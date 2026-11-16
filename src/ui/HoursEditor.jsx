import { DAYS_LONG } from '../lib/dates'
import { Switch } from './kit'

// Opening hours for each weekday. A closed day is stored with open = close.
export const isClosed = h => h.open_time.slice(0, 5) === h.close_time.slice(0, 5)

export default function HoursEditor({ hours, onChange }) {
  const set = (i, patch) => onChange(hours.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  return (
    <div>
      {hours.map((h, i) => {
        const closed = isClosed(h)
        return (
          <div key={i} className="hours-row">
            <b>{DAYS_LONG[i]}</b>
            <Switch checked={!closed} onChange={on => set(i, on ? { open_time: '08:30', close_time: '18:00' } : { open_time: '00:00', close_time: '00:00' })}>
              <span className="sr-only">{DAYS_LONG[i]} </span>{closed ? 'Closed' : 'Open'}
            </Switch>
            {!closed && (
              <div className="row">
                <input className="input" type="time" step="900" aria-label={`${DAYS_LONG[i]} opens`} value={h.open_time.slice(0, 5)} onChange={e => e.target.value && set(i, { open_time: e.target.value })} />
                <span className="muted">to</span>
                <input className="input" type="time" step="900" aria-label={`${DAYS_LONG[i]} closes`} value={h.close_time.slice(0, 5)} onChange={e => e.target.value && set(i, { close_time: e.target.value })} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
