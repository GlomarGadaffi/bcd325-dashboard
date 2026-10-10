import { describe, expect, it, vi } from 'vitest'
import type { GrantEvent } from '../../types'
import {
  AWAITING_SITE,
  BUCKET_STEPS_MS,
  bucketCount,
  bucketLabel,
  bucketRangeText,
  bucketTooltip,
  bucketWidthMs,
  buildHistogram,
  buildRug,
  captionText,
  countNewer,
  coveredSpan,
  createViewCache,
  filterWindow,
  feedEmptyText,
  formatAge,
  formatChannel,
  formatClock,
  idealBucketMs,
  inWindow,
  isStale,
  isWindowId,
  laneTooltip,
  lcnSortValue,
  niceMax,
  parseWindow,
  passesFilters,
  segmentsOf,
  siteIsSet,
  snapBucketMs,
  timePosition,
  toGrantView,
  usesHistogram,
  allOn,
  AGENCY_KEYS,
  TYPE_KEYS,
  type AgencyInfoLike,
  type GrantView,
} from './callsModel'

// Fixtures. DB entries are synthetic; the shape matches src/core/AgencyDB.ts.
const DB_FIXTURE: Record<string, AgencyInfoLike> = {
  '500': { a: 'FHP', n: 'FHP Dispatch' },
  '11': { a: 'INT', n: 'IA-11 Pensacola' },
  '777': { a: 'TEC', n: 'TEC Ops' },
  '900': { a: 'XYZ', n: 'Odd agency' },
}
const lookup = (id: string) => DB_FIXTURE[id]

// Epoch-aligned to five minutes, so bucket boundaries are easy to reason about.
const BASE = Date.UTC(2026, 9, 10, 18, 0, 0)

function grant(partial: Partial<GrantEvent> & { id: number; timestamp: number }): GrantEvent {
  return { type: 'GRANT', raw: '', grantType: 'TG', ...partial } as GrantEvent
}

function view(partial: Partial<GrantEvent> & { id: number; timestamp: number }): GrantView {
  return toGrantView(grant(partial), lookup)
}

describe('formatClock', () => {
  it('prints local HH:MM:SS with zero padding', () => {
    expect(formatClock(new Date(2026, 9, 10, 14, 2, 33).getTime())).toBe('14:02:33')
    expect(formatClock(new Date(2026, 9, 10, 0, 0, 0).getTime())).toBe('00:00:00')
  })
})

describe('formatAge', () => {
  it.each([
    [0, '0 s'],
    [4_000, '4 s'],
    [59_999, '59 s'],
    [60_000, '1 m 0 s'],
    [72_000, '1 m 12 s'],
    [3_599_000, '59 m 59 s'],
    [3_600_000, '1 h 0 m'],
    [3_900_000, '1 h 5 m'],
    [-500, '0 s'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatAge(ms)).toBe(text)
  })
})

describe('isStale', () => {
  it('is stale only after 60 seconds, not at exactly 60', () => {
    expect(isStale(60_000)).toBe(false)
    expect(isStale(60_001)).toBe(true)
    expect(isStale(0)).toBe(false)
  })
})

describe('windows', () => {
  const now = 1_000_000_000

  it('recognises and parses window IDs, defaulting to 5 m', () => {
    expect(isWindowId('60m')).toBe(true)
    expect(isWindowId('90m')).toBe(false)
    expect(parseWindow('buffer')).toBe('buffer')
    expect(parseWindow('nonsense')).toBe('5m')
    expect(parseWindow(null)).toBe('5m')
  })

  it('keeps grants inside 5 m, including exactly at the edge', () => {
    expect(inWindow(now - 300_000, '5m', now)).toBe(true)
    expect(inWindow(now - 300_001, '5m', now)).toBe(false)
  })

  it('keeps grants inside 60 m and everything in the buffer window', () => {
    expect(inWindow(now - 3_600_000, '60m', now)).toBe(true)
    expect(inWindow(now - 3_600_001, '60m', now)).toBe(false)
    expect(inWindow(now - 99_999_999, 'buffer', now)).toBe(true)
  })

  it('filters a list while keeping its order', () => {
    const items = [{ timestamp: now - 1 }, { timestamp: now - 400_000 }, { timestamp: now - 2 }]
    expect(filterWindow(items, '5m', now)).toEqual([items[0], items[2]])
  })
})

