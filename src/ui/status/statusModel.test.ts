import { describe, expect, it } from 'vitest'
import type { GrantEvent } from '../../types'
import {
  PLACEHOLDER_SITE,
  WINDOW_MS,
  bufferCoverageStart,
  formatAge,
  formatClock,
  formatCount,
  formatDelta,
  grantDelta,
  hasDeltaCoverage,
  isCompactWidth,
  isStale,
  lastGrant,
  lastP25,
  siteText,
} from './statusModel'

const NOW = 1_800_000_000_000
const MIN = 60_000

function grant(timestamp: number, extra: Partial<GrantEvent> = {}): GrantEvent {
  return {
    type: 'GRANT',
    raw: '',
    timestamp,
    grantType: 'TG',
    id: 1,
    ...extra,
  } as GrantEvent
}

describe('formatClock', () => {
  it('prints local HH:MM:SS with leading zeros', () => {
    expect(formatClock(new Date(2026, 9, 10, 9, 5, 7).getTime())).toBe('09:05:07')
  })
})

describe('formatAge', () => {
  it('uses seconds, then minutes and seconds', () => {
    expect(formatAge(0)).toBe('0 s')
    expect(formatAge(4_000)).toBe('4 s')
    expect(formatAge(59_999)).toBe('59 s')
    expect(formatAge(72_000)).toBe('1 m 12 s')
  })

  it('switches to hours and minutes past an hour', () => {
    expect(formatAge(3_600_000)).toBe('1 h 0 m')
    expect(formatAge(3_900_000)).toBe('1 h 5 m')
  })

  it('reads negative spans from clock skew as 0 s', () => {
    expect(formatAge(-5_000)).toBe('0 s')
  })
})

describe('isStale', () => {
  it('is false at exactly 60 s and true after', () => {
    expect(isStale(60_000)).toBe(false)
    expect(isStale(60_001)).toBe(true)
  })
})

describe('formatCount', () => {
  it('groups thousands in en-US form', () => {
    expect(formatCount(1204)).toBe('1,204')
    expect(formatCount(0)).toBe('0')
  })
})

describe('siteText', () => {
  it('shows the placeholder while no site is known', () => {
    expect(siteText('')).toBe(PLACEHOLDER_SITE)
    expect(siteText('   ')).toBe(PLACEHOLDER_SITE)
    expect(siteText(PLACEHOLDER_SITE)).toBe(PLACEHOLDER_SITE)
    expect(siteText(null)).toBe(PLACEHOLDER_SITE)
  })

  it('shows a set site ID as stored', () => {
    expect(siteText('01F4')).toBe('01F4')
  })
})

describe('bufferCoverageStart and hasDeltaCoverage', () => {
  it('starts at the session start while the buffer is not full', () => {
    const start = NOW - 30 * MIN
    expect(bufferCoverageStart([grant(NOW - MIN)], start, 200)).toBe(start)
  })

  it('starts at the oldest held grant once the buffer is full', () => {
    const grants = [grant(NOW - MIN), grant(NOW - 12 * MIN), grant(NOW - 3 * MIN)]
    expect(bufferCoverageStart(grants, NOW - 60 * MIN, 3)).toBe(NOW - 12 * MIN)
  })

  it('covers 10 minutes or more and no less', () => {
    expect(hasDeltaCoverage(NOW, NOW - 10 * MIN)).toBe(true)
    expect(hasDeltaCoverage(NOW, NOW - 10 * MIN + 1)).toBe(false)
  })

  it('withholds the delta for a young session', () => {
    const start = NOW - 3 * MIN
    const coverage = bufferCoverageStart([grant(NOW - MIN)], start, 200)
    expect(hasDeltaCoverage(NOW, coverage)).toBe(false)
  })
})

describe('grantDelta', () => {
  it('compares the last 5 minutes with the 5 minutes before', () => {
    const grants = [
      grant(NOW - 1 * MIN),
      grant(NOW - 4 * MIN),
      grant(NOW - 5 * MIN), // exactly 5 minutes old: in the prior window
      grant(NOW - 7 * MIN),
      grant(NOW - 11 * MIN), // outside both windows
    ]
    expect(grantDelta(grants, NOW)).toEqual({ current: 2, prior: 2, delta: 0 })
  })

  it('reports a negative delta when the prior window was busier', () => {
    const grants = [grant(NOW - 6 * MIN), grant(NOW - 7 * MIN), grant(NOW - 8 * MIN), grant(NOW - MIN)]
    expect(grantDelta(grants, NOW)).toEqual({ current: 1, prior: 3, delta: -2 })
  })

  it('counts a grant stamped a moment after now as current', () => {
    expect(grantDelta([grant(NOW + 500)], NOW).current).toBe(1)
    expect(WINDOW_MS).toBe(5 * MIN)
  })
})

describe('formatDelta', () => {
  it('signs positive and negative values and marks zero', () => {
    expect(formatDelta(3)).toBe('+3')
    expect(formatDelta(-2)).toBe('−2')
    expect(formatDelta(0)).toBe('±0')
  })
})

describe('lastGrant', () => {
  const names: Record<string, string> = { '500': 'Dispatch A' }
  const nameFor = (id: string) => names[id]

  it('is null with no grants', () => {
    expect(lastGrant([], NOW, nameFor)).toBeNull()
  })

  it('reads the newest grant at index 0 with its name and age', () => {
    const view = lastGrant(
      [grant(NOW - 72_000, { talkgroupId: '500', grantType: 'ICALL' }), grant(NOW - 1_000, { talkgroupId: '9' })],
      NOW,
      nameFor,
    )
    expect(view).toEqual({ idText: '500', grantType: 'ICALL', name: 'Dispatch A', ageMs: 72_000 })
  })

  it('names an unknown talkgroup without a DB entry', () => {
    const view = lastGrant([grant(NOW, { talkgroupId: '777' })], NOW, nameFor)
    expect(view?.name).toBe('Unknown talkgroup')
  })

  it('shows unit calls by their ID as emitted', () => {
    const view = lastGrant([grant(NOW, { unitId: '00A1B2', grantType: 'UNKNOWN' })], NOW, nameFor)
    expect(view).toEqual({ idText: '00A1B2', grantType: 'UNKNOWN', name: 'Unit call', ageMs: 0 })
  })
})

describe('lastP25', () => {
  it('is null with no cards', () => {
    expect(lastP25([], NOW)).toBeNull()
  })

  it('picks the card with the newest lastSeen, whatever its position', () => {
    const cards = [
      { tgid: '312', name: 'Dispatch 1', lastSeen: NOW - 40_000 },
      { tgid: '401', name: 'Tac 4', lastSeen: NOW - 5_000 },
      { tgid: '205', name: 'Fire', lastSeen: NOW - 90_000 },
    ]
    expect(lastP25(cards, NOW)).toEqual({ tgid: '401', name: 'Tac 4', ageMs: 5_000 })
  })

  it('falls back to a placeholder name', () => {
    expect(lastP25([{ tgid: '1', name: '', lastSeen: NOW }], NOW)?.name).toBe('Unknown TG')
  })
})

describe('isCompactWidth', () => {
  it('is compact at 639 px and wider only from 640 px', () => {
    expect(isCompactWidth(639)).toBe(true)
    expect(isCompactWidth(640)).toBe(false)
    expect(isCompactWidth(390)).toBe(true)
  })
})
