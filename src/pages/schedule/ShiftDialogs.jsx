import { useMemo, useState } from 'react'
import { api } from '../../data/hooks'
import { breakFor, candidatesFor } from '../../lib/engineAdapter'
import { DAYS, fmtDayLong, hhmm, parseISO, timeRange } from '../../lib/dates'
import { Avatar, Button, Dialog, Select, Switch, Tag } from '../../ui/kit'

const dayIndex = (weekStart, date) => Math.round((parseISO(date) - parseISO(weekStart)) / 86400000)

/** Add a shift for a person on a day, or change an existing one. */
export function ShiftDialog({ ctx, shifts, shift, memberId, date, getScheduleId, act, onClose }) {
  const editing = !!shift
  const day = shift?.date || date
  const dayTemplates = ctx.templates.filter(t => t.weekday === dayIndex(ctx.weekStart, day))
  const first = dayTemplates[0]
  const [who, setWho] = useState(shift?.user_id || memberId)
  const [start, setStart] = useState(hhmm(shift?.start_time) || hhmm(first?.start_time) || '09:00')
  const [end, setEnd] = useState(hhmm(shift?.end_time) || hhmm(first?.end_time) || '17:00')
  const [locked, setLocked] = useState(!!shift?.locked)
  const [busy, setBusy] = useState(false)
  const others = useMemo(() => shifts.filter(s => s.id !== shift?.id), [shifts, shift])
  const problems = useMemo(() => (start && end && start !== end
    ? candidatesFor(ctx, others, { date: day, start, end }).find(c => c.member.id === who)?.problems || [] : []), [ctx, others, day, start, end, who])
  const brk = start && end && start !== end ? breakFor(ctx.org, start, end) : 0
  const person = ctx.members.find(m => m.id === who)

  async function save() {
    if (!start || !end || start === end) return
    setBusy(true)
    const row = { user_id: who, start_time: start, end_time: end, break_minutes: brk }
    const ok = await act(async () => {
      if (editing) return api.updateShift(shift.id, { ...row, locked })
      const scheduleId = await getScheduleId()
      return api.addShift({ ...row, schedule_id: scheduleId, date: day, day_index: dayIndex(ctx.weekStart, day) })
    }, { done: editing ? 'Shift updated' : 'Shift added', refresh: ['week'] })
    setBusy(false)
    if (ok) onClose()
  }
  async function remove() {
    if (await act(() => api.deleteShift(shift.id), { done: 'Shift removed', refresh: ['week'] })) onClose()
  }

  return (
    <Dialog title={editing ? 'Change shift' : 'Add shift'} subtitle={fmtDayLong(day)} onClose={onClose}
      footer={<>
        {editing && <Button variant="danger" className="left" icon="trash" onClick={remove}>Remove</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy || start === end}>{editing ? 'Save changes' : 'Add shift'}</Button>
      </>}>
      <div className="stack">
        <Select label="Who" value={who} onChange={e => setWho(e.target.value)}>
          {ctx.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        {dayTemplates.length > 0 && (
          <div className="field"><span className="label">Your usual shifts</span>
            <div className="row-wrap">
              {[...new Map(dayTemplates.map(t => [`${t.start_time}-${t.end_time}`, t])).values()].map(t => (
                <Button key={t.id} size="sm" variant={hhmm(t.start_time) === start && hhmm(t.end_time) === end ? 'ink' : undefined}
                  onClick={() => { setStart(hhmm(t.start_time)); setEnd(hhmm(t.end_time)) }}>{t.name} {timeRange(t.start_time, t.end_time)}</Button>
              ))}
            </div>
          </div>
        )}
        <div className="row">
          <div className="field"><label htmlFor="sd-from">From</label><input id="sd-from" className="input" type="time" step="900" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div className="field"><label htmlFor="sd-to">To</label><input id="sd-to" className="input" type="time" step="900" value={end} onChange={e => setEnd(e.target.value)} /></div>
        </div>
        {brk > 0 && <p className="small muted">Includes a {brk}-minute break, required for a shift this long.</p>}
        {problems.length > 0 && (
          <div className="note note-warn" role="status"><div><b>Heads up for {person?.name.split(' ')[0]}</b>{problems.map((p, i) => <div key={i}>{p.message}</div>)}</div></div>
        )}
        {editing && <Switch checked={locked} onChange={setLocked}>Keep this shift when rebuilding the week</Switch>}
      </div>
    </Dialog>
  )
}

/** Pick someone for an open shift. People who can take it come first; the rest show why not. */
export function AssignDialog({ ctx, shifts, slot, getScheduleId, act, onClose }) {
  const list = useMemo(() => candidatesFor(ctx, shifts, slot), [ctx, shifts, slot])
  const [busy, setBusy] = useState(null)
  async function pick(m) {
    setBusy(m.id)
    const ok = await act(async () => {
      const scheduleId = await getScheduleId()
      return api.addShift({
        schedule_id: scheduleId, user_id: m.id, date: slot.date, day_index: slot.weekday,
        start_time: slot.start, end_time: slot.end, role_id: slot.roleId, break_minutes: breakFor(ctx.org, slot.start, slot.end),
      })
    }, { done: `${m.name.split(' ')[0]} is on ${DAYS[slot.weekday]} ${timeRange(slot.start, slot.end)}`, refresh: ['week'] })
    setBusy(null)
    if (ok) onClose()
  }
  const free = list.filter(c => c.ok)
  return (
    <Dialog title={`${slot.name}, ${timeRange(slot.start, slot.end)}`} subtitle={fmtDayLong(slot.date)} onClose={onClose} width={460}>
      {free.length === 0 && <div className="note note-warn" style={{ marginBottom: 12 }}>Nobody is free for this shift. You can still assign someone below.</div>}
      <div className="card card-flush list">
        {list.map(c => (
          <button key={c.member.id} type="button" className="list-item" disabled={!!busy} onClick={() => pick(c.member)}>
            <Avatar name={c.member.name} id={c.member.id} />
            <span className="grow">
              <b style={{ display: 'block' }}>{c.member.name}</b>
              {!c.ok && <span className="small" style={{ color: 'var(--warn)' }}>{shortReason(c.problems[0], c.member.name)}</span>}
            </span>
            {c.ok ? <Tag kind="good">Free</Tag> : null}
          </button>
        ))}
      </div>
    </Dialog>
  )
}

const REASON = {
  unavailable: 'Not available then', time_off: 'On time off', overlap: 'Already working then', min_rest: 'Too little rest between shifts',
  max_daily_hours: 'Would work too long that day', max_weekly_hours: 'Would pass the weekly hour limit', contract_max_hours: 'Would pass their contract hours',
  weekly_rest: 'Would lose their weekly rest', max_shifts_week: 'Already at their max shifts', cant_work_with: 'Paired with someone they can’t work with',
  cant_be_alone: 'Would be alone', missing_role: 'Doesn’t have the role',
}
function shortReason(p) { return REASON[p?.code] || p?.message || 'Breaks a rule' }
