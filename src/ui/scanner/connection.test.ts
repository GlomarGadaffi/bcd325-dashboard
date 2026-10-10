import { describe, expect, it } from 'vitest'
import {
  connectionView,
  dataStoppedLabel,
  NO_DATA_AFTER_MS,
  STALE_AFTER_MS,
  type ConnectionInput,
} from './connection'

const NOW = 2_000_000

function input(overrides: Partial<ConnectionInput> = {}): ConnectionInput {
  return {
    connected: true,
    hasWebSerial: true,
    portError: false,
    lastRawAt: NOW - 1000,
    since: NOW - 600_000,
    droppedAt: null,
    now: NOW,
    ...overrides,
  }
}

describe('connectionView state', () => {
  it('is LIVE with the age of the newest raw line', () => {
    const v = connectionView(input())
    expect(v).toEqual({ state: 'LIVE', dataAgeMs: 1000, silentMs: 1000, notice: null })
  })

  it('is OFFLINE when disconnected', () => {
    const v = connectionView(input({ connected: false, droppedAt: NOW - 5000 }))
    expect(v.state).toBe('OFFLINE')
    expect(v.dataAgeMs).toBe(1000)
  })

  it('is STALE at 15 seconds with no raw line, and not before', () => {
    expect(connectionView(input({ lastRawAt: NOW - STALE_AFTER_MS + 1 })).state).toBe('LIVE')
    expect(connectionView(input({ lastRawAt: NOW - STALE_AFTER_MS })).state).toBe('STALE')
  })

  it('does not count lines from before a reconnect as silence', () => {
    const v = connectionView(input({ lastRawAt: NOW - 120_000, since: NOW - 2000 }))
    expect(v.state).toBe('LIVE')
    expect(v.silentMs).toBe(2000)
    expect(v.notice).toBeNull()
  })

  it('treats connected with no line yet as silence since connecting', () => {
    expect(connectionView(input({ lastRawAt: null, since: NOW - 6000 }))).toMatchObject({
      state: 'LIVE',
      dataAgeMs: null,
      notice: 'no-data',
    })
    expect(connectionView(input({ lastRawAt: null, since: NOW - STALE_AFTER_MS })).state).toBe('STALE')
  })
})

describe('connectionView notice', () => {
  it('shows the no-data notice at 5 seconds of connected silence', () => {
    expect(connectionView(input({ lastRawAt: NOW - NO_DATA_AFTER_MS + 1 })).notice).toBeNull()
    expect(connectionView(input({ lastRawAt: NOW - NO_DATA_AFTER_MS })).notice).toBe('no-data')
  })

  it('shows the offline notice only after a live connection dropped', () => {
    expect(connectionView(input({ connected: false, droppedAt: NOW - 1 })).notice).toBe('offline')
    expect(connectionView(input({ connected: false, droppedAt: null })).notice).toBeNull()
  })

  it('shows no notice for a picker that was cancelled (never connected, no port error)', () => {
    expect(connectionView(input({ connected: false, lastRawAt: null, droppedAt: null })).notice).toBeNull()
  })

  it('shows the port error over a drop, and the unsupported browser over everything', () => {
    expect(connectionView(input({ connected: false, droppedAt: NOW - 1, portError: true })).notice).toBe('port-error')
    expect(
      connectionView(input({ connected: false, droppedAt: NOW - 1, portError: true, hasWebSerial: false })).notice,
    ).toBe('unsupported')
  })
})

describe('dataStoppedLabel', () => {
  it('names the time the data stopped while offline', () => {
    const at = new Date(2026, 9, 10, 14, 2, 7).getTime()
    expect(dataStoppedLabel(false, at)).toBe('data stopped at 14:02:07')
  })

  it('is null while connected, or when no line was ever received', () => {
    expect(dataStoppedLabel(true, NOW)).toBeNull()
    expect(dataStoppedLabel(false, null)).toBeNull()
  })
})
