import { describe, expect, it } from 'vitest'
import { connectionTracker } from './connection.svelte'

describe('connectionTracker', () => {
  it('records a drop after a live connection, and a reconnect after that', () => {
    connectionTracker.observe(false, 1000)
    expect(connectionTracker.droppedAt).toBeNull()
    expect(connectionTracker.lastChange).toBeNull()

    connectionTracker.observe(true, 2000)
    expect(connectionTracker.since).toBe(2000)
    expect(connectionTracker.lastChange).toBeNull()

    connectionTracker.observe(false, 3000)
    expect(connectionTracker.droppedAt).toBe(3000)
    expect(connectionTracker.lastChange).toEqual({ kind: 'dropped', at: 3000 })

    connectionTracker.observe(true, 4000)
    expect(connectionTracker.droppedAt).toBeNull()
    expect(connectionTracker.lastChange).toEqual({ kind: 'reconnected', at: 4000 })
  })

  it('does nothing when the same value is observed again, so shared callers are safe', () => {
    connectionTracker.observe(true, 5000)
    const since = connectionTracker.since
    connectionTracker.observe(true, since + 4000)
    expect(connectionTracker.since).toBe(since)
  })
})
