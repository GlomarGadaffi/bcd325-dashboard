import { writable, type Readable } from 'svelte/store'
import { ScannerDecoder } from '../../core/Decoder'
import { onRawLine, toggleP25Hold } from '../state/adapter.svelte'

/** A hold is confirmed only by a GLG line for the requested TG inside this window. */
export const HOLD_ECHO_MS = 3000
/** Held with no squelch-open line for this long reads as HELD QUIET. */
export const QUIET_AFTER_MS = 5000
/** Audio and mismatch timestamps move in whole seconds, so 150 ms GLG polls do not re-render. */
const AUDIO_STEP_MS = 1000
export const MOBILE_WIDTH_PX = 640

export type HoldPhase =
  | { kind: 'AUTO_SKIP' }
  | { kind: 'PENDING'; tgid: string; since: number }
  | { kind: 'HELD'; tgid: string; lastAudioAt: number | null }
  | { kind: 'MISMATCH'; tgid: string; reportedTg: string; reportedAt: number }
  | { kind: 'FAILED'; tgid: string; since: number }
  | { kind: 'STALE'; tgid: string }

export interface HoldModel {
  connected: boolean
  /**
   * The TG this module last sent to the store as a hold, or null. Set when a hold
   * is requested, cleared on release. The store writes p25HoldingTG on click, so
   * this mirror is exact at once; the 1 Hz snapshot would lag behind it.
   */
  storeHold: string | null
  phase: HoldPhase
}

export interface LineEvent {
  type: 'line'
  tgid: string
  squelchOpen: boolean
  at: number
}

export type HoldEvent =
  | { type: 'hold'; tgid: string; at: number }
  | { type: 'release' }
  | LineEvent
  | { type: 'timeout'; since: number }
  | { type: 'connection'; connected: boolean }

export type HoldEffect =
  | { type: 'hold'; tgid: string; releaseFirst: boolean }
  | { type: 'release'; tgid: string }
  | { type: 'arm'; since: number }
  | { type: 'disarm' }

export interface HoldStep {
  model: HoldModel
  effects: HoldEffect[]
}

export const INITIAL_HOLD: HoldModel = {
  connected: false,
  storeHold: null,
  phase: { kind: 'AUTO_SKIP' },
}

function unchanged(model: HoldModel): HoldStep {
  return { model, effects: [] }
}

function withPhase(model: HoldModel, phase: HoldPhase): HoldModel {
  return { ...model, phase }
}

/** Moves to HELD. lastAudioAt is set only when the line that confirmed it had squelch open. */
function withHeld(model: HoldModel, tgid: string, lastAudioAt: number | null): HoldModel {
  return withPhase(model, { kind: 'HELD', tgid, lastAudioAt })
}

/** Keeps a timestamp until the next whole-second step, so only real changes re-render. */
function touchAudio(prev: number | null, at: number): number {
  return prev === null || at - prev >= AUDIO_STEP_MS ? at : prev
}

function onConnection(m: HoldModel, connected: boolean): HoldStep {
  if (connected === m.connected) return unchanged(m)
  if (connected) return unchanged({ ...m, connected: true })

  // Nothing can be confirmed with the port closed. The scanner keeps its hold, so the
  // hold stays listed as stale until a line for that TG shows it is live again.
  const phase = m.phase
  const effects: HoldEffect[] = phase.kind === 'PENDING' ? [{ type: 'disarm' }] : []
  if (phase.kind === 'AUTO_SKIP' || phase.kind === 'STALE') {
    return { model: { ...m, connected: false }, effects }
  }
  return { model: { ...m, connected: false, phase: { kind: 'STALE', tgid: phase.tgid } }, effects }
}

function onHold(m: HoldModel, tgid: string, at: number): HoldStep {
  const phase = m.phase
  if (!m.connected) return unchanged(m)
  // Already holding this TG (or waiting on it): nothing new to send.
  if ((phase.kind === 'PENDING' || phase.kind === 'HELD') && phase.tgid === tgid) return unchanged(m)
  return {
    model: { ...m, storeHold: tgid, phase: { kind: 'PENDING', tgid, since: at } },
    effects: [
      // The store toggles, so a hold on the TG it already holds would release it.
      // The controller sends release and hold in that case.
      { type: 'hold', tgid, releaseFirst: m.storeHold === tgid },
      { type: 'arm', since: at },
    ],
  }
}

function onRelease(m: HoldModel): HoldStep {
  if (!m.connected || m.storeHold === null) return unchanged(m)
  return {
    model: { ...m, storeHold: null, phase: { kind: 'AUTO_SKIP' } },
    effects: [{ type: 'release', tgid: m.storeHold }, { type: 'disarm' }],
  }
}

