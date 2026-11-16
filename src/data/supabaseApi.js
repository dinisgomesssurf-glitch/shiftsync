// Every database call the app makes, in one place. Pages never import supabase
// directly; they use the hooks in ./hooks.js, which call these functions.
// demoApi.js implements the same functions in memory.
import { supabase } from '../lib/supabase'
import { addDaysISO, toMins } from '../lib/dates'

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data }

export const supabaseApi = {
  // ── Session ──
  async getSession() {
    const { data } = await supabase.auth.getSession()
    return data.session?.user || null
  },
  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session?.user || null))
    return () => data.subscription.unsubscribe()
  },
  async getProfile(user) {
    const p = must(await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle())
    return p ? { ...p, email: user.email } : null
  },
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  signUp: (email, password, meta) => supabase.auth.signUp({ email, password, options: { data: { ...meta, role: 'member' }, emailRedirectTo: window.location.origin } }),
  resend: email => supabase.auth.resend({ type: 'signup', email }),
  usernameAvailable: async uname => must(await supabase.rpc('check_username_available', { uname })),
  signOut: () => supabase.auth.signOut(),

  // ── Businesses ──
  async listOrgs(userId) {
    const rows = must(await supabase.from('organization_members')
      .select('role, organizations:organization_id(id, name, join_code)').eq('user_id', userId))
    return rows.filter(r => r.organizations).map(r => ({ ...r.organizations, role: r.role }))
  },
  createOrg: async name => must(await supabase.rpc('create_organization', { org_name: name })),
  joinOrg: async code => must(await supabase.rpc('join_organization_by_code', { code })),
  updateOrg: async (id, patch) => must(await supabase.from('organizations').update(patch).eq('id', id).select().single()),
  deleteOrg: async id => must(await supabase.from('organizations').delete().eq('id', id)),
  leaveOrg: async (orgId, userId) => must(await supabase.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId)),

  /** Everything about a business that doesn't change week to week. */
  async getOrg(orgId) {
    const [org, mem, roles, mroles, pay, tpl, rules, hours, timeOff, defaults] = await Promise.all([
      supabase.from('organizations').select('*').eq('id', orgId).single(),
      supabase.from('organization_members').select('role, target_hours, max_hours, senior, contract_type, profiles:user_id(id, name)').eq('organization_id', orgId),
      supabase.from('job_roles').select('*').eq('organization_id', orgId).order('name'),
      supabase.from('member_roles').select('user_id, role_id').eq('organization_id', orgId),
      supabase.from('member_pay').select('user_id, hourly_rate').eq('organization_id', orgId),
      supabase.from('shift_templates').select('*').eq('organization_id', orgId).order('weekday').order('start_time'),
      supabase.from('rules').select('*').eq('organization_id', orgId).order('created_at'),
      supabase.from('day_settings').select('*').eq('organization_id', orgId).order('day_index'),
      supabase.from('time_off').select('*').eq('organization_id', orgId),
      supabase.from('availability_default').select('*').eq('organization_id', orgId),
    ].map(q => q.then(must)))
    const rolesByUser = {}
    for (const r of mroles) (rolesByUser[r.user_id] ||= []).push(r.role_id)
    const payByUser = Object.fromEntries(pay.map(p => [p.user_id, p.hourly_rate]))
    const members = mem.filter(r => r.profiles).map(r => ({
      id: r.profiles.id, name: r.profiles.name, role: r.role,
      target_hours: r.target_hours, max_hours: r.max_hours, senior: r.senior, contract_type: r.contract_type,
      roleIds: rolesByUser[r.profiles.id] || [], hourly_rate: payByUser[r.profiles.id] ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name))
    const byDay = Object.fromEntries(hours.map(h => [h.day_index, h]))
    const fullHours = [0, 1, 2, 3, 4, 5, 6].map(i => ({ day_index: i, open_time: byDay[i]?.open_time || '08:30', close_time: byDay[i]?.close_time || '18:00' }))
    return { org, members, roles, templates: tpl, rules, hours: fullHours, hoursSet: hours.length > 0, timeOff, defaults }
  },

  /** One week: the schedule, its shifts, that week's availability changes and the last generator report. */
  async getWeek(orgId, weekStart) {
    const [schedule, weekRows] = await Promise.all([
      supabase.from('schedules').select('*').eq('organization_id', orgId).eq('kind', 'week').eq('period_start', weekStart).maybeSingle().then(must),
      supabase.from('availability').select('*').eq('organization_id', orgId).eq('week_start', weekStart).then(must),
    ])
    let shifts = [], report = null
    if (schedule) {
      const [s, run] = await Promise.all([
        supabase.from('shifts').select('*').eq('schedule_id', schedule.id).then(must),
        supabase.from('schedule_runs').select('explanations').eq('schedule_id', schedule.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
          .then(r => r.error ? null : r.data), // members can't read runs; that's fine
      ])
      shifts = s; report = run?.explanations || null
    }
    return { schedule, shifts, weekRows, report }
  },

  async historyHours(orgId, weekStart) {
    const rows = must(await supabase.from('shifts')
      .select('user_id, start_time, end_time, break_minutes, date, schedules!inner(organization_id)')
      .eq('schedules.organization_id', orgId).gte('date', addDaysISO(weekStart, -28)).lte('date', addDaysISO(weekStart, -1)))
    const out = {}
    for (const s of rows) {
      if (!s.user_id) continue
      let m = toMins(s.end_time) - toMins(s.start_time); if (m <= 0) m += 1440
      out[s.user_id] = (out[s.user_id] || 0) + (m - (s.break_minutes || 0)) / 60
    }
    return out
  },

  // ── Schedule ──
  ensureWeek: async (orgId, weekStart) => must(await supabase.rpc('ensure_week_schedule', { p_org: orgId, p_week_start: weekStart })),
  saveSchedule: async (scheduleId, shifts, version) => must(await supabase.rpc('save_schedule', { p_schedule_id: scheduleId, p_shifts: shifts, p_expected_version: version })),
  logRun: async row => { await supabase.from('schedule_runs').insert(row) },
  addShift: async row => must(await supabase.from('shifts').insert(row).select().single()),
  updateShift: async (id, patch) => must(await supabase.from('shifts').update(patch).eq('id', id).select().single()),
  deleteShift: async id => must(await supabase.from('shifts').delete().eq('id', id)),
  setPublished: async (scheduleId, published) => must(await supabase.from('schedules')
    .update({ published, pending_approval: false, ...(published ? { published_at: new Date().toISOString() } : {}) }).eq('id', scheduleId)),
  async notify(scheduleId, changeType) {
    try {
      const { data, error } = await supabase.functions.invoke('notify-schedule', { body: { schedule_id: scheduleId, change_type: changeType } })
      return error ? null : data
    } catch { return null }
  },

  // ── Settings ──
  saveHours: async (orgId, hours) => must(await supabase.from('day_settings').upsert(
    hours.map((h, i) => ({ organization_id: orgId, week_offset: 0, day_index: i, open_time: h.open_time, close_time: h.close_time })),
    { onConflict: 'organization_id,week_offset,day_index' })),
  addTemplates: async (orgId, rows) => must(await supabase.from('shift_templates').insert(rows.map(r => ({ ...r, organization_id: orgId }))).select()),
  updateTemplate: async (id, patch) => must(await supabase.from('shift_templates').update(patch).eq('id', id)),
  deleteTemplates: async ids => must(await supabase.from('shift_templates').delete().in('id', ids)),

  // ── Team ──
  addRole: async (orgId, name) => must(await supabase.from('job_roles').insert({ organization_id: orgId, name }).select().single()),
  deleteRole: async id => must(await supabase.from('job_roles').delete().eq('id', id)),
  setMemberRole: async (orgId, userId, roleId, on) => must(on
    ? await supabase.from('member_roles').insert({ organization_id: orgId, user_id: userId, role_id: roleId })
    : await supabase.from('member_roles').delete().eq('user_id', userId).eq('role_id', roleId)),
  async saveMember(orgId, userId, d) {
    must(await supabase.from('organization_members').update({
      target_hours: d.target_hours, max_hours: d.max_hours, senior: d.senior, contract_type: d.contract_type || null,
    }).eq('organization_id', orgId).eq('user_id', userId))
    must(d.hourly_rate == null
      ? await supabase.from('member_pay').delete().eq('organization_id', orgId).eq('user_id', userId)
      : await supabase.from('member_pay').upsert({ organization_id: orgId, user_id: userId, hourly_rate: d.hourly_rate, updated_at: new Date().toISOString() }))
  },
  removeMember: async (orgId, userId) => must(await supabase.from('organization_members').delete().eq('organization_id', orgId).eq('user_id', userId)),
  addRule: async (orgId, row) => must(await supabase.from('rules').insert({ ...row, organization_id: orgId }).select().single()),
  deleteRule: async id => must(await supabase.from('rules').delete().eq('id', id)),

  // ── Availability ──
  async saveUsualWeek(orgId, userId, rows) {
    must(await supabase.from('availability_default').delete().eq('organization_id', orgId).eq('user_id', userId))
    if (rows.length) must(await supabase.from('availability_default').insert(rows.map(r => ({ ...r, organization_id: orgId, user_id: userId }))))
  },
  /** rows = null removes the week's changes, so the usual week applies again. */
  async saveWeekAvailability(orgId, userId, weekStart, rows) {
    must(await supabase.from('availability').delete().eq('organization_id', orgId).eq('user_id', userId).eq('week_start', weekStart))
    if (rows?.length) must(await supabase.from('availability').insert(rows.map((r, i) => ({
      organization_id: orgId, user_id: userId, week_start: weekStart, day_index: r.day_index, slot_index: i,
      is_available: r.is_available, start_time: r.start_time, end_time: r.end_time,
    }))))
  },
}
