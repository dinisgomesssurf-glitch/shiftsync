import { useMemo } from 'react'
import { DAYS, toMins, initials } from '../lib/utils'
import { buildPersonColors, personColor, totalHours } from '../lib/scheduleEngine'

export default function ScheduleRoster({ shiftsByDay, members = [] }){
  const colors = useMemo(()=>buildPersonColors(members), [members])

  // Group shifts by user
  const rows = useMemo(()=>{
    const byUser = {}
    for (let di=0; di<7; di++){
      for (const sh of (shiftsByDay[di] || [])){
        const k = sh.name
        if (!byUser[k]) byUser[k] = { name:sh.name, id:sh.user_id, days: DAYS.map(()=>[]) }
        byUser[k].days[di].push(sh)
      }
    }
    // Ensure all members appear, even with no shifts
    for (const m of members){
      if (!byUser[m.name]) byUser[m.name] = { name:m.name, id:m.id, days: DAYS.map(()=>[]) }
    }
    // Sort each day by start time
    for (const u of Object.values(byUser)){
      u.days.forEach(arr => arr.sort((a,b)=>toMins(a.start_time)-toMins(b.start_time)))
    }
    return Object.values(byUser).sort((a,b)=>a.name.localeCompare(b.name))
  }, [shiftsByDay, members])

  return (
    <div className="roster">
      <div className="card-label">Shifts by person</div>
      <div className="roster-list">
        {rows.map(r => {
          const flat = r.days.flat()
          const hrs = totalHours(flat)
          const c = personColor(colors, r.name)
          return (
            <div key={r.name} className="roster-row">
              <div className="roster-who">
                <span className="avatar roster-avatar" style={{background:c.bg, color:c.fg}}>{initials(r.name)}</span>
                <div className="roster-who-text">
                  <div className="roster-name">{r.name}</div>
                  <div className="roster-total">{Math.round(hrs*10)/10}h this week</div>
                </div>
              </div>
              <div className="roster-days">
                {r.days.map((dayShifts, di) => (
                  <div key={di} className={`roster-day ${dayShifts.length===0?'roster-day-off':''}`}>
                    <div className="roster-day-h">{DAYS[di]}</div>
                    {dayShifts.length === 0 ? (
                      <div className="roster-off">—</div>
                    ) : (
                      <div className="roster-shifts">
                        {dayShifts.map((sh,i)=>(
                          <span key={i} className="roster-pill" style={{background:c.bg, color:c.fg, borderColor:c.fg}}>
                            {sh.start_time}–{sh.end_time}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <div className="muted" style={{padding:'12px', textAlign:'center'}}>No shifts in this schedule.</div>
        )}
      </div>
    </div>
  )
}
