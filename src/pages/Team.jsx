import { useState } from 'react'
import { api, useAct, useApp, useOrgData } from '../data/hooks'
import { DAYS } from '../lib/dates'
import { Avatar, Button, Confirm, Dialog, Input, LoadError, Select, Spinner, Switch, Tag } from '../ui/kit'
import Icon from '../ui/Icon'
import InviteCode from '../ui/InviteCode'

const num = v => (v === '' || v == null ? null : Number(v))

export default function Team() {
  const { org } = useApp()
  const q = useOrgData(org.id)
  const [dialog, setDialog] = useState(null)
  if (q.error) return <LoadError error={q.error} retry={q.refetch} />
  if (!q.data) return <Spinner />
  const { members, roles, rules, defaults } = q.data
  const person = dialog?.person && members.find(m => m.id === dialog.person)

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div><h1>Team</h1><p>{members.length} {members.length === 1 ? 'person' : 'people'}. Tap someone to set their hours, roles and rules.</p></div>
        <div className="row">
          <Button onClick={() => setDialog({ roles: true })}>Roles</Button>
          <Button variant="primary" icon="plus" onClick={() => setDialog({ invite: true })}>Invite people</Button>
        </div>
      </div>

      <div className="card card-flush list">
        {members.map(m => {
          const myRules = rules.filter(r => r.member_id === m.id || r.other_member_id === m.id).length
          const hasUsual = defaults.some(x => x.user_id === m.id)
          return (
            <button key={m.id} type="button" className="list-item" onClick={() => setDialog({ person: m.id })}>
              <Avatar name={m.name} id={m.id} />
              <span className="grow">
                <b style={{ display: 'block' }}>{m.name}</b>
                <span className="small muted">
                  {m.target_hours != null ? `${Number(m.target_hours)}h a week` : 'No target hours'}
                  {m.roleIds.length > 0 && ` · ${m.roleIds.map(id => roles.find(r => r.id === id)?.name).filter(Boolean).join(', ')}`}
                </span>
              </span>
              <span className="row-wrap" style={{ justifyContent: 'flex-end' }}>
                {m.role === 'admin' && <Tag>Manager</Tag>}
                {myRules > 0 && <Tag>{myRules} {myRules === 1 ? 'rule' : 'rules'}</Tag>}
                {!hasUsual && <Tag kind="warn">No availability yet</Tag>}
              </span>
              <Icon name="right" size={16} />
            </button>
          )
        })}
      </div>
      {members.length === 1 && <div className="note" style={{ marginTop: 16 }}>It&rsquo;s just you so far. Invite your team with the join code <b>{q.data.org.join_code}</b>.</div>}

      {dialog?.invite && <Dialog title="Invite people" subtitle="They create an account, then enter this code." onClose={() => setDialog(null)}><InviteCode code={q.data.org.join_code} /></Dialog>}
      {dialog?.roles && <RolesDialog orgId={org.id} roles={roles} onClose={() => setDialog(null)} />}
      {person && <PersonDialog key={person.id} orgId={org.id} person={person} data={q.data} onClose={() => setDialog(null)} />}
    </div>
  )
}

