import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import { getSnapshot, setSnapshot, type P25Row, type SentinelSnapshot } from '../state/adapter.svelte'
import P25Table from './P25Table.svelte'
import P25AllTime from './P25AllTime.svelte'
import P25Column from '../columns/P25Column.svelte'
import { allAgenciesOn, resetNewTracking, type P25AgencyKey } from './p25Model'

const NOW = Date.now()

function row(tgid: string, lastSeen: number, hits = 1, name = 'Channel'): P25Row {
  return { tgid, name, agency: 'P25', hits, lastSeen, isNew: false }
}

function snapshot(overrides: Partial<SentinelSnapshot>): SentinelSnapshot {
  return {
    connected: true,
    siteId: 'AWAITING C-CH',
    grants: [],
    rawLog: [],
    patches: [],
    p25Cards: [],
    leaderboard: [],
    lcnMap: [],
    persistentSlers: {},
    persistentPatches: {},
    persistentP25: {},
    stats: { sessionStart: NOW, patches: 0, grants: 0, p25Total: 0 },
    p25HoldingTG: null,
    lcdState: 'SCANNING',
    lcdData: { tgid: '---', name: 'System Standby', agency: '--' },
    lastRawAt: null,
    ...overrides,
  }
}

let host: HTMLDivElement
let cleanups: (() => void)[] = []

beforeEach(() => {
  resetNewTracking()
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  host.remove()
})

function renderTable(
  onHold = vi.fn(),
  agencyOn: Record<P25AgencyKey, boolean> = allAgenciesOn(),
): (tgid: string) => void {
  const instance = mount(P25Table, { target: host, props: { onHold, agencyOn } })
  cleanups.push(() => unmount(instance))
  flushSync()
  return onHold
}

function renderAllTime(): void {
  const instance = mount(P25AllTime, { target: host })
  cleanups.push(() => unmount(instance))
  flushSync()
}

function rowTgs(): string[] {
  return Array.from(host.querySelectorAll('li.row .tg'), (el) => el.textContent ?? '')
}

function button(selector: string): HTMLButtonElement {
  const found = host.querySelector<HTMLButtonElement>(selector)
  if (!found) throw new Error(`missing ${selector}`)
  return found
}

