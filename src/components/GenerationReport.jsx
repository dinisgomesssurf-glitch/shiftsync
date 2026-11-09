import { DAYS } from '../lib/utils'

// What the generator did, and what still needs a human: gaps it couldn't fill
// (with the reason), rule warnings, and hours vs target per person.
const WARN_LABEL = {
  below_min_staff: 'Below minimum staff',
  cant_be_alone: "Alone when they shouldn't be",
  required_on_shift: 'Required person missing',
  break_required: 'Break needed',
  min_rest: 'Too little rest',
  overlap: 'Double-booked',
  unavailable: 'Not available',
  time_off: 'On time off',
  max_daily_hours: 'Too many hours that day',
  max_weekly_hours: 'Too many hours that week',
  contract_max_hours: 'Over contract hours',
  weekly_rest: 'Missing weekly rest',
  max_shifts_week: 'Too many shifts',
  cant_work_with: "Working with someone they shouldn't",
}

export default function GenerationReport({ report, issues, members, currency, weekStart }){
  const nameOf = id => members.find(m => m.id === id)?.name || 'Unknown'
  const dayOf = date => {
    if(!weekStart || !date) return date
    const d = Math.round((new Date(date + 'T00:00:00') - new Date(weekStart + 'T00:00:00')) / 86400000)
    return DAYS[d] || date
  }
  const gaps = report?.unfilled || []
  const mandatoryGaps = gaps.filter(g => g.slot.mandatory)
  const optionalGaps = gaps.filter(g => !g.slot.mandatory)
  const warnings = (issues || []).filter(v => v.code !== 'unknown_member')
  if(!report && !warnings.length) return null

  return (
    <div className="card">
      <div className="card-label">Schedule check</div>
      {report && (
        <div className="row" style={{gap:'6px', marginBottom:'10px'}}>
          <span className={`pill ${report.score.mandatoryFilled === report.score.mandatoryTotal ? 'pill-green' : 'pill-red'}`}>
            {report.score.mandatoryFilled}/{report.score.mandatoryTotal} required shifts filled
          </span>
          {report.score.optionalTotal > 0 && <span className="pill pill-blue">{report.score.optionalFilled}/{report.score.optionalTotal} extra shifts filled</span>}
          {report.score.laborCost != null && <span className="pill pill-gray">Labour cost ≈ {currency}{Math.round(report.score.laborCost)}</span>}
          <span className="pill pill-gray">{report.preset === 'save_money' ? 'Save money' : report.preset === 'cover_first' ? 'Cover first' : 'Balanced'}</span>
        </div>
      )}

      {mandatoryGaps.length > 0 && <>
        <div style={{fontSize:'12px', fontWeight:600, color:'var(--red-text)', margin:'4px 0'}}>Couldn't fill</div>
        {mandatoryGaps.map(g => (
          <div key={g.slot.id} className="c-item" style={{fontSize:'12px'}}>
            <strong>{dayOf(g.slot.date)} {g.slot.start}–{g.slot.end}{g.slot.label ? ` · ${g.slot.label}` : ''}</strong>
            <span style={{color:'#666'}}>{g.summary.split(': ').slice(1).join(': ')}</span>
          </div>
        ))}
      </>}

      {warnings.length > 0 && <>
        <div style={{fontSize:'12px', fontWeight:600, color:'var(--amber-text)', margin:'8px 0 4px'}}>Warnings</div>
        {warnings.slice(0, 12).map((v, i) => (
          <div key={i} className="c-item" style={{fontSize:'12px'}}>
            <span className="pill pill-amber pill-tiny">{WARN_LABEL[v.code] || v.code}</span>
            <span>{v.message}</span>
          </div>
        ))}
        {warnings.length > 12 && <p className="muted">…and {warnings.length - 12} more.</p>}
      </>}

      {optionalGaps.length > 0 && (
        <details style={{marginTop:'8px'}}>
          <summary style={{fontSize:'12px', cursor:'pointer'}}>{optionalGaps.length} extra shift{optionalGaps.length > 1 ? 's' : ''} left open</summary>
          {optionalGaps.map(g => <div key={g.slot.id} style={{fontSize:'12px', color:'#666', padding:'3px 0'}}>{dayOf(g.slot.date)} · {g.summary.split(': ').slice(1).join(': ')}</div>)}
        </details>
      )}

      {report?.members?.length > 0 && (
        <details style={{marginTop:'8px'}}>
          <summary style={{fontSize:'12px', cursor:'pointer'}}>Hours per person</summary>
          <table style={{width:'100%', fontSize:'12px', marginTop:'6px', borderCollapse:'collapse'}}>
            <thead><tr style={{textAlign:'left', color:'#888'}}><th>Person</th><th>Shifts</th><th>Hours</th><th>Target</th>{report.score.laborCost != null && <th>Cost</th>}</tr></thead>
            <tbody>
              {report.members.map(m => {
                const off = m.target ? Math.abs(m.hours - m.target) / m.target > 0.25 : false
                return (
                  <tr key={m.memberId} style={{borderTop:'1px solid var(--gray-100)'}}>
                    <td>{nameOf(m.memberId)}</td><td>{m.shifts}</td>
                    <td style={{color: off ? 'var(--amber-text)' : undefined, fontWeight: off ? 600 : 400}}>{m.hours}</td>
                    <td>{m.target ?? '—'}</td>
                    {report.score.laborCost != null && <td>{m.cost != null ? `${currency}${Math.round(m.cost)}` : '—'}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </details>
      )}
    </div>
  )
}
