import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[a-z0-9_]{3,24}$/

export default function Login({ onToast }){
  const [isSignUp, setIsSignUp] = useState(false)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState(null)

  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const [verifySent, setVerifySent] = useState(null)

  const checkRef = useRef()
  useEffect(()=>{
    if(!isSignUp || !username){ setUsernameStatus(null); return }
    if(!USERNAME_RE.test(username)){ setUsernameStatus('invalid'); return }
    setUsernameStatus('checking')
    clearTimeout(checkRef.current)
    checkRef.current = setTimeout(async ()=>{
      const { data, error } = await supabase.rpc('check_username_available', { uname: username })
      if(error){ setUsernameStatus(null); return }
      setUsernameStatus(data ? 'ok' : 'taken')
    }, 350)
    return ()=>clearTimeout(checkRef.current)
  }, [username, isSignUp])

  async function signIn(){
    setErr(''); setLoading(true)
    if(!EMAIL_RE.test(email.trim())){ setErr('Enter a valid email address'); setLoading(false); return }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    if(error){
      const lo = (error.message || '').toLowerCase()
      if(lo.indexOf('confirm') >= 0 || lo.indexOf('not confirmed') >= 0){
        setErr('Please confirm your email first. Check your inbox for the verification link.')
      } else {
        setErr(error.message)
      }
    }
    setLoading(false)
  }

  async function signUp(){
    setErr(''); setLoading(true)
    const trimmedName = name.trim()
    const uname = username.trim().toLowerCase()
    const trimmedEmail = email.trim()
    if(!trimmedName){ setErr('Please enter your name'); setLoading(false); return }
    if(!USERNAME_RE.test(uname)){ setErr('Username must be 3-24 characters: lowercase letters, digits, underscore'); setLoading(false); return }
    if(!EMAIL_RE.test(trimmedEmail)){ setErr('Enter a valid email address'); setLoading(false); return }
    if(pass.length < 8){ setErr('Password must be at least 8 characters'); setLoading(false); return }

    const { data: ok, error: chkErr } = await supabase.rpc('check_username_available', { uname })
    if(chkErr){ setErr('Could not check username - try again'); setLoading(false); return }
    if(!ok){ setErr('Username already taken'); setLoading(false); return }

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: pass,
      options: {
        data: { name: trimmedName, username: uname, role: 'member' },
        emailRedirectTo: window.location.origin,
      }
    })
    if(error){
      const msg = (error.message || '').toLowerCase()
      if(msg.indexOf('username already taken') >= 0) setErr('Username already taken')
      else if(msg.indexOf('email') >= 0 && msg.indexOf('already') >= 0) setErr('An account with that email already exists')
      else setErr(error.message || 'Sign-up failed')
      setLoading(false); return
    }

    if(data && data.session){
      onToast && onToast('Account created!')
    } else {
      setVerifySent(trimmedEmail)
    }
    setLoading(false)
  }

  async function resendConfirm(){
    if(!verifySent) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: verifySent })
    if(error) onToast && onToast('Could not resend: '+error.message)
    else onToast && onToast('Verification email re-sent')
  }

  function onKey(e){
    if(e.key==='Enter') isSignUp ? signUp() : signIn()
  }

  function cleanUsername(v){
    let out = ''
    for(const ch of v.toLowerCase()){
      if((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '_') out += ch
    }
    return out
  }

  if(verifySent){
    return(
      <div className="signin-wrap">
        <div className="card signin-card" style={{textAlign:'center'}}>
          <div className="signin-icon" style={{margin:'0 auto 16px'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#085041" strokeWidth="1.5">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <polyline points="3 7 12 13 21 7"/>
            </svg>
          </div>
          <div className="signin-title">Check your inbox</div>
          <p style={{fontSize:'13px',color:'var(--gray-700)',margin:'14px 0 6px'}}>We sent a verification link to</p>
          <p style={{fontSize:'14px',fontWeight:600,marginBottom:'18px'}}>{verifySent}</p>
          <p style={{fontSize:'12px',color:'var(--gray-500)',marginBottom:'18px'}}>Click the link in the email to activate your account, then return here to sign in.</p>
          <button className="btn btn-light" style={{width:'100%',marginBottom:'8px'}} onClick={resendConfirm}>Resend email</button>
          <button className="btn btn-teal btn-lg" style={{width:'100%'}} onClick={()=>{ setVerifySent(null); setIsSignUp(false); setPass(''); setErr('') }}>Back to sign in</button>
        </div>
      </div>
    )
  }

  return(
    <div className="signin-wrap">
      <div className="card signin-card">
        <div className="signin-icon">
          <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
            <rect x="3" y="8" width="14" height="10" rx="2" stroke="#085041" strokeWidth="1.3"/>
            <path d="M7 8V6a3 3 0 016 0v2" stroke="#085041" strokeWidth="1.3" strokeLinecap="round"/>
            <circle cx="10" cy="13" r="1.5" fill="#085041"/>
          </svg>
        </div>
        <div className="signin-title">Shift<span style={{color:'var(--teal)'}}>Sync</span></div>
        <div className="signin-sub">{isSignUp ? 'Create your account to get started' : 'Welcome back, sign in to continue'}</div>

        {isSignUp && (
          <>
            <div className="form-field">
              <div className="form-label">Full name</div>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe" onKeyDown={onKey} autoComplete="name"/>
            </div>
            <div className="form-field">
              <div className="form-label">
                Username
                {usernameStatus==='checking' && <span className="hint hint-muted"> &middot; checking&hellip;</span>}
                {usernameStatus==='ok'       && <span className="hint hint-ok"> &middot; available</span>}
                {usernameStatus==='taken'    && <span className="hint hint-bad"> &middot; already taken</span>}
                {usernameStatus==='invalid'  && <span className="hint hint-bad"> &middot; 3-24 chars, a-z 0-9 _</span>}
              </div>
              <input value={username} onChange={e=>setUsername(cleanUsername(e.target.value))} placeholder="janedoe" maxLength={24} onKeyDown={onKey} autoComplete="username"/>
            </div>
          </>
        )}
        <div className="form-field">
          <div className="form-label">Email</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={onKey} autoComplete="email"/>
        </div>
        <div className="form-field">
          <div className="form-label">Password</div>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder={isSignUp?'At least 8 characters':'••••••••'} onKeyDown={onKey} autoComplete={isSignUp?'new-password':'current-password'}/>
        </div>

        {err && <div className="form-error">{err}</div>}

        <button className="btn btn-teal btn-lg" style={{width:'100%',marginTop:'4px'}} onClick={isSignUp ? signUp : signIn} disabled={loading || (isSignUp && (usernameStatus==='taken' || usernameStatus==='invalid' || usernameStatus==='checking'))}>
          {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>

        {isSignUp && (
          <p style={{fontSize:'11px',color:'var(--gray-500)',marginTop:'10px',textAlign:'center'}}>We&apos;ll send you a verification email to confirm your address.</p>
        )}

        <div className="signin-toggle">
          {isSignUp ? 'Already have an account? ' : 'New here? '}
          <button className="link" type="button" onClick={()=>{ setIsSignUp(!isSignUp); setErr(''); setUsernameStatus(null) }}>
            {isSignUp ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}
