import { DAYS, ROW_H, SCOLORS, toMins, toTime, nameShiftColor } from '../lib/utils'

// Build a stable color map: each member gets a unique color from the palette,
// keyed by their name. Falls back to hash-based for unknown names.
function buildColorMap(members){
  const map = {}
  ;(members || []).forEach((m, i) => {
    map[m.name] = SCOLORS[i % SCOLORS.length]
  })
  return map
}
const colorFor = (map, name) => map[name] || nameShiftColor(name)

// Renders a timetable where each block spans its full duration via absolute positioning.
export default function SpanningTimetable({
  shifts, daySettings, axisS, axisE, staffingReqs=[],
  editable, members, onEditShift, showUnderstaffed, cannotAlone=[]
}){
  const colorMap = buildColorMap(members)
  const rows = []
  for(let m=axisS; m<axisE; m+=30) rows.push(m)

  function checkViols(dayShifts){
    return dayShifts.filter(sh => cannotAlone.includes(sh.name) &&
      !dayShifts.some(o => o.name!==sh.name &&
        toMins(o.end_time) > toMins(sh.start_time) &&
        toMins(o.start_time) < toMins(sh.end_time)))
      .map(sh => ({name:sh.name, msg:'alone'}))
  }

  function getUnderstaffed(allShifts){
    if(!showUnderstaffed) return []
    const issues = []
    staffingReqs.forEach(req => {
      const dayShifts = allShifts[req.day_index]||[]
      const covered = dayShifts.filter(sh =>
        toMins(sh.start_time) < toMins(req.end_time) &&
        toMins(sh.end_time) > toMins(req.start_time)
      ).length
      if(covered < req.min_workers) issues.push({...req, covered})
    })
    return issues
  }

  const understaffed = getUnderstaffed(shifts)

  return(
    <div>
      {understaffed.length>0 && (
        <div style={{marginBottom:'10px',display:'flex',flexDirection:'column',gap:'4px'}}>
          {understaffed.map((u,i)=>(
            <div key={i} className="understaffed-banner">
              <span style={{flex:1}}><strong>{DAYS[u.day_index]}</strong> {u.label} ({u.start_time}–{u.end_time}): {u.covered}/{u.min_workers} workers</span>
              {editable && (
                <button className="btn btn-sm btn-light"
                  onClick={()=>onEditShift && onEditShift('assign', u.day_index, u)}>
                  Assign
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="tt-wrap">
        <table className="tt" style={{tableLayout:'fixed'}}>
          <thead><tr>
            <th style={{width:'46px'}}></th>
            {DAYS.map((d,di)=>(
              <th key={d}>
                {d}
                <div className="tt-day-sub">
                  {(daySettings[di]||{}).open_time}–{(daySettings[di]||{}).close_time}
                </div>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((rowM)=>(
              <tr key={rowM} style={{height:ROW_H+'px'}}>
                <td className="tcol" style={{height:ROW_H+'px',verticalAlign:'top'}}>
                  {rowM%60===0 ? toTime(rowM) : ''}
                </td>
                {DAYS.map((_,di)=>{
                  const ds = daySettings[di] || {open_time:'08:30', close_time:'19:00'}
                  const closed = rowM<toMins(ds.open_time) || rowM>=toMins(ds.close_time)
                  if(closed) return <td key={di} className="tclosed" style={{height:ROW_H+'px'}}></td>

                  const dayShifts = shifts[di]||[]
                  const starting = dayShifts.filter(sh => toMins(sh.start_time)===rowM)
                  const viols = checkViols(dayShifts)

                  // Background tint for understaffed cells
                  const reqsNow = staffingReqs.filter(r =>
                    r.day_index===di &&
                    toMins(r.start_time)<=rowM &&
                    toMins(r.end_time)>rowM
                  )
                  const minNeeded = reqsNow.length ? Math.max(...reqsNow.map(r=>r.min_workers)) : 0
                  const coveredNow = dayShifts.filter(sh =>
                    toMins(sh.start_time)<=rowM && toMins(sh.end_time)>rowM
                  ).length
                  const isUnder = minNeeded>0 && coveredNow<minNeeded

                  return(
                    <td key={di} style={{
                      height:ROW_H+'px',
                      position:'relative',
                      background: isUnder ? '#FFF5F5' : '',
                      verticalAlign:'top',
                      padding:0
                    }}>
                      {starting.map((sh,si)=>{
                        const durationMins = toMins(sh.end_time)-toMins(sh.start_time)
                        const heightPx = (durationMins/30)*ROW_H - 2
                        const vi = viols.find(v=>v.name===sh.name)
                        const ri2 = dayShifts.indexOf(sh)
                        const sameStart = starting.length
                        // Cascade overlap: each shift takes most of the cell width with a stagger.
                        // Wider, more readable than splitting the cell evenly.
                        const STAGGER = 18 // % of cell width offset per overlapping shift
                        const widthPct = sameStart > 1
                          ? Math.max(60, 100 - (sameStart - 1) * STAGGER)
                          : 100
                        const leftPct  = sameStart > 1 ? si * STAGGER : 0
                        const w   = `calc(${widthPct}% - 4px)`
                        const left = `calc(${leftPct}% + 2px)`
                        return(
                          <div key={sh.id||sh.name+di+si}
                            className={`sblock ${colorFor(colorMap, sh.name)}${vi?' viol':''}${editable?' clickable':''}`}
                            onClick={editable ? ()=>onEditShift('edit', di, ri2) : undefined}
                            style={{
                              position:'absolute',
                              top:'1px',
                              left,
                              width:w,
                              height:heightPx+'px',
                              overflow:'hidden',
                              zIndex: 2 + si,
                              margin:0,
      