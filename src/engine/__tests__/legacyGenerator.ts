// A faithful port of the pre-v2 generator (App.jsx genSchedule, Phase 1), used
// only to prove the new engine beats it on the same inputs.
import { addDays, daysBetween, toMinutes, weekdayOf } from '../time'
import type { GenerateInput, Shift } from '../types'

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function legacyGenerate(input: GenerateInput): Shift[] {
  const SLOT = 15
  const out: Shift[] = []
  const days = daysBetween(input.periodStart, input.periodEnd) + 1
  for (let d = 0; d < days; d++) {
    const date = addDays(input.periodStart, d)
    const wd = weekdayOf(date)
    // Old "staffing requirements" = each template window with min_workers = its head count, used as a CAP.
    const cap: Record<number, number> = {}
    for (const t of (input.templates || []).filter(t => t.weekday === wd))
      for (let m = toMinutes(t.start); m < toMinutes(t.end); m += SLOT) cap[m] = Math.max(cap[m] || 0, t.target)
    const oh = (input.openingHours || []).find(o => o.weekday === wd)
    const oM = oh ? toMinutes(oh.open) : 0, cM = oh ? toMinutes(oh.close) : 24 * 60
    const count: Record<number, number> = {}
    for (const m of input.members) { // list order — the source of the old unfairness
      for (const a of (input.availability || []).filter(a => a.memberId === m.id && a.date === date)) {
        const s = Math.max(toMinutes(a.start), oM), e = Math.min(toMinutes(a.end), cM)
        let runStart: number | null = null
        const runs: [number, number][] = []
        for (let t = s; t < e; t += SLOT) {
          const ok = cap[t] === undefined || (count[t] || 0) < cap[t]
          if (ok && runStart === null) runStart = t
          if (!ok && runStart !== null) { runs.push([runStart, t]); runStart = null }
        }
        if (runStart !== null) runs.push([runStart, e])
        for (const [rs, re] of runs) {
          if (re - rs < 30) continue
          out.push({ id: `L${out.length}`, memberId: m.id, date, start: toTime(rs), end: toTime(re), breakMinutes: 0 })
          for (let t = rs; t < re; t += SLOT) count[t] = (count[t] || 0) + 1
        }
      }
    }
  }
  return out
}
