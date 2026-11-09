// ShiftSync scheduling engine — public API.
// Phase 1: types, time helpers, rule packs and the independent validator.
// Phase 2 adds generate() (Stage A: demand → open shifts, Stage B: assignment).

export * from './types'
export * from './time'
export { RULE_PACKS, getRulePack, withOverrides, requiredBreakMinutes } from './rulePacks'
export { validateSchedule, hoursByMember } from './validate'
