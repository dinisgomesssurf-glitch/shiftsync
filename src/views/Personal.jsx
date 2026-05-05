import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DAYS, ROW_H, toMins, weekLabel, weekRange, rangesOverlap } from '../lib/utils'
import WeekNav from '../components/WeekNav'
import Modal from '../components/Modal'

const ORG_COLORS = [
  ['#1D9E75','#fff'],['#0C447C','#fff'],['#633806','#fff'],
  ['#72243E','#fff'],['#3C3489','#fff'],['#27500A','#fff'],['#712B13','#fff']
]

function orgColor(id){
  let h=0; for(const c of (id||'')) h=(h<<5)-h+c.charCodeAt(0)
  return ORG_COLORS[Math.abs(h)%ORG_COLORS.length]
}

export default function Personal({ profile, orgs }){
  const [week, setWeek] = useState(0)
  const [allShifts, setAllShifts] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(null) // {di} or null
  const [editing, setEditing] = useState(null) // event obj
  const [toast, setToast] = useState(null)

  useEffect(()=>{ loadAll() }, [week, orgs.length])

  async function loadAll(){
    if(!profile) return
    setLoading(true)

    // Get all shifts in this week, across every org the user is in
    const orgIds = orgs.map(o=>o.id)
    let shifts = []
    if(orgIds.length){
      const { data: scheds } = await supabase
        .from('schedules')
        .select('id, organization_id, week_offset, published')
        .in('organization_id', orgIds)
        .eq('week_offset', week)
      const schedIds = (scheds||[]).map(s=>s.id)
      if(schedIds.length){
        const { data: rows } = await supabase
          .from('shifts')
          .select('id, schedule_id, day_index, start_time, end_time')
          .in('schedule_id', schedIds)
          .eq('user_id', profile.id)
        if(rows){
          const schedById = Object.fromEntries((scheds||[]).map(s=>[s.id, s]))
          shifts = rows.map(r=>{
            const s = schedById[r.schedule_id]
            const org = orgs.find(o=>o.id===s.organization_id)
            return {
              id: r.id,
              org_id: s.organization_id,
              org_name: org?.name || 'Unknown',
              published: s.published,
              day_index: r.day_index,
              start_time: r.start_time,
              end_time: r.end_time,
            }
          })
        }
      }
    }
    setAllShifts(shifts)

    // Personal events for week
    const { data: ev } = await supabase
      .from('personal_events')
      .select('*')
      .eq('user_id', profile.id)
      .eq('week_offset', week)
      .order('day_index')
      .order('start_time')
    setEvents(ev||[])
    setLoading(false)
  }

  function showToast(msg){ setToast(msg); setTimeout(()=>setToast(null), 2000) }

  async function saveEvent(e){
    e.preventDefault()
    const fd = new FormData(e.target)
    const payload = {
      user_id: profile.id,
      week_offset: week,
      day_index: parseInt(fd.get('day_index')),
      start_time: fd.get('start_time'),
      end_time: fd.get('end_time'),
      title: fd.get('title')||'Personal',
      kind: 'busy',
    }
    if(toMins(payload.end_time) <= toMins(payload.start_time)){
      alert('End must be after start'); return
    }
    if(editing?.id){
      const { error } = await supabase.from('personal_events').update(payload).eq('id', editing.id)
      if(error){ showToast('Error: '+error.message); return }
    } else {
      const { error } = await supabase.from('personal_events').insert(payload)
      if(error){ showToast('Error: '+error.message); return }
    }
    setAdding(null); setEditing(null)
    showToast('Saved')
    loadAll()
  }

  async function deleteEvent(id){
    await supabase.from('personal_events').delete().eq('id', id)
    setEditing(null)
    showToast('Removed')
    loadAll()
  }

  // Compute conflicts: two shifts (different orgs) overlapping, OR a shift overlapping an event
  function conflictsForDay(di){
    const dayShifts = allShifts.filter(s=>s.day_index===di)
    const dayEvents = events.filter(e=>e.day_index===di)
    const conflicts = new Set()
    for(let i=0;i<dayShifts.length;i++){
      const a = dayShifts[i]
      const aS = toMins(a.start_time), aE = toMins(a.end_time)
      for(let j=i+1;j<dayShifts.length;j++){
        const b = dayShifts[j]
        if(rangesOverlap(aS, aE, toMins(b.start_time), toMins(b.end_time))){
          conflicts.add(a.id+':shift'); conflicts.add(b.id+':shift')
        }
      }
      for(const ev of dayEvents){
        if(rangesOverlap(aS, aE, toMins(ev.start_time), toMins(ev.end_time))){
          conflicts.add(a.id+':shift'); conflicts.add(ev.id+':event')
        }
      }
    }
    return conflicts
  }

  // Find earliest start and latest end across all blocks to determine axis
  let axisS = 8*60, axisE = 19*60
  const allBlocks = [
    ...allShifts.map(s=>({s:toMins(s.start_time), e:toMins(s.end_time)})),
    ...events.map(s=>({s:toMins(s.start_time), e:toMins(s.end_time)})),
  ]
  if(allBlocks.length){
    axisS = Math.min(axisS, ...allBlocks.map(b=>b.s)) - 30
    axisE = Math.max(axisE, ...allBlocks.map(b=>b.e)) + 30
    axisS = Math.max(0, Math.floor(axisS/30)*30)
    axisE = Math.min(24*60, Math.ceil(axisE/30)*30)
  }
  const rows = []
  for(let m=axisS; m<axisE; m+=30) rows.push(m)

  // Stats
  const totalHours = allShifts.reduce((acc,s)=>acc + (toMins(s.end_time)-toMins(s.start_time))/60, 0)
  const totalConflicts = (()=>{ let n=0; for(let di=0;di<7;di++) n += [...conflictsForDay(di)].filter(x=>x.endsWith(':shift')).length; return n })() / 2

  const conflictByDay = DAYS.map((_,di)=>conflictsForDay(di))

  return(
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">My personal schedule</div>
          <div className="page-sub">All your shifts across {orgs.length} organization{orgs.length!==1?'s':''} + personal events</div>
        </div>
        <button className="btn btn-teal" onClick={()=>setAdding({di:0})}>+ Add personal event</button>
      </div>

      <WeekNav w={week} min={-4} max={4} onNav={setWeek}
        statusEl={<span className="pill pill-gray">{loading?'Loading…':`${allShifts.length} shift${allShifts.length!==1?'s':''}, ${events.length} event${events.length!==1?'s':''}`}</span>}/>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-val">{totalHours.toFixed(1)}h</div>
          <div className="stat-lbl">Total this week</div>
        </div>
        <div className="stat">
          <div className="stat-val">{allShifts.length}</div>
          <div className="stat-lbl">Shifts scheduled</div>
        </div>
        <div className={`stat ${totalConflicts>0?'stat-warn':''}`}>
          <div className="stat-val">{Math.round(totalConflicts)}</div>
          <div className="stat-lbl">Conflicts</div>
        </div>
      </div>

      {totalConflicts>0 && (
        <div className="conflict-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span><strong>{Math.round(totalConflicts)}</strong> overlap{Math.round(totalConflicts)!==1?'s':''} this week — overlapping blocks are highlighted in red.</span>
        </div>
      )}

      <div className="card" style={{padding:'12px'}}>
        {orgs.length===0 && !events.length ? (
          <p className="muted" style={{padding:'10px',textAlign:'center'}}>No data — join an organization or add a personal event to see your week.</p>
        ) : (
          <div className="tt-wrap">
            <table className="tt" style={{tableLayout:'fixed'}}>
              <thead><tr>
                <th style={{width:'46px'}}></th>
                {DAYS.map(d=><th key={d}>{d}</th>)}
              </tr></thead>
              <tbody>
                {rows.map(rowM=>(
                  <tr key={rowM} style={{height:ROW_H+'px'}}>
                    <td className="tcol" style={{height:ROW_H+'px',verticalAlign:'top'}}>
                      {rowM%60===0 ? `${String(Math.floor(rowM/60)).padStart(2,'0')}:00` : ''}
                    </td>
                    {DAYS.map((_,di)=>{
                      const dayShifts = allShifts.filter(s=>s.day_index===di && toMins(s.start_time)===rowM)
                      const dayEvents = events.filter(e=>e.day_index===di && toMins(e.start_time)===rowM)
                      const conflicts = conflictByDay[di]
                      return(
                        <td key={di} style={{height:ROW_H+'px',position:'relative',verticalAlign:'top',padding:0}}>
                          {dayShifts.map((sh,si)=>{
                            const dur = toMins(sh.end_time)-toMins(sh.start_time)
                            const heightPx = (dur/30)*ROW_H - 2
                            const total = dayShifts.length + dayEvents.length
                            const idx = si
                            const w2 = total>1 ? `calc(${100/total}% - 2px)` : 'calc(100% - 4px)'
                            const left = total>1 ? `calc(${(idx/total)*100}% + 1px)` : '2px'
                            const [bg, fg] = orgColor(sh.org_id)
                            const isConflict = conflicts.has(sh.id+':shift')
                            return(
                              <div key={sh.id}
                                className={`pblock ${isConflict?'conflict':''}`}
                                style={{
                                  position:'absolute', top:'1px', left, width:w2, height:heightPx+'px',
                                  background:bg, color:fg,
                                  overflow:'hidden', zIndex:2, margin:0, boxSizing:'border-box',
                                }}
                                title={`${sh.org_name} · ${sh.start_time}–${sh.end_time}`}>
                                <div className="pblock-org">{sh.org_name}</div>
                                <div className="pblock-time">{sh.start_time}–{sh.end_time}</div>
                                {!sh.published && <span className="pblock-badge">draft</span>}
                              </div>
                            )
                          })}
                          {dayEvents.map((ev,ei)=>{
                            const dur = toMins(ev.end_time)-toMins(ev.start_time)
                            const heightPx = (dur/30)*ROW_H - 2
                            const total = dayShifts.length + dayEvents.length
                            const idx = dayShifts.length + ei
                            const w2 = total>1 ? `calc(${100/total}% - 2px)` : 'calc(100% - 4px)'
                            const left = total>1 ? `calc(${(idx/total)*100}% + 1px)` : '2px'
                            const isConflict = conflicts.has(ev.id+':event')
                            return(
                              <div key={'ev'+ev.id}
                                className={`pblock pblock-event ${isConflict?'conflict':''}`}
                                onClick={()=>setEditing(ev)}
                                style={{
                                  position:'absolute', top:'1px', left, width:w2, height:heightPx+'px',
                                  overflow:'hidden', zIndex:2, margin:0, boxSizing:'border-box', cursor:'pointer'
                                }}
                                title={`${ev.title} · ${ev.start_time}–${ev.end_time}`}>
                                <div className="pblock-org">📌 {ev.title}</div>
                                <div className="pblock-time">{ev.start_time}–{ev.end_time}</div>
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
        )}
        {orgs.length>0 && (
          <div className="legend" style={{marginTop:'10px'}}>
            {orgs.map(o=>{
              const [bg, fg] = orgColor(o.id)
              return(
                <div key={o.id} className="legend-item">
                  <div className="legend-dot" style={{background:bg, color:fg}}></div>
                  {o.name}
                </div>
              )
            })}
            <div className="legend-item">
              <div className="legend-dot" style={{background:'#fff',border:'1px dashed #888'}}></div>
              Personal event
            </div>
          </div>
        )}
      </div>

      {(adding || editing) && (
        <Modal title={editing?'Edit personal event':'Add personal event'} onClose={()=>{setAdding(null); setEditing(null)}}>
          <form onSubmit={saveEvent}>
            <div className="modal-field">
              <div className="modal-label">Title</div>
              <input name="title" defaultValue={editing?.title||''} placeholder="e.g. Doctor's appointment" autoFocus/>
            </div>
            <div className="modal-field">
              <div className="modal-label">Day</div>
              <select name="day_index" defaultValue={editing?.day_index ?? adding?.di ?? 0}>
                {DAYS.map((d,i)=><option key={i} value={i}>{d}</option>)}
              </select>
            </div>
            <div className="row">
              <div className="modal-field" style={{flex:1}}>
                <div className="modal-label">Start</div>
                <input name="start_time" type="time" step="900" defaultValue={editing?.start_time||'09:00'}/>
              </div>
              <div className="modal-field" style={{flex:1}}>
                <div className="modal-label">End</div>
                <input name="end_time" type="time" step="900" defaultValue={editing?.end_time||'10:00'}/>
              </div>
            </div>
            <div className="row" style={{marginTop:'8px'}}>
              <button type="submit" className="btn btn-teal">Save</button>
              {editing && <button type="button" className="btn btn-red" onClick={()=>deleteEvent(editing.id)}>Delete</button>}
              <button type="button" className="btn btn-light" onClick={()=>{setAdding(null); setEditing(null)}}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}
      {toast && <div className="toast toast-success">{toast}</div>}
    </div>
  )
}
