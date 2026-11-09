// Labour-rule presets per jurisdiction. These are STARTING POINTS: collective
// agreements (common in hospitality) can change them, so every value is
// editable per business. Each pack must be reviewed by a local lawyer before
// launch in that jurisdiction. Sources are listed in the v2 spec.

import type { Jurisdiction, RulePack } from './types'

export const RULE_PACKS: Record<Jurisdiction, RulePack> = {
  PT: {
    jurisdiction: 'PT', name: 'Portugal', version: 1,
    minRestHours: 11, maxDailyHours: 8, maxWeeklyHours: 40, weeklyRestHours: 24,
    // Art. 213: 1–2h interval so that no more than 5 consecutive hours are worked.
    breaks: [{ overHours: 5, minutes: 60 }],
    notes: ['Collective agreements may allow 6 consecutive hours and a shorter interval.'],
  },
  ES: {
    jurisdiction: 'ES', name: 'Spain', version: 1,
    minRestHours: 12, maxDailyHours: 9, maxWeeklyHours: 40, weeklyRestHours: 36,
    breaks: [{ overHours: 6, minutes: 15 }],
    notes: ['40h is an annual average; 9h/day unless a collective agreement says otherwise.'],
  },
  FR: {
    jurisdiction: 'FR', name: 'France', version: 1,
    minRestHours: 11, maxDailyHours: 10, maxWeeklyHours: 48, weeklyRestHours: 35,
    breaks: [{ overHours: 6, minutes: 20, inclusive: true }],
    overtimeWeeklyHours: 35,
    notes: ['Legal week is 35h; hours above are overtime.'],
  },
  DE: {
    jurisdiction: 'DE', name: 'Germany', version: 1,
    minRestHours: 11, maxDailyHours: 10, maxWeeklyHours: 48, weeklyRestHours: 24,
    breaks: [{ overHours: 6, minutes: 30 }, { overHours: 9, minutes: 45 }],
    notes: ['8h/day normally; up to 10h if the 6-month average stays at 8h.'],
  },
  'CA-QC': {
    jurisdiction: 'CA-QC', name: 'Canada — Quebec', version: 1,
    minRestHours: null, maxDailyHours: null, maxWeeklyHours: null, weeklyRestHours: 32,
    breaks: [{ overHours: 5, minutes: 30 }],
    overtimeWeeklyHours: 40,
    notes: ['No general daily rest rule; employees may refuse more than 14h in 24h or 2h beyond their regular day.'],
  },
  'CA-ON': {
    jurisdiction: 'CA-ON', name: 'Canada — Ontario', version: 1,
    minRestHours: 11, maxDailyHours: 8, maxWeeklyHours: 48, weeklyRestHours: 24,
    breaks: [{ overHours: 5, minutes: 30 }],
    overtimeWeeklyHours: 44,
    notes: ['Daily/weekly limits can be exceeded with a written agreement; weekly rest may be 48h every 2 weeks.'],
  },
  'CA-BC': {
    jurisdiction: 'CA-BC', name: 'Canada — British Columbia', version: 1,
    minRestHours: 8, maxDailyHours: null, maxWeeklyHours: null, weeklyRestHours: 32,
    breaks: [{ overHours: 5, minutes: 30 }],
    overtimeDailyHours: 8, overtimeWeeklyHours: 40,
    notes: ['Overtime after 8h/day or 40h/week; double time after 12h/day.'],
  },
}

export function getRulePack(j: Jurisdiction): RulePack {
  const pack = RULE_PACKS[j] || RULE_PACKS[j.split('-')[0]]
  if (!pack) throw new Error(`No rule pack for jurisdiction "${j}"`)
  return pack
}

/** A business's pack = preset + its own overrides. */
export function withOverrides(pack: RulePack, overrides: Partial<RulePack> = {}): RulePack {
  return { ...pack, ...overrides, breaks: overrides.breaks ?? pack.breaks, notes: pack.notes }
}

/** Break minutes required for a worked span (minutes). */
export function requiredBreakMinutes(pack: RulePack, spanMinutes: number): number {
  let need = 0
  for (const r of pack.breaks) {
    const limit = r.overHours * 60
    const applies = r.inclusive ? spanMinutes >= limit : spanMinutes > limit
    if (applies) need = Math.max(need, r.minutes)
  }
  return need
}
