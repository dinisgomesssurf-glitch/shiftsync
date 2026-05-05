import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Onboarding({ profile, onDone, onSignOut, onToast }){
  const [mode, setMode] = useState(null) // 'create' | 'join'
  const [orgName, setOrgName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function createOrg(){
    setErr(''); setLoading(true)
    const trimmed = orgName.trim()
    if(!trimmed){ setErr('Give your organization a name'); setLoading(false); return }
    const { data, error } = await supabase.rpc('create_organization', { org_name: trimmed })
    if(error){ setErr(error.message); setLoading(false); return }
    onToast?.('Organization created!')
    onDone?.(data)
    setLoading(false)
  }

  async function joinOrg(){
    setErr(''); setLoading(true)
    const trimmed = code.trim()
    if(!trimmed){ setErr('Enter a join code'); setLoading(false); return }
    const { data, error } = await supabase.rpc('join_organization_by_code', { code: trimmed })
    if(error){ setErr(error.message.includes('invalid')?'No organization found with that code':error.message); setLoading(false); return }
    onToast?.('Joined!')
    onDone?.(data)
    setLoading(false)
  }

  return(
    <div className="onboarding-wrap">
      <button className="btn btn-light onboarding-signout" onClick={onSignOut}>Sign out</button>
      <div className="onboarding-card">
        <div className="onboarding-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6"/>
          </svg>
        </div>
        <h1 className="onboarding-title">Welcome, {profile?.name?.split(' ')[0] || 'there'} 👋</h1>
        <p className="onboarding-sub">Let's set up your first organization. You can add more later.</p>

        {!mode && (
          <div className="onboarding-options">
            <button className="onboarding-option" onClick={()=>setMode('create')}>
              <div className="onboarding-option-icon teal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div className="onboarding-option-text">
                <div className="onboarding-option-title">Create an organization</div>
                <div className="onboarding-option-sub">Start fresh — invite your team with a join code</div>
              </div>
            </button>
            <button className="onboarding-option" onClick={()=>setMode('join')}>
              <div className="onboarding-option-icon blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 11h-6M20 8v6"/>
                </svg>
              </div>
              <div className="onboarding-option-text">
                <div className="onboarding-option-title">Join with a code</div>
                <div className="onboarding-option-sub">Got a 6-character code from your manager?</div>
              </div>
            </button>
          </div>
        )}

        {mode==='create' && (
          <div className="onboarding-form">
            <button className="link" onClick={()=>{setMode(null); setErr('')}}>← Back</button>
            <div className="form-field" style={{marginTop:'12px'}}>
              <div className="form-label">Organization name</div>
              <input value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="e.g. Joe's Café" autoFocus onKeyDown={e=>e.key==='Enter'&&createOrg()}/>
            </div>
            {err && <div className="form-error">{err}</div>}
            <button className="btn btn-teal btn-lg" style={{width:'100%'}} onClick={createOrg} disabled={loading}>
              {loading ? 'Creating…' : 'Create organization'}
            </button>
          </div>
        )}

        {mode==='join' && (
          <div className="onboarding-form">
            <button className="link" onClick={()=>{setMode(null); setErr('')}}>← Back</button>
            <div className="form-field" style={{marginTop:'12px'}}>
              <div className="form-label">Join code</div>
              <input
                value={code}
                onChange={e=>setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={8}
                style={{textTransform:'uppercase',letterSpacing:'0.15em',fontFamily:'ui-monospace,monospace'}}
                autoFocus
                onKeyDown={e=>e.key==='Enter'&&joinOrg()}/>
            </div>
            {err && <div className="form-error">{err}</div>}
            <button className="btn btn-teal btn-lg" style={{width:'100%'}} onClick={joinOrg} disabled={loading}>
              {loading ? 'Joining…' : 'Join organization'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
