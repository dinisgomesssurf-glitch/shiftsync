import { useMemo } from 'react'
import { DAYS, toMins, toTime } from '../lib/utils'

const SLOT_MIN = 15
const ROW_H_HOUR = 32

// Group all available 15-min cells from weekAvail into a 7×slotCount count matrix
function buildAvailMatrix(weekAvail, w, members, axisS, axisE){
  const slotCount = Math.max(0, Math.ceil((axisE - axisS) / SLOT_MIN))
  const matrix = Array.from({length: 7}, () =>
    Array.from({length: slotCount}, () => ({ count: 0, names: [] }))
  )
  const data = (weekAvail || {})[w] || {}
  for (const name of Object.keys(data)) {
    for (const slot of (data[name] || [])) {
      if (slot.on === false) continue
      const s = toMins(slot.start), e = toMins(slot.end)
      for (let m = Math.max(s, axisS); m < Math.min(e, axisE); m += SLOT_MIN) {
        const idx = Math.floor((m - axisS) / SLOT_MIN)
        if (matrix[slot.day_index][idx]) {
          matrix[slot.day_index][idx].count++
          matrix[slot.day_index][idx].names.push(name)
        }
      }
    }
  }
  return { matrix, slotCount }
}

export default function AvailTimetable({ w, weekAvail, members, daySettings, axisS, axisE }){
  const { matrix, slotCount } = useMemo(
    () => buildAvailMatrix(weekAvail, w, members, axisS, axisE),
    [weekAvail, w, members, axisS, axisE]
  )

  const memberCount = (members || []).length || 1
  const slotsPerHour = 60 / SLOT_MIN
  const totalHours = Math.ceil(slotCount / slotsPerHour)
  const hourMarks = []
  for (let m = Math.ceil(axisS / 60) * 60; m <= axisE; m += 60) hourMarks.push(m)
  const bodyHeight = totalHours * ROW_H_HOUR

  // Find "best times": slots where the max number of people are available
  const maxCount = matrix.reduce((m, day) => Math.max(m, ...day.map(c => c.count)), 0)
  const bestSlots = []
  for (let d = 0; d < 7; d++) {
    let runStart = -1
    for (let i = 0; i <= slotCount; i++) {
      const c = i < slotCount ? matrix[d][i].count : 0
      if (c === maxCount && maxCount > 0) {
        if (runStart < 0) runStart = i
      } else if (runStart >= 0) {
        bestSlots.push({
          day: d,
          start: axisS + runStart * SLOT_MIN,
          end:   axisS + i * SLOT_MIN,
        })
        runStart = -1
      }
    }
  }

  function colorFor(count){
    if (count === 0) return 'avh-0'
    const ratio = count / memberCount
    if (ratio >= 1)    return 'avh-4'
    if (ratio >= 0.66) return 'avh-3'
    if (ratio >= 0.33) return 'avh-2'
    return 'avh-1'
  }

  return (
    <div className="avh-wrap">
      <div className="avh-summary">
        <div className="card-label" style={{margin:0}}>Availability heatmap — darker = more people available</div>
        {maxCount > 0 && (
          <div className="avh-best">
            <strong>Best times</strong> ({maxCount} of {memberCount} available):&nbsp;
            {bestSlots.length === 0
              ? <span className="muted">none</span>
              : bestSlots.slice(0, 6).map((b, i) => (
                  <span key={i} className="pill pill-green pill-tiny" style={{marginRight:6}}>
                    {DAYS[b.day]} {toTime(b.start)}–{toTime(b.end)}
                  </span>
                ))}
            {bestSlots.length > 6 && <span className="muted">+{bestSlots.length - 6} more</span>}
          </div>
        )}
      </div>

      <div className="avh-grid">
        <div className="avh-headers">
          <div className="avh-corner"/>
          {DAYS.map(d => <div key={d} className="avh-day-h">{d}</div>)}
        </div>

        <div className="avh-body" style={{height: bodyHeight + 'px'}}>
          <div className="avh-time-col">
            {hourMarks.map(m => (
              <div key={m} className="avh-time-tick" style={{top: ((m - axisS) / 60 * ROW_H_HOUR) + 'px'}}>
                {toTime(m)}
              </div>
            ))}
          </div>

          {DAYS.map((d, di) => (
            <div key={di} className="avh-day-col">
              {hourMarks.map(m => (
                <div key={m} className="avh-day-line" style={{top: ((m - axisS) / 60 * ROW_H_HOUR) + 'px'}}/>
              ))}
              {Array.from({length: slotCount}, (_, slotIdx) => {
                const cell = matrix[di][slotIdx]
                if (!cell || cell.count === 0) return null
                const top = (slotIdx * SLOT_MIN / 60) * ROW_H_HOUR
                const height = (SLOT_MIN / 60) * ROW_H_HOUR
                const slotStart = toTime(axisS + slotIdx * SLOT_MIN)
                const slotEnd = toTime(axisS + (slotIdx + 1) * SLOT_MIN)
                return (
                  <div key={slotIdx}
                    className={`avh-cell ${colorFor(cell.count)}`}
                    style={{top: top + 'px', height: height + 'px'}}
                    title={`${DAYS[di]} ${slotStart}–${slotEnd}\n${cell.count} of ${memberCount} available\n${cell.names.join(', ')}`}/>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="avh-legend">
        <span className="legend-item"><span className="avh-swatch avh-0"/>None</span>
        <span className="legend-item"><span className="avh-swatch avh-1"/>1</span>
        <span className="legend-item"><span className="avh-swatch avh-2"/>2</span>
        <span className="legend-item"><span className="avh-swatch avh-3"/>3</span>
        <span className="legend-item"><span className="avh-swatch avh-4"/>All</span>
      </div>
    </div>
  )
}
