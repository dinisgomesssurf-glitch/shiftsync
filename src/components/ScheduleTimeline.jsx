import { useMemo, useState } from 'react'
import { DAYS, toMins, toTime, initials } from '../lib/utils'
import { assignLanes, deriveStatus } from '../lib/scheduleEngine'
import Modal from './Modal'

const DENSITY_ROW_PX = { comfortable: 28, compact: 18, dense: 12 }
const MAX_LANES_VISIBLE = 4
const ROW_INTERVAL_MIN = 30

export default function ScheduleTimeline({
  shiftsByDay, daySettings, axisS, axisE,
  staffingReqs = [], editable, members, onEditShift,
  cannotAlone = [], showUnderstaffed,
  density = 'comfortable', hideEmpty = false,
  conflictsSet = new Set(), reasons = {}, published = false,
}) {
  const ROW_PX = DENSITY_ROW_PX[density] || DENSITY_ROW_PX.comfortable
  const [overflowDay, setOverflowDay] = useState(null)

  // Pre-compute lanes per day (memoized).
  const dayLanes = useMemo(() => {
    return DAYS.map((_, di) => assignLanes(shiftsByDay[di] || []))
  }, [shiftsByDay])

  // Build the visible row list (every ROW_INTERVAL_MIN), optionally hiding rows where no shift is active anywhere.
  const rows = useMemo(() => {
    const all = []
    for (let m = axisS; m < axisE; m += ROW_INTERVAL_MIN) all.push(m)
    if (!hideEmpty) return all
    return all.filter(m => {
      for (let di = 0; di < 7; di++) {
        const dayShifts = shiftsByDay[di] || []
        if (dayShifts.some(s => toMins(s.start_time) <= m && toMins(s.end_time) > m)) return true
      }
      return false
    })
  }, [shiftsByDay, axisS, axisE, hideEmpty])

  // Day-header sub-text: hours
  function dayHours(di){ const ds = daySettings[di]||{}; return `${ds.open_time||''}–${ds.close_time||''}` }

  // Understaffed banner
  const understaffed = useMemo(() => {
    if (!showUnderstaffed) return []
    const out = []
    for (const req of staffingReqs) {
      const dayShifts = shiftsByDay[req.day_index] || []
      const covered = dayShifts.filter(sh =>
        toMins(sh.start_time) < toMins(req.end_time) &&
        toMins(sh.end_time)   > toMins(req.start_time)
      ).length
      if (covered < req.min_workers) out.push({ ...req, covered })
    }
    return out
  }, [shiftsByDay, staffingReqs, showUnderstaffed])

  // Click handler maps lane block back to the dayShifts index for editing
  function handleClick(di, sh){
    if (!editable || !onEditShift) return
    const idx = (shiftsByDay[di] || []).indexOf(
      (shiftsByDay[di] || []).find(s => s.id === sh.id)
    )
    if (idx >= 0) onEditShift('edit', di, idx)
  }

  return (
    <div className={`stl stl-${density}`}>
      {understaffed.length>0 && (
        <div className="stl-banners">
          {understaffed.map((u,i)=>(
            <div key={i} className="understaffed-banner">
              <span style={{flex:1}}>
                <strong>{DAYS[u.day_index]}</strong> {u.label} ({u.start_time}–{u.end_time}): {u.covered}/{u.min_workers}
              </span>
              {editable && onEditShift && (
                <button className="btn btn-sm btn-light" onClick={()=>onEditShift('assign', u.day_index, u)}>Assign</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="stl-scroll">
        <table className="stl-table" style={{'--row-h': ROW_PX+'px'}}>
          <thead>
            <tr>
              <th className="stl-corner"></th>
              {DAYS.map((d, di) => (
                <th key={d} className="stl-day-h">
                  <div className="stl-day-name">{d}</div>
                  <div className="stl-day-hours">{dayHours(di)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowM, ri) => (
              <tr key={rowM} className={rowM%60===0?'stl-row-hour':''}>
                <td className="stl-time">{rowM%60===0 ? toTime(rowM) : ''}</td>
                {DAYS.map((_, di) => {
                  const ds = daySettings[di] || {open_time:'08:30', close_time:'19:00'}
                  const closed = rowM < toMins(ds.open_time) || rowM >= toMins(ds.close_time)
                  if (closed) return <td key={di} className="stl-cell stl-closed"/>

                  const { shifts: lanedShifts, laneCount } = dayLanes[di]
                  const startingHere = lanedShifts.filter(sh => toMins(sh.start_time) === rowM)
                  if (!startingHere.length) {
                    // background tint for under-staffed cells (uses staffingReqs/min)
                    const reqsNow = staffingReqs.filter(r =>
                      r.day_index===di &&
                      toMins(r.start_time) <= rowM &&
                      toMins(r.end_time)   >  rowM
                    )
                    const minNeeded = reqsNow.length ? Math.max(...reqsNow.map(r=>r.min_workers)) : 0
                    const coveredNow = (shiftsByDay[di]||[]).filter(sh =>
                      toMins(sh.start_time) <= rowM && toMins(sh.end_time) > rowM
                    ).length
                    const isUnder = minNeeded>0 && coveredNow<minNeeded
                    return <td key={di} className={`stl-cell ${isUnder?'stl-under':''}`}/>
                  }

                  // Decide visible vs overflow lanes
                  const visibleCount = laneCount > MAX_LANES_VISIBLE ? MAX_LANES_VISIBLE - 1 : laneCount
                  const visible = startingHere.filter(s => s._lane < visibleCount)
                  const overflow = startingHere.filter(s => s._lane >= visibleCount)

                  return (
                    <td key={di} className="stl-cell stl-cell-block">
                      {visible.map(sh => {
                        const dur = toMins(sh.end_time) - toMins(sh.start_time)
                        const heightPx = (dur / ROW_INTERVAL_MIN) * ROW_PX - 2
                        const widthPct = 100 / Math.max(1, visibleCount + (overflow.length ? 1 : 0))
                        const leftPct  = sh._lane * widthPct
                        const status = deriveStatus(sh, { published, conflictsSet, reasons })
                        const conflictReason = (reasons[sh.id] || []).join(', ')
                        return (
                          <button key={sh.id||sh.name+rowM+sh._lane}
                            className={`stl-block s-${status} ${editable?'is-clickable':''}`}
                            onClick={()=>handleClick(di, sh)}
                            disabled={!editable}
                            style={{
                              top:'1px',
                              left: `calc(${leftPct}% + 1px)`,
                              width: `calc(${widthPct}% - 2px)`,
                              height: heightPx + 'px',
                            }}
                            aria-label={`${sh.name}, ${sh.start_time} to ${sh.end_time}${conflictReason ? ', '+conflictReason : ''}`}
                            title={conflictReason ? `${sh.name} · ${sh.start_time}–${sh.end_time}\n${conflictReason}` : `${sh.name} · ${sh.start_time}–${sh.end_time}`}>
                            <span className="stl-avatar">{initials(sh.name)}</span>
                            <span className="stl-block-body">
                              <span className="stl-block-name">{sh.name}</span>
                              <span className="stl-block-time">{sh.start_time}–{sh.end_time}</span>
                            </span>
                            {conflictReason && <span className="stl-block-warn" aria-hidden="true">⚠</span>}
                          </button>
                        )
                      })}
                      {overflow.length>0 && (
                        <button className="stl-overflow"
                          onClick={()=>setOverflowDay({di, rowM, shifts: overflow.concat(visible)})}
                          style={{
                            top:'1px',
                            left: `calc(${(visibleCount) * (100/(visibleCount+1))}% + 1px)`,
                            width: `calc(${100/(visibleCount+1)}% - 2px)`,
                            height: ROW_PX - 2 + 'px',
                          }}>
                          +{overflow.length} more
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Status legend (color = meaning, not identity) */}
      <div className="status-legend">
        <span className="legend-item"><span className="status-swatch s-confirmed"/>Confirmed</span>
        <span className="legend-item"><span className="status-swatch s-pending"/>Pending</span>
        <span className="legend-item"><span className="status-swatch s-open"/>Open shift</span>
        <span className="legend-item"><span className="status-swatch s-conflict"/>Conflict</span>
        <span className="legend-item"><span className="status-swatch s-overtime"/>Overtime</span>
      </div>

      {overflowDay && (
        <Modal title={`${DAYS[overflowDay.di]} · ${toTime(overflowDay.rowM)} — all shifts`} onClose={()=>setOverflowDay(null)}>
          <div className="stl-overflow-list">
            {overflowDay.shifts.sort((a,b)=>a._lane-b._lane).map(sh=>{
              const status = deriveStatus(sh, { published, conflictsSet, reasons })
              return (
                <button key={sh.id} className={`stl-overflow-row s-${status}`} onClick={()=>{setOverflowDay(null); handleClick(overflowDay.di, sh)}}>
                  <span className="stl-avatar">{initials(sh.name)}</span>
                  <span style={{flex:1}}>
                    <span style={{fontWeight:600}}>{sh.name}</span>
                    <span style={{display:'block',fontSize:11,opacity:.8}}>{sh.start_time}–{sh.end_time}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Modal>
      )}
    </div>
  )
}
