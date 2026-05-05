import { useEffect } from 'react'

export default function Modal({title, onClose, children, width=320}){
  useEffect(()=>{
    const onKey = e => { if(e.key==='Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return ()=>{
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return(
    <div className="modal-overlay" onClick={e=>e.target.classList.contains('modal-overlay')&&onClose?.()}>
      <div className="modal" style={{width:'min(94vw, '+width+'px)'}} role="dialog" aria-modal="true">
        {title && <div className="modal-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
