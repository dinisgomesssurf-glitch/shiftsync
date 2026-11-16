// Date and time helpers for the UI. Dates are ISO strings ("2026-11-16"),
// times are "HH:MM". Weeks start on Monday.
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export function todayISO() { return iso(new Date()) }
export function addDaysISO(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d) }
export function weekStartOf(s = todayISO()) {
  const d = parseISO(s)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return iso(d)
}
export function isISODate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') }

export function toMins(t) { if (!t || !t.includes(':')) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const hhmm = t => (t || '').slice(0, 5)
/** "08:30" → "8:30", "14:00" → "14" — compact for shift chips. */
export function shortTime(t) { const [h, m] = hhmm(t).split(':'); return m === '00' ? String(Number(h)) : `${Number(h)}:${m}` }
export function timeRange(a, b) { return `${shortTime(a)}–${shortTime(b)}` }
export function spanMinutes(a, b) { let m = toMins(b) - toMins(a); if (m <= 0) m += 1440; return m }
export function fmtHours(h) { const r = Math.round(h * 10) / 10; return `${Number.isInteger(r) ? r : r.toFixed(1)}h` }

export function fmtWeekRange(ws) {
  const a = parseISO(ws), b = parseISO(addDaysISO(ws, 6))
  const mo = d => d.toLocaleDateString('en-GB', { month: 'short' })
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${mo(b)}` : `${a.getDate()} ${mo(a)} – ${b.getDate()} ${mo(b)}`
}
export function weekLabel(ws) {
  const diff = Math.round((parseISO(ws) - parseISO(weekStartOf())) / (7 * 86400000))
  return diff === 0 ? 'This week' : diff === 1 ? 'Next week' : diff === -1 ? 'Last week' : null
}
export function fmtDayLong(s) { return parseISO(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) }

export function initials(name) { return (name || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) }
const TINTS = ['#FFD9B8', '#FFE7A3', '#CFE8C2', '#C9E4F2', '#E3D2F4', '#F9CFD8', '#D8E6B5', '#F4D6B8']
export function tintFor(key) {
  let h = 0
  for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}
/** Shift "daypart" drives the chip colour: the rota reads like a highlighted wall chart. */
export function daypart(start, end) {
  const s = toMins(start)
  if (toMins(end) <= s) return 'night'
  return s < 10 * 60 ? 'morning' : s < 12 * 60 ? 'midday' : 'evening'
}
