import { describe, expect, it } from 'vitest'
import type { GrantEvent, LeaderboardEntry } from '../../types'
import {
  NO_EDACS_DATA_TEXT,
  NO_PATCHES_TEXT,
  PATCH_VISIBLE_MS,
  REORDER_HOLD_MS,
  SITES_TABS,
  TX_VISIBLE_MS,
  LeaderboardOrder,
  axisMax,
  bareId,
  channelRows,
  formatAge,
  isPatchVisible,
  isTxActive,
  leaderboardKind,
  leaderboardTip,
  lcnRank,
  nestedBar,
  nextTab,
  patchCountText,
  patchRowsFor,
  showNoEdacsData,
  splitLeaderboard,
  storeOrder,
  type PatchLike,
} from './sitesModel'

function row(id: string, h5: number, h60: number, name = `Name ${id}`, agency = 'FHP'): LeaderboardEntry {
  return { id, name, agency, h5, h60 }
}

function grant(timestamp: number, logicalChannel?: string, voiceChannel?: string): GrantEvent {
  return {
    type: 'GRANT',
    raw: '',
    timestamp,
    grantType: 'TG',
    id: 0,
    talkgroupId: '500',
    logicalChannel,
    voiceChannel,
  }
}

function patch(id: string, lastSeen: number, isActive = false, hits = 1): PatchLike {
  return { id, members: ['2572'], hits, lastSeen, isActive }
}

describe('leaderboard keys', () => {
  it('reads U: as units, M: as members, and anything else as talkgroups', () => {
    expect(leaderboardKind('500')).toBe('talkgroups')
    expect(leaderboardKind('U:00A1B2')).toBe('units')
    expect(leaderboardKind('M:2572')).toBe('members')
  })

  it('does not treat a colon that is not at the start as a prefix', () => {
    expect(leaderboardKind('12M:3')).toBe('talkgroups')
    expect(leaderboardKind('U')).toBe('talkgroups')
  })

  it('strips only the prefix when giving the bare ID', () => {
    expect(bareId('U:00A1B2')).toBe('00A1B2')
    expect(bareId('M:2572')).toBe('2572')
    expect(bareId('500')).toBe('500')
  })

  it('splits rows by prefix and keeps each group in input order', () => {
    const rows = [row('500', 4, 9), row('U:1', 3, 3), row('M:7', 2, 2), row('501', 1, 1), row('U:2', 0, 1)]
    const groups = splitLeaderboard(rows)
    expect(groups.talkgroups.map((r) => r.id)).toEqual(['500', '501'])
    expect(groups.units.map((r) => r.id)).toEqual(['U:1', 'U:2'])
    expect(groups.members.map((r) => r.id)).toEqual(['M:7'])
  })

  it('returns three empty groups for no rows', () => {
    expect(splitLeaderboard([])).toEqual({ talkgroups: [], units: [], members: [] })
  })
})

describe('storeOrder', () => {
  it('sorts by h5 descending, then h60 descending', () => {
    const ids = storeOrder([row('a', 2, 5), row('b', 3, 3), row('c', 2, 9), row('d', 3, 7)]).map((r) => r.id)
    expect(ids).toEqual(['d', 'b', 'c', 'a'])
  })

  it('keeps full ties in input order and does not mutate the input', () => {
    const input = [row('x', 1, 1), row('y', 1, 1)]
    expect(storeOrder(input).map((r) => r.id)).toEqual(['x', 'y'])
    expect(input.map((r) => r.id)).toEqual(['x', 'y'])
  })
})

