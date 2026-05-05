// Pure schedule logic: lane assignment, coverage, conflicts, segment grouping.
// No React. Reused by Timeline / Compact / Coverage views.
import { toMins, toTime } from './utils'

export const COVERAGE_GRANULARITY = 15 // minutes per coverage cell

// ───────── Lane + cluster assignment (FullCalendar / Google Calendar pattern) ─────────
// A "cluster" is a group of shifts that transitively overlap. Cluster size is the
// max concurrent overlap inside the cluster — that's the width divisor used at render
// time, NOT the day-wide max. Non-overlapping shifts get a fresh cluster of size 1
// and render full-width. O(n log n).
export function assignLanes(dayShifts){
  const sorted = [...(dayShifts || [])].sort((a, b) => {
    const da = toMins(a.start_time) - toMins(b.start_time)
    if (da !== 0) return da
    return toMins(a.end_time) - toMins(b.end_time)
  })
  const result = []
  let cluster = null
  let clusterEnd = -Infinity

  function startCluster(){
    cluster = { shifts: [], laneEnds: [] }
  }
  function finalizeCluster(){
    if (!cluster) return
    const size = cluster.laneEnds.length
    for (const s of cluster.shifts) s._clusterSize = size
    cluster = null
  }

  for (const sh of sorted) {
    const s = toMins(sh.start_time), e = toMins(sh.end_time)
    if (s >= clusterEnd) {
      finalizeCluster()
      startCluster()
      clusterEnd = e
    } else {
      clusterEnd = Math.max(clusterEnd, e)
    }
    // Greedy lane within the cluster
    let lane = -1
    for (let i = 0; i < cluster.laneEnds.length; i++) {
      if (cluster.laneEnds[i] <= s) { lane = i; break }
    }
    if (lane < 0) { lane = cluster.laneEnds.length; cluster.laneEnds.push(e) }
    else cluster.laneEnds[lane] = e
    const tagged = { ...sh, _lane: lane, _startM: s, _endM: e, _clusterSize: 1 }
    cluster.shifts.push(tagged)
    result.push(tagged)
  }
  finalizeCluster()

  const laneCount = result.reduce((m, s) => Math.max(m, s._clusterSize), 0)
  return { shifts: result, laneCount }
}

// ───────── Coverage matrix ─────────
// Returns { matrix[day][slot] = {covered, required, state}, slotCount, axisStart, granularity }
// state ∈ 'none' | 'staffed' | 'critical' | 'under' | 'ok' | 'over'
export function buildCoverageMatrix(shifts, staffingReqs, axisStart, axisEnd, granularity = COVERAGE_GRANULARITY){
  const slotCount = Math.max(0, Math.ceil((axisEnd - axisStart) / granularity))
  const matrix = Array.from({length: 7}, () =>
    Array.from({length: slotCount}, () => ({ covered: 0, required: 0, state: 'none' }))
  )

  // shifts is either a flat array OR an array indexed by day_index.
  const flat = Array.isArray(shifts) && Array.isArray(shifts[0])
    ? shifts.flatMap((dayList, di) => (dayList || []).map(sh => ({ ...sh, day_index: di })))
    : (shifts || [])

  for (const sh of flat) {
    const s = toMins(sh.start_time), e = toMins(sh.end_time)
    const di = sh.day_index
    if (di < 0 || di > 6) continue
    const lo = Math.max(s, axisStart), hi = Math.min(e, axisEnd)
    for (let m = lo; m < hi; m += granularity) {
      const slot = Math.floor((m - axisStart) / granularity)
      if (matrix[di][slot]) matrix[di][slot].covered++
    }
  }

  for (const req of (staffingReqs || [])) {
    const s = toMins(req.start_time), e = toMins(req.end_time)
    const di = req.day_index
    if (di < 0 || di > 6) continue
    const lo = Math.max(s, axisStart), hi = Math.min(e, axisEnd)
    for (let m = lo; m < hi; m += granularity) {
      const slot = Math.floor((m - axisStart) / granularity)
      const cell = matrix[di][slot]
      if (!cell) continue
      cell.required = Math.max(cell.required, req.min_workers || 0)
    }
  }

  for (let d = 0; d < 7; d++) {
    for (let i = 0; i < slotCount; i++) {
      const c = matrix[d][i]
      if (c.required === 0) c.state = c.covered > 0 ? 'staffed' : 'none'
      else if (c.covered === 0) c.state = 'critical'
      else if (c.covered < c.required) c.state = 'under'
      else if (c.covered === c.required) c.state = 'ok'
      else c.state = 'over'
    }
  }
  return { matrix, slotCount, axisStart, granularity }
}

