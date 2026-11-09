// Turns database rows into engine input, and engine output back into rows.
// The engine itself knows nothing about Supabase or React.
import { getRulePack, withOverrides, generate, validateSchedule, RULE_PACKS } from '../engine'
import { addDaysISO } from './utils'

export { RULE_PACKS }

export function rulePackFor(org){
  try { return withOverrides(getRulePack(org?.jurisdiction || 'PT'), org?.rule_overrides || {}) }
  catch { return getRulePack('PT') }
}

export function toEngineRules(rules){
  return (rules || []).flatMap(r => {
    if(r.kind === 'cant_work_with' && r.other_member_id) return [{ type:'cant_work_with', a:r.member_id, b:r.other_member_id, hard:r.hard !== false }]
    if(r.kind === 'cant_be_alone') return [{ type:'cant_be_alone', memberId:r.member_id }]
    if(r.kind === 'max_shifts_week' && r.params?.max) return [{ type:'max_shifts_week', memberId:r.member_id, max:Number(r.params.max) }]
    if(r.kind === 'required_on_shift' && r.params?.weekday != null) return [{ type:'required_on_shift', memberId:r.member_id, weekday:Number(r.params.weekday), start:r.params.start, end:r.params.end }]
    return []
  })
}

export function toEngineMembers(members){
  return members.map(m => ({
    id: m.id, name: m.name,
    roleIds: m.roleIds?.length ? m.roleIds : undefined, // no roles set = can do anything
    targetHours: m.target_hours != null ? Number(m.target_hours) : null,
    maxHours: m.max_hours != null ? Number(m.max_hours) : null,
    hourlyRate: m.hourly_rate != null ? Number(m.hourly_rate) : null,
    senior: m.senior !== false,
  }))
}

export function toEngineTemplates(templates){
  return (templates || []).map(t => ({
    id: t.id, weekday: t.weekday, name: t.name, start: t.start_time.slice(0,5), end: t.end_time.slice(0,5),
    roleId: t.role_id || null, min: t.min_workers, target: Math.max(t.min_workers, t.target_workers),
    breakMinutes: t.break_minutes || 0, kind: t.kind || 'regular',
  }))
}

/** Shifts of a loaded week ({shifts: [[...day0], ...]}) → engine shifts. */
export function weekToEngineShifts(ws){
  if(!ws?.shifts) return []
  return ws.shifts.flatMap((day, di) => (day || []).map(s => ({
    id: String(s.id), memberId: s.user_id || null, date: s.date || addDaysISO(ws.period_start, di),
    start: s.start_time.slice(0,5), end: s.end_time.slice(0,5), roleId: s.role_id || null,
    breakMinutes: s.break_minutes || 0, kind: s.kind || 'regular', locked: !!s.locked,
  })))
}

function baseInput({ org, members, templates, availRows, timeOff, rules, daySettings, weekStart }){
  const availability = (availRows || [])
    .filter(a => a.is_available !== false)
    .map(a => ({ memberId: a.user_id, date: addDaysISO(weekStart, a.day_index), start: a.start_time.slice(0,5), end: a.end_time.slice(0,5) }))
  return {
    periodStart: weekStart,
    periodEnd: addDaysISO(weekStart, 6),
    rulePack: rulePackFor(org),
    members: toEngineMembers(members),
    templates: toEngineTemplates(templates),
    availability,
    checkAvailability: true,
    timeOff: (timeOff || []).filter(t => t.status === 'approved').map(t => ({ memberId: t.user_id, startDate: t.start_date, endDate: t.end_date })),
    openingHours: (daySettings || []).map((d, i) => ({ weekday: i, open: (d.open_time || '08:30').slice(0,5), close: (d.close_time || '19:00').slice(0,5) })),
    minStaffWhileOpen: org?.min_staff_while_open || 0,
    rules: toEngineRules(rules),
  }
}

export function runGenerator(ctx){
  const t0 = performance.now()
  const input = {
    ...baseInput(ctx),
    lockedShifts: ctx.lockedShifts || [],
    preset: ctx.org?.generation_preset || 'balanced',
    laborBudget: ctx.org?.labor_budget != null ? Number(ctx.org.labor_budget) : null,
    historyHours: ctx.historyHours || {},
    seed: ctx.seed ?? 1,
  }
  const result = generate(input)
  return { input, result, durationMs: Math.round(performance.now() - t0) }
}

/** Live check of a week as it stands (after manual edits too). */
export function checkWeek(ctx, ws){
  if(!ws) return []
  const input = { ...baseInput(ctx), shifts: weekToEngineShifts(ws) }
  return validateSchedule(input).violations
}

/** Engine shifts → payload for the save_schedule RPC. */
export function toSavePayload(shifts){
  return shifts.map(s => ({
    user_id: s.memberId, date: s.date, start_time: s.start, end_time: s.end,
    kind: s.kind || 'regular', break_minutes: s.breakMinutes || 0, role_id: s.roleId || null, locked: !!s.locked,
  }))
}
