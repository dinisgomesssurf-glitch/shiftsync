import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp, useOrgData, useWeek } from '../data/hooks'
import { addDaysISO, DAYS, daypart, fmtHours, fmtWeekRange, isISODate, parseISO, spanMinutes, timeRange, todayISO, weekLabel, weekStartOf } from '../lib/dates'
import { Button, IconButton, LoadError, Segmented, Spinner, Tag } from '../ui/kit'
import WeekGrid from './schedule/WeekGrid'

export default function MyShifts() {
  const { org, profile } = useApp()
  const { week } = useParams()
  const navigate = useNavigate()
  const weekStart = weekStartOf(isISODate(week) ? week : undefined)
  const orgQ = useOrgData(org.id)
  const weekQ = useWeek(org.id, weekStart)
  const [tab, setTab] = useState('me')
  if (orgQ.error || weekQ.error) return <LoadError error={orgQ.error || weekQ.error} retry={() => { orgQ.refetch(); weekQ.refetch() }} />
  if (!orgQ.data || !weekQ.data) return <Spinner />

  const published = !!weekQ.data.schedule?.published
  const shifts = published ? weekQ.data.shifts : []
  const mine = shifts.filter(s => s.user_id === profile.id)
  const hours = mine.reduce((a, s) => a + (spanMinutes(s.start_time, s.end_time) - (s.break_minutes || 0)) / 60, 0)
  const canSeeTeam = orgQ.data.org.staff_see_team !== false
  const today = todayISO()
  const go = n => navigate(`/shifts/${addDaysISO(weekStart, n * 7)}`)
  const roleName = id => orgQ.data.roles.find(r => r.id === id)?.name
  const withMe = s => shifts.filter(o => o.date === s.date && o.user_id !== s.user_id && o.start_time < s.end_time && s.start_time < o.end_time)
    .map(o => orgQ.data.members.find(m => m.id === o.user_id)?.name.split(' ')[0]).filter(Boolean)

  return (
    <div className={`page${tab === 'me' ? ' page-narrow' : ''}`}>
      <div className="page-head">
        <div className="weekbar">
          <IconButton icon="left" label="Previous week" outlined onClick={() => go(-1)} />
          <IconButton icon="right" label="Next week" outlined onClick={() => go(1)} />
          <div className="when" style={{ marginLeft: 6 }}><strong>{fmtWeekRange(weekStart)}</strong><span className="small muted">{weekLabel(weekStart) || parseISO(weekStart).getFullYear()}</span></div>
        </div>
        {canSeeTeam && published && <Segmented label="Whose shifts" value={tab} onChange={setTab} options={[['me', 'Mine'], ['team', 'Team']]} />}
      </div>

      {!published ? (
        <div className="card empty"><h2>No schedule for this week yet</h2><p>Your manager hasn&rsquo;t published it. You&rsquo;ll get an email when it&rsquo;s out.</p>
          <Button onClick={() => navigate('/availability')}>Check my availability</Button></div>
      ) : tab === 'team' ? (
        <WeekGrid readOnly weekStart={weekStart} members={orgQ.data.members} shifts={shifts} roles={orgQ.data.roles} highlightId={profile.id} />
      ) : (
        <div className="stack">
          <div className="row-wrap"><Tag kind="action">{mine.length} {mine.length === 1 ? 'shift' : 'shifts'}</Tag><Tag><span className="num">{fmtHours(hours)}</span> this week</Tag></div>
          <div className="card card-flush list">
            {DAYS.map((d, i) => {
              const date = addDaysISO(weekStart, i)
              const day = mine.filter(s => s.date === date).sort((a, b) => a.start_time.localeCompare(b.start_time))
              return (
                <div key={d} className={`day-card${day.length ? '' : ' rest'}`} style={date === today ? { boxShadow: 'inset 4px 0 0 var(--action)' } : undefined}>
                  <div className="d"><b>{parseISO(date).getDate()}</b><span>{d}</span></div>
                  <div className="grow stack" style={{ gap: 6 }}>
                    {day.length === 0 ? <span>Day off</span> : day.map(s => {
                      const others = canSeeTeam ? withMe(s) : []
                      return (
                        <div key={s.id} className={`chip ${daypart(s.start_time, s.end_time)}`} style={{ padding: '10px 12px', fontSize: 16 }}>
                          <span>{timeRange(s.start_time, s.end_time)}
                            <small style={{ fontSize: 13 }}>{[roleName(s.role_id), s.break_minutes ? `${s.break_minutes} min break` : null, others.length ? `with ${others.join(', ')}` : null].filter(Boolean).join(' · ') || fmtHours((spanMinutes(s.start_time, s.end_time)) / 60)}</small>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
