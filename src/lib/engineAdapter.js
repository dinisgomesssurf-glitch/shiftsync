// Turns database rows into engine input, and engine output back into rows.
// The engine itself knows nothing about Supabase or React.
import { getRulePack, withOverrides, generate, validateSchedule, RULE_PACKS, requiredBreakMinutes } from '../engine'
import { addDaysISO, hhmm, spanMinutes } from './dates'

export { RULE_PACKS }

export function rulePackFor(org) {
  try { return withOverrides(getRulePack(org?.jurisdiction || 'PT'), org?.rule_overrides || {}) }
  catch { return getRulePack('PT') }
}
export function breakFor(org, start, end) { return requiredBreakMinutes(rulePackFor(org), spanMinutes(start, end)) }

export function toEngineRules(rules) {
  return (rules || []).flatMap(r => {
    if (r.kind === 'cant_work_with' && r.other_member_id) return [{ type: 'cant_work_with', a: r.member_id, b: r.other_member_id, hard: r.hard !== false }]
    if (r.kind === 'cant_be_alone') return [{ type: 'cant_be_alone', memberId: r.member_id }]
    if (r.kind === 'max_shifts_week' && r.params?.max) return [{ type: 'max_shifts_week', memberId: r.member_id, max: Number(r.params.max) }]
    if (r.kind === 'required_on_shift' && r.params?.weekday != null) return [{ type: 'required_on_shift', memberId: r.member_id, weekday: Number(r.params.weekday), start: r.params.start, end: r.params.end }]
    return []
  })
}

export function toEngineMembers(members) {
  return members.map(m => ({
    id: m.id, name: m.name,
    roleIds: m.roleIds?.length ? m.roleIds : undefined, // no roles set = can cover anything
    targetHours: m.target_hours != null ? Number(m.target_hours) : null,
    maxHours: m.max_hours != null ? Number(m.max_hours) : null,
    hourlyRate: m.hourly_rate != null ? Number(m.hourly_rate) : null,
    senior: m.senior !== false,
  }))
}

export function toEngineTemplates(templates) {
  return (templates || []).map(t => ({
    id: t.id, weekday: t.weekday, name: t.name, start: hhmm(t.start_time), end: hhmm(t.end_time),
    roleId: t.role_id || null, min: t.min_workers, target: Math.max(t.min_workers, t.target_workers),
    breakMinutes: t.break_minutes || 0, kind: t.kind || 'regular',
  }))
}

export function toEngineShifts(shifts) {
  return (shifts || []).map(s => ({
    id: String(s.id), memberId: s.user_id || null, date: s.date,
    start: hhmm(s.start_time), end: hhmm(s.end_time), roleId: s.role_id || null,
    breakMinutes: s.break_minutes || 0, kind: s.kind || 'regular', locked: !!s.locked,
  }))
}

/**
 * Who can work when, for one week. Per person:
 *  1. rows entered for that specific week win;
 *  2. otherwise their usual week applies;
 *  3. otherwise, if the business assumes availability, any time.
 * Returns engine windows plus a per-person source for the UI.
 */
export function effectiveAvailability({ members, weekRows, defaults, weekStart, assumeAvailable }) {
  const windows = [], source = {}
  for (const m of members) {
    const wk = (weekRows || []).filter(r => r.user_id === m.id)
    const df = (defaults || []).filter(r => r.user_id === m.id)
    if (wk.length) {
      source[m.id] = 'week'
      for (const r of wk) if (r.is_available !== false) windows.push({ memberId: m.id, date: addDaysISO(weekStart, r.day_index), start: hhmm(r.start_time), end: hhmm(r.end_time) })
    } else if (df.length) {
      source[m.id] = 'usual'
      for (const r of df) windows.push({ memberId: m.id, date: addDaysISO(weekStart, r.weekday), start: hhmm(r.start_time), end: hhmm(r.end_time) })
    } else if (assumeAvailable) {
      source[m.id] = 'assumed'
      for (let d = 0; d < 7; d++) windows.push({ memberId: m.id, date: addDaysISO(weekStart, d), start: '00:00', end: '00:00' }) // 24h
    } else source[m.id] = 'none'
  }
  return { windows, source }
}

function baseInput({ org, members, templates, weekRows, defaults, timeOff, rules, hours, weekStart }) {
  const { windows } = effectiveAvailability({ members, weekRows, defaults, weekStart, assumeAvailable: org?.assume_available !== false })
  return {
    periodStart: weekStart,
    periodEnd: addDaysISO(weekStart, 6),
    rulePack: rulePackFor(org),
    members: toEngineMembers(members),
    templates: toEngineTemplates(templates),
    availability: windows,
    checkAvailability: true,
    timeOff: (timeOff || []).filter(t => t.status === 'approved').map(t => ({ memberId: t.user_id, startDate: t.start_date, endDate: t.end_date })),
    openingHours: (hours || []).map((d, i) => ({ weekday: i, open: hhmm(d.open_time), close: hhmm(d.close_time) })).filter(d => d.open !== d.close),
    minStaffWhileOpen: org?.min_staff_while_open || 0,
    rules: toEngineRules(rules),
  }
}

export function runGenerator(ctx) {
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

/** Rule check of a week as it stands (after manual edits too). */
export function checkWeek(ctx, shifts) {
  return validateSchedule({ ...baseInput(ctx), shifts: toEngineShifts(shifts) }).violations
}

/** Why (or whether) each person could take one extra shift. Used by the assign dialog. */
export function candidatesFor(ctx, shifts, slot) {
  const base = baseInput(ctx)
  const existing = toEngineShifts(shifts)
  const before = new Set(validateSchedule({ ...base, shifts: existing }).violations.map(v => v.code + '|' + v.memberId + '|' + v.message))
  return ctx.members.map(m => {
    const trial = { id: '__new__', memberId: m.id, date: slot.date, start: slot.start, end: slot.end, roleId: slot.roleId || null, breakMinutes: breakFor(ctx.org, slot.start, slot.end) }
    const problems = validateSchedule({ ...base, shifts: [...existing, trial] }).violations
      .filter(v => v.memberId === m.id && v.code !== 'break_required' && !before.has(v.code + '|' + v.memberId + '|' + v.message))
    return { member: m, ok: problems.length === 0, problems }
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || a.member.name.localeCompare(b.member.name))
}

/** Engine shifts → payload for the save_schedule RPC. */
export function toSavePayload(shifts) {
  return shifts.map(s => ({
    user_id: s.memberId, date: s.date, start_time: s.start, end_time: s.end,
    kind: s.kind || 'regular', break_minutes: s.breakMinutes || 0, role_id: s.roleId || null, locked: !!s.locked,
  }))
}

/** Template slots not yet covered by a shift with the same day and times. */
export function openSlots(templates, shifts, weekStart) {
  const out = []
  const used = new Set()
  for (const t of templates || []) {
    const date = addDaysISO(weekStart, t.weekday)
    const start = hhmm(t.start_time), end = hhmm(t.end_time)
    let filled = 0
    for (const s of shifts || []) {
      if (!s.user_id || used.has(s.id)) continue
      if (s.date === date && hhmm(s.start_time) === start && hhmm(s.end_time) === end && (!t.role_id || s.role_id === t.role_id || !s.role_id)) {
        if (filled < t.target_workers) { used.add(s.id); filled++ }
      }
    }
    for (let h = filled; h < Math.max(t.min_workers, t.target_workers); h++)
      out.push({ key: `${t.id}-${h}`, templateId: t.id, name: t.name, date, weekday: t.weekday, start, end, roleId: t.role_id || null, required: h < t.min_workers })
  }
  return out
}
