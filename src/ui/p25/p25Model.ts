import { DB } from '../../core/AgencyDB'
import { AGENCY_CODES, isAgencyCode, type AgencyCode } from '../lib/agency'

/** The card fields this model reads. The adapter's P25Row satisfies it. */
export interface P25CardInput {
  tgid: string
  name: string
  hits: number
  lastSeen: number
}

/** Agency chips for the P25 column: the six histogram agencies, then UNK for talkgroups not in the DB. */
export const P25_AGENCY_KEYS = [...AGENCY_CODES, 'UNK'] as const
export type P25AgencyKey = AgencyCode | 'UNK'

export const NEW_WINDOW_MS = 10 * 60_000
export const ALL_TIME_LIMIT = 10
export const UNKNOWN_TG_NAME = 'Unknown TG'
export const HOLD_ACTIVE_NOTE = 'Hold active: other P25 traffic is not recorded.'
export const HOLD_DISCONNECTED_NOTE = 'Hold and Release are unavailable while the scanner is disconnected.'

function dbEntry(tgid: string) {
  return Object.prototype.hasOwnProperty.call(DB, tgid) ? DB[tgid] : undefined
}

/** Count for a talkgroup in a persistent totals record. A missing or malformed value reads as 0. */
export function countOf(counts: Readonly<Record<string, number>>, tgid: string): number {
  if (!Object.prototype.hasOwnProperty.call(counts, tgid)) return 0
  const value = counts[tgid]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** The name shown for a talkgroup: the DB name, then the card's name, then a fixed fallback. */
export function talkgroupName(tgid: string, cardName?: string | null): string {
  return dbEntry(tgid)?.n || cardName || UNKNOWN_TG_NAME
}

/**
 * The agency code for a talkgroup. The store fills unknown talkgroups with a 'P25'
 * placeholder; that reads as UNK here, the same as the AgencyTag fallback.
 */
export function talkgroupAgency(tgid: string): P25AgencyKey {
  const code = dbEntry(tgid)?.a
  return isAgencyCode(code) ? code : 'UNK'
}

/** Held row first, then lastSeen descending. Ties fall back to TG order so rows never swap on their own. */
export function sortRows<T extends P25CardInput>(cards: readonly T[], heldTgid: string | null): T[] {
  return cards.slice().sort((a, b) => {
    if (a.tgid === b.tgid) return 0
    if (a.tgid === heldTgid) return -1
    if (b.tgid === heldTgid) return 1
    if (a.lastSeen !== b.lastSeen) return b.lastSeen - a.lastSeen
    return a.tgid < b.tgid ? -1 : 1
  })
}

export function allAgenciesOn(): Record<P25AgencyKey, boolean> {
  const on = {} as Record<P25AgencyKey, boolean>
  for (const key of P25_AGENCY_KEYS) on[key] = true
  return on
}

/**
 * Whether a row survives the agency chips. The held row always passes, so the
 * operator can still see and release the talkgroup they are holding.
 */
export function passesAgencyFilter(
  tgid: string,
  agencyOn: Readonly<Record<P25AgencyKey, boolean>>,
  heldTgid: string | null,
): boolean {
  return tgid === heldTgid || agencyOn[talkgroupAgency(tgid)]
}

function positiveEntries(counts: Readonly<Record<string, number>>): [string, number][] {
  return Object.entries(counts).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n > 0)
}

export function hasAnyTotals(counts: Readonly<Record<string, number>>): boolean {
  return positiveEntries(counts).length > 0
}

/**
 * The text for an empty table, or null when rows are visible. Returns null while
 * the held row is the only visible row, since that row is always shown.
 */
export function emptyMessage(state: {
  connected: boolean
  cards: number
  visible: number
  hasAnyTotals: boolean
}): string | null {
  if (state.visible > 0) return null
  if (state.cards > 0) return 'All P25 traffic is hidden by filters'
  if (state.connected && !state.hasAnyTotals) return 'P25 not received'
  return 'No P25 traffic in 5 minutes'
}

// ---------- NEW ----------

interface SessionSighting {
  firstSeen: number
  isNew: boolean
  acknowledged: boolean
}

/** Session memory, never persisted. A talkgroup is here once this session has seen it. */
const sightings = new Map<string, SessionSighting>()

/** Clears the session memory. Tests use this; the app never calls it. */
export function resetNewTracking(): void {
  sightings.clear()
}

function recordSightings(
  cards: readonly P25CardInput[],
  persistent: Readonly<Record<string, number>>,
  now: number,
): void {
  for (const card of cards) {
    if (sightings.has(card.tgid)) continue
    // The store counts a transmission before it creates the card, so the persistent
    // total already includes this card's own hits. Taking them back out gives the
    // total as it stood when this session first saw the talkgroup.
    const before = countOf(persistent, card.tgid) - card.hits
    sightings.set(card.tgid, { firstSeen: now, isNew: before <= 0, acknowledged: false })
  }
}

/**
 * The talkgroups among these cards that are NEW now. A talkgroup is NEW when the
 * session first saw it with no persistent history, and it stays NEW until it is
 * acknowledged or ten minutes pass. Recording a first sighting is the only side
 * effect, and repeat calls with the same inputs give the same result.
 */
export function newTalkgroups(
  cards: readonly P25CardInput[],
  persistent: Readonly<Record<string, number>>,
  now: number,
): Set<string> {
  recordSightings(cards, persistent, now)
  const out = new Set<string>()
  for (const card of cards) {
    const sighting = sightings.get(card.tgid)
    if (sighting && sighting.isNew && !sighting.acknowledged && now - sighting.firstSeen < NEW_WINDOW_MS) {
      out.add(card.tgid)
    }
  }
  return out
}

/** The number of NEW talkgroups among these cards. Feeds the status strip's NEW count. */
export function countNew(
  cards: readonly P25CardInput[],
  persistent: Readonly<Record<string, number>>,
  now: number,
): number {
  return newTalkgroups(cards, persistent, now).size
}

/** Clears NEW for a talkgroup for the rest of the session. */
export function acknowledgeNew(tgid: string): void {
  const sighting = sightings.get(tgid)
  if (sighting) sighting.acknowledged = true
}

// ---------- All time ----------

export interface AllTimeRow {
  tgid: string
  name: string
  agency: P25AgencyKey
  count: number
  share: number
}

export interface AllTimeBoard {
  rows: AllTimeRow[]
  total: number
}

/** Top talkgroups by persistent count, descending, ties by TG. Share is of the all-time total, not of the top rows. */
export function topAllTime(
  counts: Readonly<Record<string, number>>,
  cards: readonly Pick<P25CardInput, 'tgid' | 'name'>[],
  limit: number = ALL_TIME_LIMIT,
): AllTimeBoard {
  const entries = positiveEntries(counts)
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  const cardNames = new Map(cards.map((card) => [card.tgid, card.name]))
  const ranked = entries.sort(([ta, na], [tb, nb]) => nb - na || (ta < tb ? -1 : ta > tb ? 1 : 0))
  return {
    total,
    rows: ranked.slice(0, limit).map(([tgid, count]) => ({
      tgid,
      name: talkgroupName(tgid, cardNames.get(tgid)),
      agency: talkgroupAgency(tgid),
      count,
      share: total > 0 ? count / total : 0,
    })),
  }
}

export function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

export function allTimeTooltip(row: AllTimeRow): string {
  return `TG ${row.tgid}, ${row.name}, ${row.agency}. ${row.count} all time, ${formatShare(row.share)} of the all-time total.`
}