describe('toGrantView', () => {
  it('names a talkgroup from the DB and keeps its decimal ID and FHP segment', () => {
    const v = toGrantView(
      grant({ id: 1, timestamp: BASE, talkgroupId: '500', logicalChannel: '0A1', voiceChannel: '0B2' }),
      lookup,
    )
    expect(v.kind).toBe('talkgroup')
    expect(v.idText).toBe('500')
    expect(v.name).toBe('FHP Dispatch')
    expect(v.agency).toBe('FHP')
    expect(v.slot).toBe('FHP')
    expect(v.channel).toBe('0A1→0B2')
    expect(v.lcn).toBe('0A1')
    expect(v.vc).toBe('0B2')
  })

  it('shows Unknown ID and UNK for a talkgroup with no DB entry, in the neutral slot', () => {
    const v = view({ id: 2, timestamp: BASE, talkgroupId: '4242' })
    expect(v.name).toBe('Unknown ID')
    expect(v.agency).toBe('UNK')
    expect(v.slot).toBe('NEUTRAL')
    expect(v.idText).toBe('4242')
  })

  it('treats a DB agency outside the six as UNK while keeping its name', () => {
    const v = view({ id: 3, timestamp: BASE, talkgroupId: '900' })
    expect(v.name).toBe('Odd agency')
    expect(v.agency).toBe('UNK')
    expect(v.slot).toBe('NEUTRAL')
  })

  it('names a unit call "Unit NNN" with the hex ID as emitted, in the neutral slot', () => {
    const v = view({ id: 4, timestamp: BASE, unitId: '00A1B2', grantType: 'ICALL' })
    expect(v.kind).toBe('unit')
    expect(v.name).toBe('Unit 00A1B2')
    expect(v.idText).toBe('00A1B2')
    expect(v.agency).toBe('UNIT')
    expect(v.slot).toBe('NEUTRAL')
    expect(v.type).toBe('ICALL')
  })

  it('handles a grant with no talkgroup and no unit', () => {
    const v = view({ id: 5, timestamp: BASE, logicalChannel: '0A5' })
    expect(v.kind).toBe('none')
    expect(v.name).toBe('Unknown ID')
    expect(v.idText).toBe('—')
    expect(v.agency).toBe('UNK')
    expect(v.channel).toBe('0A5→—')
  })

  it('maps an unexpected grant type to UNKNOWN and keeps CPT', () => {
    expect(view({ id: 6, timestamp: BASE, grantType: 'XYZ' as GrantEvent['grantType'] }).type).toBe('UNKNOWN')
    expect(view({ id: 7, timestamp: BASE, grantType: 'CPT' }).type).toBe('CPT')
  })

  it('prints local time', () => {
    const ts = new Date(2026, 9, 10, 9, 5, 7).getTime()
    expect(view({ id: 8, timestamp: ts }).time).toBe('09:05:07')
  })
})

describe('formatChannel', () => {
  it('prints LCN to VC in hex, with dashes for missing parts', () => {
    expect(formatChannel('0A1', '0B2')).toBe('0A1→0B2')
    expect(formatChannel('0A1', null)).toBe('0A1→—')
    expect(formatChannel(null, '0B2')).toBe('—→0B2')
    expect(formatChannel(null, null)).toBe('—')
  })
})

