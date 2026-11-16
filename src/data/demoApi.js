// In-memory version of the API with a sample juice bar, served at /demo.
// Nothing is saved: reloading the page resets it. It lets anyone try the app
// without an account, and lets us check screens without touching real data.
import { addDaysISO, weekStartOf } from '../lib/dates'

let seq = 1000
const id = () => String(++seq)
const clone = v => JSON.parse(JSON.stringify(v))
const wait = v => new Promise(r => setTimeout(() => r(clone(v ?? null)), 120))

const ORG = 'demo-org'
const people = [
  ['maya', 'Maya Tremblay', 'admin', 32, 21, true], ['leo', 'Léo Gagnon', 'member', 30, 18.5, true],
  ['sara', 'Sara Roy', 'member', 20, 17, true], ['noah', 'Noah Côté', 'member', 16, 16.5, true],
  ['emma', 'Emma Bouchard', 'member', 16, 16.5, true], ['zoe', 'Zoé Lavoie', 'member', 12, 16, true],
  ['theo', 'Théo Morin', 'member', 10, 16, false], ['alice', 'Alice Fortin', 'member', 10, 16, false],
]
const tpl = (weekday, name, start, end, min, target = min) => ({ id: id(), organization_id: ORG, weekday, name, start_time: start, end_time: end, role_id: null, min_workers: min, target_workers: target, break_minutes: 0, kind: 'regular' })

const db = {
  me: 'maya',
  org: { id: ORG, name: 'Sunny Side Juice Bar', join_code: 'JUICE7', jurisdiction: 'CA-QC', currency: 'CAD', timezone: 'America/Toronto', generation_preset: 'balanced', labor_budget: null, min_staff_while_open: 1, staff_see_team: true, assume_available: true, rule_overrides: {} },
  members: people.map(([pid, name, role, target, rate, senior]) => ({ id: pid, name, role, target_hours: target, max_hours: null, senior, contract_type: target >= 30 ? 'full_time' : 'part_time', roleIds: [], hourly_rate: rate })),
  roles: [],
  templates: [
    ...[0, 1, 2, 3].flatMap(d => [tpl(d, 'Opening', '08:30', '14:00', 1), tpl(d, 'Midday', '10:00', '16:00', 0, 1), tpl(d, 'Closing', '13:00', '18:00', 1)]),
    tpl(4, 'Opening', '08:30', '14:00', 2), tpl(4, 'Closing', '12:00', '18:00', 2),
    ...[5, 6].flatMap(d => [tpl(d, 'Opening', '08:00', '14:00', 2), tpl(d, 'Midday', '09:00', '15:00', 1), tpl(d, 'Closing', '12:00', '17:00', 2)]),
  ],
  rules: [{ id: id(), organization_id: ORG, kind: 'cant_be_alone', member_id: 'theo', other_member_id: null, params: {} }],
  hours: [0, 1, 2, 3, 4].map(i => ({ day_index: i, open_time: '08:30', close_time: '18:00' })).concat([5, 6].map(i => ({ day_index: i, open_time: '08:00', close_time: '17:00' }))),
  timeOff: [],
  defaults: [
    ...[0, 1, 3, 5, 6].map(d => ({ user_id: 'maya', weekday: d, start_time: '07:30', end_time: '18:30' })),
    ...[1, 2, 3, 4, 6].map(d => ({ user_id: 'leo', weekday: d, start_time: '07:30', end_time: '18:30' })),
    ...[2, 3, 4].map(d => ({ user_id: 'sara', weekday: d, start_time: '09:00', end_time: '18:30' })),
    ...[0, 5, 6].map(d => ({ user_id: 'noah', weekday: d, start_time: '07:30', end_time: '18:30' })),
    ...[4, 5, 6].map(d => ({ user_id: 'emma', weekday: d, start_time: '07:30', end_time: '18:30' })),
    ...[0, 2, 5, 6].map(d => ({ user_id: 'zoe', weekday: d, start_time: '11:00', end_time: '18:30' })),
    ...[1, 5].map(d => ({ user_id: 'theo', weekday: d, start_time: '08:00', end_time: '16:00' })),
  ].map(r => ({ ...r, id: id(), organization_id: ORG })),
  schedules: [], shifts: [], weekRows: [], runs: [],
}
// Zoé can't do next Saturday.
db.weekRows.push({ id: id(), organization_id: ORG, user_id: 'zoe', week_start: addDaysISO(weekStartOf(), 7), day_index: 5, is_available: false, start_time: '00:00', end_time: '00:00' },
  ...[0, 2, 6].map(d => ({ id: id(), organization_id: ORG, user_id: 'zoe', week_start: addDaysISO(weekStartOf(), 7), day_index: d, is_available: true, start_time: '11:00', end_time: '18:30' })))

const listeners = new Set()
const user = () => ({ id: db.me, email: `${db.me}@sunnyside.example` })

