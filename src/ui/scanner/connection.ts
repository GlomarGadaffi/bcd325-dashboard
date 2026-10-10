import { formatClock } from './format'

/** Connected with no raw line for this long: the 'no data' notice. */
export const NO_DATA_AFTER_MS = 5000
/** Connected with no raw line for this long: STALE. */
export const STALE_AFTER_MS = 15000

export type ConnectionState = 'OFFLINE' | 'LIVE' | 'STALE'
export type ConnectionNotice = 'unsupported' | 'port-error' | 'offline' | 'no-data'

export interface ConnectionInput {
  connected: boolean
  hasWebSerial: boolean
  portError: boolean
  /** Newest raw line time, or null before the first line. */
  lastRawAt: number | null
  /** When the current connected or disconnected state began. */
  since: number
  /** When the connection last dropped after being live, or null. Drives the offline notice. */
  droppedAt: number | null
  now: number
}

export interface ConnectionView {
  state: ConnectionState
  /** Age of the newest raw line, or null before the first line. */
  dataAgeMs: number | null
  /** Connected silence: time since the newest line, or since connecting if that is shorter. */
  silentMs: number
  notice: ConnectionNotice | null
}

/**
 * Connection state and the one notice to show. Precedence for the notice: unsupported
 * browser, then port error, then a drop, then no data.
 */
export function connectionView(input: ConnectionInput): ConnectionView {
  const { connected, now, since } = input
  const dataAgeMs = input.lastRawAt === null ? null : Math.max(0, now - input.lastRawAt)
  // A line from before a reconnect is not evidence of data after it.
  const silentMs = connected ? Math.min(dataAgeMs ?? Infinity, Math.max(0, now - since)) : 0

  let state: ConnectionState = 'OFFLINE'
  if (connected) state = silentMs >= STALE_AFTER_MS ? 'STALE' : 'LIVE'

  let notice: ConnectionNotice | null = null
  if (!input.hasWebSerial) notice = 'unsupported'
  else if (input.portError) notice = 'port-error'
  else if (!connected && input.droppedAt !== null) notice = 'offline'
  else if (connected && silentMs >= NO_DATA_AFTER_MS) notice = 'no-data'

  return { state, dataAgeMs, silentMs, notice }
}

/** 'data stopped at HH:MM:SS' for a list that is frozen while offline, or null when live. */
export function dataStoppedLabel(connected: boolean, lastRawAt: number | null): string | null {
  if (connected || lastRawAt === null) return null
  return `data stopped at ${formatClock(lastRawAt)}`
}

export const PORT_ERROR_COPY = 'Could not open the scanner port. Close other apps using it, then retry.'
export const UNSUPPORTED_COPY = 'Use Chrome or Edge on desktop.'
export const NO_DATA_COPY = 'Connected, no data from the scanner. Check USB mode and C-CH output.'
