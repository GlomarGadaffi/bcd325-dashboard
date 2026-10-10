import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The adapter module builds the core store and hooks the serial listeners on import.
// The machine only needs its toggle and raw-line subscription, so both are stubbed.
vi.mock('../state/adapter.svelte', () => ({
  toggleP25Hold: vi.fn(),
  onRawLine: vi.fn(() => () => {}),
}))

import {
  createHoldController,
  HOLD_ECHO_MS,
  holdNeedsConfirm,
  INITIAL_HOLD,
  isQuiet,
  QUIET_AFTER_MS,
  reduceHold,
  type HoldEvent,
  type HoldModel,
  type HoldPhase,
} from './holdMachine'

const T0 = 1_000_000

/** A GLG line with the TGID in field 1 and squelch in field 8, the layout ScannerDecoder reads. */
function glg(tgid: string, squelch: 0 | 1): string {
  return `GLG,${tgid},FM,0,0,ACSO,Dispatch,Dispatch 1,${squelch},0,001,001,293`
}

function connected(phase: HoldPhase, storeHold: string | null = null): HoldModel {
  return { connected: true, storeHold, phase }
}

function step(m: HoldModel, ev: HoldEvent): HoldModel {
  return reduceHold(m, ev).model
}

describe('reduceHold: hold request', () => {
  it('ignores a hold request while disconnected', () => {
    const r = reduceHold(INITIAL_HOLD, { type: 'hold', tgid: '945', at: T0 })
    expect(r.model).toBe(INITIAL_HOLD)
    expect(r.effects).toEqual([])
  })

  it('moves AUTO-SKIP to PENDING and sends the hold with a timer armed', () => {
    const r = reduceHold(connected({ kind: 'AUTO_SKIP' }), { type: 'hold', tgid: '945', at: T0 })
    expect(r.model.phase).toEqual({ kind: 'PENDING', tgid: '945', since: T0 })
    expect(r.model.storeHold).toBe('945')
    expect(r.effects).toEqual([
      { type: 'hold', tgid: '945', releaseFirst: false },
      { type: 'arm', since: T0 },
    ])
  })

  it('does nothing when the same TG is already pending or held', () => {
    const pending = connected({ kind: 'PENDING', tgid: '945', since: T0 }, '945')
    expect(reduceHold(pending, { type: 'hold', tgid: '945', at: T0 + 1 }).model).toBe(pending)
    const held = connected({ kind: 'HELD', tgid: '945', lastAudioAt: null }, '945')
    expect(reduceHold(held, { type: 'hold', tgid: '945', at: T0 + 1 }).effects).toEqual([])
  })

  it('switches to another TG without a release first', () => {
    const r = reduceHold(connected({ kind: 'HELD', tgid: '945', lastAudioAt: null }, '945'), {
      type: 'hold',
      tgid: '1001',
      at: T0,
    })
    expect(r.model.phase).toMatchObject({ kind: 'PENDING', tgid: '1001' })
    expect(r.effects[0]).toEqual({ type: 'hold', tgid: '1001', releaseFirst: false })
  })

  it('asks for a release first when re-holding the TG the store already holds (FAILED)', () => {
    const failed = connected({ kind: 'FAILED', tgid: '945', since: T0 }, '945')
    const r = reduceHold(failed, { type: 'hold', tgid: '945', at: T0 + 9000 })
    expect(r.effects[0]).toEqual({ type: 'hold', tgid: '945', releaseFirst: true })
    expect(r.model.phase).toMatchObject({ kind: 'PENDING', since: T0 + 9000 })
  })

  it('confirms a stale hold by re-holding the same TG with a release first', () => {
    const stale = connected({ kind: 'STALE', tgid: '945' }, '945')
    const r = reduceHold(stale, { type: 'hold', tgid: '945', at: T0 })
    expect(r.effects[0]).toEqual({ type: 'hold', tgid: '945', releaseFirst: true })
    expect(r.model.phase.kind).toBe('PENDING')
  })
})

describe('reduceHold: timeout', () => {
  const pending = connected({ kind: 'PENDING', tgid: '945', since: T0 }, '945')

  it('becomes FAILED when the matching timer fires with no echo', () => {
    const next = step(pending, { type: 'timeout', since: T0 })
    expect(next.phase).toEqual({ kind: 'FAILED', tgid: '945', since: T0 })
    expect(next.storeHold).toBe('945')
  })

  it('ignores a timer that belongs to an earlier request', () => {
    expect(reduceHold(pending, { type: 'timeout', since: T0 - 1 }).model).toBe(pending)
  })

  it('never fails a hold that is already HELD (silence after HELD is not failure)', () => {
    const held = connected({ kind: 'HELD', tgid: '945', lastAudioAt: T0 }, '945')
    expect(reduceHold(held, { type: 'timeout', since: T0 }).model).toBe(held)
  })
})

