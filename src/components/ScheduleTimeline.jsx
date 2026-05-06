import { useMemo, useState } from 'react'
import { DAYS, toMins, toTime, initials } from '../lib/utils'
import { assignLanes, deriveStatus, buildPersonColors, personColor } from '../lib/scheduleEngine'
import Modal from './Modal'

// Pixels per HOUR (not per 30-min). Density toggles change this.
const PX_PER_HOUR = { comfortable: 64, compact: 40, dense: 24 }
const MAX_LANES_VISIBLE = 3
const SLOT_MIN = 15 // sub-row (for label increments only)

export default function ScheduleTimeline({
  shiftsByDay, daySettings, axisS, axisE,
  staffingReqs = [], editable, members, onEditShift,
  cannotAlone = [], showUnderstaffed,
  density = 'comfortable', hideEmpty = false,
  conflictsSet = new Set(), reasons = {}, published = false,
}) {
  const pxPerHour = PX_PER_HOUR[density] || PX_PER_HOUR.comfortable
  const pxPerMin  = pxPerHour / 60
  const [overflowDay, setOverflowDay] = useState(null)

  // Auto-fit axis to actual shift extents (with 30-min padding) when shifts are sparse.
  const fittedAxis = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    for (let di = 0; di < 7; di++) {
      for (const sh of (shiftsByDay[di] || [])) {
        lo = Math.min(lo, toMins(sh.start_time))
        hi = Math.max(hi, toMins(sh.end_time))
      }
    }
    if (!isFinite(lo)) return { aS: axisS, aE: axisE }
    // Snap to hour, pad 30 minutes
    const snappedLo = Math.max(0, Math.floor((lo - 30) / 60) * 60)
    const snappedHi = Math.min(24 * 60, Math.ceil((hi + 30) / 60) * 60)
    if (hideEmpty) return { aS: snappedLo, aE: snappedHi }
    // Default: union of opening hours and shift extents (so we never crop real shifts)
    return { aS: Math.min(axisS, snappedLo), aE: Math.max(axisE, snappedHi) }
  }, [shiftsByDay, axisS, axisE, hideEmpty])

  const { aS, aE } = fittedAxis
  const totalMin = aE - aS
  const bodyHeight = Math.max(120, totalMin * pxPerMin)
  const hourMarks = []
  for (let m = Math.ceil(aS / 60) * 60; m <= aE; m += 60) hourMarks.push(m)

  // Lane assignment per day, memoized
  const dayLanes = useMemo(() => DAYS.map((_, di) => assignLanes(shiftsByDay[di] || [])), [shiftsByDay])
  const personColors = useMemo(() => buildPersonColors(members), [members])

  // Understaffed banner data
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

  function handleClick(di, sh){
    if (!editable || !onEditShift) return
    const arr = shiftsByDay[di] || []
    const idx = arr.findIndex(s => s.id === sh.id)
    if (idx >= 0) onEditShift('edit', di, idx)
  }

  // Render shift block with absolute top/height/left/width
  function renderBlock(sh, di, laneCount, visibleCount, opts = {}){
    const dur = sh._endM - sh._startM
    const top = (sh._startM - aS) * pxPerMin
    const height = Math.max(20, dur * pxPerMin - 2)
    // Width is driven by THIS shift's cluster size (not the day-wide max).
    // If the cluster has more concurrent shifts than we can display, we shrink to
    // visibleCount+1 to leave room for the overflow chip.
    const localSize = sh._clusterSize || 1
    const denom = (opts.hasOverflow && localSize > visibleCount)
      ? visibleCount + 1
      : Math.min(localSize, visibleCount + (opts.hasOverflow ? 1 : 0))
    const widthPct = 100 / Math.max(1, denom)
    const leftPct = sh._lane * widthPct
    const status = deriveStatus(sh, { published, conflictsSet, reasons })
    const conflictReason = (reasons[sh.id] || []).join(', ')
    // Mark blocks below 90px wide so CSS can compact text
    const isNarrow = denom >= 3

    return (
      <button key={sh.id || `${sh.name}-${sh._startM}-${sh._lane}`}
        className={`stl-block s-${status} ${editable?'is-clickable':''} ${isNarrow?'is-narrow':''}`}
        onClick={()=>handleClick(di, sh)}
        disabled={!editable}
        style={{
          top: top + 'px',
          height: height + 'px',
          left: `calc(${leftPct}% + 1px)`,
          width: `calc(${widthPct}% - 2px)`,
          zIndex: 2 + sh._lane,
        }}
        aria-label={`${sh.name}, ${sh.start_time} to ${sh.end_time}${conflictReason ? ', '+conflictReason : ''}`}
        title={conflictReason ? `${sh.name} · ${sh.start_time}–${sh.end_time}\n${conflictReason}` : `${sh.name} · ${sh.start_time}–${sh.end_time}`}>
        <span className="stl-avatar" style={{background: personColor(personColors, sh.name).bg, color: personColor(personColors, sh.name).fg}}>{initials(sh.name)}</span>
        <span className="stl-block-body">
          <span className="stl-block-name">{sh.name}</span>
          <span className="stl-block-time">{sh.start_time}–{sh.end_time}</span>
        </span>
        {conflictReason && <span className="stl-block-warn" aria-hidden="true">⚠</span>}
      </button>
    )
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

      <div className="stl-grid">
        {/* Header row */}
        <div className="stl-headers">
          <div className="stl-corner"/>
          {DAYS.map((d, di) => (
            <div key={d} className={`stl-day-h stl-col-${di} ${di>=5?'stl-col-weekend':''} ${di%2===0?'stl-col-a':'stl-col-b'}`}>
              <div className="stl-day-name">{d}</div>
              <div className="stl-day-hours">{daySettings[di]?.open_time}–{daySettings[di]?.close_time}</div>
            </div>
          ))}
        </div>

        {/* Body row: time column + 7 day columns */}
        <div className="stl-body" style={{height: bodyHeight + 'px'}}>
          {/* Time column with hour labels */}
          <div className="stl-time-col">
            {hourMarks.map(m => (
              <div key={m} className="stl-time-tick" style={{top: ((m - aS) * pxPerMin) + 'px'}}>
                {toTime(m)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS.map((d, di) => {
            const ds = daySettings[di] || {open_time:'08:30', close_time:'19:00'}
            const dayOpen  = toMins(ds.open_time)
            const dayClose = toMins(ds.close_time)
            const closedTopPct  = Math.max(0, (dayOpen  - aS) * pxPerMin)
            const closedBotTop  = Math.min(bodyHeight, (dayClose - aS) * pxPerMin)
            const closedBotH    = Math.max(0, bodyHeight - closedBotTop)

            const { shifts: lanedShifts, laneCount } = dayLanes[di]
            const visibleCount = laneCount > MAX_LANES_VISIBLE ? MAX_LANES_VISIBLE - 1 : laneCount
            const visibleShifts = lanedShifts.filter(s => s._lane < visibleCount)
            const overflowShifts = lanedShifts.filter(s => s._lane >= visibleCount)

            return (
              <div key={di} className={`stl-day-col stl-col-${di} ${di>=5?'stl-col-weekend':''} ${di%2===0?'stl-col-a':'stl-col-b'}`}>
                {/* Hour grid lines */}
                {hourMarks.map(m => (
                  <div key={m} className="stl-day-line" style={{top: ((m - aS) * pxPerMin) + 'px'}}/>
                ))}
                {/* Closed-hours background */}
                {closedTopPct > 0 && (
                  <div className="stl-closed-bg" style={{top:0, height: closedTopPct + 'px'}}/>
                )}
                {closedBotH > 0 && (
                  <div className="stl-closed-bg" style={{top: closedBotTop + 'px', height: closedBotH + 'px'}}/>
                )}
                {/* Visible shift blocks */}
                {visibleShifts.map(sh => renderBlock(sh, di, laneCount, visibleCount, { hasOverflow: overflowShifts.length > 0 }))}
                {/* Overflow chip (one per starting row) */}
                {overflowShifts.length > 0 && (() => {
                  // Show chip at the earliest overflow start
                  const chipTop = (overflowShifts[0]._startM - aS) * pxPerMin
                  const widthPct = 100 / (visibleCount + 1)
                  const leftPct = visibleCount * widthPct
                  return (
                    <button className="stl-overflow"
                      onClick={()=>setOverflowDay({ di, shifts: overflowShifts.concat(visibleShifts) })}
                      style={{
                        top: chipTop + 'px',
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        height: Math.max(22, pxPerHour * 0.5) + 'px',
                      }}>
                      +{overflowShifts.length} more
                    </button>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>

      <div className="status-legend">
        <span className="legend-item"><span className="status-swatch s-confirmed"/>Confirmed</span>
        <span className="legend-item"><span className="status-swatch s-pending"/>Pending</span>
        <span className="legend-item"><span className="status-swatch s-open"/>Open shift</span>
        <span className="legend-item"><span className="status-swatch s-conflict"/>Conflict</span>
        <span className="legend-item"><span className="status-swatch s-overtime"/>Overtime</span>
      </div>

      {overflowDay && (
        <Modal title={`${DAYS[overflowDay.di]} — all overlapping shifts`} onClose={()=>setOverflowDay(null)}>
          <div className="stl-overflow-list">
            {overflowDay.shifts.sort((a,b)=>a._lane-b._lane).map(sh=>{
              const status = deriveStatus(sh, { published, conflictsSet, reasons })
              return (
                <button key={sh.id} className={`stl-overflow-row s-${status}`} onClick={()=>{setOverflowDay(null); handleClick(overflowDay.di, sh)}}>
                  <span className="stl-avatar" style={{background: personColor(personColors, sh.name).bg, color: personColor(personColors, sh.name).fg}}>{initials(sh.name)}</span>
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
