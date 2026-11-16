import { useMemo, useState } from 'react'
import { api, useAct, useApp, useOrgData, useWeek } from '../data/hooks'
import { addDaysISO, DAYS_LONG, fmtWeekRange, hhmm, parseISO, weekLabel, weekStartOf } from '../lib/dates'
import { Button, LoadError, Segmented, Select, Spinner, Switch } from '../ui/kit'

const ANY = { on: true, any: true, start: '09:00', end: '17:00' }
const OFF = { on: false, any: true, start: '09:00', end: '17:00' }
const isAny = r => hhmm(r.start_time) === '00:00' && hhmm(r.end_time) === '00:00'
const fromRow = r => (r ? (isAny(r) ? { ...ANY } : { on: true, any: false, start: hhmm(r.start_time), end: hhmm(r.end_time) }) : { ...OFF })
const toTimes = d => (d.any ? { start_time: '00:00', end_time: '00:00' } : { start_time: d.start, end_time: d.end })

export default function MyAvailability() {
  const { org, profile } = useApp()
  const orgQ = useOrgData(org.id)
  const [tab, setTab] = useState('usual')
  if (orgQ.error) return <LoadError error={orgQ.error} retry={orgQ.refetch} />
  if (!orgQ.data) return <Spinner />
  const mine = orgQ.data.defaults.filter(r => r.user_id === profile.id)
  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div><h1>When can you work?</h1><p>Your manager builds the schedule from this.</p></div>
      </div>
      <div className="stack-lg">
        <Segmented label="Which availability" value={tab} onChange={setTab} options={[['usual', 'My usual week'], ['week', 'One week is different']]} />
        {tab === 'usual'
          ? <UsualWeek key={JSON.stringify(mine)} orgId={org.id} userId={profile.id} rows={mine} />
          : <OneWeek orgId={org.id} userId={profile.id} usual={mine} />}
      </div>
    </div>
  )
}

function DayRows({ days, onChange, dates }) {
  const set = (i, patch) => onChange(days.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  return (
    <div className="card card-flush list">
      {days.map((d, i) => (
        <div key={i} className="avail-row">
          <div><b>{DAYS_LONG[i]}</b>{dates && <div className="small muted">{parseISO(dates[i]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>}</div>
          <div>
            <Switch checked={d.on} onChange={on => set(i, { on })}><span className="sr-only">{DAYS_LONG[i]}: </span>{d.on ? 'I can work' : 'I can’t work'}</Switch>
            {d.on && (
              <div className="times">
                <Segmented label={`${DAYS_LONG[i]} hours`} value={d.any ? 'any' : 'set'} onChange={v => set(i, { any: v === 'any' })} options={[['any', 'Any time'], ['set', 'Only between']]} />
                {!d.any && <>
                  <input className="input" type="time" step="900" aria-label={`${DAYS_LONG[i]} from`} value={d.start} onChange={e => e.target.value && set(i, { start: e.target.value })} />
                  <span className="muted">and</span>
                  <input className="input" type="time" step="900" aria-label={`${DAYS_LONG[i]} until`} value={d.end} onChange={e => e.target.value && set(i, { end: e.target.value })} />
                </>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function UsualWeek({ orgId, userId, rows }) {
  const act = useAct()
  const initial = useMemo(() => (rows.length ? [0, 1, 2, 3, 4, 5, 6].map(i => fromRow(rows.find(r => r.weekday === i))) : Array.from({ length: 7 }, () => ({ ...ANY }))), [rows])
  const [days, setDays] = useState(initial)
  const dirty = !rows.length || JSON.stringify(days) !== JSON.stringify(initial)
  const save = () => act(() => api.saveUsualWeek(orgId, userId, days.flatMap((d, i) => (d.on ? [{ weekday: i, ...toTimes(d) }] : []))), { done: 'Usual week saved', refresh: ['org'] })
  return (
    <div className="stack">
      {!rows.length && <div className="note note-warn">You haven&rsquo;t set this yet. Switch off the days you can&rsquo;t work, then save.</div>}
      <p className="muted">Set this once. It repeats every week until you change it.</p>
      <DayRows days={days} onChange={setDays} />
      <div><Button variant="primary" size="lg" onClick={save} disabled={!dirty}>{dirty ? 'Save my usual week' : 'Saved'}</Button></div>
    </div>
  )
}

function OneWeek({ orgId, userId, usual }) {
  const weeks = [0, 1, 2, 3, 4, 5].map(n => addDaysISO(weekStartOf(), n * 7))
  const [weekStart, setWeekStart] = useState(weeks[1])
  const q = useWeek(orgId, weekStart)
  if (q.error) return <LoadError error={q.error} retry={q.refetch} />
  return (
    <div className="stack">
      <Select label="Which week?" value={weekStart} onChange={e => setWeekStart(e.target.value)}>
        {weeks.map(w => <option key={w} value={w}>{fmtWeekRange(w)}{weekLabel(w) ? ` (${weekLabel(w).toLowerCase()})` : ''}</option>)}
      </Select>
      {!q.data ? <Spinner /> : <OneWeekEditor key={weekStart + JSON.stringify(q.data.weekRows.filter(r => r.user_id === userId))} orgId={orgId} userId={userId} weekStart={weekStart} usual={usual} rows={q.data.weekRows.filter(r => r.user_id === userId)} />}
    </div>
  )
}

function OneWeekEditor({ orgId, userId, weekStart, usual, rows }) {
  const act = useAct()
  const changed = rows.length > 0
  const initial = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map(i => {
    if (changed) { const r = rows.find(x => x.day_index === i && x.is_available !== false); return fromRow(r) }
    return usual.length ? fromRow(usual.find(r => r.weekday === i)) : { ...ANY }
  }), [changed, rows, usual])
  const [days, setDays] = useState(initial)
  const dirty = JSON.stringify(days) !== JSON.stringify(initial)
  const dates = [0, 1, 2, 3, 4, 5, 6].map(i => addDaysISO(weekStart, i))
  const save = () => act(() => api.saveWeekAvailability(orgId, userId, weekStart, days.map((d, i) => ({ day_index: i, is_available: d.on, ...(d.on ? toTimes(d) : { start_time: '00:00', end_time: '00:00' }) }))), { done: 'Saved for this week', refresh: ['week'] })
  return (
    <div className="stack">
      {changed
        ? <div className="note spread"><span>This week differs from your usual week.</span><Button size="sm" onClick={() => act(() => api.saveWeekAvailability(orgId, userId, weekStart, null), { done: 'Back to your usual week', refresh: ['week'] })}>Use my usual week</Button></div>
        : <p className="muted">This week follows your usual week. Change the days that are different, then save.</p>}
      <DayRows days={days} onChange={setDays} dates={dates} />
      <div><Button variant="primary" size="lg" onClick={save} disabled={!dirty}>Save this week</Button></div>
    </div>
  )
}
