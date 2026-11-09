// Independent hard-rule validator.
// It re-checks a finished rota from scratch and shares no code with the
// generator's search, so a bug in the generator can't hide itself. Every rota
// the engine produces — and every rota a manager edits by hand — goes through
// this before it can be published.

import type { Interval } from './time'
import {
  DAY_MIN, addDays, daysBetween, fmtHours, isCovered, overlaps, shiftInterval,
  shiftSpan, toMinutes, weekdayOf, workedMinutes,
} from './time'
import { requiredBreakMinutes } from './rulePacks'
import type { ScheduleInput, Shift, ValidationResult, Violation } from './types'

interface Placed { shift: Shift; iv: Interval }

export function validateSchedule(input: ScheduleInput): ValidationResult {
  const v: Violation[] = []
  const { rulePack: pack, periodStart, periodEnd } = input
  const periodMinutes = (daysBetween(periodStart, periodEnd) + 1) * DAY_MIN
  const memberById = new Map(input.members.map(m => [m.id, m]))
  const name = (id: string | null | undefined) => (id && memberById.get(id)?.name) || id || 'Open shift'

  const placed: Placed[] = input.shifts.map(shift => ({ shift, iv: shiftInterval(shift, periodStart) }))
  const assigned = placed.filter(p => p.shift.memberId)
  const byMember = new Map<string, Placed[]>()
  for (const p of assigned) {
    const id = p.shift.memberId as string
    if (!memberById.has(id)) {
      v.push({ code: 'unknown_member', shiftIds: [p.shift.id], memberId: id, message: `Shift ${p.shift.id} is assigned to an unknown member.` })
      continue
    }
    if (!byMember.has(id)) byMember.set(id, [])
    byMember.get(id)!.push(p)
  }
  for (const list of byMember.values()) list.sort((a, b) => a.iv.s - b.iv.s)

  // ── Per-shift checks ──
  for (const { shift } of placed) {
    const span = shiftSpan(shift)
    if (input.minShiftHours && span < input.minShiftHours * 60)
      v.push({ code: 'shift_too_short', shiftIds: [shift.id], memberId: shift.memberId, message: `${name(shift.memberId)}'s ${shift.date} shift is ${fmtHours(span)}, under the ${input.minShiftHours}h minimum.` })
    if (input.maxShiftHours && span > input.maxShiftHours * 60)
      v.push({ code: 'shift_too_long', shiftIds: [shift.id], memberId: shift.memberId, message: `${name(shift.memberId)}'s ${shift.date} shift is ${fmtHours(span)}, over the ${input.maxShiftHours}h maximum.` })
    const needBreak = requiredBreakMinutes(pack, span)
    if (needBreak > (shift.breakMinutes || 0))
      v.push({ code: 'break_required', shiftIds: [shift.id], memberId: shift.memberId, params: { required: needBreak, planned: shift.breakMinutes || 0 },
        message: `${name(shift.memberId)}'s ${shift.date} ${shift.start}–${shift.end} shift (${fmtHours(span)}) needs a ${needBreak}-min break under ${pack.name} rules.` })
    if (shift.memberId && shift.roleId) {
      const m = memberById.get(shift.memberId)
      if (m?.roleIds && !m.roleIds.includes(shift.roleId))
        v.push({ code: 'missing_role', shiftIds: [shift.id], memberId: shift.memberId, message: `${name(shift.memberId)} doesn't have the role for their ${shift.date} shift.` })
    }
  }

  // ── Availability and time off ──
  for (const [memberId, list] of byMember) {
    const off = (input.timeOff || []).filter(t => t.memberId === memberId)
    const avail = (input.availability || []).filter(a => a.memberId === memberId).map(a => shiftInterval(a, periodStart))
    for (const p of list) {
      if (off.some(t => p.shift.date >= t.startDate && p.shift.date <= t.endDate))
        v.push({ code: 'time_off', shiftIds: [p.shift.id], memberId, message: `${name(memberId)} is on approved time off on ${p.shift.date}.` })
      else if (input.checkAvailability !== false && !isCovered(p.iv, avail))
        v.push({ code: 'unavailable', shiftIds: [p.shift.id], memberId, message: `${name(memberId)} isn't available for all of ${p.shift.date} ${p.shift.start}–${p.shift.end}.` })
    }
  }

  // ── Per-member sequence checks ──
  for (const [memberId, list] of byMember) {
    const m = memberById.get(memberId)!
    // Double booking
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length && list[j].iv.s < list[i].iv.e; j++)
        v.push({ code: 'overlap', shiftIds: [list[i].shift.id, list[j].shift.id], memberId, message: `${m.name} is booked on two overlapping shifts (${list[i].shift.date} ${list[i].shift.start} and ${list[j].shift.date} ${list[j].shift.start}).` })

    // Rest between shifts on different days. Split shifts on the same day are allowed.
    if (pack.minRestHours != null) {
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1], cur = list[i]
        const gap = cur.iv.s - prev.iv.e
        if (gap >= 0 && gap < pack.minRestHours * 60 && cur.shift.date !== prev.shift.date)
          v.push({ code: 'min_rest', shiftIds: [prev.shift.id, cur.shift.id], memberId, params: { gapMinutes: gap, required: pack.minRestHours },
            message: `${m.name} gets ${fmtHours(gap)} rest between ${prev.shift.date} and ${cur.shift.date}; ${pack.name} requires ${pack.minRestHours}h.` })
      }
    }

    // Daily hours (attributed to the date the shift starts)
    const perDay = new Map<string, { min: number; ids: string[] }>()
    for (const p of list) {
      const d = perDay.get(p.shift.date) || { min: 0, ids: [] }
      d.min += workedMinutes(p.shift); d.ids.push(p.shift.id)
      perDay.set(p.shift.date, d)
    }
    if (pack.maxDailyHours != null)
      for (const [date, d] of perDay)
        if (d.min > pack.maxDailyHours * 60)
          v.push({ code: 'max_daily_hours', shiftIds: d.ids, memberId, message: `${m.name} works ${fmtHours(d.min)} on ${date}; the ${pack.name} limit is ${pack.maxDailyHours}h.` })

    // Weekly hours: rolling 7-day windows starting at periodStart
    const days = daysBetween(periodStart, periodEnd) + 1
    for (let w = 0; w < days; w += 7) {
      const from = addDays(periodStart, w), to = addDays(periodStart, Math.min(w + 6, days - 1))
      const inWeek = list.filter(p => p.shift.date >= from && p.shift.date <= to)
      const min = inWeek.reduce((s, p) => s + workedMinutes(p.shift), 0)
      const ids = inWeek.map(p => p.shift.id)
      if (pack.maxWeeklyHours != null && min > pack.maxWeeklyHours * 60)
        v.push({ code: 'max_weekly_hours', shiftIds: ids, memberId, message: `${m.name} works ${fmtHours(min)} in the week of ${from}; the ${pack.name} limit is ${pack.maxWeeklyHours}h.` })
      if (m.maxHours != null && min > m.maxHours * 60)
        v.push({ code: 'contract_max_hours', shiftIds: ids, memberId, message: `${m.name} works ${fmtHours(min)} in the week of ${from}; their contract maximum is ${m.maxHours}h.` })
      const maxShiftsRule = (input.rules || []).find(r => r.type === 'max_shifts_week' && r.memberId === memberId)
      if (maxShiftsRule && maxShiftsRule.type === 'max_shifts_week' && inWeek.length > maxShiftsRule.max)
        v.push({ code: 'max_shifts_week', shiftIds: ids, memberId, message: `${m.name} has ${inWeek.length} shifts in the week of ${from}; their maximum is ${maxShiftsRule.max}.` })

      // Weekly rest: longest gap inside the window, counting the window edges.
      if (pack.weeklyRestHours != null && inWeek.length) {
        const ws = w * DAY_MIN, we = Math.min((w + 7) * DAY_MIN, periodMinutes)
        let best = 0, pos = ws
        for (const p of inWeek) { best = Math.max(best, p.iv.s - pos); pos = Math.max(pos, p.iv.e) }
        best = Math.max(best, we - pos)
        if (best < pack.weeklyRestHours * 60)
          v.push({ code: 'weekly_rest', shiftIds: ids, memberId, params: { longestRestMinutes: best, required: pack.weeklyRestHours },
            message: `${m.name}'s longest rest in the week of ${from} is ${fmtHours(best)}; ${pack.name} requires ${pack.weeklyRestHours}h in a row.` })
      }
    }
  }

  // ── Team rules ──
  const nonTrial = assigned.filter(p => p.shift.kind !== 'trial')
  for (const rule of input.rules || []) {
    if (rule.type === 'cant_work_with') {
      const as = byMember.get(rule.a) || [], bs = byMember.get(rule.b) || []
      for (const a of as) for (const b of bs)
        if (overlaps(a.iv, b.iv))
          v.push({ code: 'cant_work_with', shiftIds: [a.shift.id, b.shift.id], memberId: rule.a, message: `${name(rule.a)} and ${name(rule.b)} shouldn't work together but overlap on ${a.shift.date}.` })
    }
    if (rule.type === 'cant_be_alone') {
      for (const p of byMember.get(rule.memberId) || []) {
        const others = nonTrial.filter(o => o.shift.memberId !== rule.memberId).map(o => o.iv)
        if (!isCovered(p.iv, others))
          v.push({ code: 'cant_be_alone', shiftIds: [p.shift.id], memberId: rule.memberId, message: `${name(rule.memberId)} would be alone for part of ${p.shift.date} ${p.shift.start}–${p.shift.end}.` })
      }
    }
    if (rule.type === 'required_on_shift') {
      const days = daysBetween(periodStart, periodEnd) + 1
      for (let d = 0; d < days; d++) {
        const date = addDays(periodStart, d)
        if (weekdayOf(date) !== rule.weekday || (input.closures || []).includes(date)) continue
        const need = shiftInterval({ date, start: rule.start, end: rule.end }, periodStart)
        const mine = (byMember.get(rule.memberId) || []).map(p => p.iv)
        if (!isCovered(need, mine))
          v.push({ code: 'required_on_shift', shiftIds: [], memberId: rule.memberId, message: `${name(rule.memberId)} must be on shift ${date} ${rule.start}–${rule.end}.` })
      }
    }
  }

  // ── Trial shifts need a senior person on for the whole shift ──
  for (const p of assigned.filter(x => x.shift.kind === 'trial')) {
    const seniors = nonTrial
      .filter(o => o.shift.memberId !== p.shift.memberId && memberById.get(o.shift.memberId as string)?.senior !== false)
      .map(o => o.iv)
    if (!isCovered(p.iv, seniors))
      v.push({ code: 'trial_unsupervised', shiftIds: [p.shift.id], memberId: p.shift.memberId, message: `${name(p.shift.memberId)}'s trial on ${p.shift.date} isn't fully supervised by a senior colleague.` })
  }

  // ── Minimum staff while open (15-min resolution) ──
  if (input.minStaffWhileOpen && input.openingHours?.length) {
    const days = daysBetween(periodStart, periodEnd) + 1
    const STEP = 15
    for (let d = 0; d < days; d++) {
      const date = addDays(periodStart, d)
      if ((input.closures || []).includes(date)) continue
      const oh = input.openingHours.find(o => o.weekday === weekdayOf(date))
      if (!oh) continue
      const base = d * DAY_MIN
      let gapStart: number | null = null
      const close = toMinutes(oh.close) <= toMinutes(oh.open) ? toMinutes(oh.close) + DAY_MIN : toMinutes(oh.close)
      for (let t = toMinutes(oh.open); t <= close; t += STEP) {
        const short = t < close && nonTrial.filter(p => p.iv.s <= base + t && p.iv.e > base + t).length < input.minStaffWhileOpen
        if (short && gapStart === null) gapStart = t
        if (!short && gapStart !== null) {
          v.push({ code: 'below_min_staff', shiftIds: [], params: { date, from: gapStart, to: t },
            message: `Fewer than ${input.minStaffWhileOpen} on shift ${date} ${fmt(gapStart)}–${fmt(t)} while open.` })
          gapStart = null
        }
      }
    }
  }

  return { ok: v.length === 0, violations: v }
}

function fmt(min: number): string {
  const m = min % DAY_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Total worked hours per member (for summaries and tests). */
export function hoursByMember(shifts: Shift[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of shifts) if (s.memberId) out[s.memberId] = (out[s.memberId] || 0) + workedMinutes(s) / 60
  return out
}
