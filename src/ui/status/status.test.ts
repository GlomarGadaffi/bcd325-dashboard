import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRawSnippet, flushSync, mount, unmount, type Component } from 'svelte'
import { clock, stopClock } from '../state/clock.svelte'
import { setSnapshot, type SentinelSnapshot } from '../state/adapter.svelte'
import StatusTiles from './StatusTiles.svelte'
import LastCall from './LastCall.svelte'
import StatusStrip from '../chrome/StatusStrip.svelte'

const MIN = 60_000

// Ages are checked against a clock that does not tick mid-test.
stopClock()

function snapshot(overrides: Partial<SentinelSnapshot>): SentinelSnapshot {
  const now = clock.now
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
    stats: { sessionStart: now, patches: 0, grants: 0, p25Total: 0 },
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
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  host.remove()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
})

// Component<never> accepts every component, whatever its props.
function render(component: Component<never>, props: object = {}): void {
  const instance = mount(component, { target: host, props: props as never })
  cleanups.push(() => unmount(instance))
  flushSync()
}

function labels(): string[] {
  return Array.from(host.querySelectorAll('dt')).map((dt) => dt.textContent ?? '')
}

describe('StatusTiles', () => {
  it('uses the exact labels, in order', () => {
    setSnapshot(snapshot({}))
    render(StatusTiles)
    expect(labels()).toEqual([
      'EDACS grants, this session',
      'Patch IDs seen',
      'P25 transmissions, all time',
      'NEW',
      'Session',
      'Site',
    ])
  })

  it('reads each value from its store field and shows the live patch count', () => {
    setSnapshot(
      snapshot({
        siteId: '01F4',
        patches: [{ id: '3F1', members: [], hits: 1, lastSeen: clock.now, isActive: true }],
        stats: { sessionStart: clock.now - 3 * 60_000 - 5_000, patches: 7, grants: 1204, p25Total: 96 },
      }),
    )
    render(StatusTiles, { newCount: 2 })
    const values = Array.from(host.querySelectorAll('dd')).map((dd) => dd.textContent?.trim())
    expect(values[0]).toBe('1,204')
    expect(values[1]).toBe('7 1 live now')
    expect(values[2]).toBe('96')
    expect(values[3]).toBe('2')
    expect(values[4]).toBe('3 m 5 s')
    expect(values[5]).toBe('01F4')
  })

  it('shows the placeholder while no site is known', () => {
    setSnapshot(snapshot({ siteId: 'AWAITING C-CH' }))
    render(StatusTiles)
    expect(host.querySelector('.site')?.textContent).toBe('AWAITING C-CH')
  })

  it('withholds the delta for a young session', () => {
    setSnapshot(snapshot({ grants: [{ type: 'GRANT', raw: '', timestamp: clock.now - MIN, grantType: 'TG', id: 1 }] }))
    render(StatusTiles)
    expect(host.textContent).not.toContain('vs prior 5 m')
  })

  it('shows the delta once the buffer covers 10 minutes', () => {
    const now = clock.now
    setSnapshot(
      snapshot({
        grants: [
          { type: 'GRANT', raw: '', timestamp: now - MIN, grantType: 'TG', id: 2 },
          { type: 'GRANT', raw: '', timestamp: now - 6 * MIN, grantType: 'TG', id: 1 },
        ],
        stats: { sessionStart: now - 20 * MIN, patches: 0, grants: 2, p25Total: 0 },
      }),
    )
    render(StatusTiles)
    expect(host.textContent).toContain('±0 vs prior 5 m')
  })
})

describe('LastCall', () => {
  it('shows placeholders with no grant or transmission', () => {
    setSnapshot(snapshot({}))
    render(LastCall)
    expect(host.textContent).toContain('No grant yet')
    expect(host.textContent).toContain('No P25 traffic')
  })

  it('shows the newest grant and the newest P25 card with ages', () => {
    const now = clock.now
    setSnapshot(
      snapshot({
        grants: [{ type: 'GRANT', raw: '', timestamp: now - 72_000, grantType: 'TG', id: 1, talkgroupId: '777' }],
        p25Cards: [
          { tgid: '312', name: 'Dispatch 1', agency: 'P25', hits: 1, lastSeen: now - 4_000, isNew: false },
        ],
      }),
    )
    render(LastCall)
    const ages = Array.from(host.querySelectorAll('.age')).map((el) => el.textContent?.trim())
    expect(ages).toEqual(['1 m 12 s', '4 s'])
    expect(host.textContent).toContain('Unknown talkgroup')
    expect(host.textContent).toContain('Dispatch 1')
  })
})

describe('StatusStrip', () => {
  const scanner = createRawSnippet(() => ({ render: () => '<span class="probe">HELD TG 312</span>' }))

  it('renders the scanner snippet and all three zones on desktop widths', () => {
    setSnapshot(snapshot({}))
    render(StatusStrip, { scanner })
    expect(host.querySelector('.zone-scanner .probe')?.textContent).toBe('HELD TG 312')
    expect(host.querySelector('.zone-last')).not.toBeNull()
    expect(host.querySelector('.zone-counters')).not.toBeNull()
  })

  it('leaves the scanner zone empty when no snippet is supplied', () => {
    setSnapshot(snapshot({}))
    render(StatusStrip)
    expect(host.querySelector('.zone-scanner')?.childElementCount).toBe(0)
  })

  it('becomes two lines with no counters below 640 px', () => {
    window.matchMedia = (query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList
    setSnapshot(snapshot({}))
    render(StatusStrip, { scanner })
    expect(host.querySelector('.strip')?.classList.contains('is-compact')).toBe(true)
    expect(host.querySelector('.zone-counters')).toBeNull()
    expect(host.querySelector('.zone-last')).not.toBeNull()
  })
})
