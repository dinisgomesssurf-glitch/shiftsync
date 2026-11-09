import { useState } from 'react'

// Where the business is (which labour rules apply) and how the generator should
// trade coverage against cost.
export default function BusinessRules({ org, rulePacks, onSave }){
  // Parent remounts this with key={org.id}, so initial state is enough.
  const [d, setD] = useState(() => ({
    jurisdiction: org.jurisdiction || 'PT', currency: org.currency || 'EUR',
    generation_preset: org.generation_preset || 'balanced',
    labor_budget: org.labor_budget ?? '', min_staff_while_open: org.min_staff_while_open ?? 0,
    staff_see_team: org.staff_see_team !== false,
  }))
  const set = (k, v) => setD(p => ({ ...p, [k]: v }))
  const pack = rulePacks[d.jurisdiction]

  return (
    <div className="card">
      <div className="card-label">Labour rules &amp; generator</div>
      <div className="setting-row" style={{gridTemplateColumns:'170px 1fr'}}>
        <span style={{fontSize:'13px'}}>Location (labour rules)</span>
        <select value={d.jurisdiction} onChange={e => set('jurisdiction', e.target.value)}>
          {Object.values(rulePacks).map(p => <option key={p.jurisdiction} value={p.jurisdiction}>{p.name}</option>)}
        </select>
      </div>
      {pack && (
        <p className="muted" style={{fontSize:'11px', margin:'4px 0 8px'}}>
          {pack.minRestHours != null ? `${pack.minRestHours}h rest between days · ` : 'No general daily rest rule · '}
          {pack.maxDailyHours != null ? `max ${pack.maxDailyHours}h/day · ` : ''}
          {pack.maxWeeklyHours != null ? `max ${pack.maxWeeklyHours}h/week · ` : ''}
          {pack.weeklyRestHours != null ? `${pack.weeklyRestHours}h weekly rest · ` : ''}
          {pack.breaks.map(b => `${b.minutes} min break over ${b.overHours}h`).join(', ')}.
          {' '}Starting values only — check them against your collective agreement.
        </p>
      )}
      <div className="setting-row" style={{gridTemplateColumns:'170px 1fr'}}>
        <span style={{fontSize:'13px'}}>Currency</span>
        <select value={d.currency} onChange={e => set('currency', e.target.value)}>
          {['EUR', 'CAD', 'USD', 'GBP'].map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="setting-row" style={{gridTemplateColumns:'170px 1fr'}}>
        <span style={{fontSize:'13px'}}>Generator priority</span>
        <select value={d.generation_preset} onChange={e => set('generation_preset', e.target.value)}>
          <option value="balanced">Balanced</option>
          <option value="cover_first">Cover first — fill every extra shift</option>
          <option value="save_money">Save money — only extras worth the cost</option>
        </select>
      </div>
      <div className="setting-row" style={{gridTemplateColumns:'170px 1fr'}}>
        <span style={{fontSize:'13px'}}>Weekly labour budget</span>
        <input type="number" min="0" step="10" placeholder="optional" value={d.labor_budget} onChange={e => set('labor_budget', e.target.value)}/>
      </div>
      <div className="setting-row" style={{gridTemplateColumns:'170px 1fr'}}>
        <span style={{fontSize:'13px'}}>Minimum staff while open</span>
        <input type="number" min="0" max="10" value={d.min_staff_while_open} onChange={e => set('min_staff_while_open', e.target.value)}/>
      </div>
      <div className="setting-row" style={{gridTemplateColumns:'170px 1fr'}}>
        <span style={{fontSize:'13px'}}>Staff see the whole team</span>
        <label style={{fontSize:'12px', display:'flex', gap:'6px', alignItems:'center'}}>
          <input type="checkbox" checked={d.staff_see_team} onChange={e => set('staff_see_team', e.target.checked)}/>
          {d.staff_see_team ? "Everyone sees everyone's shifts" : 'Staff only see their own shifts'}
        </label>
      </div>
      <button className="btn btn-teal" style={{marginTop:'12px'}} onClick={() => onSave({
        jurisdiction: d.jurisdiction, currency: d.currency, generation_preset: d.generation_preset,
        labor_budget: d.labor_budget === '' ? null : Number(d.labor_budget),
        min_staff_while_open: Math.max(0, parseInt(d.min_staff_while_open) || 0),
        staff_see_team: !!d.staff_see_team,
      })}>Save</button>
    </div>
  )
}
