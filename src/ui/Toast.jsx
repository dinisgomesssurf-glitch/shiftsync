import { createContext, useCallback, useContext, useState } from 'react'

const Ctx = createContext(() => {})
/** const toast = useToast(); toast('Saved') or toast('Something broke', 'error') */
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, kind = 'info') => {
    const id = Math.random()
    setItems(list => [...list.slice(-2), { id, text, kind }])
    setTimeout(() => setItems(list => list.filter(t => t.id !== id)), kind === 'error' ? 5000 : 2800)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </Ctx.Provider>
  )
}
