import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EmptyState from '../components/EmptyState'

export default function Organizations({ orgs, profile, onChange, onSelect, onToast }){
  const [creating, setCreating] = useState(false)
  const [joining, setJoining]   = useState(false)
  const [orgName, setOrgName]   = useState('')
  const [code, setCode]         = useState('')
  const [err, setErr]           = useState('')
  const [loading, setLoading]   = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  async function createOrg(){
    setErr(''); setLoading(true)
    if(!orgName.trim()){ setErr('Name required'); setLoading(false); return }
    const { error } = await supabase.rpc('create_organization', { org_name: orgName.trim() })
    if(error) setErr(error.message)
    else { onToast?.('Organization created!'); setCreating(false); setOrgName(''); onChange?.() }
    setLoading(false)
  }

  async function joinOrg(){
    setErr(''); setLoading(true)
    if(!code.trim()){ setErr('Code required'); setLoading(false); return }
    const { error } = await supabase.rpc('join_organization_by_code', { code: code.trim() })
    if(error) setErr(error.message.includes('invalid')?'No organization found with that code':error.message)
    else { onToast?.('Joined!'); setJoining(false); setCode(''); onChange?.() }
    setLoading(false)
  }

  async function leaveOrg(orgId, orgName){
    if(!window.confirm(`Leave "${orgName}"? You'll need a join code to come back.`)) return
    const { error } = await supabase.from('organization_members')
      .delete().eq('organization_id', orgId).eq('user_id', profile.id)
    if(error){ onToast?.('Error: '+error.message); return }
    onToast?.('Left organization')
    onChange?.()
  }

  function copyCode(code, id){
    navigator.clipboard?.writeText(code)
    setCopiedId(id)
    setTimeout(()=>setCopiedId(null), 1500)
  }

  return(
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Organizations</div>
          <div className="page-sub">Create or join organizations to manage their schedules</div>
        </div>
        <div className="row">
          <button className="btn btn-light" onClick={()=>{setJoining(true); setCreating(false); setErr('')}}>Join</button>
          <button className="btn btn-teal" onClick={()=>{setCreating(true); setJoining(false); setErr('')}}>+ Create</button>
        </div>
      </div>

      {creating && (
        <div className="card">
          <div className="card-label">New organization</div>
          <div className="form-field">
            <div className="form-label">Name</div>
            <input value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="e.g. The Coffee House" autoFocus onKeyDown={e=>e.key==='Enter'&&createOrg()}/>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="row">
            <button className="btn btn-teal" onClick={createOrg} disabled={loading}>{loading?'Creating…':'Create'}</button>
            <button className="btn btn-light" onClick={()=>{setCreating(false); setErr('')}}>Cancel</button>
          </div>
        </div>
      )}

      {joining && (
        <div className="card">
          <div className="card-label">Join with a code</div>
          <div className="form-field">
            <div className="form-label">Join code</div>
            <input
              value={code}
              onChange={e=>setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={8}
              autoFocus
              style={{textTransform:'uppercase',letterSpacing:'0.15em',fontFamily:'ui-monospace,monospace'}}
              onKeyDown={e=>e.key==='Enter'&&joinOrg()}/>
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="row">
            <button className="btn btn-teal" onClick={joinOrg} disabled={loading}>{loading?'Joining…':'Join'}</button>
            <button className="btn btn-light" onClick={()=>{setJoining(false); setErr('')}}>Cancel</button>
          </div>
        </div>
      )}

      {orgs.length===0 ? (
        <EmptyState
          icon={
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6"/>
            </svg>
          }
          title="No organizations yet"
          body="Create one to start scheduling your team, or join an existing one with a code."
        />
      ) : (
        <div className="org-grid">
          {orgs.map(o=>(
            <div key={o.id} className="org-card">
              <div className="org-card-head">
                <div className="org-avatar">{o.name?.[0]?.toUpperCase() || '?'}</div>
                <div style={{flex:1, minWidth:0}}>
                  <div className="org-card-name">{o.name}</div>
                  <div className="org-card-meta">
                    {o.role==='admin' && <span className="pill pill-blue pill-tiny">Admin</span>}
                    <span className="pill pill-gray pill-tiny">{o.member_count||1} member{(o.member_count||1)!==1?'s':''}</span>
                  </div>
                </div>
              </div>
              <div className="org-card-code">
                <span className="form-label">Join code</span>
                <div className="org-code-row">
                  <code className="org-code">{o.join_code}</code>
                  <button className="btn btn-sm btn-light" onClick={()=>copyCode(o.join_code, o.id)}>
                    {copiedId===o.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="org-card-actions">
                <button className="btn btn-teal btn-sm" onClick={()=>onSelect?.(o)}>Open</button>
                <button className="btn btn-red btn-sm" onClick={()=>leaveOrg(o.id, o.name)}>Leave</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