function RolesDialog({ orgId, roles, onClose }) {
  const act = useAct()
  const [name, setName] = useState('')
  const add = async e => { e.preventDefault(); if (name.trim() && await act(() => api.addRole(orgId, name.trim()), { refresh: ['org'] })) setName('') }
  return (
    <Dialog title="Roles" subtitle="Use roles when a shift needs a certain skill, like barista or kitchen. Skip them if anyone can cover anything." onClose={onClose}>
      <div className="stack">
        {roles.length > 0 && (
          <div className="row-wrap">
            {roles.map(r => <span key={r.id} className="tag" style={{ height: 32, paddingRight: 4 }}>{r.name}
              <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Remove ${r.name}`} onClick={() => act(() => api.deleteRole(r.id), { refresh: ['org'] })}><Icon name="close" size={14} /></button></span>)}
          </div>
        )}
        <form className="row" onSubmit={add} style={{ alignItems: 'flex-end' }}>
          <div className="grow"><Input label="New role" value={name} onChange={e => setName(e.target.value)} placeholder="Barista" maxLength={40} /></div>
          <Button type="submit" variant="primary">Add</Button>
        </form>
      </div>
    </Dialog>
  )
}

function PersonDialog({ orgId, person, data, onClose }) {
  const { profile } = useApp()
  const act = useAct()
  const { roles, rules, members } = data
  const [f, setF] = useState({
    target_hours: person.target_hours ?? '', max_hours: person.max_hours ?? '', hourly_rate: person.hourly_rate ?? '',
    senior: person.senior !== false, contract_type: person.contract_type || '',
  })
  const [confirm, setConfirm] = useState(false)
  const [withId, setWithId] = useState('')
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))
  const first = person.name.split(' ')[0]
  const mine = rules.filter(r => r.member_id === person.id || r.other_member_id === person.id)
  const alone = mine.find(r => r.kind === 'cant_be_alone')
  const maxShifts = mine.find(r => r.kind === 'max_shifts_week')
  const apart = mine.filter(r => r.kind === 'cant_work_with')
  const required = mine.filter(r => r.kind === 'required_on_shift')
  const others = members.filter(m => m.id !== person.id && !apart.some(r => r.member_id === m.id || r.other_member_id === m.id))
  const quiet = { refresh: ['org'] }

  async function save() {
    const ok = await act(() => api.saveMember(orgId, person.id, {
      target_hours: num(f.target_hours), max_hours: num(f.max_hours), hourly_rate: num(f.hourly_rate), senior: f.senior, contract_type: f.contract_type || null,
    }), { done: `${first} saved`, refresh: ['org'] })
    if (ok) onClose()
  }
  async function setMaxShifts(v) {
    if (maxShifts) await act(() => api.deleteRule(maxShifts.id), quiet)
    if (v) await act(() => api.addRule(orgId, { kind: 'max_shifts_week', member_id: person.id, params: { max: Number(v) } }), quiet)
  }

  return (
    <Dialog title={person.name} subtitle={person.role === 'admin' ? 'Manager' : 'Team member'} width={520} onClose={onClose}
      footer={<>
        {person.id !== profile.id && <Button variant="danger" className="left" onClick={() => setConfirm(true)}>Remove from team</Button>}
        <Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save changes</Button>
      </>}>
      <div className="stack-lg">
        <section className="stack">
          <h3>Hours and pay</h3>
          <div className="field-row">
            <Input label="Hours a week to aim for" type="number" min="0" max="80" step="0.5" value={f.target_hours} onChange={set('target_hours')} hint="ShiftSync shares hours fairly against this." />
            <Input label="Never more than" type="number" min="0" max="80" step="0.5" value={f.max_hours} onChange={set('max_hours')} hint="Hours a week. Leave empty for no limit." />
          </div>
          <div className="field-row">
            <Input label={`Hourly pay (${data.org.currency || 'EUR'})`} type="number" min="0" step="0.05" value={f.hourly_rate} onChange={set('hourly_rate')} hint={`Only you and ${first} can see this.`} />
            <Select label="Contract" value={f.contract_type} onChange={set('contract_type')}>
              <option value="">Not set</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="casual">Casual</option><option value="volunteer">Volunteer</option>
            </Select>
          </div>
        </section>

        {roles.length > 0 && (
          <section className="stack">
            <h3>Roles {first} can cover</h3>
            <div className="row-wrap">
              {roles.map(r => {
                const on = person.roleIds.includes(r.id)
                return <Button key={r.id} size="sm" variant={on ? 'ink' : undefined} aria-pressed={on} onClick={() => act(() => api.setMemberRole(orgId, person.id, r.id, !on), quiet)}>{r.name}</Button>
              })}
            </div>
            {person.roleIds.length === 0 && <p className="small muted">With no roles picked, {first} can cover any shift.</p>}
          </section>
        )}

        <section className="stack">
          <h3>Rules</h3>
          <Switch checked={f.senior} onChange={v => setF(p => ({ ...p, senior: v }))}>Can supervise new starters on trial shifts</Switch>
          <Switch checked={!!alone} onChange={on => act(() => (on ? api.addRule(orgId, { kind: 'cant_be_alone', member_id: person.id }) : api.deleteRule(alone.id)), quiet)}>Never works alone</Switch>
          <Select label="Most shifts in a week" value={maxShifts?.params?.max || ''} onChange={e => setMaxShifts(e.target.value)}>
            <option value="">No limit</option>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
          </Select>
          <div className="field">
            <span className="label">Keep apart from</span>
            <div className="row-wrap">
              {apart.map(r => {
                const other = members.find(m => m.id === (r.member_id === person.id ? r.other_member_id : r.member_id))
                return <span key={r.id} className="tag" style={{ height: 32, paddingRight: 4 }}>{other?.name || 'Someone'}
                  <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Remove ${other?.name}`} onClick={() => act(() => api.deleteRule(r.id), quiet)}><Icon name="close" size={14} /></button></span>
              })}
              <select className="input" style={{ width: 'auto', minHeight: 34 }} aria-label="Add a person to keep apart from" value={withId}
                onChange={async e => { const v = e.target.value; setWithId(''); if (v) await act(() => api.addRule(orgId, { kind: 'cant_work_with', member_id: person.id, other_member_id: v }), quiet) }}>
                <option value="">Add a person…</option>{others.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          {required.length > 0 && (
            <div className="field"><span className="label">Must always work</span>
              <div className="row-wrap">{required.map(r => <span key={r.id} className="tag" style={{ height: 32, paddingRight: 4 }}>{DAYS[r.params?.weekday] || ''} {r.params?.start}–{r.params?.end}
                <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Remove" onClick={() => act(() => api.deleteRule(r.id), quiet)}><Icon name="close" size={14} /></button></span>)}</div>
            </div>
          )}
        </section>
      </div>
      {confirm && <Confirm title={`Remove ${first} from the team?`} confirmLabel="Remove" onClose={() => setConfirm(false)}
        onConfirm={async () => { if (await act(() => api.removeMember(orgId, person.id), { done: `${first} removed`, refresh: ['org', 'week'] })) onClose() }}>
        {first} loses access to this business. Reassign their upcoming shifts afterwards.</Confirm>}
    </Dialog>
  )
}
