import { useState } from 'react'
import { initials, nameColor } from '../lib/utils'

// Team settings: job roles, and per-person hours, seniority and pay.
// Pay is stored in member_pay, which only admins (and the person) can read.
export default function Team({ members, roles, currency, onSaveMember, onAddRole, onDeleteRole, onToggleRole }){
  const [newRole, setNewRole] = useState('')
  const [drafts, setDrafts] = useState({})
  const draft = m => drafts[m.id] || {
    target_hours: m.target_hours ?? '', max_hours: m.max_hours ?? '',
    hourly_rate: m.hourly_rate ?? '', senior: m.senior !== false, contract_type: m.contract_type || '',
  }
  const edit = (m, k, v) => setDrafts(p => ({ ...p, [m.id]: { ...draft(m), [k]: v } }))
  const dirty = m => !!drafts[m.id]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Team</div>
          <div className="page-sub">Roles, hours and pay used by the generator</div>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Job roles</div>
        <p className="muted" style={{marginBottom:'8px'}}>E.g. barista, kitchen, bar. People without any role can cover any shift.</p>
        <div className="row" style={{marginBottom:'8px'}}>
          {roles.map(r => (
            <span key={r.id} className="pill pill-blue" style={{gap:'6px'}}>
              {r.name}
              <button className="btn btn-sm" style={{padding:'0 6px', border:'none', background:'transparent'}} onClick={() => onDeleteRole(r.id)} aria-label={`Remove ${r.name}`}>×</button>
            </span>
          ))}
          {roles.length === 0 && <span className="muted">No roles yet.</span>}
        </div>
        <div className="row">
          <input placeholder="New role" value={newRole} onChange={e => setNewRole(e.target.value)} style={{width:'160px'}}/>
          <button className="btn btn-blue" onClick={() => { if(newRole.trim()){ onAddRole(newRole.trim()); setNewRole('') } }}>Add role</button>
        </div>
      </div>

      <div className="card">
        <div className="card-label">People</div>
        <p className="muted" style={{marginBottom:'10px'}}>
          <strong>Target</strong> = hours per week you'd like them to get (the generator shares hours fairly against it).
          <strong> Max</strong> = contract limit. <strong>Senior</strong> people can supervise trial shifts.
        </p>
        {members.map(m => {
          const d = draft(m)
          const [bg, fg] = nameColor(m.name)
          return (
            <div key={m.id} className="c-item" style={{alignItems:'flex-start'}}>
              <div className="avatar" style={{width:28, height:28, fontSize:'11px', background:bg, color:fg}}>{initials(m.name)}</div>
              <div style={{flex:1, minWidth:'220px'}}>
                <div style={{fontWeight:600, fontSize:'13px'}}>{m.name} {m.role === 'admin' && <span className="pill pill-tiny pill-gray">admin</span>}</div>
                <div className="row" style={{marginTop:'6px', gap:'4px'}}>
                  {roles.map(r => {
                    const on = m.roleIds?.includes(r.id)
                    return (
                      <button key={r.id} className={`btn btn-sm ${on ? 'btn-teal' : 'btn-light'}`} onClick={() => onToggleRole(m, r.id, !on)}>{r.name}</button>
                    )
                  })}
                </div>
                <div className="row" style={{marginTop:'8px', gap:'8px'}}>
                  <label style={{fontSize:'12px'}}>Target h/wk <input type="number" min="0" max="80" step="0.5" value={d.target_hours} style={{width:'64px'}} onChange={e => edit(m, 'target_hours', e.target.value)}/></label>
                  <label style={{fontSize:'12px'}}>Max h/wk <input type="number" min="0" max="80" step="0.5" value={d.max_hours} style={{width:'64px'}} onChange={e => edit(m, 'max_hours', e.target.value)}/></label>
                  <label style={{fontSize:'12px'}}>Rate {currency}/h <input type="number" min="0" step="0.05" value={d.hourly_rate} style={{width:'72px'}} onChange={e => edit(m, 'hourly_rate', e.target.value)}/></label>
                  <select value={d.contract_type} onChange={e => edit(m, 'contract_type', e.target.value)}>
                    <option value="">Contract…</option>
                    <option value="full_time">Full-time</option>
                    <option value="part_time">Part-time</option>
                    <option value="casual">Casual</option>
                    <option value="volunteer">Volunteer</option>
                  </select>
                  <label style={{fontSize:'12px', display:'flex', alignItems:'center', gap:'4px'}}>
                    <input type="checkbox" checked={d.senior} onChange={e => edit(m, 'senior', e.target.checked)}/> Senior
                  </label>
                  {dirty(m) && (
                    <button className="btn btn-teal btn-sm" onClick={async () => {
                      const ok = await onSaveMember(m, d)
                      if(ok) setDrafts(p => { const n = { ...p }; delete n[m.id]; return n })
                    }}>Save</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