describe('reduceHold: echo and first held packet', () => {
  const pending = connected({ kind: 'PENDING', tgid: '945', since: T0 }, '945')

  it('does not treat another TG during PENDING as the echo', () => {
    expect(reduceHold(pending, { type: 'line', tgid: '1001', squelchOpen: true, at: T0 + 100 }).model).toMatchObject({
      phase: { kind: 'PENDING' },
    })
  })

  it('ignores a line from before the request', () => {
    expect(reduceHold(pending, { type: 'line', tgid: '945', squelchOpen: true, at: T0 - 1 }).model.phase.kind).toBe(
      'PENDING',
    )
  })

  it('becomes HELD on a line for the requested TG and disarms the timer', () => {
    const r = reduceHold(pending, { type: 'line', tgid: '945', squelchOpen: true, at: T0 + 200 })
    expect(r.model.phase).toEqual({ kind: 'HELD', tgid: '945', lastAudioAt: T0 + 200 })
    expect(r.effects).toEqual([{ type: 'disarm' }])
  })

  it('becomes HELD with no audio time when the echo has squelch closed', () => {
    const r = reduceHold(pending, { type: 'line', tgid: '945', squelchOpen: false, at: T0 + 200 })
    expect(r.model.phase).toEqual({ kind: 'HELD', tgid: '945', lastAudioAt: null })
  })

  it('marks the connection live on any raw line, even before the snapshot catches up', () => {
    const offline = { ...pending, connected: false }
    expect(step(offline, { type: 'line', tgid: '945', squelchOpen: false, at: T0 }).connected).toBe(true)
  })
})

describe('reduceHold: HELD, audio and mismatch', () => {
  const held = connected({ kind: 'HELD', tgid: '945', lastAudioAt: null }, '945')

  it('records squelch-open audio for the held TG', () => {
    const next = step(held, { type: 'line', tgid: '945', squelchOpen: true, at: T0 })
    expect(next.phase).toEqual({ kind: 'HELD', tgid: '945', lastAudioAt: T0 })
  })

  it('keeps the same model object for squelch-closed polls, so nothing re-renders', () => {
    expect(reduceHold(held, { type: 'line', tgid: '945', squelchOpen: false, at: T0 }).model).toBe(held)
  })

  it('keeps the same model object for audio inside the same second', () => {
    const audible = connected({ kind: 'HELD', tgid: '945', lastAudioAt: T0 }, '945')
    expect(reduceHold(audible, { type: 'line', tgid: '945', squelchOpen: true, at: T0 + 400 }).model).toBe(audible)
  })

  it('moves to MISMATCH when the scanner reports another TG while held', () => {
    const next = step(held, { type: 'line', tgid: '1001', squelchOpen: true, at: T0 })
    expect(next.phase).toEqual({ kind: 'MISMATCH', tgid: '945', reportedTg: '1001', reportedAt: T0 })
  })

  it('returns from MISMATCH to HELD when the held TG is seen again', () => {
    const mismatch = connected({ kind: 'MISMATCH', tgid: '945', reportedTg: '1001', reportedAt: T0 }, '945')
    const next = step(mismatch, { type: 'line', tgid: '945', squelchOpen: true, at: T0 + 2000 })
    expect(next.phase).toEqual({ kind: 'HELD', tgid: '945', lastAudioAt: T0 + 2000 })
  })

  it('updates the reported TG when the scanner reports a different one', () => {
    const mismatch = connected({ kind: 'MISMATCH', tgid: '945', reportedTg: '1001', reportedAt: T0 }, '945')
    const next = step(mismatch, { type: 'line', tgid: '2002', squelchOpen: false, at: T0 + 1000 })
    expect(next.phase).toEqual({ kind: 'MISMATCH', tgid: '945', reportedTg: '2002', reportedAt: T0 + 1000 })
  })

  it('stays MISMATCH and whole-second coalesced for repeated reports of the same TG', () => {
    const mismatch = connected({ kind: 'MISMATCH', tgid: '945', reportedTg: '1001', reportedAt: T0 }, '945')
    expect(reduceHold(mismatch, { type: 'line', tgid: '1001', squelchOpen: true, at: T0 + 300 }).model).toBe(mismatch)
  })

  it('never moves a HELD hold to FAILED on silence', () => {
    let m = held
    for (let t = T0; t < T0 + 60_000; t += 1000) m = step(m, { type: 'timeout', since: T0 })
    expect(m.phase.kind).toBe('HELD')
  })
})

