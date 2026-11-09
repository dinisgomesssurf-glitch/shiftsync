// ShiftSync scheduling engine — Phase 2.
//
// Stage A: demand (templates / dated demand) → one open Slot per head.
// Stage B: assign people to slots.
//   1. Locked shifts and "required on shift" rules go in first.
//   2. Build: hardest slots first (mandatory, then fewest eligible people),
//      each given to the feasible person with the best score gain.
//   3. Repair: for mandatory slots still empty, move one existing assignment
//      to someone else to free an eligible person (2-step ejection chain).
//   4. Improve: seeded local search (reassign / swap / fill / drop) with
//      simulated annealing, keeping the best rota seen.
//   5. Check everything with the independent validator, and explain gaps.
//
// Deterministic: the same input and seed always produce the same rota.

import { requiredBreakMinutes } from './rulePacks'
import {
  DAY_MIN, addDays, daysBetween, isCovered, overlaps, shiftInterval,
  shiftSpan, weekdayOf,
} from './time'
import type { Interval } from './time'
import type {
  CandidateReason, GenerateInput, GenerateResult, Member, MemberSummary, ReasonCode,
  ScoreBreakdown, Shift, Slot, UnfilledSlot, Weights,
} from './types'
import { validateSchedule } from './validate'

export const ENGINE_VERSION = '2.0.0'

export const PRESETS: Record<string, Weights> = {
  balanced: { coverage: 10, fairness: 4, preference: 2, pattern: 1, cost: 3 },
  cover_first: { coverage: 20, fairness: 2, preference: 1, pattern: 0.5, cost: 1 },
  save_money: { coverage: 6, fairness: 3, preference: 1, pattern: 1, cost: 10 },
}
const MANDATORY_PENALTY = 1000 // per unfilled mandatory slot (dominates every soft goal)
const SOFT_RULE_PENALTY = 50 // per broken "can't be alone" (fixed after search if possible)
const OPTIONAL_WEIGHT = 0.3

// ───────────────────────── Stage A ─────────────────────────

export function buildSlots(input: GenerateInput): Slot[] {
  const slots: Slot[] = []
  const days = daysBetween(input.periodStart, input.periodEnd) + 1
  const closures = new Set(input.closures || [])
  const locked = (input.lockedShifts || []).filter(s => s.memberId)
  const usedLocks = new Set<string>()

  const push = (src: { id: string; start: string; end: string; roleId?: string | null; min: number; target: number; breakMinutes?: number; kind?: Shift['kind']; label?: string }, date: string) => {
    const span = shiftSpan(src)
    const brk = Math.max(src.breakMinutes || 0, requiredBreakMinutes(input.rulePack, span))
    const heads = Math.max(src.min, src.target)
    // A locked shift with the same date, times and role already fills one head.
    let consumed = 0
    for (const l of locked) {
      if (consumed >= heads) break
      if (usedLocks.has(l.id)) continue
      if (l.date === date && l.start === src.start && l.end === src.end && (l.roleId || null) === (src.roleId || null)) {
        usedLocks.add(l.id); consumed++
      }
    }
    for (let h = consumed; h < heads; h++) {
      slots.push({
        id: `${src.id}@${date}#${h + 1}`, date, start: src.start, end: src.end,
        roleId: src.roleId ?? null, kind: src.kind || 'regular', breakMinutes: brk,
        mandatory: h < src.min, sourceId: src.id, label: src.label,
      })
    }
  }

  for (let d = 0; d < days; d++) {
    const date = addDays(input.periodStart, d)
    if (closures.has(date)) continue
    for (const t of input.templates || []) if (t.weekday === weekdayOf(date)) push({ ...t, label: t.name }, date)
  }
  for (const dd of input.demand || []) if (dd.date >= input.periodStart && dd.date <= input.periodEnd) push(dd, dd.date)
  return slots
}

// ───────────────────────── State ─────────────────────────

interface Placed { key: string; date: string; iv: Interval; worked: number; locked: boolean }

