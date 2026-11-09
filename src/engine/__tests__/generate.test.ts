import { describe, expect, it } from 'vitest'
import { buildSlots, generate, getRulePack, validateSchedule } from '../index'
import type { GenerateInput, Shift } from '../index'
import { DAY_MIN, addDays, daysBetween, shiftInterval, toMinutes, weekdayOf, workedMinutes } from '../time'
import { bigTeam, cafeGenerate, eventsGenerate, juiceBarGenerate } from '../fixtures/generationScenarios'
import { legacyGenerate } from './legacyGenerator'

const PERSONAL = ['overlap', 'unavailable', 'time_off', 'missing_role', 'min_rest', 'max_daily_hours',
  'max_weekly_hours', 'contract_max_hours', 'weekly_rest', 'max_shifts_week', 'cant_work_with', 'cant_be_alone', 'break_required']

function hardViolations(input: GenerateInput, shifts: Shift[]) {
  return validateSchedule({ ...input, shifts }).violations.filter(v => PERSONAL.includes(v.code))
}

/** Person-minutes short of template head counts, measured per 15 minutes. */
function shortfall(input: GenerateInput, shifts: Shift[]) {
  let short = 0
  const days = daysBetween(input.periodStart, input.periodEnd) + 1
  const ivs = shifts.map(s => shiftInterval(s, input.periodStart))
  for (let d = 0; d < days; d++) {
    const date = addDays(input.periodStart, d)
    const need: Record<number, number> = {}
    for (const t of (input.templates || []).filter(t => t.weekday === weekdayOf(date)))
      for (let m = toMinutes(t.start); m < toMinutes(t.end); m += 15) need[m] = (need[m] || 0) + t.min
    for (const [m, n] of Object.entries(need)) {
      const at = d * DAY_MIN + Number(m)
      const have = ivs.filter(iv => iv.s <= at && iv.e > at).length
      short += Math.max(0, n - have) * 15
    }
  }
  return short
}

/** Mean squared relative deviation from target hours. */
function unfairness(input: GenerateInput, shifts: Shift[]) {
  const ms = input.members.filter(m => m.targetHours)
  return ms.reduce((a, m) => {
    const h = shifts.filter(s => s.memberId === m.id).reduce((x, s) => x + workedMinutes(s) / 60, 0)
    const dev = (h - (m.targetHours as number)) / (m.targetHours as number)
    return a + dev * dev
  }, 0) / ms.length
}

describe('Stage A: templates → slots', () => {
  it('creates one slot per head, mandatory up to min, with legal breaks', () => {
    const slots = buildSlots(cafeGenerate)
    expect(slots.filter(s => s.mandatory)).toHaveLength(21) // 3 templates × 7 days, min 1
    expect(slots.filter(s => !s.mandatory)).toHaveLength(6) // weekend extras
    expect(slots.every(s => s.breakMinutes === 0)).toBe(true) // 4–5h shifts need no break in PT
    const jb = buildSlots(juiceBarGenerate)
    const long = jb.find(s => s.start === '08:30' && s.end === '17:00')!
    expect(long.breakMinutes).toBe(30) // Quebec: 30 min after 5h
  })
  it('a locked shift fills one head of its matching template', () => {
    const lock: Shift = { id: 'L1', memberId: 'rui', date: '2026-06-01', start: '08:00', end: '13:00', roleId: 'barista' }
    const slots = buildSlots({ ...cafeGenerate, lockedShifts: [lock] })
    expect(slots.filter(s => s.date === '2026-06-01' && s.start === '08:00')).toHaveLength(0)
  })
})

describe.each([
  ['Montreal juice bar', juiceBarGenerate],
  ['Lisbon café', cafeGenerate],
  ['overnight events', eventsGenerate],
  ['30-person team', bigTeam()],
])('%s', (_name, input) => {
  const r = generate(input)
  it('never breaks a hard rule', () => {
    expect(hardViolations(input, r.shifts)).toEqual([])
    expect(r.violations.filter(v => PERSONAL.includes(v.code))).toEqual([])
  })
  it('fills every mandatory slot', () => {
    expect(r.score.mandatoryFilled).toBe(r.score.mandatoryTotal)
    expect(r.unfilled.filter(u => u.slot.mandatory)).toEqual([])
  })
})

describe('Phase 2 gate: better than the old generator', () => {
  for (const [name, input] of [['Montreal juice bar', juiceBarGenerate], ['30-person team', bigTeam()]] as const) {
    it(`${name}: fewer rule breaks, no more shortfall, fairer hours`, () => {
      const legacy = legacyGenerate(input)
      const engine = generate(input).shifts
      const lv = hardViolations(input, legacy).length
      expect(hardViolations(input, engine)).toHaveLength(0)
      expect(lv).toBeGreaterThan(0)
      expect(shortfall(input, engine)).toBeLessThanOrEqual(shortfall(input, legacy))
      expect(unfairness(input, engine)).toBeLessThan(unfairness(input, legacy))
    })
  }
})

