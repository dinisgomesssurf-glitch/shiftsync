import { describe, expect, it } from 'vitest'
import { addDays, isCovered, shiftInterval, shiftSpan, weekStartOf, weekdayOf } from '../time'

describe('time helpers', () => {
  it('measures overnight shifts', () => {
    expect(shiftSpan({ start: '22:00', end: '04:00' })).toBe(360)
    expect(shiftSpan({ start: '08:30', end: '14:00' })).toBe(330)
  })
  it('places shifts on an absolute timeline', () => {
    expect(shiftInterval({ date: '2026-05-05', start: '22:00', end: '04:00' }, '2026-05-04')).toEqual({ s: 1440 + 1320, e: 1440 + 1680 })
  })
  it('handles weeks starting Monday or Sunday', () => {
    expect(weekdayOf('2026-05-04')).toBe(0) // Monday
    expect(weekStartOf('2026-05-07')).toBe('2026-05-04')
    expect(weekStartOf('2026-05-07', 6)).toBe('2026-05-03') // Sunday start
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  it('checks coverage by a union of intervals', () => {
    expect(isCovered({ s: 10, e: 50 }, [{ s: 0, e: 20 }, { s: 20, e: 60 }])).toBe(true)
    expect(isCovered({ s: 10, e: 50 }, [{ s: 0, e: 20 }, { s: 25, e: 60 }])).toBe(false)
  })
})
