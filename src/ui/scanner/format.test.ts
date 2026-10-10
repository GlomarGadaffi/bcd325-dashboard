import { describe, expect, it } from 'vitest'
import { formatAge, formatClock } from './format'

describe('formatClock', () => {
  it('prints local HH:MM:SS with leading zeros', () => {
    expect(formatClock(new Date(2026, 9, 10, 9, 5, 7).getTime())).toBe('09:05:07')
    expect(formatClock(new Date(2026, 9, 10, 23, 59, 59).getTime())).toBe('23:59:59')
  })
})

describe('formatAge', () => {
  it('uses the one age format: seconds, then minutes and seconds', () => {
    expect(formatAge(0)).toBe('0 s')
    expect(formatAge(4000)).toBe('4 s')
    expect(formatAge(59_999)).toBe('59 s')
    expect(formatAge(72_000)).toBe('1 m 12 s')
    expect(formatAge(60_000)).toBe('1 m 0 s')
  })

  it('reads a negative span from clock skew as 0 s', () => {
    expect(formatAge(-5000)).toBe('0 s')
  })
})