function onLine(m: HoldModel, ev: LineEvent): HoldStep {
  // A raw line proves the port is open, so it also clears a disconnected flag that
  // the 1 Hz snapshot has not caught up with yet.
  const base: HoldModel = m.connected ? m : { ...m, connected: true }
  const phase = m.phase
  const echoAudio = ev.squelchOpen ? ev.at : null

  switch (phase.kind) {
    case 'AUTO_SKIP':
      return unchanged(base)

    case 'PENDING':
      // Lines from before the request, or for another TG, are not the echo. Another
      // TG during PENDING is usually traffic from before the hold took effect.
      if (ev.at < phase.since || ev.tgid !== phase.tgid) return unchanged(base)
      return { model: withHeld(base, phase.tgid, echoAudio), effects: [{ type: 'disarm' }] }

    case 'HELD':
      if (ev.tgid !== phase.tgid) {
        return unchanged(withPhase(base, { kind: 'MISMATCH', tgid: phase.tgid, reportedTg: ev.tgid, reportedAt: ev.at }))
      }
      if (!ev.squelchOpen) return unchanged(base)
      {
        const next = touchAudio(phase.lastAudioAt, ev.at)
        return unchanged(next === phase.lastAudioAt ? base : withHeld(base, phase.tgid, next))
      }

    case 'MISMATCH':
      if (ev.tgid === phase.tgid) return unchanged(withHeld(base, phase.tgid, echoAudio))
      if (ev.tgid === phase.reportedTg) {
        const next = touchAudio(phase.reportedAt, ev.at)
        return unchanged(next === phase.reportedAt ? base : withPhase(base, { ...phase, reportedAt: next }))
      }
      return unchanged(withPhase(base, { ...phase, reportedTg: ev.tgid, reportedAt: ev.at }))

    case 'FAILED':
      // A late echo still confirms the hold; the failure was only the timer.
      if (ev.tgid !== phase.tgid || ev.at < phase.since) return unchanged(base)
      return unchanged(withHeld(base, phase.tgid, echoAudio))

    case 'STALE':
      // Not live until echoed: a fresh line for the same TG is the only way out.
      if (ev.tgid !== phase.tgid) return unchanged(base)
      return unchanged(withHeld(base, phase.tgid, echoAudio))
  }
}

function onTimeout(m: HoldModel, since: number): HoldStep {
  const phase = m.phase
  // A timer for an earlier request must not fail a newer one.
  if (phase.kind !== 'PENDING' || phase.since !== since) return unchanged(m)
  return unchanged(withPhase(m, { kind: 'FAILED', tgid: phase.tgid, since }))
}

/**
 * The hold state machine as a pure function. It returns the next model and the
 * commands and timer changes the caller must perform.
 */
export function reduceHold(m: HoldModel, ev: HoldEvent): HoldStep {
  switch (ev.type) {
    case 'connection':
      return onConnection(m, ev.connected)
    case 'hold':
      return onHold(m, ev.tgid, ev.at)
    case 'release':
      return onRelease(m)
    case 'line':
      return onLine(m, ev)
    case 'timeout':
      return onTimeout(m, ev.since)
  }
}

/**
 * HELD QUIET: held, and no squelch-open line for the TG within QUIET_AFTER_MS, or none
 * since the hold began. This is a normal state, not an error.
 */
export function isQuiet(phase: HoldPhase, now: number): boolean {
  if (phase.kind !== 'HELD') return false
  return phase.lastAudioAt === null || now - phase.lastAudioAt >= QUIET_AFTER_MS
}

/** Touch devices and phone width confirm every hold. Desktop mouse holds go straight through. */
export function holdNeedsConfirm(touch: boolean, viewportWidth: number): boolean {
  return touch || viewportWidth < MOBILE_WIDTH_PX
}

export interface HoldDeps {
  now: () => number
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** The store's toggle: sets the hold when the TG is not held, releases it when it is. */
  toggle: (tgid: string) => void
}

export interface HoldController extends Readable<HoldModel> {
  hold(tgid: string): void
  release(): void
  /** Feeds one raw scanner line. Only GLG lines with a TGID change state. */
  line(raw: string, at: number): void
  connection(connected: boolean): void
}

/**
 * Runs the reducer and performs its effects. Timers and store commands are injected so
 * tests can drive them directly. The UI uses the singleton below.
 */
export function createHoldController(deps: HoldDeps): HoldController {
  let model: HoldModel = INITIAL_HOLD
  const store = writable<HoldModel>(model)
  let armed: { handle: unknown } | null = null

  function disarm(): void {
    if (armed) {
      deps.clearTimer(armed.handle)
      armed = null
    }
  }

  function arm(since: number): void {
    disarm()
    const slot: { handle: unknown } = { handle: undefined }
    armed = slot
    slot.handle = deps.setTimer(() => {
      if (armed === slot) armed = null
      dispatch({ type: 'timeout', since })
    }, HOLD_ECHO_MS)
  }

  function run(fx: HoldEffect): void {
    switch (fx.type) {
      case 'hold':
        if (fx.releaseFirst) deps.toggle(fx.tgid)
        deps.toggle(fx.tgid)
        return
      case 'release':
        deps.toggle(fx.tgid)
        return
      case 'arm':
        arm(fx.since)
        return
      case 'disarm':
        disarm()
        return
    }
  }

  function dispatch(ev: HoldEvent): void {
    const step = reduceHold(model, ev)
    if (step.model !== model) {
      model = step.model
      store.set(model)
    }
    for (const fx of step.effects) run(fx)
  }

  return {
    subscribe: store.subscribe,
    hold: (tgid) => dispatch({ type: 'hold', tgid, at: deps.now() }),
    release: () => dispatch({ type: 'release' }),
    line: (raw, at) => {
      const event = ScannerDecoder.parseP25(raw)
      if (event) dispatch({ type: 'line', tgid: event.tgid, squelchOpen: event.isSquelchOpen, at })
    },
    connection: (connected) => dispatch({ type: 'connection', connected }),
  }
}

/** The one hold controller for the app. Every hold and release goes through it. */
export const holdController = createHoldController({
  now: () => Date.now(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (handle) => window.clearTimeout(handle as number),
  toggle: toggleP25Hold,
})

onRawLine((raw) => holdController.line(raw, Date.now()))
