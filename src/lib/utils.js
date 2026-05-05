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
export function weekRange(w){
  const base=new Date(); base.setDate(base.getDate()-base.getDay()+1+w*7)
  const sun=new Date(base); sun.setDate(sun.getDate()+6)
  const f=d=>d.toLocaleDateString('en-GB',{day:'numeric',month:'short'})
  return `${f(base)} – ${f(sun)}`
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