describe('LeaderboardOrder freeze', () => {
  const ids = (rows: LeaderboardEntry[]) => rows.map((r) => r.id)

  it('shows store order on first sight', () => {
    const order = new LeaderboardOrder()
    expect(ids(order.next([row('a', 1, 1), row('b', 5, 5)], 0))).toEqual(['b', 'a'])
  })

  it('holds a reorder for 5 seconds, then adopts it', () => {
    const order = new LeaderboardOrder()
    order.next([row('a', 5, 5), row('b', 1, 1)], 0)
    // b overtakes a at 1 s: held.
    expect(ids(order.next([row('a', 2, 5), row('b', 3, 3)], 1000))).toEqual(['a', 'b'])
    // Still held at 4.9 s.
    expect(ids(order.next([row('a', 2, 5), row('b', 3, 3)], 4999))).toEqual(['a', 'b'])
    // Allowed at exactly 5 s.
    expect(ids(order.next([row('a', 2, 5), row('b', 3, 3)], REORDER_HOLD_MS))).toEqual(['b', 'a'])
  })

  it('starts a new hold window after each reorder', () => {
    const order = new LeaderboardOrder()
    order.next([row('a', 5, 5), row('b', 1, 1)], 0)
    order.next([row('a', 1, 5), row('b', 4, 4)], 5000) // reorder at 5 s: b first
    // a overtakes b at 6 s. The window started at 5 s, so this is held.
    expect(ids(order.next([row('a', 6, 6), row('b', 4, 4)], 6000))).toEqual(['b', 'a'])
    expect(ids(order.next([row('a', 6, 6), row('b', 4, 4)], 10000))).toEqual(['a', 'b'])
  })

  it('always shows the newest values, even while the order is held', () => {
    const order = new LeaderboardOrder()
    order.next([row('a', 5, 5), row('b', 1, 1)], 0)
    const held = order.next([row('a', 5, 9), row('b', 2, 6)], 1000)
    expect(held.map((r) => [r.id, r.h5, r.h60])).toEqual([
      ['a', 5, 9],
      ['b', 2, 6],
    ])
  })

  it('drops a departed row at once without reordering the rest', () => {
    const order = new LeaderboardOrder()
    order.next([row('a', 5, 5), row('b', 4, 4), row('c', 3, 3)], 0)
    expect(ids(order.next([row('a', 5, 5), row('c', 3, 3)], 100))).toEqual(['a', 'c'])
  })

  it('places a new row at the bottom until the next reorder is allowed', () => {
    const order = new LeaderboardOrder()
    order.next([row('a', 5, 5), row('b', 4, 4)], 0)
    // c arrives with the highest h5. Store order is c, a, b. Held: a, b, c.
    expect(ids(order.next([row('a', 5, 5), row('b', 4, 4), row('c', 9, 9)], 1000))).toEqual(['a', 'b', 'c'])
    expect(ids(order.next([row('a', 5, 5), row('b', 4, 4), row('c', 9, 9)], 5000))).toEqual(['c', 'a', 'b'])
  })

  it('shows store order straight away when the list was empty', () => {
    const order = new LeaderboardOrder()
    expect(order.next([], 0)).toEqual([])
    expect(ids(order.next([row('a', 1, 1), row('b', 2, 2)], 100))).toEqual(['b', 'a'])
  })
})

