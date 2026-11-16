// One small set of line icons, drawn at 20px.
const P = {
  calendar: <><rect x="3" y="4.5" width="14" height="12.5" rx="2.5"/><path d="M3 8.5h14M7 2.5v3M13 2.5v3"/></>,
  team: <><circle cx="7.5" cy="7" r="3"/><path d="M2 16.5c.6-3 2.7-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><circle cx="14.5" cy="6" r="2.2"/><path d="M14.8 10.6c1.9.3 3 1.5 3.4 3.6"/></>,
  settings: <><circle cx="10" cy="10" r="2.6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.5 1.5M13.8 13.8l1.5 1.5M4.7 15.3l1.5-1.5M13.8 6.2l1.5-1.5"/></>,
  clock: <><circle cx="10" cy="10" r="7.2"/><path d="M10 6v4.3l2.8 1.7"/></>,
  shifts: <><path d="M4 5.5h12M4 10h12M4 14.5h7"/></>,
  left: <path d="M12 4.5 6.5 10l5.5 5.5"/>,
  right: <path d="M8 4.5 13.5 10 8 15.5"/>,
  down: <path d="M5 7.5 10 12.5l5-5"/>,
  plus: <path d="M10 4v12M4 10h12"/>,
  close: <path d="M5 5l10 10M15 5 5 15"/>,
  check: <path d="M4 10.5 8 14.5 16 5.5"/>,
  lock: <><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></>,
  more: <><circle cx="4.5" cy="10" r="1.2"/><circle cx="10" cy="10" r="1.2"/><circle cx="15.5" cy="10" r="1.2"/></>,
  copy: <><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></>,
  spark: <path d="M10 2.5l1.8 4.7 4.7 1.8-4.7 1.8L10 15.5l-1.8-4.7L3.5 9l4.7-1.8z"/>,
  send: <path d="M17 3 8.5 11.5M17 3l-5.5 14-3-5.5L3 8.5z"/>,
  trash: <><path d="M4 6h12M8 6V4h4v2M6 6l.7 10.5h6.6L14 6"/></>,
  alert: <><path d="M10 3 2.5 16.5h15z"/><path d="M10 8.5v3.5M10 14.3v.2"/></>,
}
export default function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  )
}
