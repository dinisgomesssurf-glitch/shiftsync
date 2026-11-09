// Synthetic 6-person café in Lisbon, built to the template model, with
// availability, time off and team rules. A clean rota: zero violations.

import { getRulePack } from '../rulePacks'
import type { AvailabilityWindow, ScheduleInput, Shift } from '../types'
import { addDays } from '../time'

const start = '2026-06-01' // Monday
const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(start, i))

const members = [
  { id: 'ana', name: 'Ana', roleIds: ['barista'], targetHours: 32 },
  { id: 'rui', name: 'Rui', roleIds: ['barista', 'kitchen'], targetHours: 32 },
  { id: 'ines', name: 'Inês', roleIds: ['barista'], targetHours: 20 },
  { id: 'joao', name: 'João', roleIds: ['kitchen'], targetHours: 24 },
  { id: 'marta', name: 'Marta', roleIds: ['barista'], targetHours: 16, senior: false },
  { id: 'tiago', name: 'Tiago', roleIds: ['kitchen', 'barista'], targetHours: 16 },
]

// Two templates per day: opening 08:00–13:00 and closing 13:00–18:00 (5h, no
// break needed under PT rules), one barista each, plus a kitchen shift 11:00–15:00.
const plan: [number, string, string, string, string][] = [
  // [dayIndex, start, end, member, role]
  [0, '08:00', '13:00', 'ana', 'barista'], [0, '13:00', '18:00', 'ines', 'barista'], [0, '11:00', '15:00', 'joao', 'kitchen'],
  [1, '08:00', '13:00', 'rui', 'barista'], [1, '13:00', '18:00', 'ana', 'barista'], [1, '11:00', '15:00', 'joao', 'kitchen'],
  [2, '08:00', '13:00', 'ana', 'barista'], [2, '13:00', '18:00', 'rui', 'barista'], [2, '11:00', '15:00', 'tiago', 'kitchen'],
  [3, '08:00', '13:00', 'rui', 'barista'], [3, '13:00', '18:00', 'ines', 'barista'], [3, '11:00', '15:00', 'joao', 'kitchen'],
  [4, '08:00', '13:00', 'ana', 'barista'], [4, '13:00', '18:00', 'marta', 'barista'], [4, '13:00', '18:00', 'tiago', 'kitchen'],
  [5, '08:00', '13:00', 'rui', 'barista'], [5, '13:00', '18:00', 'ines', 'barista'], [5, '11:00', '15:00', 'joao', 'kitchen'],
  [6, '08:00', '13:00', 'ines', 'barista'], [6, '13:00', '18:00', 'rui', 'barista'], [6, '11:00', '15:00', 'tiago', 'kitchen'],
]

const shifts: Shift[] = plan.map(([d, s, e, m, role], i) => ({
  id: `c${i + 1}`, date: days[d], start: s, end: e, memberId: m, roleId: role, kind: 'regular', breakMinutes: 0,
}))

// Everyone is available 07:30–19:00 every day except Marta (Fri only) and João (not Wed/Fri/Sun).
const availability: AvailabilityWindow[] = []
for (const m of members) days.forEach((date, i) => {
  if (m.id === 'marta' && i !== 4) return
  if (m.id === 'joao' && [2, 4, 6].includes(i)) return
  availability.push({ memberId: m.id, date, start: '07:30', end: '19:00' })
})

export const smallCafeLisbon: ScheduleInput = {
  periodStart: start,
  periodEnd: days[6],
  rulePack: getRulePack('PT'),
  members,
  shifts,
  availability,
  checkAvailability: true,
  timeOff: [{ memberId: 'tiago', startDate: days[0], endDate: days[1] }],
  openingHours: [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, open: '08:00', close: '18:00' })),
  minStaffWhileOpen: 1,
  minShiftHours: 3,
  maxShiftHours: 9,
  rules: [
    { type: 'cant_be_alone', memberId: 'marta' },
    { type: 'max_shifts_week', memberId: 'ines', max: 4 },
    { type: 'cant_work_with', a: 'ana', b: 'ines' },
  ],
}
