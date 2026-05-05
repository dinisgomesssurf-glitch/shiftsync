import { DAYS, ROW_H, toMins, nameShiftColor } from '../lib/utils'

export default function AvailTimetable({w, weekAvail, members, daySettings, axisS, axisE}){
  const rows = []
  for(let m=axisS; m<axisE; m+=30) rows.push(m)
  const avail = weekAvail[w]||{}

  return(
    <div style={{marginTop:'12px'}}>
      <div className="card-label" style={{marginBottom:'8px'}}>Availability overview — overlaps visible</div>
      <div className="tt-wrap">
        <table className="tt" style={{tableLayout:'fixed'}}>
          <thead><tr>
            <th style={{width:'46px'}}></th>
            {DAYS.map(d => <th key={d}>{d}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(rowM=>(
              <tr key={rowM} style={{height:ROW_H+'px'}}>
                <td className="tcol" style={{height:ROW_H+'px',verticalAlign:'top'}}>
                  {rowM%60===0 ? `${String(Math.floor(rowM/60)).padStart(2,'0')}:00` : ''}
                </td>
                {DAYS.map((_,di)=>{
                  const ds = daySettings[di]||{open_time:'08:30',close_time:'19:00'}
                  if(rowM<toMins(ds.open_time) || rowM>=toMins(ds.close_time))
                    return <td key={di} className="tclosed" style={{height:ROW_H+'px'}}></td>

                  const starting = members.filter(m=>{
                    const slots = (avail[m.name]||[]).filter(s=>s.day_index===di && s.on!==false)
                    return slots.some(s=>toMins(s.start)===rowM)
                  })
                  const presentCount = members.filter(m=>{
                    const slots = (avail[m.name]||[]).filter(s=>s.day_index===di && s.on!==false)
                    return slots.some(s=>toMins(s.start)<=rowM && toMins(s.end)>rowM)
                  }).length
                  const bg = presentCount>=3 ? '#EAF3DE' : presentCount===2 ? '#E6F1FB' : '#fff'

                  return(
                    <td key={di} style={{
                      height:ROW_H+'px',
                      position:'relative',
                      background:bg,
                      verticalAlign:'top',
                      padding:0
                    }}>
                      {starting.map((m,si)=>{
                        const slots = (avail[m.name]||[]).filter(s=>s.day_index===di && s.on!==false)
                        const slot = slots.find(s=>toMins(s.start)===rowM)
                        if(!slot) return null
                        const durationMins = toMins(slot.end)-toMins(slot.start)
                        const heightPx = (durationMins/30)*ROW_H - 2
                        const total = starting.length
                        const w2 = total>1 ? `calc(${100/total}% - 2px)` : 'calc(100% - 4px)'
                        const left = total>1 ? `calc(${(si/total)*100}% + 1px)` : '2px'
                        return(
                          <div key={m.name}
                            className={`sblock ${nameShiftColor(m.name)}`}
                            style={{
                              position:'absolute', top:'1px', left,
                              width:w2, height:heightPx+'px',
                              overflow:'hidden', zIndex:2, margin:0,
                              boxSizing:'border-box', cursor:'default',
                              fontSize:'10px', padding:'2px 4px'
                            }}>
                            <span className="sn">{m.name}</span>
                          </div>
                        )
                      })}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend" style={{marginTop:'8px'}}>
        <span className="legend-item"><span className="swatch" style={{background:'#EAF3DE',border:'0.5px solid #C0DD97'}}></span>3+ people</span>
        <span className="legend-item"><span className="swatch" style={{background:'#E6F1FB',border:'0.5px solid #B5D4F4'}}></span>2 people</span>
        <span className="legend-item"><span className="swatch" style={{background:'#fff',border:'0.5px solid #ddd'}}></span>1 person</span>
      </div>
    </div>
  )
}
