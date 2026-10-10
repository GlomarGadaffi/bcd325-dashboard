import { SentinelStore } from '../../core/SentinelStore'
import type { PatchState, P25CardState } from '../../core/SentinelStore'
import { Serial } from '../../core/SerialMonitor'
import type { P25Event } from '../../types'
import type { GrantEvent, LeaderboardEntry, RawLogEntry, SessionStats } from '../../types'

/** A patch row: the store's PatchState plus the patch ID it was keyed by. */
export interface PatchRow extends PatchState {
  id: string
}

/** A P25 talkgroup row: the store's card plus the talkgroup ID it was keyed by. */
export interface P25Row extends P25CardState {
  tgid: string
}

export interface LcdData {
  tgid: string
  name: string
  agency: string
}

/**
 * Everything the UI renders from. Built by copy from the core store, so the
 * arrays and objects here never change after they are handed out.
 */
export interface SentinelSnapshot {
  connected: boolean
  siteId: string
  /** Newest first. The store keeps the last 200. */
  grants: GrantEvent[]
  /** Oldest first. The store keeps the last 200. */
  rawLog: RawLogEntry[]
  patches: PatchRow[]
  p25Cards: P25Row[]
  leaderboard: LeaderboardEntry[]
  /** [LCN hex, VC hex] pairs, in the order the store learned them. */
  lcnMap: [string, string][]
  persistentSlers: Record<string, number>
  persistentPatches: Record<string, number>
  persistentP25: Record<string, number>
  stats: SessionStats
  p25HoldingTG: string | null
  lcdState: SentinelStore['lcdState']
  lcdData: LcdData
  /** Timestamp of the newest raw line, or null before the first line. Drives liveness. */
  lastRawAt: number | null
}

// The one store for the app. Constructing it hooks the Serial listeners.
const store = new SentinelStore()

/**
 * Read-only reference to the core store, for tests and diagnostics.
 * UI code reads getSnapshot() instead of this.
 */
export const coreStore: SentinelStore = store

let connected = Serial.connected
let dirty = false
let pinned = false

function markDirty(): void {
  dirty = true
}

function newestRawAt(rawLog: RawLogEntry[]): number | null {
  let newest: number | null = null
  for (const entry of rawLog) {
    if (newest === null || entry.timestamp > newest) newest = entry.timestamp
  }
  return newest
}

function buildSnapshot(): SentinelSnapshot {
  const rawLog = store.rawLog.slice()
  return {
    connected,
    siteId: store.siteId,
    grants: store.grants.slice(),
    rawLog,
    patches: Array.from(store.patches, ([id, p]) => ({ ...p, id, members: p.members.slice() })),
    p25Cards: Array.from(store.p25Cards, ([tgid, c]) => ({ ...c, tgid })),
    leaderboard: store.getLeaderboardRows(),
    lcnMap: Array.from(store.lcnMap),
    persistentSlers: { ...store.persistentSlers },
    persistentPatches: { ...store.persistentPatches },
    persistentP25: { ...store.persistentP25 },
    stats: { ...store.stats },
    p25HoldingTG: store.p25HoldingTG,
    lcdState: store.lcdState,
    lcdData: { ...store.lcdData },
    lastRawAt: newestRawAt(rawLog),
  }
}

let snapshot = $state.raw<SentinelSnapshot>(buildSnapshot())

store.subscribe(markDirty)
Serial.onStatusChange((next) => {
  connected = next
  markDirty()
})

// Store emits and status changes only mark the snapshot dirty. The snapshot
// itself is rebuilt at most once per second, however many emits arrived.
setInterval(() => {
  if (pinned || !dirty) return
  dirty = false
  snapshot = buildSnapshot()
}, 1000)

/** The latest snapshot. Reading it in a template, $derived or $effect tracks it. */
export function getSnapshot(): SentinelSnapshot {
  return snapshot
}

/**
 * Replaces the snapshot and pins it, so the once-a-second rebuild from the core
 * store does not overwrite it. Tests and the dev hook use this to inject state.
 */
export function setSnapshot(next: SentinelSnapshot): void {
  snapshot = next
  pinned = true
}

/** Unpins an injected snapshot; the next store emit rebuilds from live state. */
export function resumeLive(): void {
  pinned = false
  dirty = true
}

/**
 * Resolves with null on success, 'NotFoundError' when the operator cancels the
 * picker, or the error name for a real failure to open the port.
 */
export async function connect(): Promise<string | null> {
  await Serial.connect()
  const err = Serial.lastConnectError
  if (err === null) return null
  return err instanceof DOMException ? err.name : 'Error'
}

export function disconnect(): Promise<void> {
  return Serial.disconnect()
}

export function toggleP25Hold(tgid: string): void {
  store.toggleP25Hold(tgid)
}

export function exportJSON(): void {
  store.exportJSON()
}

export function exportCSV(): void {
  store.exportCSV()
}

export function wipeDB(): void {
  store.wipeDB()
}

/** Passthrough to Serial.onP25. Returns the unsubscribe function. */
export function onP25(cb: (e: P25Event) => void): () => void {
  return Serial.onP25(cb)
}

/** Passthrough to Serial.onRawLine. Returns the unsubscribe function. */
export function onRawLine(cb: (line: string) => void): () => void {
  return Serial.onRawLine(cb)
}
