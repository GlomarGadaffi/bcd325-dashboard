import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import type { LeaderboardEntry } from '../../types'
import LeaderboardPanel from './LeaderboardPanel.svelte'

function entry(id: string, h5: number, h60: number): LeaderboardEntry {
  return { id, name: `Name ${id}`, agency: 'FHP', h5, h60 }
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
})

describe('LeaderboardPanel', () => {
  it('shows at most 20 rows, and only rows of its own kind', () => {
    const talkgroups = Array.from({ length: 25 }, (_, i) => entry(String(1000 + i), 25 - i, 30 - i))
    const units = Array.from({ length: 5 }, (_, i) => entry(`U:${i + 1}`, 500, 500))
    const instance = mount(LeaderboardPanel, {
      target: host,
      props: { kind: 'talkgroups', rows: [...units, ...talkgroups] },
    })
    cleanups.push(() => unmount(instance))
    flushSync()

    const rows = Array.from(host.querySelectorAll('[role="row"]:not(.head-row)'))
    expect(rows).toHaveLength(20)
    const ids = rows.map((row) => row.querySelector('.c-id')?.textContent)
    expect(ids[0]).toBe('1000')
    expect(ids[19]).toBe('1019')
    expect(ids.some((id) => id?.startsWith('U'))).toBe(false)
  })

  it('shows its empty line when no row belongs to its kind', () => {
    const instance = mount(LeaderboardPanel, {
      target: host,
      props: { kind: 'members', rows: [entry('1000', 3, 4)] },
    })
    cleanups.push(() => unmount(instance))
    flushSync()
    expect(host.textContent).toContain('No patch events in 60 minutes')
  })
})