describe('reduceHold: FAILED', () => {
  it('turns HELD on a late echo for the requested TG', () => {
    const failed = connected({ kind: 'FAILED', tgid: '945', since: T0 }, '945')
    const next = step(failed, { type: 'line', tgid: '945', squelchOpen: true, at: T0 + 3500 })
    expect(next.phase).toEqual({ kind: 'HELD', tgid: '945', lastAudioAt: T0 + 3500 })
  })

  it('ignores lines for other TGs', () => {
    const failed = connected({ kind: 'FAILED', tgid: '945', since: T0 }, '945')
    expect(reduceHold(failed, { type: 'line', tgid: '1001', squelchOpen: true, at: T0 + 3500 }).model).toBe(failed)
  })
})

describe('reduceHold: release', () => {
  it('releases a held TG and clears the store mirror', () => {
    const r = reduceHold(connected({ kind: 'HELD', tgid: '945', lastAudioAt: null }, '945'), { type: 'release' })
    expect(r.model).toEqual({ connected: true, storeHold: null, phase: { kind: 'AUTO_SKIP' } })
    expect(r.effects).toEqual([
      { type: 'release', tgid: '945' },
      { type: 'disarm' },
    ])
  })

  it('releases from FAILED and STALE', () => {
    expect(step(connected({ kind: 'FAILED', tgid: '945', since: T0 }, '945'), { type: 'release' }).phase.kind).toBe(
      'AUTO_SKIP',
    )
    expect(step(connected({ kind: 'STALE', tgid: '945' }, '945'), { type: 'release' }).phase.kind).toBe('AUTO_SKIP')
  })

  it('does nothing when nothing is held', () => {
    const m = connected({ kind: 'AUTO_SKIP' })
    expect(reduceHold(m, { type: 'release' }).model).toBe(m)
  })

  it('does nothing while disconnected: Release is disabled and the stored hold stays', () => {
    const m: HoldModel = { connected: false, storeHold: '945', phase: { kind: 'STALE', tgid: '945' } }
    const r = reduceHold(m, { type: 'release' })
    expect(r.model).toBe(m)
    expect(r.effects).toEqual([])
  })
})

describe('reduceHold: connection changes', () => {
  it('does nothing when the flag does not change', () => {
    const m = connected({ kind: 'AUTO_SKIP' })
    expect(reduceHold(m, { type: 'connection', connected: true }).model).toBe(m)
    expect(reduceHold(INITIAL_HOLD, { type: 'connection', connected: false }).model).toBe(INITIAL_HOLD)
  })

  it('turns a live hold into STALE on disconnect, without changing the TG', () => {
    const r = reduceHold(connected({ kind: 'HELD', tgid: '945', lastAudioAt: T0 }, '945'), {
      type: 'connection',
      connected: false,
    })
    expect(r.model).toMatchObject({ connected: false, phase: { kind: 'STALE', tgid: '945' }, storeHold: '945' })
    expect(r.effects).toEqual([])
  })

  it('disarms the timer when a PENDING hold is cut off by a disconnect', () => {
    const r = reduceHold(connected({ kind: 'PENDING', tgid: '945', since: T0 }, '945'), {
      type: 'connection',
      connected: false,
    })
    expect(r.model.phase).toEqual({ kind: 'STALE', tgid: '945' })
    expect(r.effects).toEqual([{ type: 'disarm' }])
  })

  it('keeps AUTO-SKIP on disconnect when nothing is held', () => {
    const r = reduceHold(connected({ kind: 'AUTO_SKIP' }), { type: 'connection', connected: false })
    expect(r.model.phase).toEqual({ kind: 'AUTO_SKIP' })
    expect(r.model.connected).toBe(false)
  })

  it('stays STALE after reconnect: a stale hold is not live until echoed', () => {
    const stale = reduceHold(connected({ kind: 'HELD', tgid: '945', lastAudioAt: T0 }, '945'), {
      type: 'connection',
      connected: false,
    }).model
    const back = reduceHold(stale, { type: 'connection', connected: true }).model
    expect(back).toMatchObject({ connected: true, phase: { kind: 'STALE', tgid: '945' } })
  })

  it('stays STALE through silence and other TGs, and goes HELD on an echo for its TG', () => {
    const stale = connected({ kind: 'STALE', tgid: '945' }, '945')
    expect(step(stale, { type: 'line', tgid: '1001', squelchOpen: true, at: T0 }).phase.kind).toBe('STALE')
    expect(step(stale, { type: 'line', tgid: '945', squelchOpen: true, at: T0 }).phase.kind).toBe('HELD')
  })
})

