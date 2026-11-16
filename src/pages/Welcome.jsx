import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, useApp } from '../data/hooks'
import { Button, Input } from '../ui/kit'
import { Brand } from '../app/Shell'

// First screen after sign-up, and where you add another business later.
export default function Welcome({ first }) {
  const { profile, setOrgId } = useApp()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [mode, setMode] = useState(null) // 'create' | 'join'
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault(); setErr('')
    const v = value.trim()
    if (!v) return setErr(mode === 'create' ? 'Enter the name of your business.' : 'Enter the code your manager gave you.')
    setBusy(true)
    try {
      const id = mode === 'create' ? await api.createOrg(v) : await api.joinOrg(v.toUpperCase())
      await qc.invalidateQueries({ queryKey: ['orgs'] })
      setOrgId(id)
      navigate(mode === 'create' ? '/setup' : '/availability')
    } catch (e2) {
      setErr(/not found|invalid/i.test(e2.message) ? 'No business uses that code. Check it with your manager.' : e2.message)
    }
    setBusy(false)
  }

  return (
    <div className="wizard">
      <div className="spread"><Brand />{first ? <Button variant="quiet" size="sm" onClick={() => api.signOut()}>Sign out</Button> : <Button variant="quiet" size="sm" onClick={() => navigate('/')}>Back</Button>}</div>
      <div className="stack-lg" style={{ marginTop: 40 }}>
        <div>
          <h1>{first ? `Hi ${profile.name.split(' ')[0]}. What brings you here?` : 'Add a business'}</h1>
        </div>
        {!mode ? (
          <div className="card card-flush list">
            <button className="list-item" onClick={() => setMode('create')}>
              <span className="grow"><h3>I manage a team</h3><span className="muted small">Set up your business and build schedules.</span></span><span aria-hidden="true">›</span>
            </button>
            <button className="list-item" onClick={() => setMode('join')}>
              <span className="grow"><h3>I&rsquo;m joining my workplace</h3><span className="muted small">Use the code from your manager to see your shifts.</span></span><span aria-hidden="true">›</span>
            </button>
          </div>
        ) : (
          <form className="card stack" onSubmit={submit}>
            {mode === 'create'
              ? <Input label="Business name" value={value} onChange={e => setValue(e.target.value)} placeholder="Sunny Side Juice Bar" maxLength={60} autoFocus />
              : <Input label="Join code" value={value} onChange={e => setValue(e.target.value.toUpperCase())} placeholder="ABC123" hint="Six letters or numbers. Your manager finds it under Team." autoFocus style={{ letterSpacing: '.12em', fontWeight: 600 }} />}
            {err && <div className="note note-bad" role="alert">{err}</div>}
            <div className="row">
              <Button onClick={() => { setMode(null); setErr(''); setValue('') }}>Back</Button>
              <Button type="submit" variant="primary" disabled={busy}>{busy ? 'One moment…' : mode === 'create' ? 'Create business' : 'Join'}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
