/** A change of connection that the assertive region announces. */
export interface ConnectionChange {
  kind: 'dropped' | 'reconnected'
  at: number
}

// Shared by ConnectionPill and OfflineBanner. Both call observe() with the same snapshot
// value, so the first call records the change and the rest do nothing.
let last: boolean | null = null
let since = $state(Date.now())
let droppedAt = $state<number | null>(null)
let lastChange = $state<ConnectionChange | null>(null)

export const connectionTracker = {
  /** When the current connected or disconnected state began (load time before the first change). */
  get since(): number {
    return since
  },
  /** When the connection last dropped after being live, or null. */
  get droppedAt(): number | null {
    return droppedAt
  },
  /** The last drop or reconnect, for the assertive announcement. */
  get lastChange(): ConnectionChange | null {
    return lastChange
  },
  /** Records the connected flag. Repeated calls with the same value do nothing. */
  observe(connected: boolean, at: number = Date.now()): void {
    if (connected === last) return
    const wasConnected = last === true
    last = connected
    since = at
    if (connected) {
      if (droppedAt !== null) lastChange = { kind: 'reconnected', at }
      droppedAt = null
    } else if (wasConnected) {
      droppedAt = at
      lastChange = { kind: 'dropped', at }
    }
  },
}
