import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, useApp, useAct, useOrgData } from '../data/hooks'
import { RULE_PACKS } from '../lib/engineAdapter'
import { toMins } from '../lib/dates'
import { Button, IconButton, Select, Spinner } from '../ui/kit'
import HoursEditor, { isClosed } from '../ui/HoursEditor'
import InviteCode from '../ui/InviteCode'
import { Brand } from '../app/Shell'

const CURRENCY = { PT: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', 'CA-QC': 'CAD', 'CA-ON': 'CAD', 'CA-BC': 'CAD' }
const t = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const round15 = m => Math.round(m / 15) * 15

/** Two overlapping shifts that cover a typical open day. */
function suggestShifts(hours) {
  const open = hours.filter(h => !isClosed(h))
  if (!open.length) return []
  const o = toMins(open[0].open_time), c = toMins(open[0].close_time)
  const mid = round15((o + c) / 2)
  return c - o <= 6 * 60
    ? [{ name: 'Day shift', start: t(o), end: t(c), people: 1 }]
    : [{ name: 'Opening', start: t(o), end: t(mid + 30), people: 1 }, { name: 'Closing', start: t(mid - 30), end: t(c), people: 1 }]
}

export default function Setup() {
  const { org } = useApp()
  const navigate = useNavigate()
  const act = useAct()
  const q = useOrgData(org.id)
  const [step, setStep] = useState(0)
  const [place, setPlace] = useState(null)
  const [hours, setHours] = useState(null)
  const [shifts, setShifts] = useState(null)
  const [busy, setBusy] = useState(false)
  if (q.isLoading || !q.data) return <Spinner />

  const jurisdiction = place ?? q.data.org.jurisdiction ?? 'PT'
  const h = hours ?? q.data.hours
  const list = shifts ?? suggestShifts(h)
  const setShift = (i, patch) => setShifts(list.map((s, j) => (j === i ? { ...s, ...patch } : s)))

  async function next() {
    setBusy(true)
    let ok = true
    if (step === 0) {
      ok = await act(async () => {
        await api.updateOrg(org.id, { jurisdiction, currency: CURRENCY[jurisdiction] || 'EUR' })
        await api.saveHours(org.id, h.map(x => ({ open_time: x.open_time, close_time: x.close_time })))
      }, { refresh: ['org'] })
    }
    if (step === 1) {
      const openDays = h.map((x, i) => (isClosed(x) ? null : i)).filter(i => i != null)
      const rows = list.filter(s => s.name.trim() && s.start !== s.end).flatMap(s => openDays.map(weekday => ({
        weekday, name: s.name.trim(), start_time: s.start, end_time: s.end, min_workers: Math.max(1, Number(s.people) || 1), target_workers: Math.max(1, Number(s.people) || 1),
      })))
      if (rows.length && !q.data.templates.length) ok = await act(() => api.addTemplates(org.id, rows), { refresh: ['org'] })
    }
    setBusy(false)
    if (!ok) return
    if (step === 2) navigate('/schedule')
    else setStep(step + 1)
  }

  return (
    <div className="wizard">
      <div className="spread"><Brand /><Button variant="quiet" size="sm" onClick={() => navigate('/schedule')}>Finish later</Button></div>
      <div className="progress" role="img" aria-label={`Step ${step + 1} of 3`}>{[0, 1, 2].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <div className="stack-lg">
          <div><h1>Where and when are you open?</h1><p className="muted" style={{ marginTop: 6 }}>Your location sets the labour rules ShiftSync checks for you, like breaks and rest between shifts.</p></div>
          <div className="card stack">
            <Select label="Location" value={jurisdiction} onChange={e => setPlace(e.target.value)}>
              {Object.values(RULE_PACKS).map(p => <option key={p.jurisdiction} value={p.jurisdiction}>{p.name}</option>)}
            </Select>
            <div><div className="label" style={{ marginBottom: 4 }}>Opening hours</div><HoursEditor hours={h} onChange={setHours} /></div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="stack-lg">
          <div><h1>What shifts do you run?</h1><p className="muted" style={{ marginTop: 6 }}>Start with a typical day. These repeat on every day you&rsquo;re open, and you can fine-tune single days later in Settings.</p></div>
          {q.data.templates.length > 0 ? (
            <div className="note">You already have {q.data.templates.length} shifts set up. Change them any time in Settings.</div>
          ) : (
            <div className="card stack">
              {list.map((s, i) => (
                <div key={i} className="row-wrap" style={{ alignItems: 'flex-end' }}>
                  <div className="field grow" style={{ minWidth: 120 }}><label htmlFor={`n${i}`}>Name</label><input id={`n${i}`} className="input" value={s.name} onChange={e => setShift(i, { name: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`s${i}`}>From</label><input id={`s${i}`} className="input" type="time" step="900" value={s.start} onChange={e => setShift(i, { start: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`e${i}`}>To</label><input id={`e${i}`} className="input" type="time" step="900" value={s.end} onChange={e => setShift(i, { end: e.target.value })} /></div>
                  <div className="field"><label htmlFor={`p${i}`}>People</label><input id={`p${i}`} className="input narrow" type="number" min="1" max="30" value={s.people} onChange={e => setShift(i, { people: e.target.value })} /></div>
                  <IconButton icon="trash" label={`Remove ${s.name}`} onClick={() => setShifts(list.filter((_, j) => j !== i))} />
                </div>
              ))}
              <div><Button icon="plus" size="sm" onClick={() => setShifts([...list, { name: 'Shift', start: '10:00', end: '16:00', people: 1 }])}>Add another shift</Button></div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="stack-lg">
          <div><h1>Invite your team</h1><p className="muted" style={{ marginTop: 6 }}>Everyone creates their own account and enters this code. They then tell ShiftSync when they can work.</p></div>
          <div className="card"><InviteCode code={q.data.org.join_code} /></div>
          <div className="note">You can build a first schedule straight away. Until someone sets their availability, ShiftSync treats them as free any time.</div>
        </div>
      )}

      <div className="spread" style={{ marginTop: 28 }}>
        {step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : <span />}
        <Button variant="primary" size="lg" onClick={next} disabled={busy}>{step === 2 ? 'Go to the schedule' : 'Continue'}</Button>
      </div>
    </div>
  )
}
