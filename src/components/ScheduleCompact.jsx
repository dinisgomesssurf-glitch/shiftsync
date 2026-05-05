import { useMemo } from 'react'
import { DAYS, toMins, initials, nameColor } from '../lib/utils'
import { SEGMENTS, shiftFitsSegment, totalHours, deriveStatus } from '../lib/scheduleEngine'

export default function ScheduleCompact({
  shiftsByDay, members = [], onEditShift, editable,
  conflictsSet = new Set(), reasons = {}, published = false,
}){
  // Flatten to (member -> day -> segment -> shifts[])
  const data = useMemo(() => {
    const byMember = {}
    for (const m of members) {
      byMember[m.name] = { name:m.name, id:m.id, days: DAYS.map(()=>SEGMENTS.map(()=>[])) }
    }
    for (let di=0; di<7; di++){
      for (const sh of (shiftsByDay[di] || [])){
        const slot = byMember[sh.name]
        if (!slot) continue
        SEGMENTS.forEach((seg, si) => {
          if (shiftFitsSegment(sh, seg)) slot.days[di][si].push(sh)
        })
      }
    }
    return Object.values(byMember)
  }, [shiftsByDay, members])

  const weeklyTotals = data.map(row => totalHours(row.days.flat(2).filter((sh,i,a)=>a.indexOf(sh)===i)))

  return (
    <div className="cmp-wrap">
      <div className="cmp-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th rowSpan={2} className="cmp-worker-h">Worker</th>
              {DAYS.map(d => <th key={d} colSpan={SEGMENTS.length} className="cmp-day-h">{d}</th>)}
              <th rowSpan={2} className="cmp-total-h">Total</th>
            </tr>
            <tr>
              {DAYS.map(d => SEGMENTS.map(s => (
                <th key={d+s.key} className="cmp-seg-h" title={`${s.start}–${s.end}`}>{s.label[0]}</th>
              )))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri)=>{
              const [bg, fg] = nameColor(row.name)
              return (
                <tr key={row.id||row.name}>
                  <th className="cmp-worker">
                    <span className="avatar cmp-avatar" style={{background:bg, color:fg}}>{initials(row.name)}</span>
                    <span className="cmp-worker-name">{row.name}</span>
                  </th>
                  {DAYS.map((d, di) => SEGMENTS.map((seg, si) => {
                    const cellShifts = row.days[di][si]
                    if (!cellShifts.length) return <td key={d+seg.key} className="cmp-cell cmp-cell-empty"/>
                    // Render combined hours; if multiple, summarize
                    const sample = cellShifts[0]
                    const status = deriveStatus(sample, { published, conflictsSet, reasons })
                    const tip = cellShifts.map(s=>`${s.start_time}–${s.end_time}`).join(', ')
                    return (
                      <td key={d+seg.key} className={`cmp-cell s-${status}`} title={tip}>
                        <button
                          className="cmp-pill"
                          disabled={!editable}
                          onClick={()=>{
                            if (!editable || !onEditShift) return
                            const idx = (shiftsByDay[di]||[]).indexOf(sample)
                            if (idx>=0) onEditShift('edit', di, idx)
                          }}>
                          {cellShifts.length>1 ? `${cellShifts.length}×` : sample.start_time.slice(0,5)}
                        </button>
                      </td>
                    )
                  }))}
                  <td className="cmp-total">{Math.round(weeklyTotals[ri]*10)/10}h</td>
                </tr>
              )
            })}
            {data.length===0 && (
              <tr><td colSpan={1+7*SEGMENTS.length+1} style={{padding:24, textAlign:'center', color:'var(--gray-500)'}}>
                No team members in this organization.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="cmp-legend">
        {SEGMENTS.map(s => <span key={s.key} className="legend-item"><strong>{s.label[0]}</strong>&nbsp;{s.label} ({s.start}–{s.end})</span>)}
      </div>
    </div>
  )
}