describe('P25Table rows', () => {
  it('pins the held row first with a HELD chip and a Release control', () => {
    setSnapshot(
      snapshot({
        p25Cards: [row('500', NOW - 1000), row('501', NOW - 5000)],
        p25HoldingTG: '501',
        persistentP25: { '500': 3, '501': 2 },
      }),
    )
    renderTable()

    expect(rowTgs()).toEqual(['501', '500'])
    const first = host.querySelector('li.row') as HTMLElement
    expect(first.classList.contains('is-held')).toBe(true)
    expect(first.querySelector('.state')?.textContent).toContain('HELD')
    const hold = first.querySelector('button.hold') as HTMLButtonElement
    expect(hold.textContent?.trim()).toBe('Release')
    expect(hold.getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toContain('Hold active: other P25 traffic is not recorded.')
  })

  it('marks a talkgroup absent from persistent totals NEW until it is acknowledged', () => {
    setSnapshot(snapshot({ p25Cards: [row('700', NOW)], persistentP25: { '700': 1 } }))
    renderTable()

    expect(button('button.new-button').textContent).toContain('NEW')
    button('button.new-button').click()
    flushSync()
    expect(host.querySelector('button.new-button')).toBeNull()
  })

  it('never marks a talkgroup with persistent history NEW', () => {
    setSnapshot(snapshot({ p25Cards: [row('800', NOW)], persistentP25: { '800': 9 } }))
    renderTable()
    expect(host.querySelector('button.new-button')).toBeNull()
  })

  it('routes Hold to onHold for a row that is not held', () => {
    setSnapshot(snapshot({ p25Cards: [row('900', NOW)], persistentP25: { '900': 4 } }))
    const onHold = renderTable()
    button('button.hold').click()
    expect(onHold).toHaveBeenCalledWith('900')
  })

  it('disables Hold with the reason as text while disconnected', () => {
    setSnapshot(snapshot({ connected: false, p25Cards: [row('900', NOW)], persistentP25: { '900': 4 } }))
    renderTable()
    const hold = button('button.hold')
    expect(hold.disabled).toBe(true)
    expect(hold.getAttribute('aria-describedby')).toBe('p25-hold-reason')
    expect(host.querySelector('#p25-hold-reason')?.textContent).toContain('disconnected')
  })

  it('applies the agency chips to rows but never hides the held row', () => {
    setSnapshot(
      snapshot({
        p25Cards: [row('801', NOW), row('12301', NOW - 1000)],
        p25HoldingTG: '801',
        persistentP25: { '801': 2, '12301': 2 },
      }),
    )
    // FHP is switched off, but 801 is the held row, so it stays visible.
    renderTable(vi.fn(), { ...allAgenciesOn(), FHP: false })
    expect(rowTgs()).toEqual(['801', '12301'])
    expect(host.textContent).not.toContain('hidden by filters')

    setSnapshot(
      snapshot({
        p25Cards: [row('801', NOW), row('12301', NOW - 1000)],
        persistentP25: { '801': 2, '12301': 2 },
      }),
    )
    flushSync()
    expect(rowTgs()).toEqual(['12301'])
    expect(host.textContent).toContain('1 hidden by filters')
  })

  it('says P25 is not received when connected with no P25 data at all', () => {
    setSnapshot(snapshot({ connected: true }))
    renderTable()
    expect(host.querySelector('.empty')?.textContent).toBe('P25 not received')
  })

  it('says there is no traffic in 5 minutes when totals exist but no card is live', () => {
    setSnapshot(snapshot({ connected: true, persistentP25: { '500': 3 } }))
    renderTable()
    expect(host.querySelector('.empty')?.textContent).toBe('No P25 traffic in 5 minutes')
  })

  it('freezes the rows while the pointer is inside, then catches up on leave', () => {
    setSnapshot(snapshot({ p25Cards: [row('600', NOW - 2000)], persistentP25: { '600': 4 } }))
    renderTable()

    const table = host.querySelector('.p25-table') as HTMLElement
    table.dispatchEvent(new Event('pointerenter'))
    setSnapshot(
      snapshot({
        p25Cards: [row('600', NOW - 500), row('601', NOW)],
        persistentP25: { '600': 5, '601': 1 },
      }),
    )
    flushSync()
    expect(rowTgs()).toEqual(['600'])
    expect(getSnapshot().p25Cards).toHaveLength(2)

    table.dispatchEvent(new Event('pointerleave'))
    flushSync()
    expect(rowTgs()).toEqual(['601', '600'])
  })
})

describe('P25AllTime', () => {
  it('shows the top ten by all-time count, largest first, labelled all time', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 12; i++) counts[String(2000 + i)] = i + 1
    setSnapshot(snapshot({ persistentP25: counts }))
    renderAllTime()

    const items = Array.from(host.querySelectorAll('li.bar-item .bar-row'))
    expect(items).toHaveLength(10)
    expect(items[0].querySelector('.tg')?.textContent).toBe('2011')
    expect(items[0].querySelector('.value')?.textContent).toBe('12')
    expect(host.querySelector('.toggle')?.textContent).toContain('All time')
    expect(host.textContent?.toLowerCase()).not.toContain('live')
  })

  it('gives the share of the all-time total in the tooltip', () => {
    setSnapshot(snapshot({ persistentP25: { '801': 10, '12301': 3 } }))
    renderAllTime()

    const tooltip = host.querySelector('[role="tooltip"]')
    expect(tooltip?.textContent).toBe('TG 801, Troop A Dispatch (Pensacola), FHP. 10 all time, 76.9% of the all-time total.')
  })

  it('collapses and expands the bars', () => {
    setSnapshot(snapshot({ persistentP25: { '801': 1 } }))
    renderAllTime()
    expect(host.querySelector('li.bar-item')).not.toBeNull()

    button('.toggle').click()
    flushSync()
    expect(host.querySelector('li.bar-item')).toBeNull()
    expect(button('.toggle').getAttribute('aria-expanded')).toBe('false')

    button('.toggle').click()
    flushSync()
    expect(host.querySelector('li.bar-item')).not.toBeNull()
  })
})

describe('P25Column', () => {
  it('hides rows when an agency chip is switched off, and passes Hold up to the parent', () => {
    setSnapshot(
      snapshot({
        p25Cards: [row('801', NOW), row('12301', NOW - 1000)],
        persistentP25: { '801': 2, '12301': 2 },
      }),
    )
    const onHold = vi.fn()
    const instance = mount(P25Column, { target: host, props: { onHold } })
    cleanups.push(() => unmount(instance))
    flushSync()
    expect(rowTgs()).toEqual(['801', '12301'])

    const fhp = Array.from(host.querySelectorAll<HTMLButtonElement>('.filters button')).find(
      (el) => el.textContent?.trim() === 'FHP',
    )
    if (!fhp) throw new Error('missing FHP chip')
    expect(fhp.getAttribute('aria-pressed')).toBe('true')
    fhp.click()
    flushSync()
    expect(fhp.getAttribute('aria-pressed')).toBe('false')
    expect(rowTgs()).toEqual(['12301'])

    const holdLoc = host.querySelector<HTMLButtonElement>('button.hold')
    holdLoc?.click()
    expect(onHold).toHaveBeenCalledWith('12301')
  })
})
