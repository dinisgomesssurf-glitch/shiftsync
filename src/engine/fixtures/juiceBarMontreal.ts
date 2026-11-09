// Real rota (26 shifts) from the Montreal juice bar pilot, week of Mon 4 May 2026.
// Staff names are replaced with pseudonyms (Quebec Law 25 — no real staff data
// in the repository). Shift times are exactly as published by the owner.
// "Essai" shifts are trials for new hires and are modelled as kind: 'trial'.

import { getRulePack } from '../rulePacks'
import type { Member, ScheduleInput, Shift } from '../types'

export const members: Member[] = [
  { id: 'a', name: 'Staff A' }, // ~34.5h, opens most days
  { id: 'b', name: 'Staff B' }, // ~32.5h
  { id: 'c', name: 'Staff C' },
  { id: 'd', name: 'Staff D' },
  { id: 'e', name: 'Staff E' },
  { id: 'f', name: 'Staff F' },
  { id: 'g', name: 'Staff G', senior: false }, // trial Mon, regular Wed
  { id: 'h', name: 'Staff H', senior: false }, // trial Tue, regular Sat
  { id: 'i', name: 'Staff I' },
]

type Row = [string, string, string, string, Shift['kind']?]
// [date, start, end, member, kind]
const rows: Row[] = [
  ['2026-05-04', '08:30', '17:00', 'a'], ['2026-05-04', '09:00', '13:00', 'g', 'trial'], ['2026-05-04', '13:00', '18:00', 'd'],
  ['2026-05-05', '08:30', '14:00', 'a'], ['2026-05-05', '10:00', '14:00', 'h', 'trial'], ['2026-05-05', '13:00', '18:00', 'b'],
  ['2026-05-06', '08:30', '14:00', 'g'], ['2026-05-06', '08:30', '16:00', 'b'], ['2026-05-06', '13:00', '18:00', 'c'],
  ['2026-05-07', '08:30', '14:00', 'a'], ['2026-05-07', '10:00', '16:00', 'c'], ['2026-05-07', '13:00', '18:00', 'b'],
  ['2026-05-08', '08:30', '14:00', 'i'], ['2026-05-08', '08:30', '14:00', 'e'], ['2026-05-08', '12:00', '18:00', 'c'], ['2026-05-08', '12:00', '18:00', 'b'],
  ['2026-05-09', '08:00', '14:00', 'a'], ['2026-05-09', '08:00', '14:00', 'd'], ['2026-05-09', '09:00', '15:00', 'h'], ['2026-05-09', '12:00', '17:00', 'f'], ['2026-05-09', '12:00', '17:00', 'e'],
  ['2026-05-10', '08:00', '17:00', 'a'], ['2026-05-10', '08:00', '17:00', 'b'], ['2026-05-10', '09:00', '15:00', 'e'], ['2026-05-10', '12:00', '17:00', 'f'], ['2026-05-10', '12:00', '17:00', 'd'],
]

export const shifts: Shift[] = rows.map(([date, start, end, memberId, kind], i) => ({
  id: `jb${i + 1}`, date, start, end, memberId, kind: kind || 'regular', breakMinutes: 0,
}))

export const juiceBarMontreal: ScheduleInput = {
  periodStart: '2026-05-04',
  periodEnd: '2026-05-10',
  rulePack: getRulePack('CA-QC'),
  members,
  shifts,
  checkAvailability: false, // historical rota: availability wasn't recorded
  openingHours: [
    { weekday: 0, open: '08:30', close: '18:00' },
    { weekday: 1, open: '08:30', close: '18:00' },
    { weekday: 2, open: '08:30', close: '18:00' },
    { weekday: 3, open: '08:30', close: '18:00' },
    { weekday: 4, open: '08:30', close: '18:00' },
    { weekday: 5, open: '08:00', close: '17:00' },
    { weekday: 6, open: '08:00', close: '17:00' },
  ],
  minStaffWhileOpen: 1, // the owner confirmed 1 person in quiet hours is deliberate
}
