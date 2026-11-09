// Generation scenarios: the same teams as the validator fixtures, expressed as
// DEMAND (templates) + availability, so the engine has to build the rota itself.

import { getRulePack } from '../rulePacks'
import { addDays } from '../time'
import type { AvailabilityWindow, GenerateInput, Member, ShiftTemplate } from '../types'
import { juiceBarMontreal, shifts as jbShifts } from './juiceBarMontreal'

// ── Montreal juice bar: templates = the May rota's shift shapes and head counts ──
function juiceBarTemplates(): ShiftTemplate[] {
  const byKey = new Map<string, ShiftTemplate>()
  for (const s of jbShifts) {
    if (s.kind === 'trial') continue
    const weekday = (new Date(s.date + 'T00:00:00Z').getUTCDay() + 6) % 7
    const key = `${weekday}|${s.start}|${s.end}`
    const t = byKey.get(key) || { id: `jb-${weekday}-${s.start}-${s.end}`, weekday, start: s.start, end: s.end, min: 0, target: 0 }
    t.min++; t.target++
    byKey.set(key, t)
  }
  return [...byKey.values()]
}

// Each person is available, for the whole opening day, on the days they worked
// that week plus one extra day — so a valid rota exists but it isn't the only one.
function juiceBarAvailability(): AvailabilityWindow[] {
  const out: AvailabilityWindow[] = []
  const worked = new Map<string, Set<string>>()
  for (const s of jbShifts) if (s.memberId) {
    if (!worked.has(s.memberId)) worked.set(s.memberId, new Set())
    worked.get(s.memberId)!.add(s.date)
  }
  juiceBarMontreal.members.forEach((m, i) => {
    const days = worked.get(m.id) || new Set<string>()
    days.add(addDays('2026-05-04', (i * 3) % 7))
    for (const date of days) out.push({ memberId: m.id, date, start: '07:30', end: '18:30' })
  })
  return out
}

const jbTargets: Record<string, number> = { a: 34, b: 32, c: 17, d: 16, e: 16, f: 10, g: 6, h: 6, i: 6 }

export const juiceBarGenerate: GenerateInput = {
  periodStart: juiceBarMontreal.periodStart,
  periodEnd: juiceBarMontreal.periodEnd,
  rulePack: juiceBarMontreal.rulePack,
  members: juiceBarMontreal.members.map(m => ({ ...m, targetHours: jbTargets[m.id], senior: true })),
  availability: juiceBarAvailability(),
  checkAvailability: true,
  openingHours: juiceBarMontreal.openingHours,
  minStaffWhileOpen: 1,
  templates: juiceBarTemplates(),
}

// ── Lisbon café, 8 people, two roles, templates with optional extra heads ──
const cafeStart = '2026-06-01'
const cafeMembers: Member[] = [
  { id: 'ana', name: 'Ana', roleIds: ['barista'], targetHours: 35, hourlyRate: 7.5 },
  { id: 'rui', name: 'Rui', roleIds: ['barista', 'kitchen'], targetHours: 35, hourlyRate: 8 },
  { id: 'ines', name: 'Inês', roleIds: ['barista'], targetHours: 20, hourlyRate: 6.5 },
  { id: 'joao', name: 'João', roleIds: ['kitchen'], targetHours: 30, hourlyRate: 7.5 },
  { id: 'marta', name: 'Marta', roleIds: ['barista'], targetHours: 16, hourlyRate: 6, senior: false },
  { id: 'tiago', name: 'Tiago', roleIds: ['kitchen', 'barista'], targetHours: 24, hourlyRate: 7 },
  { id: 'sofia', name: 'Sofia', roleIds: ['barista'], targetHours: 20, hourlyRate: 6.5 },
  { id: 'pedro', name: 'Pedro', roleIds: ['kitchen'], targetHours: 16, hourlyRate: 7 },
]
const cafeTemplates: ShiftTemplate[] = []
for (let wd = 0; wd < 7; wd++) {
  const weekend = wd >= 5
  cafeTemplates.push(
    { id: `open-${wd}`, weekday: wd, name: 'Opening', start: '08:00', end: '13:00', roleId: 'barista', min: 1, target: weekend ? 2 : 1 },
    { id: `close-${wd}`, weekday: wd, name: 'Closing', start: '13:00', end: '18:00', roleId: 'barista', min: 1, target: weekend ? 2 : 1 },
    { id: `kitchen-${wd}`, weekday: wd, name: 'Kitchen', start: '11:00', end: '15:00', roleId: 'kitchen', min: 1, target: weekend ? 2 : 1 },
  )
}
const cafeAvailability: AvailabilityWindow[] = []
for (const m of cafeMembers) for (let d = 0; d < 7; d++) {
  if (m.id === 'marta' && ![4, 5, 6].includes(d)) continue
  if (m.id === 'joao' && [2, 6].includes(d)) continue
  if (m.id === 'ines' && d < 2) continue
  cafeAvailability.push({ memberId: m.id, date: addDays(cafeStart, d), start: '07:30', end: '19:00', kind: m.id === 'sofia' && d >= 5 ? 'preferred' : 'available' })
}

