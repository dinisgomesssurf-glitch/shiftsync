import { weekLabel, weekRange } from '../lib/utils'

export default function WeekNav({w, min, max, onNav, statusEl}){
  return(
    <div className="week-nav">
      <button className="wnav-btn" onClick={()=>onNav(w-1)} disabled={w<=min} aria-label="Previous week">←</button>
      <div className="wnav-center">
        <div className="wnav-title">{weekLabel(w)}</div>
        <div className="wnav-sub">{weekRange(w)}</div>
      </div>
      {statusEl}
      <button className="wnav-btn" onClick={()=>onNav(w+1)} disabled={w>=max} aria-label="Next week">→</button>
    </div>
  )
}