describe('behaviour', () => {
  it('is deterministic for a given seed', () => {
    const a = generate({ ...cafeGenerate, seed: 7 }), b = generate({ ...cafeGenerate, seed: 7 })
    expect(a.shifts).toEqual(b.shifts)
  })

  it('keeps locked shifts exactly and builds around them', () => {
    const lock: Shift = { id: 'L1', memberId: 'pedro', date: '2026-06-03', start: '11:00', end: '15:00', roleId: 'kitchen' }
    const r = generate({ ...cafeGenerate, lockedShifts: [lock] })
    expect(r.shifts).toContainEqual(expect.objectContaining({ id: 'L1', memberId: 'pedro' }))
    expect(r.shifts.filter(s => s.date === '2026-06-03' && s.roleId === 'kitchen')).toHaveLength(1)
  })

  it('"fill gaps only": locking the whole previous rota changes nothing that was filled', () => {
    const first = generate(cafeGenerate)
    const kept = first.shifts.slice(0, 10)
    const second = generate({ ...cafeGenerate, lockedShifts: kept, seed: 99 })
    for (const k of kept) expect(second.shifts).toContainEqual(k)
  })

  it('respects can\'t-work-with and can\'t-be-alone', () => {
    const r = generate(cafeGenerate)
    const iv = (s: Shift) => shiftInterval(s, cafeGenerate.periodStart)
    const ana = r.shifts.filter(s => s.memberId === 'ana'), ines = r.shifts.filter(s => s.memberId === 'ines')
    for (const a of ana) for (const b of ines) expect(iv(a).s < iv(b).e && iv(b).s < iv(a).e).toBe(false)
    expect(validateSchedule({ ...cafeGenerate, shifts: r.shifts }).violations.filter(v => v.code === 'cant_be_alone')).toEqual([])
  })

  it('never puts Friday-night event crew on Saturday morning set-up (11h rest)', () => {
    const r = generate(eventsGenerate)
    const friday = new Set(r.shifts.filter(s => s.date === '2026-03-13').map(s => s.memberId))
    const setup = r.shifts.filter(s => s.start === '10:00')
    expect(setup).toHaveLength(2)
    for (const s of setup) expect(friday.has(s.memberId)).toBe(false)
  })

  it('explains slots it cannot fill', () => {
    const input: GenerateInput = {
      ...cafeGenerate,
      templates: [...cafeGenerate.templates!, { id: 'bar', weekday: 0, name: 'Bar', start: '18:00', end: '23:00', roleId: 'bartender', min: 1, target: 1 }],
    }
    const r = generate(input)
    const gap = r.unfilled.find(u => u.slot.sourceId === 'bar')!
    expect(gap.slot.mandatory).toBe(true)
    expect(gap.summary).toMatch(/without the role/)
    expect(gap.candidates.find(c => c.memberId === 'tiago')!.code).toBe('time_off') // on leave that Monday
    expect(gap.candidates.filter(c => c.code === 'missing_role')).toHaveLength(7)
  })

  it('names the blocking rule when someone is available but not allowed', () => {
    const input: GenerateInput = {
      periodStart: '2026-03-09', periodEnd: '2026-03-15', rulePack: getRulePack('PT'),
      members: [{ id: 'solo', name: 'Solo' }], checkAvailability: false,
      demand: [
        { id: 'night', date: '2026-03-13', start: '22:00', end: '04:00', min: 1, target: 1 },
        { id: 'morning', date: '2026-03-14', start: '09:00', end: '13:00', min: 1, target: 1 },
      ],
    }
    const r = generate(input)
    expect(r.unfilled).toHaveLength(1)
    expect(r.unfilled[0].candidates[0].code).toBe('min_rest')
    expect(r.unfilled[0].summary).toMatch(/less than 11h rest/)
  })

  it('"save money" leaves optional extras open; "cover first" fills them', () => {
    const save = generate({ ...cafeGenerate, preset: 'save_money', laborBudget: 400 })
    const cover = generate({ ...cafeGenerate, preset: 'cover_first' })
    expect(save.score.mandatoryFilled).toBe(save.score.mandatoryTotal)
    expect(cover.score.optionalFilled).toBe(cover.score.optionalTotal)
    expect(save.score.optionalFilled).toBeLessThan(cover.score.optionalFilled)
    expect(save.score.laborCost!).toBeLessThan(cover.score.laborCost!)
  })

  it('uses past hours: someone short on hours lately gets more now', () => {
    const base = generate(juiceBarGenerate)
    const owed = generate({ ...juiceBarGenerate, historyHours: { e: 0, a: 4 * 40 } })
    const h = (r: typeof base, id: string) => r.members.find(m => m.memberId === id)!.hours
    expect(h(owed, 'e')).toBeGreaterThanOrEqual(h(base, 'e'))
  })

  it('runs a 30-person week in well under 3 seconds', () => {
    const t = Date.now()
    generate(bigTeam())
    expect(Date.now() - t).toBeLessThan(3000)
  })
})
