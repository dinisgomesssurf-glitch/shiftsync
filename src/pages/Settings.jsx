import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api, IS_DEMO, useAct, useApp, useOrgData } from '../data/hooks'
import { RULE_PACKS } from '../lib/engineAdapter'
import { DAYS, daypart, hhmm, timeRange } from '../lib/dates'
import { Button, Confirm, DayPicker, Dialog, Input, LoadError, Select, Spinner, Switch } from '../ui/kit'
import HoursEditor from '../ui/HoursEditor'

export default function Settings() {
  const { org } = useApp()
  const q = useOrgData(org.id)
  const { hash } = useLocation()
  useEffect(() => { if (q.data && hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [q.data, hash])
  if (q.error) return <LoadError error={q.error} retry={q.refetch} />
  if (!q.data) return <Spinner />
  const sections = [['shifts', 'Shifts'], ['hours', 'Opening hours'], ['business', 'Business'], ['scheduling', 'Scheduling'], ...(IS_DEMO ? [] : [['danger', 'Delete']])]
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head"><div><h1>Settings</h1></div></div>
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Settings sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
        <div className="stack-lg">
          <ShiftsSection data={q.data} />
          <HoursSection key={JSON.stringify(q.data.hours)} data={q.data} />
          <BusinessSection key={q.data.org.name + q.data.org.jurisdiction + q.data.org.currency} data={q.data} />
          <SchedulingSection data={q.data} />
          <DangerSection data={q.data} />
        </div>
      </div>
    </div>
  )
}

// A "shift" here is the same template on one or more weekdays.
function groupTemplates(templates) {
  const map = new Map()
  for (const t of templates) {
    const key = [t.name, t.start_time, t.end_time, t.role_id || '', t.min_workers, t.target_workers].join('|')
    if (!map.has(key)) map.set(key, { key, name: t.name, start: hhmm(t.start_time), end: hhmm(t.end_time), role_id: t.role_id || '', min: t.min_workers, target: t.target_workers, days: [], ids: [] })
    const g = map.get(key); g.days.push(t.weekday); g.ids.push(t.id)
  }
  return [...map.values()].sort((a, b) => Math.min(...a.days) - Math.min(...b.days) || a.start.localeCompare(b.start))
}
const dayText = days => {
  const s = [...days].sort()
  if (s.length === 7) return 'Every day'
  if (s.join() === '0,1,2,3,4') return 'Weekdays'
  if (s.join() === '5,6') return 'Weekends'
  return s.map(d => DAYS[d]).join(', ')
}

function ShiftsSection({ data }) {
  const [edit, setEdit] = useState(null)
  const groups = groupTemplates(data.templates)
  const roleName = id => data.roles.find(r => r.id === id)?.name
  return (
    <section id="shifts" className="card stack">
      <div className="spread">
        <div><h2>Shifts</h2><p className="muted small">The shifts you usually run. ShiftSync fills these when it builds a week.</p></div>
        <Button variant="primary" icon="plus" onClick={() => setEdit({})}>Add shift</Button>
      </div>
      {groups.length === 0 ? <div className="note">No shifts yet. Add your first one, for example Opening from 8:30 to 14:00 with 2 people.</div> : (
        <div className="card card-flush list">
          {groups.map(g => (
            <button key={g.key} type="button" className="list-item" onClick={() => setEdit(g)}>
              <span className={`chip ${daypart(g.start, g.end)}`} style={{ width: 112, flex: 'none' }}><span>{timeRange(g.start, g.end)}</span></span>
              <span className="grow"><b style={{ display: 'block' }}>{g.name}</b><span className="small muted">{dayText(g.days)}{g.role_id && roleName(g.role_id) ? ` · ${roleName(g.role_id)}` : ''}</span></span>
              <span className="small muted num">{g.min === g.target ? `${g.min} ${g.min === 1 ? 'person' : 'people'}` : `${g.min} to ${g.target} people`}</span>
            </button>
          ))}
        </div>
      )}
      {edit && <ShiftTemplateDialog orgId={data.org.id} group={edit} roles={data.roles} onClose={() => setEdit(null)} />}
    </section>
  )
}

function ShiftTemplateDialog({ orgId, group, roles, onClose }) {
  const act = useAct()
  const editing = !!group.ids
  const [f, setF] = useState({ name: group.name || '', start: group.start || '08:30', end: group.end || '14:00', role_id: group.role_id || '', min: group.min ?? 1, extra: group.ids ? group.target - group.min : 0 })
  const [days, setDays] = useState(group.days || [0, 1, 2, 3, 4])
  const [err, setErr] = useState('')
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  async function save() {
    if (!f.name.trim()) return setErr('Give the shift a name.')
    if (!f.start || !f.end || f.start === f.end) return setErr('Set a start and an end time.')
    if (!days.length) return setErr('Pick at least one day.')
    const min = Math.max(0, parseInt(f.min) || 0), target = min + Math.max(0, parseInt(f.extra) || 0)
    if (target === 0) return setErr('A shift needs at least one person.')
    const rows = days.map(weekday => ({ weekday, name: f.name.trim(), start_time: f.start, end_time: f.end, role_id: f.role_id || null, min_workers: min, target_workers: target }))
    const ok = await act(async () => { if (editing) await api.deleteTemplates(group.ids); await api.addTemplates(orgId, rows) }, { done: editing ? 'Shift updated' : 'Shift added', refresh: ['org'] })
    if (ok) onClose()
  }
  return (
    <Dialog title={editing ? 'Change shift' : 'Add shift'} onClose={onClose} width={480}
      footer={<>
        {editing && <Button variant="danger" className="left" icon="trash" onClick={async () => { if (await act(() => api.deleteTemplates(group.ids), { done: 'Shift removed', refresh: ['org'] })) onClose() }}>Remove</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>{editing ? 'Save changes' : 'Add shift'}</Button>
      </>}>
      <div className="stack">
        <Input label="Name" value={f.name} onChange={set('name')} placeholder="Opening" maxLength={60} />
        <div className="row">
          <div className="field"><label htmlFor="t-from">From</label><input id="t-from" className="input" type="time" step="900" value={f.start} onChange={set('start')} /></div>
          <div className="field"><label htmlFor="t-to">To</label><input id="t-to" className="input" type="time" step="900" value={f.end} onChange={set('end')} /></div>
        </div>
        {f.start && f.end && f.end < f.start && <p className="small muted">Ends the next day.</p>}
        <div className="field"><span className="label">On</span><DayPicker value={days} onChange={setDays} labels={DAYS} /></div>
        <div className="field-row">
          <Input label="People needed" type="number" min="0" max="30" value={f.min} onChange={set('min')} />
          <Input label="Extra if possible" type="number" min="0" max="30" value={f.extra} onChange={set('extra')} hint="Added when someone is free and it fits the budget." />
        </div>
        {roles.length > 0 && <Select label="Role" value={f.role_id} onChange={set('role_id')}><option value="">Anyone</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}
        {err && <div className="note note-bad" role="alert">{err}</div>}
      </div>
    </Dialog>
  )
}

function HoursSection({ data }) {
  const act = useAct()
  const [hours, setHours] = useState(data.hours)
  const dirty = JSON.stringify(hours) !== JSON.stringify(data.hours)
  return (
    <section id="hours" className="card stack">
      <h2>Opening hours</h2>
      <HoursEditor hours={hours} onChange={setHours} />
      {dirty && <div><Button variant="primary" onClick={() => act(() => api.saveHours(data.org.id, hours.map(h => ({ open_time: h.open_time, close_time: h.close_time }))), { done: 'Opening hours saved', refresh: ['org'] })}>Save opening hours</Button></div>}
    </section>
  )
}

function BusinessSection({ data }) {
  const act = useAct()
  const qc = useQueryClient()
  const [f, setF] = useState({ name: data.org.name, jurisdiction: data.org.jurisdiction || 'PT', currency: data.org.currency || 'EUR' })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const dirty = f.name !== data.org.name || f.jurisdiction !== (data.org.jurisdiction || 'PT') || f.currency !== (data.org.currency || 'EUR')
  const pack = RULE_PACKS[f.jurisdiction]
  return (
    <section id="business" className="card stack">
      <h2>Business</h2>
      <Input label="Name" value={f.name} onChange={set('name')} maxLength={60} />
      <div className="field-row">
        <Select label="Location" value={f.jurisdiction} onChange={set('jurisdiction')}>{Object.values(RULE_PACKS).map(p => <option key={p.jurisdiction} value={p.jurisdiction}>{p.name}</option>)}</Select>
        <Select label="Currency" value={f.currency} onChange={set('currency')}>{['EUR', 'CAD', 'USD', 'GBP'].map(c => <option key={c}>{c}</option>)}</Select>
      </div>
      {pack && (
        <div className="note"><div>
          <b>Labour rules ShiftSync checks in {pack.name.replace('Canada — ', '')}</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {pack.minRestHours != null && <li>{pack.minRestHours} hours of rest between working days</li>}
            {pack.maxDailyHours != null && <li>No more than {pack.maxDailyHours} hours a day</li>}
            {pack.maxWeeklyHours != null && <li>No more than {pack.maxWeeklyHours} hours a week</li>}
            {pack.weeklyRestHours != null && <li>{pack.weeklyRestHours} hours off in a row every week</li>}
            {pack.breaks.map((b, i) => <li key={i}>A {b.minutes}-minute break on shifts over {b.overHours} hours</li>)}
          </ul>
          <p className="small" style={{ marginTop: 6 }}>These are the general rules. A collective agreement can change them, so check yours.</p>
        </div></div>
      )}
      {dirty && <div><Button variant="primary" disabled={!f.name.trim()} onClick={async () => { if (await act(() => api.updateOrg(data.org.id, { ...f, name: f.name.trim() }), { done: 'Business saved', refresh: ['org'] })) qc.invalidateQueries({ queryKey: ['orgs'] }) }}>Save business</Button></div>}
    </section>
  )
}

function SchedulingSection({ data }) {
  const act = useAct()
  const o = data.org
  const save = (patch, done = 'Saved') => act(() => api.updateOrg(o.id, patch), { done, refresh: ['org'] })
  const [budget, setBudget] = useState(o.labor_budget ?? '')
  return (
    <section id="scheduling" className="card stack">
      <h2>Scheduling</h2>
      <Select label="When ShiftSync builds a week, it should" value={o.generation_preset || 'balanced'} onChange={e => save({ generation_preset: e.target.value })}>
        <option value="balanced">Balance cover, fair hours and cost</option>
        <option value="cover_first">Fill every shift it can, extras included</option>
        <option value="save_money">Keep wages down and skip extras</option>
      </Select>
      <div className="field-row">
        <Input label={`Weekly wage budget (${o.currency || 'EUR'})`} type="number" min="0" step="10" placeholder="No budget" value={budget} onChange={e => setBudget(e.target.value)}
          onBlur={() => { const v = budget === '' ? null : Number(budget); if (v !== (o.labor_budget == null ? null : Number(o.labor_budget))) save({ labor_budget: v }) }} hint="Needs hourly pay set for your team." />
        <Select label="Fewest people on while open" value={o.min_staff_while_open ?? 0} onChange={e => save({ min_staff_while_open: Number(e.target.value) })} hint="You get a warning when a week dips below this.">
          <option value={0}>No minimum</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
        </Select>
      </div>
      <Switch checked={o.assume_available !== false} onChange={v => save({ assume_available: v })}>Treat people who haven&rsquo;t set availability as free any time</Switch>
      <Switch checked={o.staff_see_team !== false} onChange={v => save({ staff_see_team: v })}>Let the team see each other&rsquo;s shifts</Switch>
    </section>
  )
}

function DangerSection({ data }) {
  const act = useAct()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  if (IS_DEMO) return null
  return (
    <section id="danger" className="card stack">
      <h2>Delete this business</h2>
      <p className="muted">Removes {data.org.name}, its team list and every schedule, for everyone. This can&rsquo;t be undone.</p>
      <div><Button variant="danger" onClick={() => setOpen(true)}>Delete {data.org.name}</Button></div>
      {open && <Confirm title={`Delete ${data.org.name}?`} confirmLabel="Delete for everyone" onClose={() => setOpen(false)}
        onConfirm={async () => { if (await act(() => api.deleteOrg(data.org.id), { done: 'Business deleted', refresh: [] })) { await qc.invalidateQueries({ queryKey: ['orgs'] }); navigate('/') } }}>
        Every schedule and the whole team list will be gone for good.</Confirm>}
    </section>
  )
}