describe('createViewCache', () => {
  it('returns the same view object for the same grant and converts it once', () => {
    const spy = vi.fn(lookup)
    const cached = createViewCache(spy)
    const g = grant({ id: 9, timestamp: BASE, talkgroupId: '500' })
    const first = cached(g)
    const second = cached(g)
    expect(second).toBe(first)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('filters', () => {
  const v = view({ id: 10, timestamp: BASE, talkgroupId: '500', grantType: 'TG' })

  it('passes when the agency and type are both on', () => {
    expect(passesFilters(v, allOn(AGENCY_KEYS), allOn(TYPE_KEYS))).toBe(true)
  })

  it('hides a row whose agency is off, and a row whose type is off', () => {
    expect(passesFilters(v, { ...allOn(AGENCY_KEYS), FHP: false }, allOn(TYPE_KEYS))).toBe(false)
    expect(passesFilters(v, allOn(AGENCY_KEYS), { ...allOn(TYPE_KEYS), TG: false })).toBe(false)
  })
})

describe('countNewer', () => {
  it('counts only grants with an ID above the frozen top', () => {
    const views = [view({ id: 12, timestamp: BASE }), view({ id: 11, timestamp: BASE }), view({ id: 5, timestamp: BASE })]
    expect(countNewer(views, 11)).toBe(1)
    expect(countNewer(views, 0)).toBe(3)
    expect(countNewer(views, 12)).toBe(0)
  })
})

describe('feed empty text', () => {
  const base = { siteId: '01F4', bufferCount: 0, windowCount: 0, visibleCount: 0 }

  it('returns null when there are visible rows', () => {
    expect(feedEmptyText({ ...base, bufferCount: 3, windowCount: 3, visibleCount: 3 })).toBeNull()
  })

  it('says the site is locked when the site is set and the buffer is empty', () => {
    expect(feedEmptyText(base)).toBe('Site 01F4 locked. Waiting for voice grants.')
  })

  it('does not claim a lock before the site is known', () => {
    expect(feedEmptyText({ ...base, siteId: AWAITING_SITE })).toBe('No grants in this window.')
  })

  it('says no grants in this window when the window is empty but the buffer is not', () => {
    expect(feedEmptyText({ ...base, bufferCount: 9, windowCount: 0 })).toBe('No grants in this window.')
  })

  it('says filters hide everything when the window has grants', () => {
    expect(feedEmptyText({ ...base, bufferCount: 9, windowCount: 4 })).toBe('No grants match these filters.')
  })

  it('treats an empty site ID as not set', () => {
    expect(siteIsSet('')).toBe(false)
    expect(siteIsSet(AWAITING_SITE)).toBe(false)
    expect(siteIsSet('01F4')).toBe(true)
  })
})

describe('covered span and caption', () => {
  it('covers the first to the last grant, regardless of order', () => {
    const views = [view({ id: 3, timestamp: BASE + 90_000 }), view({ id: 2, timestamp: BASE }), view({ id: 1, timestamp: BASE + 30_000 })]
    expect(coveredSpan(views)).toEqual({ start: BASE, end: BASE + 90_000, count: 3 })
    expect(coveredSpan([])).toBeNull()
  })

  it('prints the span as HH:MM:SS with a plural count, never "last hour"', () => {
    const start = new Date(2026, 9, 10, 14, 2, 10).getTime()
    const end = new Date(2026, 9, 10, 14, 19, 55).getTime()
    expect(captionText({ start, end, count: 200 })).toBe('14:02:10 to 14:19:55, 200 grants')
    expect(captionText({ start, end: start, count: 1 })).toBe('14:02:10 to 14:02:10, 1 grant')
    expect(captionText(null)).toBe('No grants in this window.')
  })

  it('places a grant on the span, with a zero-length span at the right edge', () => {
    expect(timePosition(50, 0, 100)).toBe(0.5)
    expect(timePosition(0, 0, 100)).toBe(0)
    expect(timePosition(100, 0, 100)).toBe(1)
    expect(timePosition(50, 50, 50)).toBe(1)
    expect(timePosition(-10, 0, 100)).toBe(0)
  })
})

describe('bucket width', () => {
  it('clamps span / 50 to the 10 s and 5 min limits', () => {
    expect(idealBucketMs(0)).toBe(10_000)
    expect(idealBucketMs(300_000)).toBe(10_000)
    expect(idealBucketMs(1_020_000)).toBeCloseTo(20_400)
    expect(idealBucketMs(100_000_000)).toBe(300_000)
  })

  it('snaps to the nearest allowed step on a log scale', () => {
    expect(snapBucketMs(10_000)).toBe(10_000)
    expect(snapBucketMs(14_400)).toBe(10_000)
    expect(snapBucketMs(20_400)).toBe(30_000)
    expect(snapBucketMs(72_000)).toBe(60_000)
    expect(snapBucketMs(200_000)).toBe(300_000)
  })

  it('uses only allowed steps', () => {
    for (const span of [0, 10_000, 500_000, 1_020_000, 3_600_000, 36_000_000]) {
      expect(BUCKET_STEPS_MS).toContain(bucketWidthMs(BASE, BASE + span))
    }
  })

  it('keeps the desktop width when no cap is given', () => {
    expect(bucketWidthMs(BASE, BASE + 1_020_000)).toBe(30_000)
    expect(bucketWidthMs(BASE, BASE + 3_600_000)).toBe(60_000)
  })

  it('coarsens to fit the phone cap of 40 buckets', () => {
    expect(bucketWidthMs(BASE, BASE + 10_800_000, 40)).toBe(300_000)
    expect(bucketCount(BASE, BASE + 10_800_000, 300_000)).toBeLessThanOrEqual(40)
    expect(bucketWidthMs(BASE, BASE + 3_600_000, 40)).toBe(300_000)
  })

  it('counts wall-clock buckets touched, including both ends', () => {
    expect(bucketCount(BASE, BASE, 10_000)).toBe(1)
    expect(bucketCount(BASE, BASE + 10_000, 10_000)).toBe(2)
    expect(bucketCount(BASE + 9_999, BASE + 10_000, 10_000)).toBe(2)
  })
})

describe('histogram', () => {
  it('bins 200 grants over 17 minutes into 30 s buckets, using the histogram', () => {
    const views = Array.from({ length: 200 }, (_, i) => view({ id: i + 1, timestamp: BASE + i * 5_000, talkgroupId: '500' }))
    const model = buildHistogram(views)
    expect(model.width).toBe(30_000)
    expect(model.buckets.length).toBe(34)
    expect(model.total).toBe(200)
    expect(model.buckets.reduce((sum, b) => sum + b.total, 0)).toBe(200)
    expect(usesHistogram(model)).toBe(true)
    expect(model.peakIndex).toBeGreaterThanOrEqual(0)
    expect(model.yMax).toBeGreaterThanOrEqual(model.buckets[model.peakIndex].total)
  })

  it('falls back to the rug for 20 grants over an hour, with an average under 3', () => {
    const views = Array.from({ length: 20 }, (_, i) =>
      view({ id: i + 1, timestamp: BASE + Math.round((i * 3_600_000) / 19), talkgroupId: '500' }),
    )
    const model = buildHistogram(views)
    expect(model.width).toBe(60_000)
    expect(model.total).toBe(20)
    expect(usesHistogram(model)).toBe(false)
  })

  it('has no buckets and no span for zero grants', () => {
    const model = buildHistogram([])
    expect(model.buckets).toEqual([])
    expect(model.span).toBeNull()
    expect(model.peakIndex).toBe(-1)
    expect(usesHistogram(model)).toBe(false)
  })

  it('does not use the histogram for a single grant', () => {
    const model = buildHistogram([view({ id: 1, timestamp: BASE })])
    expect(model.buckets.length).toBe(1)
    expect(usesHistogram(model)).toBe(false)
  })

  it('switches exactly at an average of three grants per bucket', () => {
    // A 10 s span gives 10 s buckets, so these land in two buckets: five then one.
    const at = buildHistogram([0, 2000, 4000, 6000, 8000, 10000].map((d, i) => view({ id: i + 1, timestamp: BASE + d, talkgroupId: '500' })))
    const below = buildHistogram([0, 2000, 4000, 6000, 10000].map((d, i) => view({ id: i + 1, timestamp: BASE + d, talkgroupId: '500' })))
    expect(at.buckets.length).toBe(2)
    expect(usesHistogram(at)).toBe(true)
    expect(below.buckets.length).toBe(2)
    expect(usesHistogram(below)).toBe(false)
  })

  it('stacks segments in fixed slot order, not by size', () => {
    // Four FHP, one INT, one TEC. Stack order is fixed, so from the base the
    // segments read FHP, INT, TEC whatever their sizes.
    const views = [
      view({ id: 1, timestamp: BASE, talkgroupId: '500' }),
      view({ id: 2, timestamp: BASE, talkgroupId: '500' }),
      view({ id: 3, timestamp: BASE, talkgroupId: '500' }),
      view({ id: 4, timestamp: BASE, talkgroupId: '500' }),
      view({ id: 5, timestamp: BASE, talkgroupId: '11' }),
      view({ id: 6, timestamp: BASE, talkgroupId: '777' }),
    ]
    const bucket = buildHistogram(views).buckets[0]
    expect(segmentsOf(bucket).map((s) => s.slot)).toEqual(['FHP', 'INT', 'TEC'])
  })

  it('puts unit calls and unidentified grants in the neutral slot, split for the tooltip', () => {
    const views = [
      view({ id: 1, timestamp: BASE, unitId: 'A1' }),
      view({ id: 2, timestamp: BASE, unitId: 'A2' }),
      view({ id: 3, timestamp: BASE, talkgroupId: '4242' }),
      view({ id: 4, timestamp: BASE, talkgroupId: '500' }),
    ]
    const bucket = buildHistogram(views).buckets[0]
    expect(bucket.slots.NEUTRAL).toBe(3)
    expect(bucket.unit).toBe(2)
    expect(bucket.unidentified).toBe(1)
    expect(bucket.agencies).toEqual([{ code: 'FHP', count: 1 }])
  })

  it('sorts agency counts by count, breaking ties in stack order', () => {
    const views = [
      view({ id: 1, timestamp: BASE, talkgroupId: '777' }),
      view({ id: 2, timestamp: BASE, talkgroupId: '777' }),
      view({ id: 3, timestamp: BASE, talkgroupId: '500' }),
      view({ id: 4, timestamp: BASE, talkgroupId: '500' }),
      view({ id: 5, timestamp: BASE, talkgroupId: '11' }),
    ]
    const bucket = buildHistogram(views).buckets[0]
    expect(bucket.agencies).toEqual([
      { code: 'FHP', count: 2 },
      { code: 'TEC', count: 2 },
      { code: 'INT', count: 1 },
    ])
  })

  it('caps the phone histogram at 40 buckets and keeps the newest', () => {
    // One grant every 5 minutes for 5 hours: 61 grants, 61 five-minute buckets.
    const views = Array.from({ length: 61 }, (_, k) => view({ id: k + 1, timestamp: BASE + k * 300_000, talkgroupId: '500' }))
    const model = buildHistogram(views, 40)
    expect(model.width).toBe(300_000)
    expect(model.buckets.length).toBe(40)
    expect(model.total).toBe(40)
    expect(model.span?.start).toBe(BASE + 21 * 300_000)
    expect(model.span?.end).toBe(BASE + 60 * 300_000)
  })

  it('keeps the full span on desktop', () => {
    const views = Array.from({ length: 61 }, (_, k) => view({ id: k + 1, timestamp: BASE + k * 300_000, talkgroupId: '500' }))
    expect(buildHistogram(views).buckets.length).toBe(61)
  })

  it('puts empty buckets between grants so the axis is continuous', () => {
    // A 2400 s span has an ideal width of 48 s, which snaps to 60 s: 41 buckets.
    const views = [view({ id: 1, timestamp: BASE }), view({ id: 2, timestamp: BASE + 2_400_000 })]
    const model = buildHistogram(views)
    expect(model.width).toBe(60_000)
    expect(model.buckets.length).toBe(41)
    expect(model.buckets[0].total).toBe(1)
    expect(model.buckets[40].total).toBe(1)
    expect(model.buckets.slice(1, 40).every((b) => b.total === 0)).toBe(true)
  })

  it('picks a nice axis maximum', () => {
    expect(niceMax(0)).toBe(1)
    expect(niceMax(1)).toBe(1)
    expect(niceMax(2)).toBe(2)
    expect(niceMax(3)).toBe(5)
    expect(niceMax(7)).toBe(10)
    expect(niceMax(10)).toBe(10)
    expect(niceMax(11)).toBe(20)
    expect(niceMax(47)).toBe(50)
  })
})

describe('bucket text', () => {
  it('prints the range inclusive of the last whole second', () => {
    // One grant gives a 10 s bucket, so the range ends at 14:02:09.
    const start = new Date(2026, 9, 10, 14, 2, 0).getTime()
    const views = [view({ id: 1, timestamp: start, talkgroupId: '500' })]
    const bucket = buildHistogram(views).buckets[0]
    expect(bucketRangeText(bucket)).toBe('14:02:00 to 14:02:09')
  })

  it('builds the tooltip from range, total, agencies by count and the unit split', () => {
    const start = new Date(2026, 9, 10, 14, 2, 0).getTime()
    const views = [
      ...Array.from({ length: 5 }, (_, i) => view({ id: i + 1, timestamp: start + i * 1000, talkgroupId: '500' })),
      ...Array.from({ length: 4 }, (_, i) => view({ id: i + 10, timestamp: start + i * 1000, talkgroupId: '11' })),
      ...Array.from({ length: 2 }, (_, i) => view({ id: i + 20, timestamp: start + i * 1000, talkgroupId: '777' })),
      view({ id: 30, timestamp: start, unitId: 'A1' }),
      view({ id: 31, timestamp: start, talkgroupId: '4242' }),
    ]
    const bucket = buildHistogram(views, 40).buckets[0]
    expect(bucket.total).toBe(13)
    expect(bucketTooltip(bucket)).toBe(
      '14:02:00 to 14:02:09: 13 grants. FHP 5, INT 4, TEC 2. Unit 1, unidentified 1.',
    )
    expect(bucketLabel(bucket)).toBe('13 grants, 14:02:00 to 14:02:09')
  })

  it('uses the singular for one grant', () => {
    const bucket = buildHistogram([view({ id: 1, timestamp: BASE, talkgroupId: '500' })]).buckets[0]
    expect(bucketTooltip(bucket)).toMatch(/: 1 grant\. FHP 1\./)
  })
})

describe('event rug', () => {
  const span0 = new Date(2026, 9, 10, 14, 0, 0).getTime()
  const lcnMap: [string, string][] = [
    ['9', '1A0'],
    ['10', '1B0'],
    ['0A1', '0B2'],
  ]

  it('makes one lane per LCN in numeric order, labelled from the LCN map', () => {
    const views = [
      view({ id: 1, timestamp: span0, logicalChannel: '0A1', talkgroupId: '500' }),
      view({ id: 2, timestamp: span0 + 60_000, logicalChannel: '10', talkgroupId: '500' }),
      view({ id: 3, timestamp: span0 + 120_000, logicalChannel: '9', talkgroupId: '500' }),
    ]
    const rug = buildRug(views, lcnMap)
    expect(rug.lanes.map((l) => l.label)).toEqual([
      'LCN 9 to VC 1A0',
      'LCN 10 to VC 1B0',
      'LCN 0A1 to VC 0B2',
    ])
  })

  it('counts grants per lane, keeps the last grant time and places ticks on the span', () => {
    const views = [
      view({ id: 1, timestamp: span0, logicalChannel: '9', talkgroupId: '500' }),
      view({ id: 2, timestamp: span0 + 120_000, logicalChannel: '9', talkgroupId: '500' }),
      view({ id: 3, timestamp: span0 + 60_000, logicalChannel: '10', talkgroupId: '500' }),
    ]
    const rug = buildRug(views, lcnMap)
    const nine = rug.lanes[0]
    expect(nine.count).toBe(2)
    expect(nine.lastTs).toBe(span0 + 120_000)
    expect(nine.ticks.map((t) => t.position)).toEqual([0, 1])
    expect(rug.lanes[1].ticks[0].position).toBeCloseTo(0.5)
    expect(laneTooltip(nine)).toBe('LCN 9 to VC 1A0: 2 grants. Last grant 14:02:00.')
  })

  it('puts grants without an LCN in a last lane, and shows a dash for an unknown VC', () => {
    const views = [
      view({ id: 1, timestamp: span0, talkgroupId: '500' }),
      view({ id: 2, timestamp: span0, logicalChannel: 'AB', talkgroupId: '500' }),
    ]
    const rug = buildRug(views, lcnMap)
    expect(rug.lanes.map((l) => l.label)).toEqual(['LCN AB to VC —', 'No LCN'])
  })

  it('has no lanes and no span for zero grants', () => {
    const rug = buildRug([], lcnMap)
    expect(rug.lanes).toEqual([])
    expect(rug.span).toBeNull()
  })

  it('sorts hex LCN values numerically, with bad hex last', () => {
    expect(lcnSortValue('9')).toBeLessThan(lcnSortValue('10'))
    expect(lcnSortValue('0A')).toBe(10)
    expect(lcnSortValue('zz')).toBe(Number.POSITIVE_INFINITY)
  })
})