describe('nested bars and axes', () => {
  it('takes the axis from the panel rows only', () => {
    const talkgroups = [row('500', 1, 40), row('501', 1, 10)]
    const units = [row('U:1', 1, 3), row('U:2', 0, 2)]
    expect(axisMax(talkgroups)).toBe(40)
    expect(axisMax(units)).toBe(3)
    expect(axisMax([])).toBe(0)
  })

  it('draws the whole bar from h60 and the solid part from h5', () => {
    const bar = nestedBar(row('500', 2, 8), 16)
    expect(bar.total).toBe(0.5)
    expect(bar.solid).toBe(0.25)
    expect(bar.h5).toBe(2)
    expect(bar.h60).toBe(8)
  })

  it('never lets h5 exceed h60 in the render', () => {
    const bar = nestedBar(row('500', 9, 4), 4)
    expect(bar.h5).toBe(4)
    expect(bar.solid).toBe(1)
    expect(bar.total).toBe(1)
  })

  it('returns zero geometry for empty rows and axes', () => {
    expect(nestedBar(row('500', 0, 0), 0)).toEqual({ total: 0, solid: 0, h5: 0, h60: 0 })
  })

  it('treats negative or non-finite counts as zero', () => {
    const bar = nestedBar(row('500', -2, Number.NaN), 5)
    expect(bar).toEqual({ total: 0, solid: 0, h5: 0, h60: 0 })
  })

  it('writes the tooltip with the same text for each kind', () => {
    expect(leaderboardTip('talkgroups', row('500', 1, 12, 'Dispatch A', 'FHP'))).toBe(
      'TG 500 Dispatch A (FHP): 1 grant in 5 m, 12 in 60 m',
    )
    expect(leaderboardTip('units', row('U:00A1', 2, 3, 'Unit 00A1', 'UNIT'))).toBe(
      'Unit 00A1: 2 unit grants in 5 m, 3 in 60 m',
    )
    expect(leaderboardTip('members', row('M:2572', 0, 1, 'Member 2572', 'MEM'))).toBe(
      'Member 2572: 0 patch events in 5 m, 1 in 60 m',
    )
  })
})

describe('patches', () => {
  it('drops a patch once it is more than 30 s old, and keeps one at exactly 30 s', () => {
    const now = 100_000
    expect(isPatchVisible(patch('3F1', now - PATCH_VISIBLE_MS), now)).toBe(true)
    expect(isPatchVisible(patch('3F1', now - PATCH_VISIBLE_MS - 1), now)).toBe(false)
  })

  it('shows TX for 2 s after the hit and no longer', () => {
    const now = 50_000
    const p = patch('3F1', now - TX_VISIBLE_MS + 1, true)
    expect(isTxActive(p, now)).toBe(true)
    expect(isTxActive(patch('3F1', now - TX_VISIBLE_MS, true), now)).toBe(false)
  })

  it('needs the store flag as well as the age for TX', () => {
    expect(isTxActive(patch('3F1', 1000, false), 1500)).toBe(false)
  })

  it('lists active patches first, then newest first, and omits pruned ones', () => {
    const now = 60_000
    const rows = [
      patch('AAA', 59_500, false),
      patch('BBB', 59_000, true),
      patch('CCC', 58_000, false),
      patch('DDD', 40_000, false),
      patch('EEE', 20_000, true),
    ]
    const ids = patchRowsFor(rows, now).map((p) => p.id)
    expect(ids).toEqual(['BBB', 'AAA', 'CCC', 'DDD'])
  })

  it('does not reorder the input', () => {
    const rows = [patch('B', 1, false), patch('A', 2, false)]
    patchRowsFor(rows, 3)
    expect(rows.map((p) => p.id)).toEqual(['B', 'A'])
  })

  it('breaks ties by ID so equal rows do not swap', () => {
    const rows = [patch('B', 5, false), patch('A', 5, false)]
    expect(patchRowsFor(rows, 6).map((p) => p.id)).toEqual(['A', 'B'])
  })

  it('pluralises the summary line and names the empty state', () => {
    expect(patchCountText(1)).toBe('1 patch active')
    expect(patchCountText(3)).toBe('3 patches active')
    expect(NO_PATCHES_TEXT).toBe('No patches in last 30 s')
  })
})

