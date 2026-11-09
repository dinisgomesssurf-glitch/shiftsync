import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from './lib/supabase'
import { DAYS, toMins, weekLabel, weekRange,
         initials, nameColor, nameShiftColor,
         weekStartDate, addDaysISO } from './lib/utils'

import Toast from './components/Toast'
import WeekNav from './components/WeekNav'
import Topbar from './components/Topbar'
import EmptyState from './components/EmptyState'
import Modal from './components/Modal'
import SpanningTimetable from './components/SpanningTimetable'
import ScheduleView from './components/ScheduleView'
import AvailTimetable from './components/AvailTimetable'
import AvailabilityPicker, { rangesToCells, cellsToRanges } from './components/AvailabilityPicker'

import Login from './views/Login'
import Onboarding from './views/Onboarding'
import Organizations from './views/Organizations'
import Personal from './views/Personal'
import Team from './views/Team'
import TemplatesEditor from './components/TemplatesEditor'
import GenerationReport from './components/GenerationReport'
import BusinessRules from './components/BusinessRules'
import { RULE_PACKS, runGenerator, checkWeek, weekToEngineShifts, toSavePayload } from './lib/engineAdapter'

const PERSONAL_ORG = { id: '__personal__', name: 'Personal' }
const CURRENCY_SYMBOL = { EUR:'€', CAD:'$', USD:'$', GBP:'£' }
const RULE_LABELS = {
  cant_be_alone: "can't be alone",
  cant_work_with: "can't work with",
  max_shifts_week: 'max shifts/week',
  required_on_shift: 'required on shift',
}

