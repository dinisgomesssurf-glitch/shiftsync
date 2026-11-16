// Shared building blocks. Every screen is made from these, so they all look alike.
import { useEffect, useId, useRef, useState } from 'react'
import Icon from './Icon'
import { initials, tintFor } from '../lib/dates'

export function Button({ variant, size, block, icon, children, className = '', ...rest }) {
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', className].filter(Boolean).join(' ')
  return <button type="button" className={cls} {...rest}>{icon && <Icon name={icon} size={18} />}{children}</button>
}

export function IconButton({ icon, label, outlined, ...rest }) {
  return <button type="button" className={`icon-btn${outlined ? ' outlined' : ''}`} aria-label={label} title={label} {...rest}><Icon name={icon} /></button>
}

export function Field({ label, hint, error, children }) {
  const id = useId()
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {typeof children === 'function' ? children(id) : children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function Input({ label, hint, error, narrow, className = '', ...rest }) {
  return <Field label={label} hint={hint} error={error}>{id => <input id={id} className={`input${narrow ? ' narrow' : ''} ${className}`} {...rest} />}</Field>
}

export function Select({ label, hint, children, ...rest }) {
  return <Field label={label} hint={hint}>{id => <select id={id} className="input" {...rest}>{children}</select>}</Field>
}

export function Switch({ checked, onChange, children }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span className="track" /><span>{children}</span>
    </label>
  )
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
    </div>
  )
}

export function Avatar({ name, id, size }) {
  return <span className={`avatar ${size || ''}`} style={{ background: tintFor(id || name) }} aria-hidden="true">{initials(name)}</span>
}

export function Tag({ kind, children }) { return <span className={`tag${kind ? ` tag-${kind}` : ''}`}>{children}</span> }

export function Spinner() { return <div className="center-screen" style={{ minHeight: 240 }}><div className="spinner" role="status" aria-label="Loading" /></div> }

export function Empty({ title, children, action }) {
  return <div className="empty"><h2>{title}</h2><p>{children}</p>{action}</div>
}

export function LoadError({ error, retry }) {
  return <Empty title="This didn't load" action={<Button onClick={retry}>Try again</Button>}>{error?.message || 'Check your connection.'}</Empty>
}

export function Dialog({ title, subtitle, onClose, width, children, footer }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector('input, select, button:not([aria-label="Close"])')?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={width ? { '--w': `${width}px` } : undefined}>
        <div className="dialog-head">
          <div><h2>{title}</h2>{subtitle && <p className="muted small" style={{ marginTop: 3 }}>{subtitle}</p>}</div>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}

/** Asks before something that can't be undone. */
export function Confirm({ title, children, confirmLabel, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose} width={400}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="ink" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button></>}>
      <p className="muted">{children}</p>
    </Dialog>
  )
}

/** A button that opens a small menu. items: [{label, onClick, danger, icon}] | 'divider' | {heading} */
export function Menu({ trigger, items, align = 'right', up }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ onClick: () => setOpen(o => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div className={`menu${align === 'left' ? ' left' : ''}${up ? ' up' : ''}`} role="menu">
          {items.filter(Boolean).map((it, i) => it === 'divider' ? <hr key={i} />
            : it.heading ? <div key={i} className="menu-label">{it.heading}</div>
            : <button key={i} type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick() }}>
                {it.icon && <Icon name={it.icon} size={18} />}{it.label}
              </button>)}
        </div>
      )}
    </div>
  )
}

export function DayPicker({ value, onChange, labels }) {
  return (
    <div className="daypick" role="group" aria-label="Days">
      {labels.map((d, i) => (
        <button key={d} type="button" aria-pressed={value.includes(i)}
          onClick={() => onChange(value.includes(i) ? value.filter(x => x !== i) : [...value, i].sort())}>{d}</button>
      ))}
    </div>
  )
}