describe('isQuiet', () => {
  it('is quiet when held with no audio since the hold began', () => {
    expect(isQuiet({ kind: 'HELD', tgid: '945', lastAudioAt: null }, T0)).toBe(true)
  })

  it('is not quiet while audio is recent and quiet once it is older than QUIET_AFTER_MS', () => {
    const phase: HoldPhase = { kind: 'HELD', tgid: '945', lastAudioAt: T0 }
    expect(isQuiet(phase, T0 + QUIET_AFTER_MS - 1)).toBe(false)
    expect(isQuiet(phase, T0 + QUIET_AFTER_MS)).toBe(true)
  })

  it('is never quiet outside HELD', () => {
    expect(isQuiet({ kind: 'PENDING', tgid: '945', since: T0 }, T0 + 60_000)).toBe(false)
    expect(isQuiet({ kind: 'AUTO_SKIP' }, T0 + 60_000)).toBe(false)
  })
})

describe('holdNeedsConfirm', () => {
  it('confirms on touch devices at any width', () => {
    expect(holdNeedsConfirm(true, 1440)).toBe(true)
  })

  it('confirms at phone width even without touch', () => {
    expect(holdNeedsConfirm(false, 639)).toBe(true)
    expect(holdNeedsConfirm(false, 640)).toBe(false)
  })
})

describe('createHoldController: timers and store commands', () => {
  let toggle = vi.fn<(tgid: string) => void>()

  beforeEach(() => {
    vi.useFakeTimers()
    toggle = vi.fn<(tgid: string) => void>()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function controller() {
    return createHoldController({
      now: () => Date.now(),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      toggle,
    })
  }

  function current(c: ReturnType<typeof controller>): HoldModel {
    let value: HoldModel = INITIAL_HOLD
    c.subscribe((m) => (value = m))()
    return value
  }

  function subscribed(c: ReturnType<typeof controller>): () => HoldModel {
    let value: HoldModel = INITIAL_HOLD
    c.subscribe((m) => (value = m))
    return () => value
  }

  it('sends one toggle for a hold and fails it only at the echo deadline', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(toggle).toHaveBeenLastCalledWith('945')

    vi.advanceTimersByTime(HOLD_ECHO_MS - 1)
    expect(read().phase.kind).toBe('PENDING')

    vi.advanceTimersByTime(1)
    expect(read().phase).toMatchObject({ kind: 'FAILED', tgid: '945' })
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('cancels the deadline when the echo arrives, so a held TG is never failed by silence', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    c.line(glg('945', 0), Date.now())
    expect(read().phase).toMatchObject({ kind: 'HELD', tgid: '945', lastAudioAt: null })

    vi.advanceTimersByTime(60_000)
    expect(read().phase.kind).toBe('HELD')
  })

  it('takes the echo from raw GLG lines and ignores idle and non-GLG lines', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    c.line('OK', Date.now())
    c.line('GLG,,,,,,,,,,', Date.now())
    expect(read().phase.kind).toBe('PENDING')
    c.line(glg('945', 1), Date.now())
    expect(read().phase).toMatchObject({ kind: 'HELD', lastAudioAt: Date.now() })
  })

  it('reaches HELD from a late echo after FAILED', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    vi.advanceTimersByTime(HOLD_ECHO_MS)
    expect(read().phase.kind).toBe('FAILED')
    c.line(glg('945', 0), Date.now())
    expect(read().phase.kind).toBe('HELD')
  })

  it('releases with one toggle and clears the mirror', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    c.line(glg('945', 0), Date.now())
    c.release()
    expect(toggle).toHaveBeenLastCalledWith('945')
    expect(toggle).toHaveBeenCalledTimes(2)
    expect(read()).toEqual({ connected: true, storeHold: null, phase: { kind: 'AUTO_SKIP' } })
  })

  it('re-holds a stale TG with a release then a hold, so the store ends up holding it', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    c.line(glg('945', 0), Date.now())
    c.connection(false)
    expect(read().phase).toEqual({ kind: 'STALE', tgid: '945' })

    c.connection(true)
    toggle.mockClear()
    c.hold('945')
    expect(toggle.mock.calls).toEqual([['945'], ['945']])
    expect(read().phase.kind).toBe('PENDING')
  })

  it('does not send anything while disconnected', () => {
    const c = controller()
    c.hold('945')
    c.release()
    expect(toggle).not.toHaveBeenCalled()
    expect(current(c).phase.kind).toBe('AUTO_SKIP')
  })

  it('cancels a pending deadline on disconnect, so it cannot fail later', () => {
    const c = controller()
    const read = subscribed(c)
    c.connection(true)
    c.hold('945')
    c.connection(false)
    vi.advanceTimersByTime(HOLD_ECHO_MS * 2)
    expect(read().phase).toEqual({ kind: 'STALE', tgid: '945' })
  })
})
