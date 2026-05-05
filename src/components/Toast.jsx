export default function Toast({msg, kind='success'}){
  return <div className={`toast toast-${kind}`}>{msg}</div>
}
