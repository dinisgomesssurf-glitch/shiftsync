import { describe, expect, it } from 'vitest'
import { getRulePack, hoursByMember, validateSchedule } from '../index'
import type { ScheduleInput, Shift, ViolationCode } from '../index'
import { juiceBarMontreal } from '../fixtures/juiceBarMontreal'
import { overnightEvents } from '../fixtures/overnightEvents'
import { smallCafeLisbon } from '../fixtures/smallCafeLisbon'

const codes = (input: ScheduleInput) => validateSchedule(input).violations.map(v => v.code)
const count = (input: ScheduleInput, code: ViolationCode) => codes(input).filter(c => c === code).length

describe('juice bar, Montreal (real rota, week of 4 May 2026)', () => {
  it('has 26 shifts and 151.5 scheduled hours across 9 people', () => {
    const h = hoursByMember(juiceBarMontreal.shifts)
    expect(juiceBarMontreal.shifts).toHaveLength(26)
    expect(Object.keys(h)).toHaveLength(9)
    expect(Object.values(h).reduce((a, b) => a + b, 0)).toBeCloseTo(151.5)
  })

  it('only breaks the Quebec meal-break rule, on the 16 shifts longer than 5h', () => {
    const result = validateSchedule(juiceBarMontreal)
    const nonBreak = result.violations.filter(v => v.code !== 'break_required')
    expect(nonBreak).toEqual([])
    expect(count(juiceBarMontreal, 'break_required')).toBe(16)
  })

  it('is clean once 30-min breaks are added to shifts longer than 5h', () => {
    const fixed: Shift[] = juiceBarMontreal.shifts.map(s => {
      const span = (Number(s.end.slice(0, 2)) * 60 + Number(s.end.slice(3))) - (Number(s.start.slice(0, 2)) * 60 + Number(s.start.slice(3)))
      return span > 300 ? { ...s, breakMinutes: 30 } : s
    })
    expect(validateSchedule({ ...juiceBarMontreal, shifts: fixed }).ok).toBe(true)
  })

  it('trial shifts are supervised and do not count towards minimum staff', () => {
    expect(count(juiceBarMontreal, 'trial_unsupervised')).toBe(0)
    // Remove the senior colleague from Monday's trial: now it is unsupervised.
    const shifts = juiceBarMontreal.shifts.filter(s => !(s.date === '2026-05-04' && s.memberId === 'a'))
    const c = codes({ ...juiceBarMontreal, shifts })
    expect(c).toContain('trial_unsupervised')
    expect(c).toContain('below_min_staff') // the trial alone doesn't keep the shop staffed
  })
})

describe('overnight events (22:00–04:00)', () => {
  it('handles shifts that cross midnight without false overlaps', () => {
    expect(validateSchedule(overnightEvents).ok).toBe(true)
  })

  it('catches too little rest after an overnight event (Portugal 11h)', () => {
    const input: ScheduleInput = {
      ...overnightEvents,
      rulePack: getRulePack('PT'),
      shifts: [
        { id: 'ev', memberId: 'v1', date: '2026-03-13', start: '22:00', end: '04:00', breakMinutes: 60, kind: 'event' },
        { id: 'am', memberId: 'v1', date: '2026-03-14', start: '08:30', end: '13:00' },
      ],
    }
    const v = validateSchedule(input).violations.find(x => x.code === 'min_rest')
    expect(v?.params?.gapMinutes).toBe(270) // 04:00 → 08:30
  })

  it('catches a double booking across midnight', () => {
    const input: ScheduleInput = {
      ...overnightEvents,
      shifts: [
        { id: 'x', memberId: 'v1', date: '2026-03-13', start: '22:00', end: '04:00', breakMinutes: 30 },
        { id: 'y', memberId: 'v1', date: '2026-03-14', start: '03:00', end: '06:00' },
      ],
    }
    expect(codes(input)).toContain('overlap')
  })
})

describe('small café, Lisbon (synthetic, clean)', () => {
  it('has zero violations', () => {
    expect(validateSchedule(smallCafeLisbon).violations).toEqual([])
  })

  it('catches each team rule when broken', () => {
    const base = smallCafeLisbon
    // Ana and Inês overlap on Monday
    const s1 = base.shifts.map(s => (s.id === 'c2' ? { ...s, start: '12:00' } : s))
    expect(codes({ ...base, shifts: s1 })).toContain('cant_work_with')
    // Marta alone: remove Tiago's Friday afternoon shift
    const s2 = base.shifts.filter(s => !(s.memberId === 'tiago' && s.date === '2026-06-05'))
    expect(codes({ ...base, shifts: s2 })).toContain('cant_be_alone')
    // Inês gets a 5th shift
    const s3 = [...base.shifts, { id: 'extra', memberId: 'ines', date: '2026-06-03', start: '08:00', end: '11:00', roleId: 'barista' }]
    expect(codes({ ...base, shifts: s3 })).toContain('max_shifts_week')
    // Required on shift
    expect(codes({ ...base, rules: [{ type: 'required_on_shift', memberId: 'joao', weekday: 2, start: '11:00', end: '15:00' }] }))
      .toContain('required_on_shift')
  })

  it('catches availability, time off, role and length problems', () => {
    const base = smallCafeLisbon
    const add = (s: Shift) => codes({ ...base, shifts: [...base.shifts, s] })
    expect(add({ id: 'u', memberId: 'joao', date: '2026-06-03', start: '15:00', end: '18:00' })).toContain('unavailable')
    expect(add({ id: 't', memberId: 'tiago', date: '2026-06-01', start: '15:00', end: '18:00' })).toContain('time_off')
    expect(add({ id: 'r', memberId: 'joao', date: '2026-06-02', start: '15:00', end: '18:00', roleId: 'barista' })).toContain('missing_role')
    expect(add({ id: 's', memberId: 'rui', date: '2026-06-01', start: '15:00', end: '17:00' })).toContain('shift_too_short')
  })

  it('catches daily, weekly and weekly-rest limits', () => {
    const base = smallCafeLisbon
    const long: Shift[] = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']
      .map((date, i) => ({ id: `w${i}`, memberId: 'rui', date, start: '08:00', end: '17:30', breakMinutes: 60 }))
    const c = codes({ ...base, maxShiftHours: 12, shifts: long })
    expect(c).toContain('max_daily_hours') // 8.5h worked > 8h
    expect(c).toContain('max_weekly_hours') // 59.5h > 40h
    expect(c).toContain('weekly_rest') // 7 days in a row
  })
})

describe('rule packs', () => {
  it('breaks: Germany tiers, France inclusive at 6h', async () => {
    const { requiredBreakMinutes } = await import('../rulePacks')
    expect(requiredBreakMinutes(getRulePack('DE'), 6 * 60)).toBe(0)
    expect(requiredBreakMinutes(getRulePack('DE'), 7 * 60)).toBe(30)
    expect(requiredBreakMinutes(getRulePack('DE'), 10 * 60)).toBe(45)
    expect(requiredBreakMinutes(getRulePack('FR'), 6 * 60)).toBe(20)
    expect(requiredBreakMinutes(getRulePack('CA-QC'), 5 * 60)).toBe(0)
    expect(requiredBreakMinutes(getRulePack('CA-QC'), 5.5 * 60)).toBe(30)
  })
  it('falls back from region to country and rejects unknown ones', () => {
    expect(getRulePack('PT-11').jurisdiction).toBe('PT')
    expect(() => getRulePack('XX')).toThrow()
  })
})