class Rota {
  // slot index → member id (or null)
  assign: (string | null)[]
  byMember = new Map<string, Placed[]>()
  constructor(public slots: Slot[], public ivs: Interval[], public worked: number[]) {
    this.assign = slots.map(() => null)
  }
  clone(): Rota {
    const r = new Rota(this.slots, this.ivs, this.worked)
    r.assign = [...this.assign]
    for (const [k, v] of this.byMember) r.byMember.set(k, [...v])
    return r
  }
  list(m: string): Placed[] { return this.byMember.get(m) || [] }
  addPlaced(m: string, p: Placed) {
    const l = [...this.list(m), p].sort((a, b) => a.iv.s - b.iv.s)
    this.byMember.set(m, l)
  }
  removePlaced(m: string, key: string) {
    this.byMember.set(m, this.list(m).filter(p => p.key !== key))
  }
  set(i: number, m: string | null) {
    const prev = this.assign[i]
    if (prev) this.removePlaced(prev, `s${i}`)
    this.assign[i] = m
    if (m) this.addPlaced(m, { key: `s${i}`, date: this.slots[i].date, iv: this.ivs[i], worked: this.worked[i], locked: false })
  }
}

// PRNG (mulberry32): small, fast, deterministic.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ───────────────────────── Engine ─────────────────────────

