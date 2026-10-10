import type { GrantEvent } from '../../types'

// Pure logic for the status strip: ages, clock text, the grant delta and its
// coverage rule, and the last-call views. No DOM, no store reads.

export const PLACEHOLDER_SITE = 'AWAITING C-CH'
/** Mirrors the core store, which keeps the newest 200 grants. */
export const GRANT_BUFFER_CAP = 200
export const WINDOW_MS = 5 * 60_000
/** The delta needs the buffer to reach back over the current and the prior window. */
export const DELTA_COVERAGE_MS = 2 * WINDOW_MS
export const STALE_AFTER_MS = 60_000
export const PHONE_MAX_WIDTH_PX = 639
export const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH_PX}px)`

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Local HH:MM:SS. */
export function formatClock(timestamp: number): string {
  const d = new Date(timestamp)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** One age format everywhere: "4 s", "1 m 12 s", and "1 h 5 m" past an hour. Negative spans read as 0 s. */
export function formatAge(ageMs: number): string {
  const total = Math.max(0, Math.floor(ageMs / 1000))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  if (minutes < 60) return `${minutes} m ${total % 60} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

export function elapsedMs(now: number, then: number): number {
  return Math.max(0, now - then)
}

/** Exactly 60 s is not stale. */
export function isStale(ageMs: number): boolean {
  return ageMs > STALE_AFTER_MS
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US')
}

/** The site ID, or the placeholder while no SITE event has arrived. */
export function siteText(siteId: string | null | undefined): string {
  const trimmed = (siteId ?? '').trim()
  return trimmed !== '' && trimmed !== PLACEHOLDER_SITE ? trimmed : PLACEHOLDER_SITE
}

/**
 * The time from which the grant buffer holds every grant. Until the buffer is
 * full nothing has been dropped, so coverage starts at the session start. Once
 * it is full, coverage starts at the oldest grant still held.
 */
export function bufferCoverageStart(
  grants: readonly Pick<GrantEvent, 'timestamp'>[],
  sessionStart: number,
  cap: number = GRANT_BUFFER_CAP,
): number {
  if (grants.length < cap) return sessionStart
  let oldest = Infinity
  for (const grant of grants) {
    if (grant.timestamp < oldest) oldest = grant.timestamp
  }
  return oldest
}

export function hasDeltaCoverage(now: number, coverageStart: number): boolean {
  return now - coverageStart >= DELTA_COVERAGE_MS
}

export interface GrantDelta {
  current: number
  prior: number
  delta: number
}

/** Grants in the last 5 minutes against the 5 minutes before that. */
export function grantDelta(grants: readonly Pick<GrantEvent, 'timestamp'>[], now: number): GrantDelta {
  let current = 0
  let prior = 0
  for (const grant of grants) {
    const age = now - grant.timestamp
    if (age < WINDOW_MS) current++
    else if (age < DELTA_COVERAGE_MS) prior++
  }
  return { current, prior, delta: current - prior }
}

/** Signed delta text. The minus is U+2212 so it does not read as a dash. */
export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`
  if (delta < 0) return `−${-delta}`
  return '±0'
}

export interface LastGrantView {
  idText: string
  grantType: GrantEvent['grantType']
  name: string
  ageMs: number
}

/** The newest grant (index 0 in the store). `nameFor` maps a decimal talkgroup ID to its DB name. */
export function lastGrant(
  grants: readonly GrantEvent[],
  now: number,
  nameFor: (talkgroupId: string) => string | undefined,
): LastGrantView | null {
  const grant = grants[0]
  if (!grant) return null
  const ageMs = elapsedMs(now, grant.timestamp)
  if (grant.talkgroupId) {
    return {
      idText: grant.talkgroupId,
      grantType: grant.grantType,
      name: nameFor(grant.talkgroupId) || 'Unknown talkgroup',
      ageMs,
    }
  }
  if (grant.unitId) {
    return { idText: grant.unitId, grantType: grant.grantType, name: 'Unit call', ageMs }
  }
  return { idText: '—', grantType: grant.grantType, name: 'No ID', ageMs }
}

export interface P25Like {
  tgid: string
  name: string
  lastSeen: number
}

export interface LastP25View {
  tgid: string
  name: string
  ageMs: number
}

/** The P25 card with the newest lastSeen. */
export function lastP25(cards: readonly P25Like[], now: number): LastP25View | null {
  let newest: P25Like | null = null
  for (const card of cards) {
    if (!newest || card.lastSeen > newest.lastSeen) newest = card
  }
  if (!newest) return null
  return {
    tgid: newest.tgid,
    name: newest.name || 'Unknown TG',
    ageMs: elapsedMs(now, newest.lastSeen),
  }
}

/** True for phone widths: the strip switches to its two-line form below 640 px. */
export function isCompactWidth(width: number): boolean {
  return width <= PHONE_MAX_WIDTH_PX
}
