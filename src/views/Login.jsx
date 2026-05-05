import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login({ onToast }){
  const [isSignUp, setIsSignUp] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn(){
    setErr(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass })
    if(error) setErr(error.message)
    setLoading(false)
  }

  async function signUp(){
    setErr(''); setLoading(true)
    if(!name.trim()){ setErr('Please enter your name'); setLoading(false); return }
    if(pass.length < 6){ setErr('Password must be at least 6 characters'); setLoading(false); return }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { name: name.trim(), role: 'member' } }
    })
    if(error) setErr(error.message)
    else onToast?.('Account created! Please sign in.')
    setLoading(false)
  }

  function onKey(e){
    if(e.key==='Enter') isSignUp ? signUp() : signIn()
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
          <div className="form-field">
            <div className="form-label">Full name</div>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" onKeyDown={onKey}/>
          </div>
        )}
        <div className="form-field">
          <div className="form-label">Email</div>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={onKey} autoComplete="email"/>
        </div>
        <div className="form-field">
          <div className="form-label">Password</div>
          <input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={onKey} autoComplete={isSignUp?'new-password':'current-password'}/>
        </div>

        {err && <div className="form-error">{err}</div>}

        <button className="btn btn-teal btn-lg" style={{width:'100%',marginTop:'4px'}} onClick={isSignUp ? signUp : signIn} disabled={loading}>
          {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
        </button>

        <div className="signin-toggle">
          {isSignUp ? 'Already have an account? ' : 'New here? '}
          <button className="link" type="button" onClick={()=>{setIsSignUp(!isSignUp); setErr('')}}>
            {isSignUp ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  )
}
