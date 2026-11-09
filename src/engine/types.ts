// ShiftSync engine — shared types.
// Pure data, no React, no Supabase. Everything the engine needs arrives in a
// ScheduleInput snapshot; everything it produces is plain JSON.

/** ISO calendar date, e.g. "2026-05-04". */
export type ISODate = string
/** Local wall-clock time "HH:MM" (24h). */
export type HHMM = string

/** Jurisdiction code: ISO country, optionally with region, e.g. "PT", "CA-QC". */
export type Jurisdiction = string

export interface BreakRule {
  /** Break applies when worked span is longer than this many hours. */
  overHours: number
  /** Minimum total break in minutes. */
  minutes: number
  /** If true the rule applies when span is >= overHours (France: "dès 6 heures"). */
  inclusive?: boolean
}

export interface RulePack {
  jurisdiction: Jurisdiction
  name: string
  /** Minimum rest between shifts on different days, hours. null = no general rule. */
  minRestHours: number | null
  /** Hard cap on worked hours per day. null = no hard cap (overtime only). */
  maxDailyHours: number | null
  /** Hard cap on worked hours per week. null = no hard cap. */
  maxWeeklyHours: number | null
  /** Longest uninterrupted rest required inside each 7-day period, hours. */
  weeklyRestHours: number | null
  /** Break rules; the largest applicable one wins. */
  breaks: BreakRule[]
  /** Overtime thresholds — a cost signal, never a hard limit. */
  overtimeDailyHours?: number | null
  overtimeWeeklyHours?: number | null
  /** Short notes for the UI and for legal review. */
  notes: string[]
  /** Pack version, bumped whenever a value changes. */
  version: number
}

export type ShiftKind = 'regular' | 'trial' | 'event'

export interface Member {
  id: string
  name: string
  roleIds?: string[]
  /** Contracted / target weekly hours (used for fairness, Phase 2). */
  targetHours?: number | null
  /** Personal hard cap on weekly hours (contract). */
  maxHours?: number | null
  hourlyRate?: number | null
  /** Senior staff can supervise trial shifts. Defaults to true for non-trial members. */
  senior?: boolean
}

export interface Shift {
  id: string
  memberId: string | null // null = open shift
  date: ISODate // the date the shift STARTS on
  start: HHMM
  end: HHMM // end <= start means the shift ends the next day
  roleId?: string | null
  breakMinutes?: number
  kind?: ShiftKind
  locked?: boolean
}

export interface AvailabilityWindow {
  memberId: string
  date: ISODate
  start: HHMM
  end: HHMM
  kind?: 'available' | 'preferred'
}

export interface TimeOff {
  memberId: string
  startDate: ISODate
  endDate: ISODate // inclusive
}

export interface OpeningHours {
  /** 0 = Monday … 6 = Sunday */
  weekday: number
  open: HHMM
  close: HHMM
}

export type TeamRule =
  | { type: 'cant_work_with'; a: string; b: string; hard?: boolean }
  | { type: 'cant_be_alone'; memberId: string }
  | { type: 'required_on_shift'; memberId: string; weekday: number; start: HHMM; end: HHMM }
  | { type: 'max_shifts_week'; memberId: string; max: number }

export interface ScheduleInput {
  periodStart: ISODate
  periodEnd: ISODate // inclusive
  rulePack: RulePack
  members: Member[]
  shifts: Shift[]
  availability?: AvailabilityWindow[]
  /** When false, availability is not checked (e.g. imported historical rotas). */
  checkAvailability?: boolean
  timeOff?: TimeOff[]
  openingHours?: OpeningHours[]
  closures?: ISODate[]
  /** Minimum non-trial people on shift whenever the business is open. */
  minStaffWhileOpen?: number
  minShiftHours?: number
  maxShiftHours?: number
  rules?: TeamRule[]
}

export type ViolationCode =
  | 'overlap'
  | 'unavailable'
  | 'time_off'
  | 'missing_role'
  | 'min_rest'
  | 'max_daily_hours'
  | 'max_weekly_hours'
  | 'contract_max_hours'
  | 'weekly_rest'
  | 'break_required'
  | 'shift_too_short'
  | 'shift_too_long'
  | 'max_shifts_week'
  | 'cant_work_with'
  | 'cant_be_alone'
  | 'required_on_shift'
  | 'trial_unsupervised'
  | 'below_min_staff'
  | 'unknown_member'

export interface Violation {
  code: ViolationCode
  /** Shifts involved (ids). */
  shiftIds: string[]
  memberId?: string | null
  /** Human-readable explanation, English (UI translates by code + params). */
  message: string
  params?: Record<string, string | number>
}

export interface ValidationResult {
  ok: boolean
  violations: Violation[]
}
