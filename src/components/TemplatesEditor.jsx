import { useState } from 'react'
import { DAYS, toMins } from '../lib/utils'

// Shift templates: the business's usual shifts, per weekday.
// "min" = people we must find; "target" = people we'd like.
const EMPTY = { name:'Opening', start_time:'08:30', end_time:'14:00', role_id:'', min_workers:1, target_workers:1, break_minutes:0 }

export default function TemplatesEditor({ templates, roles, onAdd, onDelete }){
  const [form, setForm] = useState(EMPTY)
  const [days, setDays] = useState([0,1,2,3,4])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const roleName = id => roles.find(r => r.id === id)?.name

  function add(){
    if(!days.length) return alert('Pick at least one day')
    if(toMins(form.start_time) === toMins(form.end_time)) return alert('Start and end must differ')
    const min = Math.max(0, parseInt(form.min_workers) || 0)
    const target = Math.max(min, parseInt(form.target_workers) || 0)
    onAdd(days.map(weekday => ({
      ...form, weekday, role_id: form.role_id || null,
      min_workers: min, target_workers: target, break_minutes: Math.max(0, parseInt(form.break_minutes) || 0),
    })))
  }

  const byDay = DAYS.map((_, di) => templates.filter(t => t.weekday === di).sort((a, b) => a.start_time.localeCompare(b.start_time)))
  const overnight = t => toMins(t.end_time) <= toMins(t.start_time)

  return (
    <div className="card">
      <div className="card-label">Shift templates</div>
      <p className="muted" style={{marginBottom:'10px'}}>
        Your usual shifts. The generator fills <strong>min</strong> first, then tops up to <strong>target</strong>.
        Breaks required by law are added automatically.
      </p>
      {templates.length === 0 && <p className="muted" style={{marginBottom:'8px'}}>No templates yet — add your first one below.</p>}
      {byDay.map((list, di) => list.length > 0 && (
        <div key={di} style={{marginBottom:'8px'}}>
          <div style={{fontSize:'12px', fontWeight:600, color:'#666', margin:'6px 0 2px'}}>{DAYS[di]}</div>
          {list.map(t => (
            <div key={t.id} className="req-row">
              <span style={{fontSize:'13px', fontWeight:500, minWidth:'90px'}}>{t.name}</span>
              <span style={{fontSize:'12px'}}>{t.start_time.slice(0,5)}–{t.end_time.slice(0,5)}{overnight(t) ? ' (+1)' : ''}</span>
              {t.role_id && <span className="pill pill-gray">{roleName(t.role_id) || 'role'}</span>}
              <span className="pill pill-blue">{t.min_workers === t.target_workers ? `${t.min_workers} people` : `${t.min_workers}–${t.target_workers} people`}</span>
              {t.break_minutes > 0 && <span className="pill pill-gray">{t.break_minutes} min break</span>}
              <button className="btn btn-red btn-sm" style={{marginLeft:'auto'}} onClick={() => onDelete(t.id)}>Remove</button>
            </div>
          ))}
        </div>
      ))}
      <div className="add-req">
        <div className="card-label" style={{marginBottom:'8px'}}>Add a template</div>
        <div className="row" style={{marginBottom:'8px'}}>
          {DAYS.map((d, i) => (
            <label key={d} style={{fontSize:'12px', display:'flex', alignItems:'center', gap:'3px'}}>
              <input type="checkbox" checked={days.includes(i)} onChange={e => setDays(p => e.target.checked ? [...p, i] : p.filter(x => x !== i))}/>{d}
            </label>
          ))}
          <button className="btn btn-light btn-sm" onClick={() => setDays([0,1,2,3,4])}>Weekdays</button>
          <button className="btn btn-light btn-sm" onClick={() => setDays([5,6])}>Weekend</button>
          <button className="btn btn-light btn-sm" onClick={() => setDays([0,1,2,3,4,5,6])}>All</button>
        </div>
        <div className="row" style={{gap:'6px'}}>
          <input placeholder="Name" value={form.name} style={{width:'120px'}} onChange={e => set('name', e.target.value)}/>
          <input type="time" step="900" value={form.start_time} onChange={e => set('start_time', e.target.value)}/>
          <input type="time" step="900" value={form.end_time} onChange={e => set('end_time', e.target.value)}/>
          <select value={form.role_id} onChange={e => set('role_id', e.target.value)}>
            <option value="">Any role</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <label style={{fontSize:'12px'}}>min <input type="number" min="0" max="30" value={form.min_workers} style={{width:'52px'}} onChange={e => set('min_workers', e.target.value)}/></label>
          <label style={{fontSize:'12px'}}>target <input type="number" min="0" max="30" value={form.target_workers} style={{width:'52px'}} onChange={e => set('target_workers', e.target.value)}/></label>
          <label style={{fontSize:'12px'}}>break <input type="number" min="0" max="120" step="5" value={form.break_minutes} style={{width:'58px'}} onChange={e => set('break_minutes', e.target.value)}/></label>
          <button className="btn btn-blue" onClick={add}>Add</button>
        </div>
        <p className="muted" style={{marginTop:'6px', fontSize:'11px'}}>An end time earlier than the start (e.g. 22:00–04:00) means the shift ends the next day.</p>
      </div>
    </div>
  )
}