export const cafeGenerate: GenerateInput = {
  periodStart: cafeStart,
  periodEnd: addDays(cafeStart, 6),
  rulePack: getRulePack('PT'),
  members: cafeMembers,
  availability: cafeAvailability,
  checkAvailability: true,
  timeOff: [{ memberId: 'tiago', startDate: cafeStart, endDate: addDays(cafeStart, 1) }],
  openingHours: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, open: '08:00', close: '18:00' })),
  minStaffWhileOpen: 1,
  templates: cafeTemplates,
  rules: [
    { type: 'cant_be_alone', memberId: 'marta' },
    { type: 'cant_work_with', a: 'ana', b: 'ines' },
    { type: 'max_shifts_week', memberId: 'ines', max: 4 },
  ],
}

// ── Event organizer: two overnight events + a day job the next morning ──
export const eventsGenerate: GenerateInput = {
  periodStart: '2026-03-09',
  periodEnd: '2026-03-15',
  rulePack: getRulePack('PT'),
  members: [
    { id: 'lead1', name: 'Lead 1', roleIds: ['lead', 'crew'], targetHours: 12 },
    { id: 'lead2', name: 'Lead 2', roleIds: ['lead', 'crew'], targetHours: 12 },
    ...[1, 2, 3, 4, 5, 6].map(i => ({ id: `c${i}`, name: `Crew ${i}`, roleIds: ['crew'], targetHours: 8 })),
  ],
  checkAvailability: false,
  demand: [
    { id: 'fri-lead', date: '2026-03-13', start: '21:30', end: '04:30', roleId: 'lead', min: 1, target: 1, label: 'Friday party', kind: 'event' },
    { id: 'fri-crew', date: '2026-03-13', start: '22:00', end: '04:00', roleId: 'crew', min: 3, target: 4, label: 'Friday party', kind: 'event' },
    { id: 'sat-lead', date: '2026-03-14', start: '21:30', end: '04:30', roleId: 'lead', min: 1, target: 1, label: 'Saturday party', kind: 'event' },
    { id: 'sat-crew', date: '2026-03-14', start: '22:00', end: '04:00', roleId: 'crew', min: 3, target: 4, label: 'Saturday party', kind: 'event' },
    // Saturday morning set-up: whoever worked Friday night can't do it (rest)
    { id: 'sat-setup', date: '2026-03-14', start: '10:00', end: '14:00', roleId: 'crew', min: 2, target: 2, label: 'Set-up' },
  ],
}

/** A bigger synthetic team to check speed: 30 people, ~150 slots. */
export function bigTeam(): GenerateInput {
  const start = '2026-09-07'
  const members: Member[] = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, name: `Person ${i}`, targetHours: [40, 30, 20, 16][i % 4], hourlyRate: 8 + (i % 5) }))
  const templates: ShiftTemplate[] = []
  for (let wd = 0; wd < 7; wd++) {
    templates.push(
      { id: `o${wd}`, weekday: wd, start: '07:00', end: '15:00', min: 3, target: 5 },
      { id: `m${wd}`, weekday: wd, start: '11:00', end: '17:00', min: 3, target: 4 },
      { id: `c${wd}`, weekday: wd, start: '15:00', end: '23:00', min: 3, target: 5 },
    )
  }
  const availability: AvailabilityWindow[] = []
  members.forEach((m, i) => { for (let d = 0; d < 7; d++) if ((i + d) % 7 !== 0) availability.push({ memberId: m.id, date: addDays(start, d), start: '06:00', end: '23:30' }) })
  return { periodStart: start, periodEnd: addDays(start, 6), rulePack: getRulePack('PT'), members, templates, availability, checkAvailability: true }
}