// ───────── Conflict detection ─────────
// Same person scheduled in two overlapping shifts (same org or pair-of-orgs externally).
// Insufficient rest: < restMinHours between the end of a shift and start of next.
export function detectConflicts(shifts, opts = {}){
  const { restMinHours = 8, weeklyMaxHours = 48 } = opts
  const flat = Array.isArray(shifts) && Array.isArray(shifts[0])
    ? shifts.flatMap((d, di) => (d || []).map(s => ({ ...s, day_index: di })))
    : (shifts || [])

  const conflicts = new Set() // shift IDs that have at least one conflict
  const reasons = {}          // shiftId -> array of reason strings

  // Group by person
  const byPerson = {}
  for (const sh of flat) {
    const k = sh.user_id || sh.name
    if (!k) continue
    if (!byPerson[k]) byPerson[k] = []
    byPerson[k].push(sh)
  }

  for (const k of Object.keys(byPerson)) {
    const list = byPerson[k]
      .map(s => ({ ...s, _s: s.day_index * 24 * 60 + toMins(s.start_time), _e: s.day_index * 24 * 60 + toMins(s.end_time) }))
      .sort((a, b) => a._s - b._s)

    // Overlap
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[j]._s >= list[i]._e) break
        ;[list[i], list[j]].forEach(s => {
          const id = s.id || s._s
          conflicts.add(id)
          ;(reasons[id] ||= []).push('double-booked')
        })
      }
    }

    // Insufficient rest
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1], cur = list[i]
      if (cur._s - prev._e < restMinHours * 60 && cur._s - prev._e > 0) {
        ;[prev, cur].forEach(s => {
          const id = s.id || s._s
          conflicts.add(id)
          ;(reasons[id] ||= []).push(`<${restMinHours}h rest`)
        })
      }
    }

    // Weekly max
    const weekly = list.reduce((acc, s) => acc + (s._e - s._s), 0) / 60
    if (weekly > weeklyMaxHours) {
      list.forEach(s => {
        const id = s.id || s._s
        conflicts.add(id)
        ;(reasons[id] ||= []).push('overtime')
      })
    }
  }

  return { conflicts, reasons }
}

// ───────── Status derivation ─────────
// Uses schedule + shift state + conflict pass. Identity is OUT, semantics are IN.
export function deriveStatus(shift, ctx = {}){
  const { published = false, conflictsSet = new Set(), reasons = {} } = ctx
  if (conflictsSet.has(shift.id)) {
    const r = reasons[shift.id] || []
    if (r.includes('overtime')) return 'overtime'
    return 'conflict'
  }
  if (!shift.user_id) return 'open'
  if (published) return 'confirmed'
  return 'pending'
}

export const STATUS_LABEL = {
  confirmed: 'Confirmed',
  pending:   'Pending',
  conflict:  'Conflict',
  open:      'Open shift',
  overtime:  'Overtime',
}

// ───────── Compact / segment grouping ─────────
export const SEGMENTS = [
  { key: 'morning',   label: 'Morning',   start: '06:00', end: '12:00' },
  { key: 'midday',    label: 'Midday',    start: '12:00', end: '15:00' },
  { key: 'afternoon', label: 'Afternoon', start: '15:00', end: '18:00' },
  { key: 'evening',   label: 'Evening',   start: '18:00', end: '23:59' },
]

export function shiftFitsSegment(sh, seg){
  const s = toMins(sh.start_time), e = toMins(sh.end_time)
  const ss = toMins(seg.start), se = toMins(seg.end)
  return s < se && e > ss
}

export function totalHours(shifts){
  return (shifts || []).reduce((acc, s) => acc + (toMins(s.end_time) - toMins(s.start_time)) / 60, 0)
}
