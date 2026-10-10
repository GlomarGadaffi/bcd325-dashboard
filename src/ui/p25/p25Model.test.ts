import { beforeEach, describe, expect, it } from 'vitest'
import {
  NEW_WINDOW_MS,
  acknowledgeNew,
  allAgenciesOn,
  allTimeTooltip,
  countNew,
  countOf,
  emptyMessage,
  hasAnyTotals,
  newTalkgroups,
  passesAgencyFilter,
  resetNewTracking,
  sortRows,
  talkgroupAgency,
  talkgroupName,
  topAllTime,
  type P25CardInput,
} from './p25Model'

function card(tgid: string, hits: number, lastSeen: number, name = 'Channel'): P25CardInput {
  return { tgid, name, hits, lastSeen }
}

describe('talkgroupName', () => {
  it('prefers the DB name over the card name', () => {
    expect(talkgroupName('12301', 'channel from scanner')).toBe('ACSO Dispatch 1')
  })

  it('falls back to the card name, then to Unknown TG', () => {
    expect(talkgroupName('99999', 'Fire Ops')).toBe('Fire Ops')
    expect(talkgroupName('99999', '')).toBe('Unknown TG')
    expect(talkgroupName('99999')).toBe('Unknown TG')
  })

  it('does not match inherited object keys', () => {
    expect(talkgroupName('constructor')).toBe('Unknown TG')
  })
})

describe('talkgroupAgency', () => {
  it('reads the DB agency and maps unknown talkgroups to UNK', () => {
    expect(talkgroupAgency('801')).toBe('FHP')
    expect(talkgroupAgency('12301')).toBe('LOC')
    expect(talkgroupAgency('99999')).toBe('UNK')
    expect(talkgroupAgency('toString')).toBe('UNK')
  })
})

describe('sortRows', () => {
  it('pins the held row first even when it was heard longest ago', () => {
    const rows = sortRows([card('1', 1, 500), card('2', 1, 900), card('3', 1, 700)], '1')
    expect(rows.map((row) => row.tgid)).toEqual(['1', '2', '3'])
  })

  it('sorts by lastSeen descending, then TG, without mutating the input', () => {
    const input = [card('5', 1, 100), card('3', 1, 300), card('4', 1, 300)]
    const snapshotOrder = input.map((row) => row.tgid)
    const rows = sortRows(input, null)
    expect(rows.map((row) => row.tgid)).toEqual(['3', '4', '5'])
    expect(input.map((row) => row.tgid)).toEqual(snapshotOrder)
  })
})

describe('agency filter', () => {
  it('shows every agency by default', () => {
    const on = allAgenciesOn()
    expect(passesAgencyFilter('801', on, null)).toBe(true)
    expect(passesAgencyFilter('99999', on, null)).toBe(true)
  })

  it('hides rows of a switched-off agency, but never the held row', () => {
    const on = { ...allAgenciesOn(), FHP: false }
    expect(passesAgencyFilter('801', on, null)).toBe(false)
    expect(passesAgencyFilter('801', on, '801')).toBe(true)
    expect(passesAgencyFilter('12301', on, null)).toBe(true)
  })
})

describe('emptyMessage', () => {
  const base = { connected: true, cards: 0, visible: 0, hasAnyTotals: true }

  it('returns null while rows are visible', () => {
    expect(emptyMessage({ ...base, cards: 2, visible: 1 })).toBeNull()
  })

  it('says filters hide everything when cards exist but none are visible', () => {
    expect(emptyMessage({ ...base, cards: 3, visible: 0 })).toBe('All P25 traffic is hidden by filters')
  })

  it('says P25 is not received when connected with no P25 data at all', () => {
    expect(emptyMessage({ ...base, hasAnyTotals: false })).toBe('P25 not received')
  })

  it('says no traffic in 5 minutes when totals exist, and when disconnected', () => {
    expect(emptyMessage(base)).toBe('No P25 traffic in 5 minutes')
    expect(emptyMessage({ ...base, connected: false, hasAnyTotals: false })).toBe('No P25 traffic in 5 minutes')
  })
})

describe('countOf and hasAnyTotals', () => {
  it('reads missing and malformed counts as zero', () => {
    expect(countOf({}, '1')).toBe(0)
    expect(countOf({ '1': Number.NaN }, '1')).toBe(0)
    expect(countOf({ '1': 4 }, '1')).toBe(4)
    expect(hasAnyTotals({})).toBe(false)
    expect(hasAnyTotals({ '1': 0 })).toBe(false)
    expect(hasAnyTotals({ '1': 1 })).toBe(true)
  })
})

