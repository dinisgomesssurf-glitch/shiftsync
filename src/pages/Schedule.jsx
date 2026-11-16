import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, useAct, useApp, useOrgData, useWeek } from '../data/hooks'
import { checkWeek, effectiveAvailability, openSlots, runGenerator, toEngineShifts, toSavePayload } from '../lib/engineAdapter'
import { addDaysISO, DAYS, fmtHours, fmtWeekRange, isISODate, parseISO, spanMinutes, timeRange, weekLabel, weekStartOf } from '../lib/dates'
import { Button, Confirm, Empty, IconButton, LoadError, Menu, Spinner, Tag } from '../ui/kit'
import { useToast } from '../ui/Toast'
import Icon from '../ui/Icon'
import WeekGrid, { Legend } from './schedule/WeekGrid'
import { AssignDialog, ShiftDialog } from './schedule/ShiftDialogs'

const MONEY = { EUR: '€', CAD: '$', USD: '$', GBP: '£' }

export default function Schedule() {
  const { org, profile } = useApp()
  const { week } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const act = useAct()
  const weekStart = weekStartOf(isISODate(week) ? week : undefined)
  const orgQ = useOrgData(org.id)
  const weekQ = useWeek(org.id, weekStart)
  const [dialog, setDialog] = useState(null)
  const [building, setBuilding] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const d = orgQ.data, w = weekQ.data
  const ctx = useMemo(() => d && w && ({
    org: d.org, members: d.members, templates: d.templates, weekRows: w.weekRows, defaults: d.defaults,
    timeOff: d.timeOff, rules: d.rules, hours: d.hours, weekStart,
  }), [d, w, weekStart])
  const view = useMemo(() => {
    if (!ctx) return null
    const shifts = w.shifts
    const avail = effectiveAvailability({ members: ctx.members, weekRows: ctx.weekRows, defaults: ctx.defaults, weekStart, assumeAvailable: ctx.org.assume_available !== false })
    const open = shifts.length ? openSlots(ctx.templates, shifts, weekStart) : []
    let violations = []
    try { violations = shifts.length ? checkWeek(ctx, shifts) : [] } catch (e) { console.error(e) }
    const flagged = new Set(violations.filter(v => v.code !== 'below_min_staff').flatMap(v => v.shiftIds))
    return { shifts, avail, open, violations, flagged }
  }, [ctx, w, weekStart])

  if (orgQ.error || weekQ.error) return <LoadError error={orgQ.error || weekQ.error} retry={() => { orgQ.refetch(); weekQ.refetch() }} />
  if (!view) return <Spinner />

  const { shifts, avail, open, violations, flagged } = view
  const schedule = w.schedule
  const published = !!schedule?.published
  const hasShifts = shifts.length > 0
  const requiredOpen = open.filter(o => o.required)
  const go = n => navigate(`/schedule/${addDaysISO(weekStart, n * 7)}`)
  const getScheduleId = async () => schedule?.id || (await api.ensureWeek(org.id, weekStart)).id

  async function build(mode) {
    setBuilding(true)
    await act(async () => {
      const [sched, historyHours] = await Promise.all([api.ensureWeek(org.id, weekStart), api.historyHours(org.id, weekStart)])
      const existing = toEngineShifts(shifts).filter(s => s.memberId)
      const kept = existing.filter(s => mode === 'gaps' || s.locked)
      const wasLocked = new Set(existing.filter(s => s.locked).map(s => s.id))
      const { result, durationMs } = runGenerator({ ...ctx, lockedShifts: kept.map(s => ({ ...s, locked: true })), historyHours, seed: (sched.version || 1) * 7919 })
      await api.saveSchedule(sched.id, toSavePayload(result.shifts.map(s => ({ ...s, locked: wasLocked.has(s.id) }))), sched.version)
      const report = { preset: ctx.org.generation_preset, score: result.score, members: result.members, unfilled: result.unfilled.map(u => ({ slot: u.slot, summary: u.summary })) }
      await api.logRun({ schedule_id: sched.id, engine_version: result.engineVersion, seed: result.seed, score: result.score.total, duration_ms: durationMs, created_by: profile.id, result: { iterations: result.iterations }, explanations: report })
      const gaps = result.unfilled.filter(u => u.slot.mandatory).length
      toast(gaps ? `Schedule built. ${gaps} shift${gaps > 1 ? 's' : ''} still to fill.` : 'Schedule built. Every shift is covered.')
    }, { refresh: ['week'] })
    setBuilding(false)
  }
  async function publish() {
    const ok = await act(() => api.setPublished(schedule.id, true), { refresh: ['week'] })
    if (!ok) return
    const res = await api.notify(schedule.id, 'published')
    toast(typeof res?.sent === 'number' && res.sent > 0 ? `Published. Emailed ${res.sent} ${res.sent === 1 ? 'person' : 'people'}.` : 'Published. Your team can see it now.')
  }

  // ── Things that need a look ──
  const why = o => w.report?.unfilled?.find(u => u.slot.date === o.date && u.slot.start === o.start && u.slot.end === o.end)?.summary?.split(': ').slice(1).join(': ')
  const issues = [
    ...requiredOpen.map(o => ({ bad: true, key: o.key, title: `${DAYS[o.weekday]} ${timeRange(o.start, o.end)} ${o.name} has nobody`, detail: why(o), action: () => setDialog({ type: 'assign', slot: o }) })),
    ...violations.filter(v => !(v.code === 'below_min_staff' && requiredOpen.length)).map((v, i) => ({ key: `v${i}`, title: v.message })),
  ]
  const totalHours = shifts.reduce((a, s) => a + (spanMinutes(s.start_time, s.end_time) - (s.break_minutes || 0)) / 60, 0)
  const cost = d.members.some(m => m.hourly_rate != null)
    ? shifts.reduce((a, s) => a + ((spanMinutes(s.start_time, s.end_time) - (s.break_minutes || 0)) / 60) * Number(d.members.find(m => m.id === s.user_id)?.hourly_rate || 0), 0) : null
  const waiting = d.members.filter(m => avail.source[m.id] === 'assumed').length

  const setupSteps = [
    { done: d.templates.length > 0, title: 'Add the shifts you run', hint: 'Like Opening 8:30–14 with 2 people.', to: '/settings#shifts', cta: 'Add shifts' },
    { done: d.members.length > 1, title: 'Invite your team', hint: `Share the join code ${d.org.join_code}.`, to: '/team', cta: 'Invite' },
    { done: hasShifts, title: 'Build your first schedule', hint: 'One click. You can change anything afterwards.' },
  ]
  const needsSetup = !hasShifts && (d.templates.length === 0 || d.members.length <= 1)
  const nextStep = setupSteps.findIndex(s => !s.done)

  return (
    <div className="page">
      <div className="page-head">
        <div className="weekbar">
          <IconButton icon="left" label="Previous week" outlined onClick={() => go(-1)} />
          <IconButton icon="right" label="Next week" outlined onClick={() => go(1)} />
          <div className="when" style={{ marginLeft: 6 }}>
            <strong>{fmtWeekRange(weekStart)}</strong>
            <span className="small muted">{weekLabel(weekStart) || parseISO(weekStart).getFullYear()}</span>
          </div>
          {weekStart !== weekStartOf() && <Button size="sm" variant="quiet" onClick={() => navigate('/schedule')}>Today</Button>}
        </div>
        {hasShifts && (
          <div className="row">
            <Menu items={[
              { label: 'Fill the gaps only', icon: 'spark', onClick: () => build('gaps') },
              { label: 'Rebuild the whole week', icon: 'spark', onClick: () => setDialog({ type: 'rebuild' }) },
              published && 'divider',
              published && { label: 'Email the team again', icon: 'send', onClick: async () => { const r = await api.notify(schedule.id, 'updated'); toast(r?.sent ? `Emailed ${r.sent} people.` : 'No emails were sent.') } },
              published && { label: 'Unpublish', onClick: () => act(() => api.setPublished(schedule.id, false), { done: 'Unpublished. Your team no longer sees this week.', refresh: ['week'] }) },
              'divider',
              { label: 'Clear this week', icon: 'trash', danger: true, onClick: () => setDialog({ type: 'clear' }) },
            ]} trigger={p => <Button {...p} disabled={building}>{building ? 'Building…' : 'Rebuild'}<Icon name="down" size={16} /></Button>} />
            {published
              ? <Tag kind="good"><Icon name="check" size={14} />Published</Tag>
              : <Button variant="primary" icon="send" onClick={publish}>Publish</Button>}
          </div>
        )}
      </div>

      {needsSetup ? (
        <div className="card card-flush" style={{ maxWidth: 640 }}>
          <div style={{ padding: '18px 18px 6px' }}><h2>Three steps to your first schedule</h2></div>
          <div className="list steps">
            {setupSteps.map((s, i) => (
              <div key={i} className={`step${s.done ? ' done' : i === nextStep ? ' next' : ''}`}>
                <span className="n">{s.done ? <Icon name="check" size={16} /> : i + 1}</span>
                <span className="grow"><b>{s.title}</b>{!s.done && <span className="small muted" style={{ display: 'block' }}>{s.hint}</span>}</span>
                {!s.done && i === nextStep && (s.to ? <Link className="btn btn-primary btn-sm" to={s.to}>{s.cta}</Link>
                  : <Button variant="primary" size="sm" icon="spark" onClick={() => build('all')} disabled={building}>Build schedule</Button>)}
              </div>
            ))}
          </div>
        </div>
      ) : !hasShifts ? (
        <div className="card">
          <Empty title={`Nothing planned for ${(weekLabel(weekStart) || 'this week').toLowerCase()} yet`}
            action={<Button variant="primary" size="lg" icon="spark" onClick={() => build('all')} disabled={building}>{building ? 'Building…' : 'Build schedule'}</Button>}>
            ShiftSync fills your {d.templates.length} shifts from everyone&rsquo;s availability, keeps hours fair and follows the labour rules.
            {waiting > 0 && ` ${waiting} ${waiting === 1 ? 'person hasn’t' : 'people haven’t'} set availability yet, so they count as free any time.`}
          </Empty>
        </div>
      ) : (
        <div className="stack-lg">
          <div>
            <div className="stats">
              <Tag kind={requiredOpen.length ? 'bad' : 'good'}>{requiredOpen.length ? `${requiredOpen.length} shift${requiredOpen.length > 1 ? 's' : ''} to fill` : 'Every shift covered'}</Tag>
              <Tag><span className="num">{fmtHours(totalHours)}</span> planned</Tag>
              {cost != null && <Tag>About {MONEY[d.org.currency] || ''}{Math.round(cost).toLocaleString()} in wages</Tag>}
              {!published && <Tag kind="action">Draft, only you can see it</Tag>}
            </div>
            <WeekGrid weekStart={weekStart} members={d.members} shifts={shifts} open={open} availability={avail.windows} source={avail.source} flagged={flagged} roles={d.roles}
              onAdd={(memberId, date) => setDialog({ type: 'shift', memberId, date })}
              onEdit={shift => setDialog({ type: 'shift', shift })}
              onAssign={slot => setDialog({ type: 'assign', slot })} />
            <Legend />
          </div>

          {issues.length > 0 && (
            <section className="card card-flush" aria-label="Things to check">
              <div style={{ padding: '16px 18px 8px' }}><h2>{issues.length} {issues.length === 1 ? 'thing' : 'things'} to check</h2></div>
              <div className="list">
                {(showAll ? issues : issues.slice(0, 5)).map(it => (
                  <div key={it.key} className={`issue${it.bad ? ' bad' : ''}`}>
                    <span className="dot" />
                    <span className="grow"><b>{it.title}</b>{it.detail && <span className="small muted" style={{ display: 'block' }}>{it.detail}</span>}</span>
                    {it.action && <Button size="sm" onClick={it.action}>Assign</Button>}
                  </div>
                ))}
                {issues.length > 5 && <button className="list-item" onClick={() => setShowAll(!showAll)}><span className="muted small">{showAll ? 'Show fewer' : `Show ${issues.length - 5} more`}</span></button>}
              </div>
            </section>
          )}
        </div>
      )}

      {dialog?.type === 'shift' && <ShiftDialog ctx={ctx} shifts={shifts} shift={dialog.shift} memberId={dialog.memberId} date={dialog.date} getScheduleId={getScheduleId} act={act} onClose={() => setDialog(null)} />}
      {dialog?.type === 'assign' && <AssignDialog ctx={ctx} shifts={shifts} slot={dialog.slot} getScheduleId={getScheduleId} act={act} onClose={() => setDialog(null)} />}
      {dialog?.type === 'rebuild' && <Confirm title="Rebuild the whole week?" confirmLabel="Rebuild" onConfirm={() => build('all')} onClose={() => setDialog(null)}>This replaces every shift except the ones you locked.</Confirm>}
      {dialog?.type === 'clear' && <Confirm title="Clear this week?" confirmLabel="Clear week" onClose={() => setDialog(null)}
        onConfirm={() => act(() => api.saveSchedule(schedule.id, [], schedule.version), { done: 'Week cleared', refresh: ['week'] })}>Every shift in this week is removed. This can&rsquo;t be undone.</Confirm>}
    </div>
  )
}
