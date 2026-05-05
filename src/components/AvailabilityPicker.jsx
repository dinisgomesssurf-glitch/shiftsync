import { useEffect, useMemo, useRef, useState } from 'react'
import { DAYS, toMins, toTime } from '../lib/utils'

const SLOT_MIN = 15 // granularity in minutes
const ROW_PX   = 14 // pixel height per 15-min row

const cellKey = (d, m) => `${d}:${m}`

// Convert a list of availability ranges into a Set of selected 15-min cell keys.
export function rangesToCells(slotsByDay){
  const cells = new Set()
  for(const di of Object.keys(slotsByDay)){
    for(const r of slotsByDay[di]){
      if(r.on === false) continue
      const start = toMins(r.start), end = toMins(r.end)
      for(let m = start; m < end; m += SLOT_MIN){
        cells.add(cellKey(parseInt(di), m))
      }
    }
  }
  return cells
}

// Convert a Set of cell keys back into ranges per day, ready to upsert.
export function cellsToRanges(cells){
  const byDay = {}
  for(const key of cells){
    const [d, m] = key.split(':').map(Number)
    if(!byDay[d]) byDay[d] = []
    byDay[d].push(m)
  }
  const out = []
  for(const di of Object.keys(byDay)){
    const mins = byDay[di].sort((a,b)=>a-b)
    let s = mins[0], prev = mins[0]
    let slot_index = 0
    for(let i = 1; i < mins.length; i++){
      if(mins[i] === prev + SLOT_MIN){ prev = mins[i]; continue }
      out.push({day_index: parseInt(di), slot_index: slot_index++, start: toTime(s), end: toTime(prev + SLOT_MIN), on: true})
      s = mins[i]; prev = mins[i]
    }
    if(s !== undefined){
      out.push({day_index: parseInt(di), slot_index: slot_index++, start: toTime(s), end: toTime(prev + SLOT_MIN), on: true})
    }
  }
  return out
}

export default function AvailabilityPicker({ daySettings, initialCells, onChange, disabled }){
  // axis: earliest open → latest close across all days, snapped to 15-min boundaries
  const { axisS, axisE } = useMemo(()=>{
    const opens  = daySettings.map(d => toMins(d.open_time))
    const closes = daySettings.map(d => toMins(d.close_time))
    const aS = Math.max(0, Math.min(...opens))
    const aE = Math.min(24*60, Math.max(...closes))
    return {
      axisS: Math.floor(aS / SLOT_MIN) * SLOT_MIN,
      axisE: Math.ceil(aE  / SLOT_MIN) * SLOT_MIN,
    }
  }, [daySettings])

  const rows = useMemo(()=>{
    const out = []
    for(let m = axisS; m < axisE; m += SLOT_MIN) out.push(m)
    return out
  }, [axisS, axisE])

  const [cells, setCells] = useState(()=>new Set(initialCells || []))
  // keep cells in sync if initialCells reference changes (e.g. week swap)
  useEffect(()=>{ setCells(new Set(initialCells || [])) }, [initialCells])

  // paint state
  const paintingRef = useRef({ active: false, mode: 'add', touched: new Set() })

  function isClosed(d, m){
    const ds = daySettings[d] || { open_time:'08:30', close_time:'19:00' }
    return m < toMins(ds.open_time) || m >= toMins(ds.close_time)
  }

  function applyToCell(d, m){
    if(disabled) return
    if(isClosed(d, m)) return
    const k = cellKey(d, m)
    if(paintingRef.current.touched.has(k)) return
    paintingRef.current.touched.add(k)
    setCells(prev=>{
      const next = new Set(prev)
      if(paintingRef.current.mode === 'add') next.add(k); else next.delete(k)
      onChange?.(next)
      return next
    })
  }

  function startPaint(d, m, e){
    if(disabled) return
    e.preventDefault?.()
    const k = cellKey(d, m)
    paintingRef.current = {
      active: true,
      mode: cells.has(k) ? 'remove' : 'add',
      touched: new Set(),
    }
    applyToCell(d, m)
  }

  function endPaint(){
    paintingRef.current.active = false
  }

  // global pointerup so dragging out of the grid still ends paint
  useEffect(()=>{
    const up = ()=>endPaint()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return ()=>{
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [])

  // hover paint via pointermove on the grid (for mouse) — we read d,m from the target's data-* attrs
  function onPointerMove(e){
    if(!paintingRef.current.active) return
    // For touch and mouse alike, find the cell under the pointer
    const target = document.elementFromPoint(e.clientX, e.clientY)
    if(!target) return
    const cell = target.closest?.('[data-cell]')
    if(!cell) return
    const d = parseInt(cell.dataset.day)
    const m = parseInt(cell.dataset.min)
    applyToCell(d, m)
  }

  // Stat line
  const totalMins = cells.size * SLOT_MIN
  const hh = Math.floor(totalMins / 60)
  const mm = totalMins % 60

  return(
    <div className="picker-wrap" style={{userSelect:'none', touchAction: disabled ? 'auto' : 'none'}}>
      <div className="picker-summary">
        <span className="pill pill-green">{hh}h {mm}m selected</span>
        <span className="hint hint-muted">Click or drag to paint your availability. Click again to remove.</span>
      </div>
      <div className="picker-scroll">
        <table className="picker-table">
          <thead>
            <tr>
              <th className="picker-axis-h"></th>
              {DAYS.map((d, di)=>{
                const ds = daySettings[di] || {}
                return(
                  <th key={d} className="picker-day-head">
                    <div className="picker-day-name">{d}</div>
                    <div className="picker-day-hours">{ds.open_time}–{ds.close_time}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody onPointerMove={onPointerMove}>
            {rows.map(rowM=>(
              <tr key={rowM} style={{height: ROW_PX+'px'}}>
                <td className="picker-axis">
                  {rowM % 60 === 0 ? toTime(rowM) : ''}
                </td>
                {DAYS.map((_, di)=>{
                  const closed = isClosed(di, rowM)
                  const k = cellKey(di, rowM)
                  const on = cells.has(k)
                  const half = (rowM % 60) === 30
                  const hourBoundary = (rowM % 60) === 0
                  return(
                    <td
                      key={di}
                      data-cell="1"
                      data-day={di}
                      data-min={rowM}
                      className={
                        'picker-cell'
                        + (closed ? ' picker-cell-closed' : '')
                        + (on ? ' picker-cell-on' : '')
                        + (hourBoundary ? ' picker-cell-hour' : '')
                        + (half ? ' picker-cell-half' : '')
                      }
                      onPointerDown={closed?undefined:e=>startPaint(di, rowM, e)}
                    />
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="picker-actions">
        <button type="button" className="btn btn-light btn-sm" onClick={()=>{
          const next = new Set()
          // select all open hours of every day (typical "always available")
          for(let di=0; di<7; di++){
            for(let m=axisS; m<axisE; m+=SLOT_MIN){
              if(!isClosed(di, m)) next.add(cellKey(di, m))
            }
          }
          setCells(next); onChange?.(next)
        }}>Select all</button>
        <button type="button" className="btn btn-light btn-sm" onClick={()=>{
          const next = new Set()
          // weekdays only
          for(let di=0; di<5; di++){
            for(let m=axisS; m<axisE; m+=SLOT_MIN){
              if(!isClosed(di, m)) next.add(cellKey(di, m))
            }
          }
          setCells(next); onChange?.(next)
        }}>Weekdays only</button>
        <button type="button" className="btn btn-light btn-sm" onClick={()=>{
          setCells(new Set()); onChange?.(new Set())
        }}>Clear</button>
      </div>
    </div>
  )
}
