import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushSync, mount, unmount, type Component } from 'svelte'
import { setSnapshot, type SentinelSnapshot } from '../state/adapter.svelte'
import RawLogSheet from './RawLogSheet.svelte'
import MenuPopover from './MenuPopover.svelte'
import WipeDialog from './WipeDialog.svelte'
import { captureFocus, returnFocus } from './focusReturn'

const NOW = Date.now()

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
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  for (const cleanup of cleanups) cleanup()
  cleanups = []
  host.remove()
  document.querySelectorAll('dialog').forEach((el) => el.remove())
  vi.restoreAllMocks()
})

// Component<never> accepts every component, whatever its props.
function render(component: Component<never>, props: object): void {
  const instance = mount(component, { target: host, props: props as never })
  cleanups.push(() => unmount(instance))
  flushSync()
}

function pressKey(key: string, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  flushSync()
}

describe('RawLogSheet', () => {
  it('shows scanner lines as text, with local time and a GLG label', () => {
    const rawLog = [
      { id: 1, timestamp: new Date(2026, 9, 10, 9, 5, 7).getTime(), line: 'GLG,12301,FM,0,0,ACSO' },
      { id: 2, timestamp: new Date(2026, 9, 10, 9, 5, 8).getTime(), line: '<img src=x onerror="window.__hit=1">' },
    ]
    setSnapshot(snapshot({ rawLog }))
    render(RawLogSheet, { open: true, onClose: vi.fn() })

    const rows = host.querySelectorAll('.row')
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelector('.time')?.textContent).toBe('09:05:07')
    expect(rows[0].querySelector('.tag')?.textContent).toBe('GLG')
    expect(rows[1].querySelector('.text')?.textContent).toBe(rawLog[1].line)
    expect(rows[1].querySelector('.tag')).toBeNull()
    expect(host.querySelector('.log img')).toBeNull()
  })

  it('is closed by default and opens on L', () => {
    setSnapshot(snapshot({}))
    render(RawLogSheet, { open: false, onClose: vi.fn() })
    expect(host.querySelector('.sheet')?.classList.contains('is-open')).toBe(false)

    pressKey('l')
    expect(host.querySelector('.sheet')?.classList.contains('is-open')).toBe(true)
  })

  it('ignores L while a text field has focus', () => {
    setSnapshot(snapshot({}))
    const input = document.createElement('input')
    document.body.append(input)
    cleanups.push(() => input.remove())
    render(RawLogSheet, { open: false, onClose: vi.fn() })

    input.focus()
    pressKey('l', input)
    expect(host.querySelector('.sheet')?.classList.contains('is-open')).toBe(false)
  })

  it('closes on Escape while open', () => {
    setSnapshot(snapshot({}))
    const onClose = vi.fn()
    render(RawLogSheet, { open: true, onClose })
    pressKey('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('MenuPopover', () => {
  it('lists the actions, with Wipe history in the danger group', () => {
    render(MenuPopover, { onRawLog: vi.fn(), onChannels: vi.fn(), onWipe: vi.fn(), onClose: vi.fn() })
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(labels).toEqual(['Export JSON', 'Export CSV', 'Raw log', 'Channels', 'Wipe history'])
    expect(host.querySelector('.danger button')?.textContent?.trim()).toBe('Wipe history')
  })

  it('opens the raw log and closes the menu', () => {
    const onRawLog = vi.fn()
    const onClose = vi.fn()
    render(MenuPopover, { onRawLog, onChannels: vi.fn(), onWipe: vi.fn(), onClose })
    const raw = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Raw log')
    raw?.click()
    expect(onRawLog).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows an ERROR chip with the message when an export fails', () => {
    // Force the download step to fail. The menu must catch it and stay open.
    const original = URL.createObjectURL
    URL.createObjectURL = () => {
      throw new Error('Storage full')
    }
    try {
      const onClose = vi.fn()
      render(MenuPopover, { onRawLog: vi.fn(), onChannels: vi.fn(), onWipe: vi.fn(), onClose })
      const exportButton = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Export JSON')
      exportButton?.click()
      flushSync()
      const status = host.querySelector('[role="status"]')
      expect(status?.textContent).toContain('ERROR')
      expect(status?.textContent).toContain('Storage full')
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      URL.createObjectURL = original
    }
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(MenuPopover, { onRawLog: vi.fn(), onChannels: vi.fn(), onWipe: vi.fn(), onClose })
    pressKey('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('WipeDialog', () => {
  it('starts with Cancel focused and Wipe disabled until WIPE is typed exactly', () => {
    setSnapshot(snapshot({ persistentP25: { '312': 3 } }))
    render(WipeDialog, { open: true, onClose: vi.fn() })

    const cancel = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')
    const wipe = host.querySelector<HTMLButtonElement>('button.destructive')
    expect(document.activeElement).toBe(cancel)
    expect(wipe?.disabled).toBe(true)

    const input = host.querySelector<HTMLInputElement>('input')
    if (!input) throw new Error('confirm input missing')
    for (const value of ['wipe', 'WIPE ', 'WIP']) {
      input.value = value
      input.dispatchEvent(new Event('input'))
      flushSync()
      expect(wipe?.disabled).toBe(true)
    }
    input.value = 'WIPE'
    input.dispatchEvent(new Event('input'))
    flushSync()
    expect(wipe?.disabled).toBe(false)
  })

  it('wipes without the browser prompt, then closes', () => {
    setSnapshot(snapshot({ persistentP25: { '312': 3 } }))
    const nativeConfirm = vi.fn(() => false)
    window.confirm = nativeConfirm
    const onClose = vi.fn()
    render(WipeDialog, { open: true, onClose })

    const input = host.querySelector<HTMLInputElement>('input')
    if (!input) throw new Error('confirm input missing')
    input.value = 'WIPE'
    input.dispatchEvent(new Event('input'))
    flushSync()
    host.querySelector<HTMLButtonElement>('button.destructive')?.click()

    expect(nativeConfirm).not.toHaveBeenCalled()
    expect(window.confirm).toBe(nativeConfirm)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('focusReturn', () => {
  it('returns focus to the first captured element only', () => {
    const trigger = document.createElement('button')
    const other = document.createElement('button')
    document.body.append(trigger, other)
    cleanups.push(() => {
      trigger.remove()
      other.remove()
    })

    trigger.focus()
    captureFocus()
    other.focus()
    captureFocus()
    returnFocus()
    expect(document.activeElement).toBe(trigger)

    other.focus()
    returnFocus()
    expect(document.activeElement).toBe(other)
  })
})
