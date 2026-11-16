import { addDaysISO, DAYS, daypart, parseISO, spanMinutes, timeRange, todayISO, fmtHours } from '../../lib/dates'
import { Avatar } from '../../ui/kit'
import Icon from '../../ui/Icon'

// The rota: people down the side, days across the top.
// readOnly = the staff view of the team's week.
export default function WeekGrid({ weekStart, members, shifts, open = [], availability, source = {}, flagged = new Set(), roles = [], readOnly, highlightId, onAdd, onEdit, onAssign }) {
  const dates = DAYS.map((_, i) => addDaysISO(weekStart, i))
  const today = todayISO()
  const roleName = id => roles.find(r => r.id === id)?.name
  const hoursOf = id => shifts.filter(s => s.user_id === id).reduce((a, s) => a + (spanMinutes(s.start_time, s.end_time) - (s.break_minutes || 0)) / 60, 0)
  const isFree = (id, date) => !availability || availability.some(w => w.memberId === id && w.date === date)
  const rows = open.length && !readOnly ? [{ open: true }, ...members] : members

  return (
    <div className="grid-wrap">
      <div className="grid" role="table" aria-label="Weekly schedule">
        <div className="g-head g-name" role="columnheader"><span className="small muted">{members.length} people</span></div>
        {dates.map((d, i) => {
          const need = open.filter(o => o.date === d && o.required).length
          return (
            <div key={d} className={`g-head${d === today ? ' today' : ''}`} role="columnheader">
              <span className="dow">{DAYS[i]}</span><span className="date">{parseISO(d).getDate()}</span>
              {!readOnly && need > 0 && <span className="cover short">{need} to fill</span>}
            </div>
          )
        })}

        {rows.map((m, r) => {
          const last = r === rows.length - 1 ? ' g-last' : ''
          if (m.open) return [
            <div key="open-name" className={`g-name g-open-row${last}`} role="rowheader"><div className="who"><b>Open shifts</b><span>Tap one to assign</span></div></div>,
            ...dates.map(d => (
              <div key={`open-${d}`} className={`g-cell g-open-row${last}`} role="cell">
                {open.filter(o => o.date === d).map(o => (
                  <button key={o.key} type="button" className={`chip open${o.required ? '' : ' optional'}`} onClick={() => onAssign(o)}>
                    <span>{timeRange(o.start, o.end)}<small>{o.required ? o.name : `${o.name} · extra`}</small></span>
                  </button>
                ))}
              </div>
            )),
          ]
          const h = hoursOf(m.id)
          const target = m.target_hours != null ? Number(m.target_hours) : null
          return [
            <div key={m.id} className={`g-name${last}`} role="rowheader" style={highlightId === m.id ? { background: 'var(--action-soft)' } : undefined}>
              <Avatar name={m.name} id={m.id} />
              <div className="who">
                <b>{m.name}</b>
                {source[m.id] === 'none' ? <span className="off">No availability set</span>
                  : <span className="num">{fmtHours(h)}{target ? ` of ${fmtHours(target)}` : ''}</span>}
              </div>
            </div>,
            ...dates.map(d => {
              const mine = shifts.filter(s => s.user_id === m.id && s.date === d).sort((a, b) => a.start_time.localeCompare(b.start_time))
              const free = isFree(m.id, d)
              return (
                <div key={`${m.id}-${d}`} className={`g-cell${free ? '' : ' off'}${last}`} role="cell" title={free ? undefined : `${m.name} isn't available`}>
                  {mine.map(s => {
                    const Tag = readOnly ? 'div' : 'button'
                    return (
                      <Tag key={s.id} {...(readOnly ? {} : { type: 'button', onClick: () => onEdit(s) })}
                        className={`chip ${daypart(s.start_time, s.end_time)}${s.kind === 'trial' ? ' trial' : ''}${flagged.has(String(s.id)) ? ' flag' : ''}`}>
                        <span>{timeRange(s.start_time, s.end_time)}{(s.role_id && roleName(s.role_id)) || s.kind === 'trial' ? <small>{s.kind === 'trial' ? 'Trial' : roleName(s.role_id)}</small> : null}</span>
                        {s.locked && <Icon name="lock" size={13} />}
                      </Tag>
                    )
                  })}
                  {!readOnly && (mine.length === 0
                    ? <button type="button" className="add" aria-label={`Add shift for ${m.name}, ${DAYS[dates.indexOf(d)]}`} onClick={() => onAdd(m.id, d)}><Icon name="plus" /></button>
                    : <button type="button" className="add-more" onClick={() => onAdd(m.id, d)}>+ add</button>)}
                  {!free && mine.length === 0 && <span className="avail-hint">Off</span>}
                </div>
              )
            }),
          ]
        })}
      </div>
    </div>
  )
}

export function Legend() {
  return (
    <div className="legend" aria-label="Colour key">
      <span><i style={{ background: 'var(--morning)' }} />Morning</span>
      <span><i style={{ background: 'var(--midday)' }} />Midday</span>
      <span><i style={{ background: 'var(--evening)' }} />Afternoon and evening</span>
      <span><i style={{ background: 'var(--night)' }} />Overnight</span>
      <span><i style={{ background: 'repeating-linear-gradient(135deg, #fff 0 3px, #d9cfbf 3px 5px)' }} />Not available</span>
    </div>
  )
}
