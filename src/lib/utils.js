// Shared helpers used across views.
export const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
export const SCOLORS = ['c0','c1','c2','c3','c4','c5','c6','c7']
export const AVCOLORS = [
  ['#E6F1FB','#0C447C'],['#E1F5EE','#085041'],['#FAEEDA','#633806'],
  ['#FBEAF0','#72243E'],['#EEEDFE','#3C3489'],['#EAF3DE','#27500A'],
  ['#FAECE7','#712B13'],['#F1EFE8','#444441']
]
export const CTYPES = ["can't be alone","can't work with","max shifts/week","required on shift"]
export const ROW_H = 28 // px per 30-min row

export function toMins(t){ if(!t||!t.includes(':')) return 0; const[h,m]=t.split(':').map(Number); return h*60+m }
export function toTime(m){ return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}` }
export function weekLabel(w){ return w===0?'This week':w===-1?'Last week':w===1?'Next week':w<0?`${-w} weeks ago`:`In ${w} weeks` }

// ── Date-based weeks ──
// The UI navigates by offset from the current week (0 = this week), but the
// database stores real dates (week_start / period_start). These helpers are
// the only place the two meet. weekStartsOn: 0 = Monday … 6 = Sunday.
function isoLocal(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function parseISO(iso){ const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d) }
export function weekStartDate(offset = 0, weekStartsOn = 0){
  const d = new Date(); d.setHours(0,0,0,0)
  const weekdayMon0 = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - ((weekdayMon0 - weekStartsOn + 7) % 7) + offset * 7)
  return isoLocal(d)
}
export function weekOffsetOf(iso, weekStartsOn = 0){
  const a = parseISO(weekStartDate(0, weekStartsOn)), b = parseISO(iso)
  return Math.round((b - a) / (7 * 86400000))
}
export function addDaysISO(iso, n){ const d = parseISO(iso); d.setDate(d.getDate() + n); return isoLocal(d) }
export function weekRange(w, weekStartsOn = 0){
  const start = parseISO(weekStartDate(w, weekStartsOn))
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const f = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short' })
  return `${f(start)} – ${f(end)}`
}
export const initials = n=>(n||'?').slice(0,2).toUpperCase()
export const nameColor = n=>{
  let h=0; for(let c of (n||'')) h=(h<<5)-h+c.charCodeAt(0)
  return AVCOLORS[Math.abs(h)%8]
}
export const nameShiftColor = n=>{
  let h=0; for(let c of (n||'')) h=(h<<5)-h+c.charCodeAt(0)
  return SCOLORS[Math.abs(h)%8]
}

// Detect overlap between two [start, end) ranges (in minutes)
export function rangesOverlap(aS, aE, bS, bE){
  return aS < bE && bS < aE
}