describe('lcnRank', () => {
  it('reads LCN as hex, so 0x9 comes before 0x10', () => {
    expect(lcnRank('9')).toBe(9)
    expect(lcnRank('10')).toBe(16)
    expect(lcnRank('0A1')).toBe(161)
    expect(lcnRank('9')).toBeLessThan(lcnRank('10'))
  })

  it('sorts unparseable values last', () => {
    expect(lcnRank('zz')).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('channelRows', () => {
  it('sorts LCN values numerically as hex, so 0x9 sits above 0x10', () => {
    const rows = channelRows(
      [
        ['10', 'B0'],
        ['9', 'A0'],
        ['A1', 'C0'],
      ],
      [],
    )
    expect(rows.map((r) => r.lcn)).toEqual(['9', '10', 'A1'])
  })

  it('counts grants per LCN and takes the newest timestamp', () => {
    const rows = channelRows(
      [['0A1', '0B2']],
      [grant(1000, '0A1', '0B2'), grant(3000, '0A1', '0B2'), grant(2000, '0A2')],
    )
    expect(rows).toEqual([
      { lcn: '0A1', vc: '0B2', grants: 2, lastAt: 3000 },
      { lcn: '0A2', vc: null, grants: 1, lastAt: 2000 },
    ])
  })

  it('keeps a map entry with no grants in the buffer, with no last grant', () => {
    const rows = channelRows([['0A5', '0B6']], [])
    expect(rows).toEqual([{ lcn: '0A5', vc: '0B6', grants: 0, lastAt: null }])
  })

  it('puts grants with no logical channel in one row, last', () => {
    const rows = channelRows(
      [['1', '2']],
      [grant(1000), grant(4000), grant(2000, '1', '2')],
    )
    expect(rows[rows.length - 1]).toEqual({ lcn: null, vc: null, grants: 2, lastAt: 4000 })
    expect(rows.filter((r) => r.lcn === null)).toHaveLength(1)
  })

  it('leaves out the no-LCN row when every grant has a channel', () => {
    const rows = channelRows([], [grant(1000, '1')])
    expect(rows.some((r) => r.lcn === null)).toBe(false)
  })

  it('treats an empty LCN string as no channel', () => {
    const rows = channelRows([], [grant(1000, '')])
    expect(rows).toEqual([{ lcn: null, vc: null, grants: 1, lastAt: 1000 }])
  })
})

describe('formatAge', () => {
  it('uses one format: seconds, then minutes and seconds, then hours and minutes', () => {
    expect(formatAge(4000)).toBe('4 s')
    expect(formatAge(72_000)).toBe('1 m 12 s')
    expect(formatAge(3_600_000)).toBe('1 h 0 m')
    expect(formatAge(3_900_000)).toBe('1 h 5 m')
  })

  it('reads a negative age as zero', () => {
    expect(formatAge(-500)).toBe('0 s')
  })
})

describe('tabs and empty states', () => {
  it('starts with four tabs in the spec order', () => {
    expect(SITES_TABS).toEqual(['talkgroups', 'units', 'members', 'channels'])
  })

  it('moves with arrows, wrapping at both ends', () => {
    expect(nextTab('talkgroups', 'ArrowRight', SITES_TABS)).toBe('units')
    expect(nextTab('channels', 'ArrowRight', SITES_TABS)).toBe('talkgroups')
    expect(nextTab('talkgroups', 'ArrowLeft', SITES_TABS)).toBe('channels')
  })

  it('jumps to the first and last tab with Home and End', () => {
    expect(nextTab('members', 'Home', SITES_TABS)).toBe('talkgroups')
    expect(nextTab('members', 'End', SITES_TABS)).toBe('channels')
  })

  it('skips tabs that are not in the list in use', () => {
    const phone = ['talkgroups', 'members'] as const
    expect(nextTab('talkgroups', 'ArrowRight', phone)).toBe('members')
    expect(nextTab('members', 'ArrowRight', phone)).toBe('talkgroups')
  })

  it('returns null for keys that do not move focus', () => {
    expect(nextTab('units', 'Enter', SITES_TABS)).toBeNull()
    expect(nextTab('units', 'ArrowRight', [])).toBeNull()
  })

  it('shows the C-CH note only when connected and no grants are counted', () => {
    expect(showNoEdacsData(true, 0)).toBe(true)
    expect(showNoEdacsData(false, 0)).toBe(false)
    expect(showNoEdacsData(true, 1)).toBe(false)
    expect(NO_EDACS_DATA_TEXT).toBe('No EDACS data yet - enable C-CH output')
  })
})
