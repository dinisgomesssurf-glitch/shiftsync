import { useMemo } from 'react'
import { DAYS, toMins, toTime } from '../lib/utils'
import { buildCoverageMatrix } from '../lib/scheduleEngine'

const STATE_LABELS = {
  none:    'No requirement, no staff',
  staffed: 'Staffed (no minimum set)',
  ok:      'Fully staffed',
  under:   'Under-staffed',
  critical:'No one assigned',
  over:    'Over-staffed',
}

export default function ScheduleCoverage({ shiftsByDay, staffingReqs, daySettings, axisS, axisE }){
  const { matrix, slotCount, axisStart, granularity } = useMemo(
    () => buildCoverageMatrix(shiftsByDay, staffingReqs || [], axisS, axisE, 15),
    [shiftsByDay, staffingReqs, axisS, axisE]
  )

  // Hour rows derived from slots
  const slotsPerHour = 60 / granularity
  const totalHours = Math.ceil(slotCount / slotsPerHour)

  // Aggregate stats
  const stats = useMemo(() => {
    const out = { ok:0, under:0, critical:0, over:0, none:0, staffed:0 }
    for (let d=0; d<7; d++) for (let i=0; i<slotCount; i++) out[matrix[d][i].state]++
    return out
  }, [matrix, slotCount])

  return (
    <div className="cov-wrap">
      <div className="cov-stats">
        <div className="stat"><div className="stat-val" style={{color:'var(--green-text)'}}>{stats.ok}</div><div className="stat-lbl">Fully staffed slots</div></div>
        <div className="stat"><div className="stat-val" style={{color:'var(--amber-text)'}}>{stats.under}</div><div className="stat-lbl">Under</div></div>
        <div className="stat"><div className="stat-val" style={{color:'var(--red-text)'}}>{stats.critical}</div><div className="stat-lbl">Critical</div></div>
        <div className="stat"><div className="stat-val" style={{color:'var(--blue-text)'}}>{stats.over}</div><div className="stat-lbl">Over</div></div>
      </div>

      <div className="cov-scroll">
        <table className="cov-table">
          <thead>
            <tr>
              <th className="cov-corner"></th>
              {DAYS.map(d => <th key={d} className="cov-day">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({length: totalHours}, (_, hourIdx) => {
              const baseMin = axisStart + hourIdx * 60
              return (
                <tr key={hourIdx}>
                  <td className="cov-time">{toTime(baseMin)}</td>
                  {DAYS.map((_, di) => (
                    <td key={di} className="cov-day-cell">
                      <div className="cov-quarter-row">
                        {Array.from({length: slotsPerHour}, (_, qi) => {
                          const slotIdx = hourIdx * slotsPerHour + qi
                          const cell = matrix[di]?.[slotIdx]
                          if (!cell) return <span key={qi} className="cov-quarter cov-state-none"/>
                          return (
                            <span
                              key={qi}
                              className={`cov-quarter cov-state-${cell.state}`}
                              title={`${DAYS[di]} ${toTime(axisStart + slotIdx*15)}\n${STATE_LABELS[cell.state]}\nCovered: ${cell.covered}${cell.required?` / ${cell.required}`:''}`}
                            >
                              <span className="cov-num">{cell.required ? `${cell.covered}/${cell.required}` : cell.covered || ''}</span>
                            </span>
                          )
                        })}
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="cov-legend">
        <span className="legend-item"><span className="cov-swatch cov-state-ok"/>Fully staffed</span>
        <span className="legend-item"><span className="cov-swatch cov-state-under"/>Under</span>
        <span className="legend-item"><span className="cov-swatch cov-state-critical"/>Critical</span>
        <span className="legend-item"><span className="cov-swatch cov-state-over"/>Over</span>
        <span className="legend-item"><span className="cov-swatch cov-state-staffed"/>Staffed (no min set)</span>
        <span className="legend-item"><span className="cov-swatch cov-state-none"/>Closed / no requirement</span>
      </div>
    </div>
  )
}
