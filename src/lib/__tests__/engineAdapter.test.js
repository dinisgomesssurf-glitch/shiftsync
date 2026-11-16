import { describe, expect, it } from 'vitest'
import { runGenerator, checkWeek, toSavePayload, toEngineRules, effectiveAvailability, openSlots, candidatesFor } from '../engineAdapter'

// Rows shaped exactly like the database returns them.
const org = { id: 'o1', jurisdiction: 'CA-QC', generation_preset: 'balanced', labor_budget: null, min_staff_while_open: 1, rule_overrides: {}, assume_available: true }
const members = [
  { id: 'u1', name: 'Ana', target_hours: 30, max_hours: null, senior: true, roleIds: [], hourly_rate: 16 },
  { id: 'u2', name: 'Rui', target_hours: 20, max_hours: 25, senior: true, roleIds: [], hourly_rate: 15.5 },
  { id: 'u3', name: 'Inês', target_hours: null, max_hours: null, senior: false, roleIds: [], hourly_rate: null },
  { id: 'u4', name: 'João', target_hours: 30, max_hours: null, senior: true, roleIds: [], hourly_rate: 15 },
]
const templates = [0, 1, 2, 3, 4, 5, 6].flatMap(wd => [
  { id: `t-open-${wd}`, weekday: wd, name: 'Opening', start_time: '08:30', end_time: '14:00', role_id: null, min_workers: 1, target_workers: 1 },
  { id: `t-close-${wd}`, weekday: wd, name: 'Closing', start_time: '13:00', end_time: '18:00', role_id: null, min_workers: 1, target_workers: 1 },
])
const weekStart = '2026-11-16'
const hours = [0, 1, 2, 3, 4, 5, 6].map(i => ({ day_index: i, open_time: '08:30', close_time: i === 6 ? '08:30' : '18:00' })) // Sunday closed
const rules = [{ id: 'r1', kind: 'cant_be_alone', member_id: 'u3', other_member_id: null, params: {} }, { id: 'r2', kind: 'max_shifts_week', member_id: 'u2', params: { max: 4 } }]
const ctx = { org, members, templates, weekRows: [], defaults: [], timeOff: [], rules, hours, weekStart }
const toRows = shifts => toSavePayload(shifts).map((p, i) => ({ id: i + 1, ...p }))

describe('availability: week changes beat the usual week, which beats "assume free"', () => {
  const defaults = [{ user_id: 'u1', weekday: 0, start_time: '08:00', end_time: '14:00' }]
  const weekRows = [{ user_id: 'u2', day_index: 2, is_available: true, start_time: '10:00', end_time: '12:00' }, { user_id: 'u2', day_index: 3, is_available: false, start_time: '00:00', end_time: '00:00' }]
  it('picks the right source per person', () => {
    const a = effectiveAvailability({ members, weekRows, defaults, weekStart, assumeAvailable: true })
    expect(a.source).toEqual({ u1: 'usual', u2: 'week', u3: 'assumed', u4: 'assumed' })
    expect(a.windows.filter(w => w.memberId === 'u1')).toEqual([{ memberId: 'u1', date: '2026-11-16', start: '08:00', end: '14:00' }])
    expect(a.windows.filter(w => w.memberId === 'u2')).toHaveLength(1)
    expect(a.windows.filter(w => w.memberId === 'u3')).toHaveLength(7)
  })
  it('leaves people out when the business does not assume availability', () => {
    const a = effectiveAvailability({ members, weekRows, defaults, weekStart, assumeAvailable: false })
    expect(a.source.u3).toBe('none')
    expect(a.windows.some(w => w.memberId === 'u3')).toBe(false)
  })
})

describe('engine adapter', () => {
  it('maps database rules to engine rules', () => {
    expect(toEngineRules(rules)).toEqual([{ type: 'cant_be_alone', memberId: 'u3' }, { type: 'max_shifts_week', memberId: 'u2', max: 4 }])
  })

  it('builds a full, legal week when nobody has set availability yet', () => {
    const { result } = runGenerator(ctx)
    expect(result.score.mandatoryFilled).toBe(14)
    expect(result.violations.filter(v => v.code !== 'below_min_staff')).toEqual([])
    const payload = toSavePayload(result.shifts)
    expect(payload.find(p => p.start_time === '08:30').break_minutes).toBe(30) // 5.5h in Quebec
    expect(payload.filter(p => p.user_id === 'u2').length).toBeLessThanOrEqual(4)
  })

  it('lists open slots, and they disappear once a matching shift exists', () => {
    expect(openSlots(templates, [], weekStart)).toHaveLength(14)
    const { result } = runGenerator(ctx)
    expect(openSlots(templates, toRows(result.shifts), weekStart)).toHaveLength(0)
    const minusOne = toRows(result.shifts).slice(1)
    const open = openSlots(templates, minusOne, weekStart)
    expect(open).toHaveLength(1)
    expect(open[0].required).toBe(true)
  })

  it('flags a manual edit that breaks a rule, and ignores closed days for minimum staff', () => {
    const { result } = runGenerator(ctx)
    const rows = toRows(result.shifts)
    expect(checkWeek(ctx, rows)).toEqual([])
    const sunday = rows.filter(r => r.date !== '2026-11-22')
    expect(checkWeek(ctx, sunday).filter(v => v.code === 'below_min_staff')).toEqual([]) // closed Sunday
    const alone = [{ id: 99, user_id: 'u3', date: weekStart, start_time: '14:00', end_time: '18:00', break_minutes: 0 }]
    expect(checkWeek(ctx, alone).map(v => v.code)).toContain('cant_be_alone')
  })

  it('ranks who can take an open shift and says why others cannot', () => {
    const existing = [{ id: 1, user_id: 'u1', date: weekStart, start_time: '08:30', end_time: '14:00', break_minutes: 30 }]
    const list = candidatesFor({ ...ctx, weekRows: [{ user_id: 'u4', day_index: 0, is_available: false, start_time: '00:00', end_time: '00:00' }] }, existing, { date: weekStart, start: '13:00', end: '18:00' })
    const by = Object.fromEntries(list.map(c => [c.member.id, c]))
    expect(by.u2.ok).toBe(true)
    expect(by.u1.problems[0].code).toBe('overlap')
    expect(by.u4.problems[0].code).toBe('unavailable')
    expect(list[0].ok).toBe(true)
  })
})
