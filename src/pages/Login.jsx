import { useEffect, useRef, useState } from 'react'
import { api } from '../data/hooks'
import { Button, Input } from '../ui/kit'
import { Brand } from '../app/Shell'
import { useToast } from '../ui/Toast'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const USERNAME_RE = /^[a-z0-9_]{3,24}$/

export default function Login() {
  const toast = useToast()
  const [mode, setMode] = useState('in') // 'in' | 'up' | 'sent'
  const [f, setF] = useState({ name: '', username: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [nameState, setNameState] = useState(null)
  const set = k => e => setF(p => ({ ...p, [k]: k === 'username' ? e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') : e.target.value }))

  const timer = useRef()
  useEffect(() => {
    clearTimeout(timer.current)
    if (mode !== 'up' || !USERNAME_RE.test(f.username)) return
    timer.current = setTimeout(async () => {
      try { setNameState((await api.usernameAvailable(f.username)) ? 'ok' : 'taken') } catch { setNameState(null) }
    }, 350)
    return () => clearTimeout(timer.current)
  }, [f.username, mode])
  const usernameHint = !f.username ? 'Lowercase letters, numbers and _'
    : !USERNAME_RE.test(f.username) ? '3–24 characters' : nameState === 'ok' ? 'Available' : null
  const usernameError = USERNAME_RE.test(f.username) && nameState === 'taken' ? 'Already taken' : null

  async function submit(e) {
    e.preventDefault(); setErr('')
    const email = f.email.trim()
    if (!EMAIL_RE.test(email)) return setErr('Enter a valid email address.')
    setBusy(true)
    if (mode === 'in') {
      const { error } = await api.signIn(email, f.password)
      if (error) setErr(/confirm/i.test(error.message) ? 'Confirm your email first. The link is in your inbox.' : /invalid/i.test(error.message) ? 'Wrong email or password.' : error.message)
    } else {
      if (!f.name.trim()) { setBusy(false); return setErr('Enter your name.') }
      if (!USERNAME_RE.test(f.username)) { setBusy(false); return setErr('Pick a username of 3–24 lowercase letters, numbers or _.') }
      if (f.password.length < 8) { setBusy(false); return setErr('Use a password of at least 8 characters.') }
      const { data, error } = await api.signUp(email, f.password, { name: f.name.trim(), username: f.username })
      if (error) setErr(/username/i.test(error.message) ? 'That username is taken.' : /already/i.test(error.message) ? 'An account with that email already exists.' : error.message)
      else if (!data?.session) setMode('sent')
    }
    setBusy(false)
  }

  return (
    <div className="auth">
      <div className="auth-form">
        <div className="stack-lg">
          <Brand />
          {mode === 'sent' ? (
            <div className="stack">
              <h1>Check your inbox</h1>
              <p className="muted">We sent a confirmation link to <b>{f.email}</b>. Open it, then sign in here.</p>
              <Button variant="primary" size="lg" block onClick={() => setMode('in')}>Go to sign in</Button>
              <Button variant="quiet" block onClick={async () => { const { error } = await api.resend(f.email.trim()); toast(error ? error.message : 'Email sent again', error ? 'error' : 'info') }}>Send the email again</Button>
            </div>
          ) : (
            <form className="stack" onSubmit={submit} noValidate>
              <div>
                <h1>{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
                <p className="muted" style={{ marginTop: 6 }}>{mode === 'in' ? 'Sign in to see your schedule.' : 'One account works for every place you work.'}</p>
              </div>
              {mode === 'up' && <>
                <Input label="Your name" value={f.name} onChange={set('name')} autoComplete="name" placeholder="Ana Silva" />
                <Input label="Username" value={f.username} onChange={set('username')} autoComplete="username" hint={usernameHint} error={usernameError} />
              </>}
              <Input label="Email" type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" />
              <Input label="Password" type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} hint={mode === 'up' ? 'At least 8 characters' : null} />
              {err && <div className="note note-bad" role="alert">{err}</div>}
              <Button type="submit" variant="primary" size="lg" block disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}</Button>
              <p className="small muted" style={{ textAlign: 'center' }}>
                {mode === 'in' ? 'New to ShiftSync? ' : 'Already have an account? '}
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setErr('') }}>{mode === 'in' ? 'Create an account' : 'Sign in'}</button>
              </p>
              <p className="small muted" style={{ textAlign: 'center' }}><a href="/demo">Try the demo without an account</a></p>
            </form>
          )}
        </div>
      </div>
      <div className="auth-art" aria-hidden="true">
        <div>
          <h2>Next week&rsquo;s rota, done before your coffee&rsquo;s cold.</h2>
          <div className="mini-rota">
            <span className="n" /><span className="n">Mon</span><span className="n">Tue</span><span className="n">Wed</span><span className="n">Thu</span><span className="n">Fri</span>
            <span className="n">Maya</span><span style={{ background: '#FFE8A3', color: '#5A4300' }}>8:30–14</span><span className="e" /><span style={{ background: '#FFE8A3', color: '#5A4300' }}>8:30–14</span><span className="e" /><span style={{ background: '#E2D4F5', color: '#40245F' }}>13–18</span>
            <span className="n">Léo</span><span className="e" /><span style={{ background: '#FFD2B0', color: '#6B2F06' }}>10–16</span><span style={{ background: '#E2D4F5', color: '#40245F' }}>13–18</span><span style={{ background: '#FFE8A3', color: '#5A4300' }}>8:30–14</span><span className="e" />
            <span className="n">Sara</span><span style={{ background: '#E2D4F5', color: '#40245F' }}>13–18</span><span style={{ background: '#FFE8A3', color: '#5A4300' }}>8:30–14</span><span className="e" /><span style={{ background: '#FFD2B0', color: '#6B2F06' }}>10–16</span><span style={{ background: '#FFE8A3', color: '#5A4300' }}>8:30–14</span>
          </div>
        </div>
      </div>
    </div>
  )
}
