// Time helpers. All times are local wall-clock times of the business.
// Absolute positions are expressed as minutes since periodStart 00:00, so a
// shift that crosses midnight is just an interval that ends past 24*60.
// (Daylight-saving changes are ignored: a 1-hour error twice a year is
// acceptable for rota planning and keeps the engine dependency-free.)

import type { HHMM, ISODate, Shift } from './types'

export const DAY_MIN = 24 * 60

export function toMinutes(t: HHMM): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '')
  if (!m) throw new Error(`Invalid time "${t}"`)
  return Number(m[1]) * 60 + Number(m[2])
}

export function fromMinutes(min: number): HHMM {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Days between two ISO dates (b - a). Uses UTC to avoid DST drift. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000)
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

/** 0 = Monday … 6 = Sunday */
export function weekdayOf(d: ISODate): number {
  return (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7
}

/**
 * First day of the week containing `d`.
 * weekStartsOn: 0 = Monday … 6 = Sunday (Canada often starts on Sunday = 6).
 */
export function weekStartOf(d: ISODate, weekStartsOn = 0): ISODate {
  const back = (weekdayOf(d) - weekStartsOn + 7) % 7
  return addDays(d, -back)
}

/** Shift length in minutes; end <= start means it ends the next day. */
export function shiftSpan(s: Pick<Shift, 'start' | 'end'>): number {
  const a = toMinutes(s.start)
  let b = toMinutes(s.end)
  if (b <= a) b += DAY_MIN
  return b - a
}

/** Worked minutes = span minus unpaid break. */
export function workedMinutes(s: Pick<Shift, 'start' | 'end' | 'breakMinutes'>): number {
  return shiftSpan(s) - (s.breakMinutes || 0)
}

export interface Interval { s: number; e: number }

/** Absolute interval of a shift, in minutes from periodStart 00:00. */
export function shiftInterval(s: Pick<Shift, 'date' | 'start' | 'end'>, periodStart: ISODate): Interval {
  const s0 = daysBetween(periodStart, s.date) * DAY_MIN + toMinutes(s.start)
  return { s: s0, e: s0 + shiftSpan(s) }
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.s < b.e && b.s < a.e
}

/** Merge overlapping/touching intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((x, y) => x.s - y.s)
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.s <= last.e) last.e = Math.max(last.e, iv.e)
    else out.push({ ...iv })
  }
  return out
}

/** True if `inner` is fully covered by the union of `cover`. */
export function isCovered(inner: Interval, cover: Interval[]): boolean {
  let pos = inner.s
  for (const iv of mergeIntervals(cover)) {
    if (iv.e <= pos) continue
    if (iv.s > pos) return false
    pos = iv.e
    if (pos >= inner.e) return true
  }
  return pos >= inner.e
}

export function fmtHours(min: number): string {
  const h = min / 60
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1).replace(/\.0$/, '')}h`
}
