import { describe, expect, it } from 'vitest'
import { runGenerator, checkWeek, toSavePayload, weekToEngineShifts, toEngineRules } from '../engineAdapter'

// Rows shaped exactly like Supabase returns them.
const org = { id: 'o1', jurisdiction: 'CA-QC', generation_preset: 'balanced', labor_budget: null, min_staff_while_open: 1, rule_overrides: {} }
const members = [
  { id: 'u1', name: 'Ana', role: 'admin', target_hours: 30, max_hours: null, senior: true, roleIds: [], hourly_rate: 16 },
  { id: 'u2', name: 'Rui', role: 'member', target_hours: 20, max_hours: 25, senior: true, roleIds: [], hourly_rate: 15.5 },
  { id: 'u3', name: 'Inês', role: 'member', target_hours: null, max_hours: null, senior: false, roleIds: [], hourly_rate: null },
  { id: 'u4', name: 'João', role: 'member', target_hours: 30, max_hours: null, senior: true, roleIds: [], hourly_rate: 15 },
]
const templates = [0,1,2,3,4,5,6].flatMap(wd => [
  { id: `t-open-${wd}`, weekday: wd, name: 'Opening', start_time: '08:30', end_time: '14:00', role_id: null, min_workers: 1, target_workers: 1, break_minutes: 0, kind: 'regular' },
  { id: `t-close-${wd}`, weekday: wd, name: 'Closing', start_time: '13:00', end_time: '18:00', role_id: null, min_workers: 1, target_workers: 1, break_minutes: 0, kind: 'regular' },
])
const weekStart = '2026-11-16'
const availRows = members.flatMap(m => [0,1,2,3,4,5,6].map(d => ({ user_id: m.id, day_index: d, start_time: '08:00', end_time: '19:00', is_available: true })))
const daySettings = [0,1,2,3,4,5,6].map(i => ({ day_index: i, open_time: '08:30', close_time: '18:00' }))
const rules = [{ id: 'r1', kind: 'cant_be_alone', member_id: 'u3', other_member_id: null, params: {} },
               { id: 'r2', kind: 'max_shifts_week', member_id: 'u2', params: { max: 4 } }]

describe('engine adapter', () => {
  const ctx = { org, members, templates, availRows, timeOff: [], rules, daySettings, weekStart }

  it('maps DB rules to engine rules', () => {
    expect(toEngineRules(rules)).toEqual([{ type: 'cant_be_alone', memberId: 'u3' }, { type: 'max_shifts_week', memberId: 'u2', max: 4 }])
  })

  it('generates a full, legal week from DB-shaped rows and builds the save payload', () => {
    const { result } = runGenerator(ctx)
    expect(result.score.mandatoryFilled).toBe(14)
    expect(result.violations.filter(v => v.code !== 'below_min_staff')).toEqual([])
    const payload = toSavePayload(result.shifts)
    expect(payload).toHaveLength(14)
    expect(payload[0]).toMatchObject({ date: expect.stringMatching(/^2026-11-(1[6-9]|2[0-2])$/), kind: 'regular', locked: false })
    expect(payload.find(p => p.start_time === '08:30').break_minutes).toBe(30) // 5.5h in Quebec → 30 min
    expect(payload.filter(p => p.user_id === 'u2').length).toBeLessThanOrEqual(4)
    expect(result.score.laborCost).toBeGreaterThan(0)
  })

  it('round-trips a loaded week and flags manual edits that break a rule', () => {
    const { result } = runGenerator(ctx)
    const ws = { period_start: weekStart, shifts: [0,1,2,3,4,5,6].map(() => []) }
    toSavePayload(result.shifts).forEach((p, i) => {
      const di = (new Date(p.date + 'T00:00:00Z') - new Date(weekStart + 'T00:00:00Z')) / 86400000
      ws.shifts[di].push({ id: i + 1, ...p })
    })
    expect(weekToEngineShifts(ws)).toHaveLength(14)
    expect(checkWeek(ctx, ws).filter(v => v.code !== 'below_min_staff')).toEqual([])
    // Manager drags Inês (can't be alone) onto Monday evening by herself
    ws.shifts[0] = ws.shifts[0].filter(s => s.start_time !== '13:00')
    ws.shifts[0].push({ id: 99, user_id: 'u3', date: weekStart, start_time: '14:00', end_time: '18:00', break_minutes: 0 })
    expect(checkWeek(ctx, ws).map(v => v.code)).toContain('cant_be_alone')
  })

  it('keeps locked shifts in "fill gaps only" mode', () => {
    const locked = [{ id: '501', memberId: 'u3', date: weekStart, start: '08:30', end: '14:00', breakMinutes: 30, locked: true }]
    const { result } = runGenerator({ ...ctx, rules: [], lockedShifts: locked })
    expect(result.shifts).toContainEqual(expect.objectContaining({ id: '501', memberId: 'u3' }))
    expect(result.shifts.filter(s => s.date === weekStart && s.start === '08:30')).toHaveLength(1)
  })
})