describe('NEW derivation', () => {
  beforeEach(() => {
    resetNewTracking()
  })

  const t0 = 1_000_000

  it('is NEW when the talkgroup is absent from persistent totals at first sight', () => {
    // The store has already counted this transmission, so the total equals the card's hits.
    expect(newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0).has('500')).toBe(true)
  })

  it('is not NEW when the talkgroup already had persistent history', () => {
    expect(newTalkgroups([card('600', 1, t0)], { '600': 5 }, t0).size).toBe(0)
  })

  it('treats a DB talkgroup with no history as NEW too', () => {
    expect(newTalkgroups([card('801', 1, t0)], { '801': 1 }, t0).has('801')).toBe(true)
  })

  it('counts the card\'s own hits when they were recorded before the first sight', () => {
    expect(newTalkgroups([card('700', 2, t0)], { '700': 2 }, t0).has('700')).toBe(true)
    expect(newTalkgroups([card('701', 2, t0)], { '701': 3 }, t0).has('701')).toBe(false)
  })

  it('never shows NEW for a talkgroup in persistent totals, even at its first session sight', () => {
    expect(countNew([card('900', 1, t0), card('901', 1, t0)], { '900': 4, '901': 1 }, t0)).toBe(1)
  })

  it('keeps the first-sight decision when the persistent total grows later', () => {
    newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0)
    expect(newTalkgroups([card('500', 3, t0 + 1000)], { '500': 3 }, t0 + 1000).has('500')).toBe(true)
  })

  it('clears after ten minutes from first sight', () => {
    newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0)
    expect(newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0 + NEW_WINDOW_MS - 1).has('500')).toBe(true)
    expect(newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0 + NEW_WINDOW_MS).has('500')).toBe(false)
  })

  it('clears on acknowledge for the rest of the session', () => {
    newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0)
    acknowledgeNew('500')
    expect(newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0 + 1000).size).toBe(0)
  })

  it('does not become NEW again after the window when the card reappears', () => {
    newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0)
    // Pruned from the store, then heard again after the window has closed.
    expect(newTalkgroups([], { '500': 1 }, t0 + NEW_WINDOW_MS + 60_000).size).toBe(0)
    expect(newTalkgroups([card('500', 1, t0)], { '500': 2 }, t0 + NEW_WINDOW_MS + 60_000).size).toBe(0)
  })

  it('counts only the cards it is given', () => {
    const cards = [card('500', 1, t0), card('501', 1, t0)]
    const persistent = { '500': 1, '501': 1 }
    expect(countNew(cards, persistent, t0)).toBe(2)
    expect(countNew([cards[0]], persistent, t0)).toBe(1)
  })

  it('gives the same answer when called again with the same inputs', () => {
    const cards = [card('500', 1, t0)]
    const first = [...newTalkgroups(cards, { '500': 1 }, t0)]
    const second = [...newTalkgroups(cards, { '500': 1 }, t0 + 500)]
    expect(second).toEqual(first)
  })

  it('forgets everything after a reset', () => {
    newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0)
    acknowledgeNew('500')
    resetNewTracking()
    expect(newTalkgroups([card('500', 1, t0)], { '500': 1 }, t0).has('500')).toBe(true)
  })
})

describe('topAllTime', () => {
  it('sorts descending, breaks ties by TG, and keeps the top ten', () => {
    const counts: Record<string, number> = {}
    for (let i = 1; i <= 12; i++) counts[String(1000 + i)] = i
    counts['1001'] = 12
    const board = topAllTime(counts, [])
    expect(board.rows).toHaveLength(10)
    expect(board.rows[0].tgid).toBe('1001')
    expect(board.rows[0].count).toBe(12)
    expect(board.rows[1].tgid).toBe('1012')
    expect(board.rows.at(-1)?.count).toBe(4)
  })

  it('takes share from the all-time total, including talkgroups outside the top ten', () => {
    const counts: Record<string, number> = { '1': 30, '2': 10, '3': 10 }
    const board = topAllTime(counts, [], 2)
    expect(board.total).toBe(50)
    expect(board.rows.map((row) => row.share)).toEqual([0.6, 0.2])
  })

  it('names rows from the DB, then the card, then Unknown TG', () => {
    const board = topAllTime({ '12301': 3, '99999': 2, '98888': 1 }, [
      { tgid: '99999', name: 'Fire Ops' },
      { tgid: '98888', name: '' },
    ])
    expect(board.rows.map((row) => row.name)).toEqual(['ACSO Dispatch 1', 'Fire Ops', 'Unknown TG'])
  })

  it('ignores zero and malformed counts', () => {
    const board = topAllTime({ '1': 0, '2': 3, '3': Number.NaN }, [])
    expect(board.rows.map((row) => row.tgid)).toEqual(['2'])
    expect(board.total).toBe(3)
  })

  it('is empty with no totals', () => {
    expect(topAllTime({}, [])).toEqual({ rows: [], total: 0 })
  })
})

describe('allTimeTooltip', () => {
  it('gives TG, name, agency, count and one-decimal share', () => {
    const text = allTimeTooltip({ tgid: '801', name: 'Troop A', agency: 'FHP', count: 25, share: 0.125 })
    expect(text).toBe('TG 801, Troop A, FHP. 25 all time, 12.5% of the all-time total.')
  })
})
