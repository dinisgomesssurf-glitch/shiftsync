// Event-organizer pilot pattern: events run 22:00–04:00 the next day, mostly
// with the same people. Two Friday/Saturday events in one weekend.

import { getRulePack } from '../rulePacks'
import type { ScheduleInput } from '../types'

export const overnightEvents: ScheduleInput = {
  periodStart: '2026-03-09', // Monday
  periodEnd: '2026-03-15',
  rulePack: getRulePack('CA-QC'),
  members: [
    { id: 'lead', name: 'Event lead' },
    { id: 'v1', name: 'Crew 1' },
    { id: 'v2', name: 'Crew 2' },
    { id: 'v3', name: 'Crew 3' },
  ],
  shifts: [
    { id: 'e1', memberId: 'lead', date: '2026-03-13', start: '21:30', end: '04:30', kind: 'event', breakMinutes: 30 },
    { id: 'e2', memberId: 'v1', date: '2026-03-13', start: '22:00', end: '04:00', kind: 'event', breakMinutes: 30 },
    { id: 'e3', memberId: 'v2', date: '2026-03-13', start: '22:00', end: '04:00', kind: 'event', breakMinutes: 30 },
    { id: 'e4', memberId: 'lead', date: '2026-03-14', start: '21:30', end: '04:30', kind: 'event', breakMinutes: 30 },
    { id: 'e5', memberId: 'v1', date: '2026-03-14', start: '22:00', end: '04:00', kind: 'event', breakMinutes: 30 },
    { id: 'e6', memberId: 'v3', date: '2026-03-14', start: '22:00', end: '04:00', kind: 'event', breakMinutes: 30 },
  ],
  checkAvailability: false,
}