export default function App(){
  const [authReady,    setAuthReady]    = useState(false)
  const [profile,      setProfile]      = useState(null)

  // Org state
  const [orgs,         setOrgs]         = useState([])      // [{id, name, join_code, role, member_count}]
  const [currentOrg,   setCurrentOrg]   = useState(null)    // org from list, or PERSONAL_ORG

  // View state
  const [view,         setView]         = useState(null)    // current sub-view name
  const [week,         setWeek]         = useState(0)
  const [histW,        setHistW]        = useState(null)
  const [editSh,       setEditSh]       = useState(null)
  const [assignModal,  setAssignModal]  = useState(null)
  const [toast,        setToast]        = useState(null)
  const [genLoading,   setGenLoading]   = useState(false)

  // Org-scoped data
  const [daySettings,  setDaySettings]  = useState(DAYS.map(()=>({open_time:'08:30',close_time:'19:00'})))
  const [rules,        setRules]        = useState([])   // rows from public.rules
  const [members,      setMembers]      = useState([])
  const [weekAvail,    setWeekAvail]    = useState({})
  const [weekSchedules,setWeekSchedules]= useState({})
  const [staffingReqs, setStaffingReqs] = useState([])   // templates mapped to the old requirement shape (used by ScheduleView)
  const [templates,    setTemplates]    = useState([])
  const [jobRoles,     setJobRoles]     = useState([])
  const [timeOff,      setTimeOff]      = useState([])
  const [orgSettings,  setOrgSettings]  = useState(null)
  const [genReports,   setGenReports]   = useState({})   // week offset → last generation report
  const [fillGapsOnly, setFillGapsOnly] = useState(false)

  const showToast = useCallback(msg=>{
    setToast(msg)
    setTimeout(()=>setToast(null), 2200)
  }, [])

  const isPersonalView = currentOrg?.id === PERSONAL_ORG.id
  const isOrgsView     = view === 'organizations'
  const isAdmin = currentOrg?.role === 'admin'

  const allM = daySettings.map(d=>({o:toMins(d.open_time), c:toMins(d.close_time)}))
  const axisS = Math.min(...allM.map(x=>x.o).filter(Boolean), 510)
  const axisE = Math.max(...allM.map(x=>x.c).filter(Boolean), 1140)
  const memberName = id => members.find(m=>m.id===id)?.name || 'Unknown'
  const cannotAlone = rules.filter(r=>r.kind==='cant_be_alone').map(r=>memberName(r.member_id))
  // Live rule check of the week on screen — catches problems from manual edits too.
  const weekIssues = useMemo(() => {
    const cur = weekSchedules[week]
    if(!cur || !orgSettings) return []
    try {
      const availRows = Object.values(weekAvail[week] || {}).flat()
        .filter(r => r.user_id)
        .map(r => ({ user_id: r.user_id, day_index: r.day_index, start_time: r.start, end_time: r.end, is_available: r.on !== false }))
      return checkWeek({ org: orgSettings, members, templates, availRows, timeOff, rules, daySettings, weekStart: cur.period_start }, cur)
        // Only flag "not available" for people who actually submitted availability this week.
        .filter(v => v.code !== 'unavailable' || availRows.some(a => a.user_id === v.memberId))
    } catch(e) { console.error(e); return [] }
  }, [weekSchedules, week, orgSettings, members, templates, weekAvail, timeOff, rules, daySettings])

  // ── AUTH ──
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session) loadProfile(session.user)
      else { setAuthReady(true) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session)=>{
      if(session) loadProfile(session.user)
      else { setProfile(null); setOrgs([]); setCurrentOrg(null); setView(null); setAuthReady(true) }
    })
    return ()=>subscription.unsubscribe()
  }, [])

  async function loadProfile(authUser){
    // Profile rows are now created server-side by the on_auth_user_created trigger.
    // Just read it. If it's somehow missing (legacy account), bail to login.
    const { data } = await supabase.from('profiles').select('*').eq('id', authUser.id).maybeSingle()
    if(data){
      setProfile({ ...data, email: authUser.email })
      await loadOrgs(data.id)
    } else {
      // Profile missing — sign out and let user re-register
      await supabase.auth.signOut()
    }
    setAuthReady(true)
  }

  async function loadOrgs(userId){
    const { data, error } = await supabase
      .from('organization_members')
      .select('role, organization_id, organizations:organization_id(id, name, join_code)')
      .eq('user_id', userId)
    if(error){ console.error(error); return }
    const orgsList = (data||[])
      .map(r => r.organizations ? { ...r.organizations, role: r.role } : null)
      .filter(Boolean)

    // Get member counts in parallel (no FK relationship issues since we're just counting)
    const counts = await Promise.all(orgsList.map(async o=>{
      const { count } = await supabase
        .from('organization_members')
        .select('id', { count:'exact', head:true })
        .eq('organization_id', o.id)
      return [o.id, count||0]
    }))
    const countMap = Object.fromEntries(counts)
    const enriched = orgsList.map(o => ({ ...o, member_count: countMap[o.id] }))
    setOrgs(enriched)

    // Auto-select an org/view
    setCurrentOrg(prev=>{
      if(prev && prev.id===PERSONAL_ORG.id) return prev
      if(prev){
        const fresh = enriched.find(o=>o.id===prev.id)
        if(fresh) return fresh
      }
      return enriched[0] || null
    })
  }

  async function signOut(){
    await supabase.auth.signOut()
    setProfile(null); setOrgs([]); setCurrentOrg(null); setView(null)
  }

  // ── Org-scoped data loading ──
  const orgId = currentOrg && !isPersonalView ? currentOrg.id : null

  useEffect(()=>{
    if(!orgId){ return }
    loadOrgData(orgId)
    setWeekSchedules({})
    setWeekAvail({})
  }, [orgId])

  async function loadOrgData(oid){
    const [mem, con, ds, tpl, roles, mroles, pay, org, toff] = await Promise.all([
      supabase.from('organization_members').select('role, target_hours, max_hours, senior, contract_type, profiles:user_id(id, name)').eq('organization_id', oid),
      supabase.from('rules').select('*').eq('organization_id', oid).order('created_at'),
      supabase.from('day_settings').select('*').eq('organization_id', oid).order('day_index'),
      supabase.from('shift_templates').select('*').eq('organization_id', oid).order('weekday').order('start_time'),
      supabase.from('job_roles').select('*').eq('organization_id', oid).order('name'),
      supabase.from('member_roles').select('user_id, role_id').eq('organization_id', oid),
      supabase.from('member_pay').select('user_id, hourly_rate').eq('organization_id', oid),
      supabase.from('organizations').select('*').eq('id', oid).single(),
      supabase.from('time_off').select('*').eq('organization_id', oid),
    ])
    const rolesByUser = {}
    ;(mroles.data || []).forEach(r => { (rolesByUser[r.user_id] ||= []).push(r.role_id) })
    const payByUser = Object.fromEntries((pay.data || []).map(p => [p.user_id, p.hourly_rate]))
    if(mem.data) setMembers(mem.data.filter(r => r.profiles).map(r => ({
      ...r.profiles, role: r.role, target_hours: r.target_hours, max_hours: r.max_hours,
      senior: r.senior, contract_type: r.contract_type,
      roleIds: rolesByUser[r.profiles.id] || [], hourly_rate: payByUser[r.profiles.id] ?? null,
    })))
    if(con.data) setRules(con.data)
    if(ds.data && ds.data.length===7) setDaySettings(ds.data)
    else setDaySettings(DAYS.map(()=>({open_time:'08:30', close_time:'19:00'})))
    applyTemplates(tpl.data || [])
    setJobRoles(roles.data || [])
    setOrgSettings(org.data || null)
    setTimeOff(toff.data || [])
  }
  function applyTemplates(list){
    setTemplates(list)
    setStaffingReqs(list.map(t => ({
      id: t.id, day_index: t.weekday, start_time: t.start_time, end_time: t.end_time,
      min_workers: t.min_workers, label: t.name,
    })))
  }

  // Pick default view when org context changes
  useEffect(()=>{
    if(!profile) return
    if(currentOrg?.id === PERSONAL_ORG.id){ setView('personal'); return }
    if(isOrgsView) return
    if(currentOrg){
      setView(prev => {
        const valid = currentOrg.role==='admin'
          ? ['timetable','history','availability','constraints','team','settings']
          : ['my-availability','my-shifts','my-history']
        if(prev && valid.includes(prev)) return prev
        return currentOrg.role==='admin' ? 'timetable' : 'my-availability'
      })
    }
  }, [currentOrg, profile])

  // Load schedule + availability for the current week
  useEffect(()=>{
    if(profile && orgId){
      loadSchedule(week)
      loadAvail(week)
    }
  }, [week, orgId, profile])

  // ── AVAILABILITY ──
  async function loadAvail(w){
    if(!orgId) return
    const { data } = await supabase
      .from('availability')
      .select('*, profiles:user_id(name)')
      .eq('organization_id', orgId)
      .eq('week_start', weekStartDate(w))
    if(data){
      const byPerson = {}
      data.forEach(r=>{
        const name = r.profiles?.name || 'Unknown'
        if(!byPerson[name]) byPerson[name] = []
        byPerson[name].push({slot_index:r.slot_index, day_index:r.day_index, on:r.is_available, start:r.start_time, end:r.end_time, id:r.id, user_id:r.user_id})
      })
      setWeekAvail(prev=>({...prev, [w]: byPerson}))
      return byPerson
    }
    return {}
  }

  function getSlots(w, name, di){
    const all = (weekAvail[w]||{})[name] || []
    const slots = all.filter(s=>s.day_index===di).sort((a,b)=>a.slot_index-b.slot_index)
    return slots.length ? slots : [{slot_index:0, day_index:di, on:true, start:'08:30', end:'17:00', _new:true}]
  }

  function setSlot(name, w, di, slot_index, field, val){
    setWeekAvail(prev=>{
      const next = JSON.parse(JSON.stringify(prev))
      if(!next[w]) next[w] = {}
      if(!next[w][name]) next[w][name] = []
      const ex = next[w][name].find(s=>s.day_index===di && s.slot_index===slot_index)
      if(ex) ex[field] = val
      else next[w][name].push({slot_index, day_index:di, on:true, start:'08:30', end:'17:00', [field]:val})
      return next
    })
  }

  function addSlot(name, w, di){
    setWeekAvail(prev=>{
      const next = JSON.parse(JSON.stringify(prev))
      if(!next[w]) next[w] = {}
      if(!next[w][name]) next[w][name] = []
      const ex = next[w][name].filter(s=>s.day_index===di)
      const newIdx = ex.length ? Math.max(...ex.map(s=>s.slot_index))+1 : 1
      next[w][name].push({slot_index:newIdx, day_index:di, on:true, start:'08:30', end:'17:00', _new:true})
      return next
    })
  }

  function removeSlot(name, w, di, slot_index){
    setWeekAvail(prev=>{
      const next = JSON.parse(JSON.stringify(prev))
      if(next[w] && next[w][name]) next[w][name] = next[w][name].filter(s=>!(s.day_index===di && s.slot_index===slot_index))
      return next
    })
  }

  async function saveMyAvailFromCells(w, cells){
    if(!profile || !orgId) return
    // Wipe my existing availability for this org+week, then insert fresh ranges
    const { error: delErr } = await supabase
      .from('availability')
      .delete()
      .eq('organization_id', orgId)
      .eq('user_id', profile.id)
      .eq('week_start', weekStartDate(w))
    if(delErr){ showToast('Error: '+delErr.message); return }

    if(!cells || cells.size === 0){
      // refresh local state so UI reflects empty
      setWeekAvail(prev=>({...prev, [w]: {...(prev[w]||{}), [profile.name]: []}}))
      showToast('Availability cleared')
      return
    }

    const ranges = cellsToRanges(cells)
    const rows = ranges.map(r => ({
      organization_id: orgId, user_id: profile.id, week_start: weekStartDate(w),
      day_index: r.day_index, slot_index: r.slot_index,
      is_available: true, start_time: r.start, end_time: r.end
    }))
    const { error } = await supabase.from('availability').insert(rows)
    if(error){ showToast('Error: '+error.message); return }
    setWeekAvail(prev=>({...prev, [w]: {...(prev[w]||{}), [profile.name]: ranges}}))
    showToast('Availability saved')
  }

  // ── SCHEDULES ──
  async function loadLatestRun(w, scheduleId){
    const { data } = await supabase.from('schedule_runs').select('*')
      .eq('schedule_id', scheduleId).order('created_at', { ascending:false }).limit(1).maybeSingle()
    if(data?.explanations) setGenReports(prev => ({ ...prev, [w]: data.explanations }))
  }

  async function loadSchedule(w, force = false){
    if(!orgId) return
    if(weekSchedules[w] && !force) return
    const { data: sched } = await supabase
      .from('schedules')
      .select('*')
      .eq('organization_id', orgId)
      .eq('kind', 'week')
      .eq('period_start', weekStartDate(w))
      .maybeSingle()
    if(sched){
      const { data: shifts } = await supabase
        .from('shifts')
        .select('*, profiles:user_id(name)')
        .eq('schedule_id', sched.id)
      const byDay = DAYS.map(()=>[])
      if(shifts) shifts.forEach(s => byDay[s.day_index]?.push({...s, name: s.user_id ? (s.profiles?.name || 'Unknown') : 'Open shift'}))
      setWeekSchedules(prev=>({...prev, [w]: {...sched, shifts: byDay}}))
      loadLatestRun(w, sched.id)
    }
  }

  // Hours each person worked in the 4 weeks before this one (for fairness over time).
  async function loadHistoryHours(ws){
    const from = addDaysISO(ws, -28), to = addDaysISO(ws, -1)
    const { data } = await supabase.from('shifts')
      .select('user_id, start_time, end_time, break_minutes, date, schedules!inner(organization_id)')
      .eq('schedules.organization_id', orgId).gte('date', from).lte('date', to)
    const out = {}
    ;(data || []).forEach(s => {
      if(!s.user_id) return
      let m = toMins(s.end_time) - toMins(s.start_time); if(m <= 0) m += 1440
      out[s.user_id] = (out[s.user_id] || 0) + (m - (s.break_minutes || 0)) / 60
    })
    return out
  }

  async function genSchedule(){
    if(!orgId) return
    if(!templates.length){ showToast('Add shift templates in Settings first'); return }
    setGenLoading(true)
    try {
      const ws = weekStartDate(week)
      const [{ data: availRows }, historyHours, { data: sched, error: se }] = await Promise.all([
        supabase.from('availability').select('*').eq('organization_id', orgId).eq('week_start', ws),
        loadHistoryHours(ws),
        supabase.rpc('ensure_week_schedule', { p_org: orgId, p_week_start: ws }),
      ])
      if(se || !sched?.id) throw new Error(se?.message || 'could not create schedule')

      // Keep pinned shifts — or everything already assigned, in "fill gaps only" mode.
      const existing = weekToEngineShifts(weekSchedules[week])
      const lockedShifts = existing.filter(s => s.memberId && (fillGapsOnly || s.locked))
        .map(s => ({ ...s, locked: true }))

      const { result, durationMs } = runGenerator({
        org: orgSettings, members, templates, availRows, timeOff, rules, daySettings,
        weekStart: ws, lockedShifts, historyHours, seed: (sched.version || 1) * 7919 + week,
      })
      const toSave = result.shifts.map(s => ({ ...s, locked: lockedShifts.some(l => l.id === s.id) }))
      const { error: saveErr } = await supabase.rpc('save_schedule', {
        p_schedule_id: sched.id, p_shifts: toSavePayload(toSave), p_expected_version: sched.version,
      })
      if(saveErr) throw new Error(saveErr.message?.includes('stale_version')
        ? 'Someone else just changed this schedule — reload and try again' : saveErr.message)

      const report = {
        preset: orgSettings?.generation_preset || 'balanced',
        score: result.score, members: result.members, violations: result.violations,
        unfilled: result.unfilled.map(u => ({ slot: u.slot, summary: u.summary })),
      }
      setGenReports(prev => ({ ...prev, [week]: report }))
      await supabase.from('schedule_runs').insert({
        schedule_id: sched.id, engine_version: result.engineVersion, seed: result.seed,
        score: result.score.total, duration_ms: durationMs, created_by: profile.id,
        result: { members: result.members, iterations: result.iterations }, explanations: report,
      })
      await loadSchedule(week, true)
      const gaps = result.unfilled.filter(u => u.slot.mandatory).length
      showToast(gaps ? `Generated — ${gaps} shift${gaps>1?'s':''} couldn't be filled` : 'Schedule generated!')
    } catch(e) {
      showToast('Error: ' + e.message)
    } finally {
      setGenLoading(false)
    }
  }

  async function toggleLock(di, idx){
    const shift = weekSchedules[week].shifts[di][idx]
    const locked = !shift.locked
    const { error } = await supabase.from('shifts').update({ locked }).eq('id', shift.id)
    if(error){ showToast('Error: ' + error.message); return }
    setWeekSchedules(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      next[week].shifts[di][idx].locked = locked
      return next
    })
    showToast(locked ? 'Shift locked — regenerating keeps it' : 'Shift unlocked')
  }

  // ── Templates, roles, team, business rules ──
  async function addTemplates(rows){
    const { data, error } = await supabase.from('shift_templates')
      .insert(rows.map(r => ({ ...r, organization_id: orgId }))).select()
    if(error){ showToast('Error: ' + error.message); return }
    applyTemplates([...templates, ...data])
    showToast(rows.length > 1 ? `${rows.length} templates added` : 'Template added')
  }
  async function deleteTemplate(id){
    await supabase.from('shift_templates').delete().eq('id', id)
    applyTemplates(templates.filter(t => t.id !== id))
  }
  async function addJobRole(name){
    const { data, error } = await supabase.from('job_roles').insert({ organization_id: orgId, name }).select().single()
    if(error){ showToast('Error: ' + error.message); return }
    setJobRoles(prev => [...prev, data])
  }
  async function deleteJobRole(id){
    await supabase.from('job_roles').delete().eq('id', id)
    setJobRoles(prev => prev.filter(r => r.id !== id))
    setMembers(prev => prev.map(m => ({ ...m, roleIds: (m.roleIds || []).filter(r => r !== id) })))
  }
  async function toggleMemberRole(member, roleId, on){
    const q = on
      ? supabase.from('member_roles').insert({ organization_id: orgId, user_id: member.id, role_id: roleId })
      : supabase.from('member_roles').delete().eq('user_id', member.id).eq('role_id', roleId)
    const { error } = await q
    if(error){ showToast('Error: ' + error.message); return }
    setMembers(prev => prev.map(m => m.id !== member.id ? m : { ...m, roleIds: on ? [...(m.roleIds||[]), roleId] : (m.roleIds||[]).filter(r => r !== roleId) }))
  }
  async function saveMember(member, d){
    const num = v => (v === '' || v == null ? null : Number(v))
    const { error } = await supabase.from('organization_members').update({
      target_hours: num(d.target_hours), max_hours: num(d.max_hours), senior: !!d.senior, contract_type: d.contract_type || null,
    }).eq('organization_id', orgId).eq('user_id', member.id)
    if(error){ showToast('Error: ' + error.message); return false }
    const rate = num(d.hourly_rate)
    const payRes = rate == null
      ? await supabase.from('member_pay').delete().eq('organization_id', orgId).eq('user_id', member.id)
      : await supabase.from('member_pay').upsert({ organization_id: orgId, user_id: member.id, hourly_rate: rate, updated_at: new Date().toISOString() })
    if(payRes.error){ showToast('Error: ' + payRes.error.message); return false }
    setMembers(prev => prev.map(m => m.id !== member.id ? m : {
      ...m, target_hours: num(d.target_hours), max_hours: num(d.max_hours), senior: !!d.senior,
      contract_type: d.contract_type || null, hourly_rate: rate,
    }))
    showToast(`${member.name} saved`)
    return true
  }
  async function saveOrgSettings(patch){
    const { data, error } = await supabase.from('organizations').update(patch).eq('id', orgId).select().single()
    if(error){ showToast('Error: ' + error.message); return }
    setOrgSettings(data)
    showToast('Settings saved')
  }

  async function submitForApproval(){
    const ws = weekSchedules[week]; if(!ws) return
    await supabase.from('schedules').update({pending_approval:true}).eq('id', ws.id)
    setWeekSchedules(prev=>({...prev, [week]: {...prev[week], pending_approval:true}}))
    showToast('Submitted for approval')
  }

  async function approveAndPublish(){
    const ws = weekSchedules[week]; if(!ws) return
    const under = getUnderstaffed(ws.shifts)
    if(under.length>0 && !window.confirm(`${under.length} understaffed slot(s). Publish anyway?`)) return
    await supabase.from('schedules').update({published:true, pending_approval:false, published_at: new Date().toISOString()}).eq('id', ws.id)
    setWeekSchedules(prev=>({...prev, [week]: {...prev[week], published:true, pending_approval:false}}))
    showToast('Schedule published! Sending notifications...')
    notifySchedule(ws.id, 'published')
  }

  function scheduleNotifyUpdate(schedId){
    if(!schedId) return
    if(window.__notifyTimer) clearTimeout(window.__notifyTimer)
    window.__notifyTimer = setTimeout(()=>{ notifySchedule(schedId, 'updated') }, 4000)
  }

  async function notifySchedule(schedId, change_type){
    try {
      const { data, error } = await supabase.functions.invoke('notify-schedule', {
        body: { schedule_id: schedId, change_type }
      })
      if(error){ console.warn('notify-schedule error', error); return }
      if(data?.skipped === 'no_resend_key'){
        showToast('Email service not configured yet')
      } else if(data?.skipped === 'debounce'){
        // server-side debounce, silent
      } else if(typeof data?.sent === 'number'){
        if(change_type === 'published') showToast(`Published. Emailed ${data.sent} member${data.sent===1?'':'s'}`)
        else showToast(`Update emailed to ${data.sent} member${data.sent===1?'':'s'}`)
      }
    } catch (e) {
      console.warn('notify failed', e)
    }
  }

  async function rejectSchedule(){
    const ws = weekSchedules[week]; if(!ws) return
    await supabase.from('schedules').update({pending_approval:false}).eq('id', ws.id)
    setWeekSchedules(prev=>({...prev, [week]: {...prev[week], pending_approval:false}}))
    showToast('Sent back for revision')
  }

  async function unpublishSchedule(){
    const ws = weekSchedules[week]; if(!ws) return
    if(!window.confirm('Unpublish this schedule? Members will no longer see their shifts.')) return
    const { error } = await supabase.from('schedules')
      .update({ published:false, pending_approval:false })
      .eq('id', ws.id)
    if(error){ showToast('Error: '+error.message); return }
    setWeekSchedules(prev=>({...prev, [week]: {...prev[week], published:false, pending_approval:false}}))
    showToast('Schedule unpublished')
  }

  async function saveShiftEdit(di, idx){
    const s = document.getElementById('es').value, e = document.getElementById('ee').value
    if(toMins(e) <= toMins(s)){ alert('End must be after start'); return }
    const ws = weekSchedules[week]
    const shift = ws.shifts[di][idx]
    await supabase.from('shifts').update({start_time:s, end_time:e}).eq('id', shift.id)
    setWeekSchedules(prev=>{
      const next = JSON.parse(JSON.stringify(prev))
      next[week].shifts[di][idx].start_time = s
      next[week].shifts[di][idx].end_time = e
      return next
    })
    setEditSh(null); showToast('Shift updated')
    if(weekSchedules[week]?.published) scheduleNotifyUpdate(weekSchedules[week].id)
  }

  async function removeShiftDB(di, idx){
    const ws = weekSchedules[week]
    const shift = ws.shifts[di][idx]
    await supabase.from('shifts').delete().eq('id', shift.id)
    setWeekSchedules(prev=>{
      const next = JSON.parse(JSON.stringify(prev))
      next[week].shifts[di].splice(idx, 1)
      return next
    })
    setEditSh(null)
    if(ws?.published) scheduleNotifyUpdate(ws.id)
  }

  async function assignWorker(di, member, req){
    const ws = weekSchedules[week]; if(!ws) return
    const ds = daySettings[di] || {open_time:'08:30', close_time:'19:00'}
    // If this came from an understaffed slot, fill exactly that slot;
    // otherwise default to the full opening hours of the day.
    const start_time = req?.start_time || ds.open_time
    const end_time   = req?.end_time   || ds.close_time
    const { data } = await supabase.from('shifts').insert({
      schedule_id: ws.id, user_id: member.id, day_index: di,
      date: addDaysISO(ws.period_start, di), start_time, end_time
    }).select('*, profiles:user_id(name)').single()
    if(data){
      setWeekSchedules(prev=>{
        const next = JSON.parse(JSON.stringify(prev))
        next[week].shifts[di].push({...data, name: data.profiles?.name || 'Unknown'})
        return next
      })
      showToast(`${member.name} assigned`)
      if(ws.published) scheduleNotifyUpdate(ws.id)
    }
    setAssignModal(null)
  }

  // A requirement is met only if EVERY 15-min slot in its window has enough people
  // (before, a 1-hour shift anywhere in a 9–17 window counted as covering it).
  function getUnderstaffed(shifts){
    const issues = []
    staffingReqs.forEach(req=>{
      const dayShifts = (shifts[req.day_index] || []).filter(sh => sh.user_id)
      const rs = toMins(req.start_time), re = toMins(req.end_time)
      let covered = Infinity
      for(let t = rs; t < re; t += 15){
        const n = dayShifts.filter(sh => toMins(sh.start_time) <= t && toMins(sh.end_time) > t).length
        covered = Math.min(covered, n)
      }
      if(covered === Infinity) covered = 0
      if(covered < req.min_workers) issues.push({...req, covered})
    })
    return issues
  }

  async function saveDaySettings(){
    const rows = daySettings.map((d,i)=>({
      organization_id: orgId, week_offset:0, day_index:i,
      open_time: d.open_time, close_time: d.close_time
    }))
    const { error } = await supabase.from('day_settings').upsert(rows, { onConflict: 'organization_id,week_offset,day_index' })
    if(error) showToast('Error: '+error.message)
    else showToast('Hours saved')
  }
  const [ruleForm, setRuleForm] = useState({ kind: 'cant_be_alone', member_id: '', other_member_id: '', max: 3, weekday: 0, start: '08:00', end: '14:00' })
  async function addRule(){
    const member_id = ruleForm.member_id || members[0]?.id
    if(!member_id) return
    const row = { organization_id: orgId, kind: ruleForm.kind, member_id, params: {} }
    if(ruleForm.kind === 'cant_work_with'){
      const other = ruleForm.other_member_id || members.find(m=>m.id!==member_id)?.id
      if(!other || other === member_id){ showToast('Pick two different people'); return }
      row.other_member_id = other
    }
    if(ruleForm.kind === 'max_shifts_week') row.params = { max: Math.max(1, parseInt(ruleForm.max) || 1) }
    if(ruleForm.kind === 'required_on_shift'){
      if(toMins(ruleForm.end) <= toMins(ruleForm.start)){ showToast('End must be after start'); return }
      row.params = { weekday: ruleForm.weekday, start: ruleForm.start, end: ruleForm.end }
    }
    const { data, error } = await supabase.from('rules').insert(row).select().single()
    if(error){ showToast('Error: '+error.message); return }
    setRules(prev=>[...prev, data])
  }
  async function delRule(id){
    await supabase.from('rules').delete().eq('id', id)
    setRules(prev=>prev.filter(r=>r.id!==id))
  }

  function handleTimetableAction(action, di, data){
    if(action==='edit') setEditSh({di, idx:data})
    if(action==='assign') setAssignModal({di, req:data})
  }

  // ── EARLY RETURNS ──
  if(!authReady){
    return <div className="splash"><div className="spinner"/></div>
  }
  if(!profile){
    return <Login onToast={showToast}/>
  }
  if(orgs.length===0 && !isOrgsView && !isPersonalView){
    return <Onboarding profile={profile} onDone={async()=>{ await loadOrgs(profile.id) }} onSignOut={signOut} onToast={showToast}/>
  }

  // ── MAIN RENDER ──
  const adminTabs = [
    ['timetable','Timetable'],
    ['history','History'],
    ['availability','Availability'],
    ['constraints','Constraints'],
    ['team','Team'],
    ['settings','Settings'],
  ]
  const memberTabs = [
    ['my-availability','My Availability'],
    ['my-shifts','My Shifts'],
    ['my-history','History'],
  ]
  const personalTabs = [['personal','Schedule']]
  const orgsTabs     = [['organizations','Organizations']]

  let tabs
  if(isOrgsView) tabs = orgsTabs
  else if(isPersonalView) tabs = personalTabs
  else tabs = isAdmin ? adminTabs : memberTabs

  const ws = weekSchedules[week]
  const currency = CURRENCY_SYMBOL[orgSettings?.currency] || '€'

  return(
    <div>
      {toast && <Toast msg={toast}/>}

      {/* Assign modal */}
      {assignModal && (
        <Modal title={`Assign worker — ${DAYS[assignModal.di]}`} onClose={()=>setAssignModal(null)}>
          <p style={{fontSize:'12px',color:'#888',marginBottom:'12px'}}>
            {assignModal.req.label} needs {assignModal.req.min_workers}, has {assignModal.req.covered}
          </p>
          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
            {members.filter(m=>!(ws?.shifts[assignModal.di]||[]).some(s=>s.name===m.name)).map(m=>{
              const [bg, fg] = nameColor(m.name)
              return(
                <button key={m.id} className="btn assign-row" onClick={()=>assignWorker(assignModal.di, m, assignModal.req)}>
                  <div className="avatar" style={{width:24, height:24, fontSize:'10px', background:bg, color:fg}}>{initials(m.name)}</div>
                  {m.name}
                </button>
              )
            })}
            {members.filter(m=>!(ws?.shifts[assignModal.di]||[]).some(s=>s.name===m.name)).length===0 && (
              <p className="muted">Everyone is already assigned to this day.</p>
            )}
          </div>
          <button className="btn btn-light" style={{marginTop:'10px',width:'100%'}} onClick={()=>setAssignModal(null)}>Cancel</button>
        </Modal>
      )}

      {/* Edit shift modal */}
      {editSh && ws && ws.shifts[editSh.di][editSh.idx] && (
        <Modal title="Edit shift" onClose={()=>setEditSh(null)}>
          {(()=>{
            const sh = ws.shifts[editSh.di][editSh.idx]
            const [bg, fg] = nameColor(sh.name)
            return(<>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'14px'}}>
                <div className="avatar" style={{width:32, height:32, fontSize:'11px', background:bg, color:fg}}>{initials(sh.name)}</div>
                <div>
                  <div style={{fontSize:'14px',fontWeight:500}}>{sh.name}</div>
                  <div style={{fontSize:'11px',color:'#888'}}>{DAYS[editSh.di]}</div>
                </div>
              </div>
              <div className="modal-field"><div className="modal-label">Start</div><input type="time" id="es" defaultValue={sh.start_time} step="900"/></div>
              <div className="modal-field"><div className="modal-label">End</div><input type="time" id="ee" defaultValue={sh.end_time} step="900"/></div>
              {sh.break_minutes > 0 && <p className="muted" style={{fontSize:'12px'}}>Includes a {sh.break_minutes}-min break.</p>}
              <label style={{fontSize:'12px', display:'flex', alignItems:'center', gap:'6px', margin:'6px 0'}}>
                <input type="checkbox" checked={!!sh.locked} onChange={()=>toggleLock(editSh.di, editSh.idx)}/>
                Locked — keep this shift when regenerating
              </label>
              <div className="row" style={{marginTop:'8px'}}>
                <button className="btn btn-teal" onClick={()=>saveShiftEdit(editSh.di, editSh.idx)}>Save</button>
                <button className="btn btn-red" onClick={()=>removeShiftDB(editSh.di, editSh.idx)}>Remove</button>
                <button className="btn btn-light" onClick={()=>setEditSh(null)}>Cancel</button>
              </div>
            </>)
          })()}
        </Modal>
      )}

      <Topbar
        profile={profile}
        view={view}
        onView={v => { setView(v); setEditSh(null) }}
        tabs={tabs}
        onSignOut={signOut}
        orgs={orgs}
        currentOrg={currentOrg || PERSONAL_ORG}
        onOrgChange={(o)=>{ setCurrentOrg(o); setView(null); setEditSh(null) }}
        onManageOrgs={()=>{ setView('organizations'); setEditSh(null) }}
      />

      {/* ORGANIZATIONS */}
      {isOrgsView && (
        <Organizations
          orgs={orgs}
          profile={profile}
          onChange={()=>loadOrgs(profile.id)}
          onSelect={(o)=>{ setCurrentOrg(o); setView(null) }}
          onToast={showToast}
        />
      )}

      {/* PERSONAL SCHEDULE */}
      {isPersonalView && !isOrgsView && (
        <Personal profile={profile} orgs={orgs}/>
      )}

      {/* TIMETABLE (admin) */}
      {!isPersonalView && !isOrgsView && view==='timetable' && (
        <div className="page page-wide">
          <div className="page-header">
            <div>
              <div className="page-title">Timetable</div>
              <div className="page-sub">{currentOrg?.name}</div>
            </div>
            {week>=0 && (
              <div className="row">
                {ws && <label style={{fontSize:'12px', display:'flex', alignItems:'center', gap:'4px'}} title="Keep everything already assigned and only fill what's missing">
                  <input type="checkbox" checked={fillGapsOnly} onChange={e=>setFillGapsOnly(e.target.checked)}/> Fill gaps only
                </label>}
                <button className="btn btn-blue" onClick={genSchedule} disabled={genLoading}>
                  {genLoading ? 'Generating…' : ws ? 'Regenerate' : 'Generate'}
                </button>
                {ws && !ws.published && !ws.pending_approval && <button className="btn btn-teal" onClick={submitForApproval}>Submit for approval</button>}
                {ws?.pending_approval && !ws.published && <>
                  <span className="pill pill-amber">Pending approval</span>
                  <button className="btn btn-teal" onClick={approveAndPublish}>Approve &amp; publish</button>
                  <button className="btn btn-red" onClick={rejectSchedule}>Send back</button>
                </>}
                {ws?.published && <>
                  <span className="pill pill-green">Published</span>
                  <button className="btn btn-light" onClick={()=>notifySchedule(ws.id, 'updated')}>Resend email</button>
                  <button className="btn btn-red" onClick={unpublishSchedule}>Unpublish</button>
                </>}
              </div>
            )}
          </div>
          <WeekNav w={week} min={-4} max={4} onNav={setWeek}
            statusEl={
              week<0 ? <span className="pill pill-gray">past</span>
              : ws?.published ? <span className="pill pill-green">published</span>
              : ws?.pending_approval ? <span className="pill pill-amber">pending</span>
              : ws ? <span className="pill pill-gray">draft</span>
              : <span className="pill pill-gray">no schedule</span>
            }/>
          {week<0 && <div className="info-banner">Past week — read only</div>}
          <div className="card" style={{padding:'12px'}}>
            <div className="card-label">{ws ? (week>=0?'Click any block to edit':'Read only') : 'No schedule yet'}</div>
            {ws ? (
              <ScheduleView
                shiftsByDay={ws.shifts}
                daySettings={daySettings}
                axisS={axisS} axisE={axisE}
                staffingReqs={staffingReqs}
                editable={week>=0}
                members={members}
                onEditShift={handleTimetableAction}
                showUnderstaffed={week>=0}
                cannotAlone={cannotAlone}
                published={!!ws.published}
              />
            ) : (
              <EmptyState
                title="No schedule yet"
                body={templates.length ? 'Click "Generate" above to build a schedule from your shift templates and team availability.' : 'Add your usual shifts under Settings → Shift templates, then click "Generate".'}
              />
            )}
          </div>
          {ws && week>=0 && (
            <GenerationReport report={genReports[week]} issues={weekIssues} members={members}
              currency={currency} weekStart={ws.period_start}/>
          )}
        </div>
      )}

      {/* HISTORY */}
      {!isPersonalView && !isOrgsView && view==='history' && (
        <div className="page page-wide">
          <div className="page-header">
            <div>
              <div className="page-title">Schedule history</div>
              <div className="page-sub">{currentOrg?.name}</div>
            </div>
          </div>
          {[-1,-2,-3,-4].map(w => {
            const h = weekSchedules[w], isExp = histW===w
            return(
              <div key={w} className="hist-item">
                <div className="hist-head" onClick={()=>{ if(!isExp) loadSchedule(w); setHistW(isExp?null:w) }}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:500}}>{weekLabel(w)}</div>
                    <div style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{weekRange(w)}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    {h?.published && <span className="pill pill-green">published</span>}
                    <span style={{fontSize:'14px',color:'#aaa'}}>{isExp?'▲':'▼'}</span>
                  </div>
                </div>
                {isExp && (
                  <div className="hist-body">
                    {h ? (
                      <ScheduleView shiftsByDay={h.shifts} daySettings={daySettings} axisS={axisS} axisE={axisE}
                        staffingReqs={staffingReqs} editable={false} members={members} onEditShift={null}
                        showUnderstaffed={false} cannotAlone={cannotAlone} published={!!h.published}/>
                    ) : (
                      <p className="muted" style={{padding:'12px'}}>No schedule for this week.</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* AVAILABILITY (admin) */}
      {!isPersonalView && !isOrgsView && view==='availability' && (()=>{
        const avail = weekAvail[week]||{}
        return(
          <div className="page page-wide">
            <div className="page-header">
              <div>
                <div className="page-title">Availability</div>
                <div className="page-sub">{currentOrg?.name}</div>
              </div>
            </div>
            <WeekNav w={week} min={-4} max={4} onNav={w=>{setWeek(w); loadAvail(w)}}
              statusEl={<span className="pill pill-gray">{week<0?'past':week===0?'current':'upcoming'}</span>}/>
            {members.length===0 ? (
              <EmptyState
                title="No team members yet"
                body="Share your join code to invite teammates. Their availability will show up here."
                action={<div className="join-code-hint">Code: <code>{currentOrg?.join_code}</code></div>}
              />
            ) : (
              <>
                <div className="av-grid">
                  {members.map(m=>{
                    const [bg, fg] = nameColor(m.name)
                    const slots = avail[m.name]||[]
                    const activeDays = [...new Set(slots.filter(s=>s.on!==false).map(s=>s.day_index))]
                    return(
                      <div key={m.id} className="av-card">
                        <div className="av-card-head">
                          <div className="avatar" style={{width:32, height:32, fontSize:'11px', background:bg, color:fg}}>{initials(m.name)}</div>
                          <div>
                            <div style={{fontSize:'13px',fontWeight:500}}>{m.name}</div>
                            <div style={{fontSize:'11px',color:'#888'}}>{activeDays.length} day{activeDays.length!==1?'s':''} available</div>
                          </div>
                        </div>
                        <div className="av-days">
                          {DAYS.map((d,di)=>{
                            const daySlots = slots.filter(s=>s.day_index===di && s.on!==false)
                            return(
                              <div key={d} className="av-day">
                                <span className="av-day-name">{d}</span>
                                {daySlots.length ? (
                                  <div style={{display:'flex',flexDirection:'column',gap:'2px',alignItems:'flex-end'}}>
                                    {daySlots.map((s,i)=><span key={i} className="av-time">{s.start}–{s.end}</span>)}
                                  </div>
                                ) : <span className="av-off">unavailable</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="card" style={{padding:'12px',marginTop:'4px'}}>
                  <AvailTimetable w={week} weekAvail={weekAvail} members={members} daySettings={daySettings} axisS={axisS} axisE={axisE}/>
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* CONSTRAINTS */}
      {!isPersonalView && !isOrgsView && view==='constraints' && (
        <div className="page">
          <div className="page-header">
            <div>
              <div className="page-title">Constraints</div>
              <div className="page-sub">{currentOrg?.name}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-label">Active rules</div>
            {rules.length===0 && <p className="muted">No constraints yet — add one below.</p>}
            {rules.map(r=>(
              <div key={r.id} className="c-item">
                <span className="pill pill-amber">{RULE_LABELS[r.kind] || r.kind}</span>
                <span style={{fontSize:'13px',flex:1}}>
                  <strong>{memberName(r.member_id)}</strong>
                  {r.kind==='cant_work_with' && <> — with <strong>{memberName(r.other_member_id)}</strong></>}
                  {r.kind==='max_shifts_week' && <> — max {r.params?.max} shifts</>}
                  {r.kind==='required_on_shift' && r.params?.weekday!=null && <> — {DAYS[r.params.weekday]} {r.params.start}–{r.params.end}</>}
                  {r.kind==='required_on_shift' && r.params?.note && <> — {r.params.note}</>}
                </span>
                <button className="btn btn-red btn-sm" onClick={()=>delRule(r.id)}>Remove</button>
              </div>
            ))}
            <hr className="divider"/>
            <div className="row" style={{flexWrap:'wrap'}}>
              <select value={ruleForm.member_id || members[0]?.id || ''} onChange={e=>setRuleForm(f=>({...f, member_id:e.target.value}))}>
                {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select value={ruleForm.kind} onChange={e=>setRuleForm(f=>({...f, kind:e.target.value}))}>
                {Object.entries(RULE_LABELS).map(([k,label])=><option key={k} value={k}>{label}</option>)}
              </select>
              {ruleForm.kind==='cant_work_with' && (
                <select value={ruleForm.other_member_id} onChange={e=>setRuleForm(f=>({...f, other_member_id:e.target.value}))}>
                  <option value="">with…</option>
                  {members.filter(m=>m.id!==(ruleForm.member_id || members[0]?.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
              {ruleForm.kind==='max_shifts_week' && (
                <input type="number" min="1" max="14" value={ruleForm.max} style={{width:'80px'}}
                  onChange={e=>setRuleForm(f=>({...f, max:e.target.value}))}/>
              )}
              {ruleForm.kind==='required_on_shift' && (<>
                <select value={ruleForm.weekday} onChange={e=>setRuleForm(f=>({...f, weekday:parseInt(e.target.value)}))}>
                  {DAYS.map((d,i)=><option key={d} value={i}>{d}</option>)}
                </select>
                <input type="time" value={ruleForm.start} onChange={e=>setRuleForm(f=>({...f, start:e.target.value}))}/>
                <input type="time" value={ruleForm.end} onChange={e=>setRuleForm(f=>({...f, end:e.target.value}))}/>
              </>)}
              <button className="btn btn-blue" onClick={addRule}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS */}
      {!isPersonalView && !isOrgsView && view==='settings' && (
        <div className="page">
          <div className="page-header">
            <div>
              <div className="page-title">Settings</div>
              <div className="page-sub">{currentOrg?.name}</div>
            </div>
          </div>
          <div className="card">
            <div className="card-label">Share with your team</div>
            <p className="muted" style={{marginBottom:'10px'}}>Send this code to teammates so they can join the organization.</p>
            <div className="org-code-row" style={{maxWidth:'260px'}}>
              <code className="org-code" style={{flex:1}}>{currentOrg?.join_code}</code>
              <button className="btn btn-light btn-sm" onClick={()=>{
                navigator.clipboard?.writeText(currentOrg?.join_code||'')
                showToast('Code copied')
              }}>Copy</button>
            </div>
          </div>
          <div className="card">
            <div className="card-label">Opening hours per day</div>
            {DAYS.map((d,di)=>(
              <div key={d} className="setting-row">
                <span style={{fontSize:'13px',fontWeight:500}}>{d}</span>
                <input type="time" value={daySettings[di]?.open_time||'08:30'} step="900" onChange={e=>setDaySettings(prev=>prev.map((s,i)=>i===di?{...s,open_time:e.target.value}:s))}/>
                <input type="time" value={daySettings[di]?.close_time||'19:00'} step="900" onChange={e=>setDaySettings(prev=>prev.map((s,i)=>i===di?{...s,close_time:e.target.value}:s))}/>
              </div>
            ))}
            <button className="btn btn-teal" style={{marginTop:'12px'}} onClick={saveDaySettings}>Save hours</button>
          </div>
          <TemplatesEditor templates={templates} roles={jobRoles} onAdd={addTemplates} onDelete={deleteTemplate}/>
          {orgSettings && <BusinessRules key={orgSettings.id} org={orgSettings} rulePacks={RULE_PACKS} onSave={saveOrgSettings}/>}
        </div>
      )}

      {/* TEAM */}
      {!isPersonalView && !isOrgsView && view==='team' && (
        <Team members={members} roles={jobRoles} currency={currency}
          onSaveMember={saveMember} onAddRole={addJobRole} onDeleteRole={deleteJobRole} onToggleRole={toggleMemberRole}/>
      )}

      {/* MY AVAILABILITY */}
      {!isPersonalView && !isOrgsView && view==='my-availability' && (()=>{
        const isPast = week<0
        const [bg, fg] = nameColor(profile?.name)
        // Build initial cells from this week's existing availability for this user
        const myRanges = (weekAvail[week]||{})[profile?.name] || []
        const slotsByDay = {}
        myRanges.forEach(r => {
          if(r.on === false) return
          if(!slotsByDay[r.day_index]) slotsByDay[r.day_index] = []
          slotsByDay[r.day_index].push(r)
        })
        const initial = rangesToCells(slotsByDay)
        return(
          <div className="page">
            <div className="page-header">
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <div className="avatar" style={{width:36,height:36,fontSize:'13px',background:bg,color:fg}}>{initials(profile?.name)}</div>
                <div>
                  <div className="page-title">My availability</div>
                  <div className="page-sub">{currentOrg?.name}</div>
                </div>
              </div>
            </div>
            <WeekNav w={week} min={0} max={4} onNav={w=>{setWeek(w); loadAvail(w)}}
              statusEl={week===0 ? <span className="pill pill-green">current</span> : <span className="pill pill-blue">upcoming</span>}/>
            <div className="card">
              <div className="card-label">Paint your availability — {weekLabel(week)}</div>
              <AvailabilityPicker
                key={`${week}-${profile?.id}-${myRanges.length}`}
                daySettings={daySettings}
                initialCells={initial}
                disabled={isPast}
                onChange={(cells)=>{ window.__currentPickerCells = cells }}
              />
              {!isPast && (
                <button
                  className="btn btn-teal"
                  style={{marginTop:'12px'}}
                  onClick={()=>saveMyAvailFromCells(week, window.__currentPickerCells || initial)}>
                  Save availability
                </button>
              )}
            </div>
          </div>
        )
      })()}

      {/* MY SHIFTS */}
      {!isPersonalView && !isOrgsView && view==='my-shifts' && (()=>{
        const sched = ws?.published ? ws : null
        const myShifts = sched ? DAYS.map((d,di)=>({d, sh: sched.shifts[di].filter(s=>s.name===profile?.name)})) : []
        const shiftDays = myShifts.filter(x=>x.sh.length)
        return(
          <div className="page page-wide">
            <div className="page-header">
              <div>
                <div className="page-title">My shifts</div>
                <div className="page-sub">{currentOrg?.name}</div>
              </div>
            </div>
            <WeekNav w={week} min={-4} max={4} onNav={w=>{setWeek(w); loadSchedule(w)}}
              statusEl={sched ? <span className="pill pill-green">published</span> : <span className="pill pill-gray">not published</span>}/>
            {!sched ? (
              <div className="card">
                <EmptyState
                  title="Schedule not yet published"
                  body="Once your manager publishes the week's schedule, your shifts will appear here."
                />
              </div>
            ) : (
              <div className="card">
                <div className="card-label">{weekLabel(week)} · {shiftDays.length} day{shiftDays.length!==1?'s':''} with shifts</div>
                {myShifts.map(({d,sh})=>(
                  <div key={d} className="shift-row">
                    <span style={{fontSize:'13px',fontWeight:500,minWidth:'36px'}}>{d}</span>
                    {sh.length ? (
                      <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                        {sh.map((s,i)=><div key={i} className={`sblock ${nameShiftColor(profile?.name)}`}><span className="sn">{s.start_time} – {s.end_time}</span></div>)}
                      </div>
                    ) : <span className="muted">No shift</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* MY HISTORY */}
      {!isPersonalView && !isOrgsView && view==='my-history' && (
        <div className="page page-wide">
          <div className="page-header">
            <div>
              <div className="page-title">My history</div>
              <div className="page-sub">{currentOrg?.name}</div>
            </div>
          </div>
          {[-1,-2,-3,-4].map(w=>{
            const h = weekSchedules[w], isExp = histW===w
            const myShifts = h ? DAYS.map((d,di)=>({d, sh: h.shifts[di].filter(s=>s.name===profile?.name)})).filter(x=>x.sh.length) : []
            return(
              <div key={w} className="hist-item">
                <div className="hist-head" onClick={()=>{ if(!isExp) loadSchedule(w); setHistW(isExp?null:w) }}>
                  <div>
                    <div style={{fontSize:'13px',fontWeight:500}}>{weekLabel(w)}</div>
                    <div style={{fontSize:'11px',color:'#888',marginTop:'2px'}}>{weekRange(w)}</div>
                  </div>
                  <span style={{fontSize:'14px',color:'#aaa'}}>{isExp?'▲':'▼'}</span>
                </div>
                {isExp && (
                  <div className="hist-body" style={{padding:'10px 16px'}}>
                    {!h && <p className="muted">Loading…</p>}
                    {h && myShifts.length===0 && <p className="muted">No shifts this week.</p>}
                    {h && myShifts.map(({d,sh})=>(
                      <div key={d} className="shift-row">
                        <span style={{fontSize:'13px',fontWeight:500,minWidth:'36px'}}>{d}</span>
                        <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                          {sh.map((s,i)=><div key={i} className={`sblock ${nameShiftColor(profile?.name)}`}><span className="sn">{s.start_time} – {s.end_time}</span></div>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