export const demoApi = {
  isDemo: true,
  demoSwitchUser(uid) { db.me = uid; listeners.forEach(cb => cb(user())) },
  demoUser: () => db.me,

  getSession: () => wait(user()),
  onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb) },
  getProfile: u => wait({ id: u.id, name: db.members.find(m => m.id === u.id)?.name, username: u.id, email: u.email }),
  signOut: async () => { window.location.href = '/' },

  listOrgs: uid => wait([{ id: ORG, name: db.org.name, join_code: db.org.join_code, role: db.members.find(m => m.id === uid)?.role || 'member' }]),
  createOrg: async () => { throw new Error('Creating a business is turned off in the demo') },
  joinOrg: async () => { throw new Error('Joining a business is turned off in the demo') },
  updateOrg: (_id, patch) => { Object.assign(db.org, patch); return wait(db.org) },
  deleteOrg: async () => { throw new Error('Not available in the demo') },
  leaveOrg: async () => { throw new Error('Not available in the demo') },

  getOrg: () => wait({ org: db.org, members: db.members, roles: db.roles, templates: db.templates, rules: db.rules, hours: db.hours, hoursSet: true, timeOff: db.timeOff, defaults: db.defaults }),
  getWeek(_o, weekStart) {
    const schedule = db.schedules.find(s => s.period_start === weekStart) || null
    return wait({
      schedule, shifts: schedule ? db.shifts.filter(s => s.schedule_id === schedule.id) : [],
      weekRows: db.weekRows.filter(r => r.week_start === weekStart),
      report: schedule ? db.runs.filter(r => r.schedule_id === schedule.id).at(-1)?.explanations || null : null,
    })
  },
  historyHours: () => wait({}),

  ensureWeek(_o, weekStart) {
    let s = db.schedules.find(x => x.period_start === weekStart)
    if (!s) { s = { id: id(), organization_id: ORG, kind: 'week', period_start: weekStart, period_end: addDaysISO(weekStart, 6), published: false, version: 1 }; db.schedules.push(s) }
    return wait(s)
  },
  saveSchedule(scheduleId, shifts, version) {
    const s = db.schedules.find(x => x.id === scheduleId)
    if (version != null && s.version !== version) return Promise.reject(new Error('stale_version'))
    db.shifts = db.shifts.filter(x => x.schedule_id !== scheduleId).concat(shifts.map(x => ({ ...x, id: id(), schedule_id: scheduleId })))
    s.version++
    return wait(s.version)
  },
  logRun: row => { db.runs.push(row); return wait() },
  addShift: row => { const r = { kind: 'regular', break_minutes: 0, locked: false, ...row, id: id() }; db.shifts.push(r); return wait(r) },
  updateShift: (sid, patch) => { const r = db.shifts.find(s => s.id === sid); Object.assign(r, patch); return wait(r) },
  deleteShift: sid => { db.shifts = db.shifts.filter(s => s.id !== sid); return wait() },
  setPublished: (sid, published) => { db.schedules.find(s => s.id === sid).published = published; return wait() },
  notify: () => wait({ sent: db.members.length }),

  saveHours: (_o, hours) => { db.hours = hours.map((h, i) => ({ ...h, day_index: i })); return wait() },
  addTemplates: (_o, rows) => { const added = rows.map(r => ({ break_minutes: 0, kind: 'regular', ...r, id: id(), organization_id: ORG })); db.templates.push(...added); return wait(added) },
  updateTemplate: (tid, patch) => { Object.assign(db.templates.find(t => t.id === tid), patch); return wait() },
  deleteTemplates: ids => { db.templates = db.templates.filter(t => !ids.includes(t.id)); return wait() },

  addRole: (_o, name) => { const r = { id: id(), organization_id: ORG, name }; db.roles.push(r); return wait(r) },
  deleteRole: rid => { db.roles = db.roles.filter(r => r.id !== rid); db.members.forEach(m => { m.roleIds = m.roleIds.filter(x => x !== rid) }); return wait() },
  setMemberRole: (_o, uid, rid, on) => { const m = db.members.find(x => x.id === uid); m.roleIds = on ? [...m.roleIds, rid] : m.roleIds.filter(x => x !== rid); return wait() },
  saveMember: (_o, uid, d) => { Object.assign(db.members.find(m => m.id === uid), d); return wait() },
  removeMember: (_o, uid) => { db.members = db.members.filter(m => m.id !== uid); return wait() },
  addRule: (_o, row) => { const r = { params: {}, ...row, id: id(), organization_id: ORG }; db.rules.push(r); return wait(r) },
  deleteRule: rid => { db.rules = db.rules.filter(r => r.id !== rid); return wait() },

  saveUsualWeek: (_o, uid, rows) => { db.defaults = db.defaults.filter(r => r.user_id !== uid).concat(rows.map(r => ({ ...r, id: id(), organization_id: ORG, user_id: uid }))); return wait() },
  saveWeekAvailability: (_o, uid, weekStart, rows) => {
    db.weekRows = db.weekRows.filter(r => !(r.user_id === uid && r.week_start === weekStart))
      .concat((rows || []).map(r => ({ ...r, id: id(), organization_id: ORG, user_id: uid, week_start: weekStart })))
    return wait()
  },
}