export function generate(input: GenerateInput): GenerateResult {
  const seed = input.seed ?? 1
  const rand = rng(seed)
  const W: Weights = { ...PRESETS[input.preset || 'balanced'], ...(input.weights || {}) }
  const pack = input.rulePack
  const P = input.periodStart
  const days = daysBetween(P, input.periodEnd) + 1
  const weeks = Math.ceil(days / 7)
  const members = input.members
  const memberById = new Map(members.map(m => [m.id, m]))
  const rules = input.rules || []

  const slots = buildSlots(input)
  const ivs = slots.map(s => shiftInterval(s, P))
  const worked = slots.map(s => shiftSpan(s) - s.breakMinutes)
  const rota = new Rota(slots, ivs, worked)

  // Locked shifts are fixed assignments outside the slot list.
  const locked = (input.lockedShifts || []).map(s => ({
    ...s, breakMinutes: Math.max(s.breakMinutes || 0, requiredBreakMinutes(pack, shiftSpan(s))),
  }))
  for (const l of locked) {
    if (!l.memberId || !memberById.has(l.memberId)) continue
    rota.addPlaced(l.memberId, { key: `L${l.id}`, date: l.date, iv: shiftInterval(l, P), worked: shiftSpan(l) - (l.breakMinutes || 0), locked: true })
  }
  const lockedPlaced = new Map<string, Placed[]>()
  for (const [m, l] of rota.byMember) lockedPlaced.set(m, [...l])

  // ── Static eligibility (doesn't change during search) ──
  const availByMember = new Map<string, Interval[]>()
  const prefByMember = new Map<string, Interval[]>()
  for (const a of input.availability || []) {
    const iv = shiftInterval(a, P)
    if (!availByMember.has(a.memberId)) availByMember.set(a.memberId, [])
    availByMember.get(a.memberId)!.push(iv)
    if (a.kind === 'preferred') {
      if (!prefByMember.has(a.memberId)) prefByMember.set(a.memberId, [])
      prefByMember.get(a.memberId)!.push(iv)
    }
  }
  const checkAvail = input.checkAvailability !== false
  function staticReason(i: number, m: Member): ReasonCode | null {
    const s = slots[i]
    if ((input.timeOff || []).some(t => t.memberId === m.id && s.date >= t.startDate && s.date <= t.endDate)) return 'time_off'
    if (s.roleId && m.roleIds && !m.roleIds.includes(s.roleId)) return 'missing_role'
    if (checkAvail && !isCovered(ivs[i], availByMember.get(m.id) || [])) return 'unavailable'
    return null
  }
  const eligible: string[][] = slots.map((_, i) => members.filter(m => staticReason(i, m) === null).map(m => m.id))

  const maxShiftsRule = new Map<string, number>()
  for (const r of rules) if (r.type === 'max_shifts_week') maxShiftsRule.set(r.memberId, r.max)
  const cantWorkWith = rules.filter(r => r.type === 'cant_work_with' && r.hard !== false) as Array<{ a: string; b: string }>

  // ── Dynamic feasibility: can member m take slot i given the current rota? ──
  function weekIndex(date: string) { return Math.floor(daysBetween(P, date) / 7) }
  function dynamicReason(r: Rota, i: number, m: string): ReasonCode | null {
    const iv = ivs[i], date = slots[i].date
    const mine = r.list(m).filter(p => p.key !== `s${i}`)
    for (const p of mine) if (overlaps(p.iv, iv)) return 'overlap'
    if (pack.minRestHours != null) {
      const need = pack.minRestHours * 60
      for (const p of mine) {
        if (p.date === date) continue // split shifts on the same day are allowed
        const gap = p.iv.e <= iv.s ? iv.s - p.iv.e : p.iv.s - iv.e
        if (gap >= 0 && gap < need) return 'min_rest'
      }
    }
    if (pack.maxDailyHours != null) {
      const dayMin = mine.filter(p => p.date === date).reduce((a, p) => a + p.worked, 0) + worked[i]
      if (dayMin > pack.maxDailyHours * 60) return 'max_daily_hours'
    }
    const w = weekIndex(date)
    const inWeek = mine.filter(p => weekIndex(p.date) === w)
    const weekMin = inWeek.reduce((a, p) => a + p.worked, 0) + worked[i]
    if (pack.maxWeeklyHours != null && weekMin > pack.maxWeeklyHours * 60) return 'max_weekly_hours'
    const mem = memberById.get(m)!
    if (mem.maxHours != null && weekMin > mem.maxHours * 60) return 'contract_max_hours'
    const maxS = maxShiftsRule.get(m)
    if (maxS != null && inWeek.length + 1 > maxS) return 'max_shifts_week'
    if (pack.weeklyRestHours != null) {
      const ws = w * 7 * DAY_MIN, we = Math.min((w + 1) * 7, days) * DAY_MIN
      const all = [...inWeek.map(p => p.iv), iv].sort((a, b) => a.s - b.s)
      let best = 0, pos = ws
      for (const x of all) { best = Math.max(best, x.s - pos); pos = Math.max(pos, x.e) }
      best = Math.max(best, we - pos)
      if (best < pack.weeklyRestHours * 60) return 'weekly_rest'
    }
    for (const rule of cantWorkWith) {
      const other = rule.a === m ? rule.b : rule.b === m ? rule.a : null
      if (other && r.list(other).some(p => overlaps(p.iv, iv))) return 'cant_work_with'
    }
    return null
  }
  const feasible = (r: Rota, i: number, m: string) => eligible[i].includes(m) && dynamicReason(r, i, m) === null

  // ── Targets for fairness ──
  const totalDemandMin = worked.reduce((a, b) => a + b, 0) + locked.reduce((a, l) => a + shiftSpan(l) - (l.breakMinutes || 0), 0)
  const targeted = members.filter(m => m.targetHours != null && m.targetHours > 0)
  const untargeted = members.filter(m => !(m.targetHours != null && m.targetHours > 0))
  const targetedMin = targeted.reduce((a, m) => a + (m.targetHours as number) * 60 * weeks, 0)
  const shareMin = untargeted.length ? Math.max(0, totalDemandMin - targetedMin) / untargeted.length : 0
  const fairTarget = new Map<string, number>() // minutes for this period
  for (const m of members) {
    let t = m.targetHours != null && m.targetHours > 0 ? m.targetHours * 60 * weeks : shareMin
    const hist = input.historyHours?.[m.id]
    if (hist != null && m.targetHours) {
      const debt = (m.targetHours - hist / 4) * 60 * weeks // worked less than target recently → a bit more now
      t += Math.max(-0.5 * t, Math.min(0.5 * t, debt * 0.5))
    }
    fairTarget.set(m.id, t)
  }
  const rateOf = (m: string) => memberById.get(m)?.hourlyRate ?? null
  const anyRates = members.some(m => m.hourlyRate != null)
  const avgRate = anyRates ? members.reduce((a, m) => a + (m.hourlyRate || 0), 0) / members.filter(m => m.hourlyRate != null).length : 0
  const totalWeight = slots.reduce((a, s) => a + (s.mandatory ? 1 : OPTIONAL_WEIGHT), 0) || 1
  const mandatoryTotal = slots.filter(s => s.mandatory).length
  const cantBeAlone = rules.filter(r => r.type === 'cant_be_alone').map(r => (r as { memberId: string }).memberId)

  // ── Score ──
  function score(r: Rota): ScoreBreakdown {
    let filledW = 0, mandFilled = 0, optFilled = 0
    slots.forEach((s, i) => {
      if (!r.assign[i]) return
      filledW += s.mandatory ? 1 : OPTIONAL_WEIGHT
      if (s.mandatory) mandFilled++; else optFilled++
    })
    const coverage = filledW / totalWeight

    let fair = 0, n = 0
    for (const m of members) {
      const mins = r.list(m.id).reduce((a, p) => a + p.worked, 0)
      const t = fairTarget.get(m.id) || 0
      const dev = (mins - t) / Math.max(t, 240)
      fair += Math.min(dev * dev, 4); n++
    }
    fair = n ? fair / n : 0

    let prefHits = 0, prefTotal = 0
    for (const [m, prefs] of prefByMember) {
      for (const p of r.list(m)) { prefTotal++; if (isCovered(p.iv, prefs)) prefHits++ }
    }
    const preference = prefTotal ? prefHits / prefTotal : 0

    let bad = 0
    for (const m of members) {
      const l = r.list(m.id)
      for (let i = 1; i < l.length; i++) {
        if (l[i].date === l[i - 1].date) bad++ // split shift
        else if (l[i].iv.s - l[i - 1].iv.e < 12 * 60) bad += 0.5 // close then open
      }
    }
    const patterns = members.length ? bad / members.length : 0

    let cost: number | null = null, costTerm = 0
    if (anyRates) {
      cost = 0
      for (const m of members) {
        const rate = rateOf(m.id) ?? avgRate
        const l = r.list(m.id)
        for (let w = 0; w < weeks; w++) {
          const mins = l.filter(p => weekIndex(p.date) === w).reduce((a, p) => a + p.worked, 0)
          const otAt = pack.overtimeWeeklyHours != null ? pack.overtimeWeeklyHours * 60 : Infinity
          cost += (Math.min(mins, otAt) + Math.max(0, mins - otAt) * 1.5) / 60 * rate
        }
      }
      if (input.laborBudget) costTerm = Math.max(0, (cost - input.laborBudget * weeks) / (input.laborBudget * weeks)) * 3 + cost / (input.laborBudget * weeks) * 0.2
      else costTerm = cost / Math.max(1, (totalDemandMin / 60) * avgRate)
    }

    let soft = 0
    for (const m of cantBeAlone) {
      for (const p of r.list(m)) {
        const others: Interval[] = []
        for (const [o, l] of r.byMember) if (o !== m) for (const q of l) if (overlaps(q.iv, p.iv)) others.push(q.iv)
        if (!isCovered(p.iv, others)) soft++
      }
    }

    const total = W.coverage * coverage - W.fairness * fair + W.preference * preference
      - W.pattern * patterns - W.cost * costTerm
      - MANDATORY_PENALTY * (mandatoryTotal - mandFilled) / Math.max(1, mandatoryTotal) * (mandatoryTotal ? 1 : 0)
      - SOFT_RULE_PENALTY * soft
    return {
      total, coverage, mandatoryFilled: mandFilled, mandatoryTotal,
      optionalFilled: optFilled, optionalTotal: slots.length - mandatoryTotal,
      fairness: fair, preference, patterns, laborCost: cost == null ? null : Math.round(cost * 100) / 100,
      softRulePenalties: soft,
    }
  }
  const pinned = new Set<number>()

  // ── 1. Required on shift ──
  const extraViolations: string[] = []
  for (const rule of rules) {
    if (rule.type !== 'required_on_shift') continue
    for (let d = 0; d < days; d++) {
      const date = addDays(P, d)
      if (weekdayOf(date) !== rule.weekday || (input.closures || []).includes(date)) continue
      const need = shiftInterval({ date, start: rule.start, end: rule.end }, P)
      if (isCovered(need, rota.list(rule.memberId).map(p => p.iv))) continue
      const cands = slots.map((_, i) => i)
        .filter(i => !rota.assign[i] && overlaps(ivs[i], need) && feasible(rota, i, rule.memberId))
        .sort((a, b) => (Math.min(ivs[b].e, need.e) - Math.max(ivs[b].s, need.s)) - (Math.min(ivs[a].e, need.e) - Math.max(ivs[a].s, need.s)))
      if (cands.length) { rota.set(cands[0], rule.memberId); pinned.add(cands[0]) }
      else extraViolations.push(`${memberById.get(rule.memberId)?.name || rule.memberId} couldn't be placed on ${date} ${rule.start}–${rule.end}.`)
    }
  }

  // ── 2. Build ──
  const order = slots.map((_, i) => i).filter(i => !rota.assign[i]).sort((a, b) =>
    (Number(slots[b].mandatory) - Number(slots[a].mandatory)) ||
    (eligible[a].length - eligible[b].length) ||
    (ivs[a].s - ivs[b].s) || (a - b))
  let current = score(rota)
  for (const i of order) {
    let best: string | null = null, bestScore = slots[i].mandatory ? -Infinity : current.total, bestTie = -1
    for (const m of eligible[i]) {
      if (dynamicReason(rota, i, m) !== null) continue
      rota.set(i, m)
      const sc = score(rota).total
      const tie = rand()
      if (sc > bestScore + 1e-9 || (Math.abs(sc - bestScore) <= 1e-9 && tie > bestTie)) { best = m; bestScore = sc; bestTie = tie }
      rota.set(i, null)
    }
    if (best) { rota.set(i, best); current = score(rota) }
  }

  // ── 3. Repair mandatory gaps (ejection chain, depth 2) ──
  for (let i = 0; i < slots.length; i++) {
    if (rota.assign[i] || !slots[i].mandatory) continue
    let done = false
    for (const c of eligible[i]) {
      if (done) break
      for (const p of rota.list(c)) {
        if (p.locked || !p.key.startsWith('s')) continue
        const j = Number(p.key.slice(1))
        if (pinned.has(j)) continue
        rota.set(j, null)
        if (dynamicReason(rota, i, c) === null) {
          rota.set(i, c)
          const d = eligible[j].find(x => x !== c && dynamicReason(rota, j, x) === null)
          if (d) { rota.set(j, d); done = true; break }
          rota.set(i, null)
        }
        rota.set(j, c)
      }
    }
  }
  current = score(rota)

  // ── 4. Improve: seeded local search with simulated annealing ──
  const movable = slots.map((_, i) => i).filter(i => !pinned.has(i))
  const iterations = input.iterations ?? Math.min(6000, 300 + slots.length * 40)
  let best = rota.clone(), bestScore = current.total
  const T0 = 0.5
  for (let it = 0; it < iterations && movable.length; it++) {
    const T = T0 * (1 - it / iterations) + 1e-4
    const kind = rand()
    const i = movable[Math.floor(rand() * movable.length)]
    const undo: Array<[number, string | null]> = []
    if (kind < 0.45) {
      // reassign or fill slot i
      const cands = eligible[i].filter(m => m !== rota.assign[i])
      if (!cands.length) continue
      const m = cands[Math.floor(rand() * cands.length)]
      const prev = rota.assign[i]
      rota.set(i, null)
      if (dynamicReason(rota, i, m) !== null) { rota.set(i, prev); continue }
      rota.set(i, m); undo.push([i, prev])
    } else if (kind < 0.85) {
      // swap the people on two filled slots
      const j = movable[Math.floor(rand() * movable.length)]
      const a = rota.assign[i], b = rota.assign[j]
      if (i === j || !a || !b || a === b) continue
      if (!eligible[i].includes(b) || !eligible[j].includes(a)) continue
      rota.set(i, null); rota.set(j, null)
      if (dynamicReason(rota, i, b) !== null) { rota.set(i, a); rota.set(j, b); continue }
      rota.set(i, b)
      if (dynamicReason(rota, j, a) !== null) { rota.set(i, a); rota.set(j, b); continue }
      rota.set(j, a); undo.push([i, a], [j, b])
    } else {
      // drop an optional slot (lets cost/fairness presets trim extras)
      if (slots[i].mandatory || !rota.assign[i]) continue
      undo.push([i, rota.assign[i]]); rota.set(i, null)
    }
    const sc = score(rota).total
    const delta = sc - current.total
    if (delta >= 0 || rand() < Math.exp(delta / T)) {
      current = { ...current, total: sc }
      if (sc > bestScore + 1e-9) { bestScore = sc; best = rota.clone() }
    } else {
      for (let k = undo.length - 1; k >= 0; k--) rota.set(undo[k][0], null)
      for (let k = undo.length - 1; k >= 0; k--) rota.set(undo[k][0], undo[k][1])
    }
  }
  let final = best

  // ── 5a. Fix any remaining "can't be alone" by reassigning or opening the shift ──
  const aloneShift = (r: Rota, m: string, i: number) => {
    const others: Interval[] = []
    for (const [o, l] of r.byMember) if (o !== m) for (const q of l) if (overlaps(q.iv, ivs[i])) others.push(q.iv)
    return !isCovered(ivs[i], others)
  }
  for (const m of cantBeAlone) {
    for (let i = 0; i < slots.length; i++) {
      if (final.assign[i] !== m || pinned.has(i) || !aloneShift(final, m, i)) continue
      final.set(i, null)
      const alt = eligible[i].find(x => !cantBeAlone.includes(x) && dynamicReason(final, i, x) === null)
      if (alt) final.set(i, alt)
    }
  }

  // ── 5b. Output + independent validation ──
  const out: Shift[] = []
  slots.forEach((s, i) => {
    const m = final.assign[i]
    if (m) out.push({ id: `g-${s.id}`, memberId: m, date: s.date, start: s.start, end: s.end, roleId: s.roleId, breakMinutes: s.breakMinutes, kind: s.kind })
  })
  const allShifts = [...locked, ...out]
  const check = validateSchedule({ ...input, shifts: allShifts })
  // Safety net: a per-person hard break here would be an engine bug — open the shift rather than publish it.
  const PERSONAL = new Set(['overlap', 'unavailable', 'time_off', 'missing_role', 'min_rest', 'max_daily_hours', 'max_weekly_hours', 'contract_max_hours', 'weekly_rest', 'max_shifts_week', 'cant_work_with'])
  const unsafe = new Set<string>()
  for (const v of check.violations) if (PERSONAL.has(v.code)) for (const id of v.shiftIds) if (id.startsWith('g-')) unsafe.add(id)
  if (unsafe.size) {
    slots.forEach((s, i) => { if (unsafe.has(`g-${s.id}`)) final.set(i, null) })
  }
  const finalShifts = unsafe.size ? allShifts.filter(s => !unsafe.has(s.id)) : allShifts
  const finalCheck = unsafe.size ? validateSchedule({ ...input, shifts: finalShifts }) : check
  const finalScore = score(final)

  // ── 5c. Explain every empty slot ──
  const REASON_TEXT: Record<ReasonCode, string> = {
    unavailable: "isn't available", time_off: 'is on time off', missing_role: "doesn't have the role",
    overlap: 'is already on another shift', min_rest: `would get less than ${pack.minRestHours}h rest`,
    max_daily_hours: `would pass ${pack.maxDailyHours}h that day`, max_weekly_hours: `would pass ${pack.maxWeeklyHours}h that week`,
    contract_max_hours: 'would pass their contract hours', max_shifts_week: 'is at their max shifts',
    weekly_rest: `would lose their ${pack.weeklyRestHours}h weekly rest`, cant_work_with: "can't work with someone already on",
    not_worth_cost: 'could work it, but it was left open to save cost/hours', feasible: 'could work it',
  }
  const unfilled: UnfilledSlot[] = []
  slots.forEach((s, i) => {
    if (final.assign[i]) return
    const candidates: CandidateReason[] = members.map(m => {
      const code: ReasonCode = staticReason(i, m) ?? dynamicReason(final, i, m.id) ?? (s.mandatory ? 'feasible' : 'not_worth_cost')
      return { memberId: m.id, code, message: `${m.name} ${REASON_TEXT[code]}` }
    })
    const counts = new Map<ReasonCode, number>()
    for (const c of candidates) counts.set(c.code, (counts.get(c.code) || 0) + 1)
    const blocked = candidates.filter(c => !['unavailable', 'time_off', 'missing_role'].includes(c.code)).slice(0, 3).map(c => c.message)
    const parts = [...counts].filter(([c]) => ['unavailable', 'time_off', 'missing_role'].includes(c))
      .map(([c, n]) => `${n} ${c === 'unavailable' ? 'unavailable' : c === 'time_off' ? 'on time off' : 'without the role'}`)
    const label = `${s.label ? s.label + ' ' : ''}${s.date} ${s.start}–${s.end}`
    unfilled.push({
      slot: s, candidates,
      summary: `${label}${s.mandatory ? '' : ' (optional)'}: ${[...parts, ...blocked].join('; ') || 'nobody on the team'}.`,
    })
  })

  const summaries: MemberSummary[] = members.map(m => {
    const l = final.list(m.id)
    const mins = l.reduce((a, p) => a + p.worked, 0)
    const rate = m.hourlyRate
    return {
      memberId: m.id, hours: Math.round(mins / 6) / 10, target: m.targetHours ?? null,
      fairTarget: Math.round((fairTarget.get(m.id) || 0) / 6) / 10, shifts: l.length,
      cost: rate != null ? Math.round(mins / 60 * rate * 100) / 100 : null,
    }
  })

  const violations = [
    ...finalCheck.violations,
    ...extraViolations.map(message => ({ code: 'required_on_shift' as const, shiftIds: [], message })),
  ]
  return {
    engineVersion: ENGINE_VERSION, seed, shifts: finalShifts, unfilled, violations,
    score: finalScore, members: summaries, iterations,
  }
}

