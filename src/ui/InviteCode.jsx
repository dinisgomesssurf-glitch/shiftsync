import { Button } from './kit'
import { useToast } from './Toast'

export default function InviteCode({ code }) {
  const toast = useToast()
  const copy = async text => { try { await navigator.clipboard.writeText(text); toast('Copied') } catch { toast('Copy it by hand: ' + text) } }
  const message = `Join our team on ShiftSync to see your shifts: ${window.location.origin} — create an account and enter the code ${code}`
  return (
    <div className="stack">
      <div className="code-box" aria-label={`Join code ${code.split('').join(' ')}`}>{code}</div>
      <div className="row-wrap">
        <Button icon="copy" onClick={() => copy(code)}>Copy code</Button>
        <Button icon="send" onClick={() => copy(message)}>Copy invite message</Button>
      </div>
    </div>
  )
}
