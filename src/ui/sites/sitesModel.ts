import type { GrantEvent, LeaderboardEntry } from '../../types'

// Pure logic for the EDACS sites column: leaderboard split, order and nested-bar
// geometry, patch visibility, the channel table, ages and tab keys. No DOM, no store reads.

// ---------- Leaderboard keys ----------

export type LeaderboardKind = 'talkgroups' | 'units' | 'members'

export const UNIT_KEY_PREFIX = 'U:'
export const MEMBER_KEY_PREFIX = 'M:'

export function leaderboardKind(key: string): LeaderboardKind {
  if (key.startsWith(UNIT_KEY_PREFIX)) return 'units'
  if (key.startsWith(MEMBER_KEY_PREFIX)) return 'members'
  return 'talkgroups'
}

/** The ID a key stands for: the U: or M: prefix removed. Talkgroup keys are unchanged. */
export function bareId(key: string): string {
  const kind = leaderboardKind(key)
  if (kind === 'units') return key.slice(UNIT_KEY_PREFIX.length)
  if (kind === 'members') return key.slice(MEMBER_KEY_PREFIX.length)
  return key
}

export interface LeaderboardGroups {
  talkgroups: LeaderboardEntry[]
  units: LeaderboardEntry[]
  members: LeaderboardEntry[]
}

/** Splits store rows by key prefix. Each group keeps the order it arrived in. */
export function splitLeaderboard(rows: readonly LeaderboardEntry[]): LeaderboardGroups {
  const groups: LeaderboardGroups = { talkgroups: [], units: [], members: [] }
  for (const row of rows) groups[leaderboardKind(row.id)].push(row)
  return groups
}

// ---------- Counts and nested bars ----------

/** Counts from the store are whole numbers. Anything else reads as zero. */
function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

/** Store order: h5 descending, then h60 descending. Full ties keep their input order. */
export function storeOrder(rows: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  return [...rows].sort((a, b) => count(b.h5) - count(a.h5) || count(b.h60) - count(a.h60))
}

/** The largest h60 in a panel. Each panel has its own axis, so this takes only that panel's rows. */
export function axisMax(rows: readonly LeaderboardEntry[]): number {
  let max = 0
  for (const row of rows) max = Math.max(max, count(row.h60))
  return max
}

export interface NestedBar {
  /** The whole bar (h60) as a share of the axis, 0 to 1. */
  total: number
  /** The solid part (h5) as a share of the whole bar, 0 to 1. */
  solid: number
  h5: number
  h60: number
}

/**
 * One row's nested bar. h5 is a subset of h60 in the store, and the clamp keeps it that way
 * even if the input breaks the rule. The two are never added together.
 */
export function nestedBar(row: LeaderboardEntry, axis: number): NestedBar {
  const h60 = count(row.h60)
  const h5 = Math.min(count(row.h5), h60)
  const total = axis > 0 ? Math.min(h60 / axis, 1) : 0
  const solid = h60 > 0 ? h5 / h60 : 0
  return { total, solid, h5, h60 }
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Hover and focus text for a leaderboard row. Same text either way. */
export function leaderboardTip(kind: LeaderboardKind, row: LeaderboardEntry): string {
  const h5 = count(row.h5)
  const h60 = count(row.h60)
  if (kind === 'talkgroups') {
    return `TG ${bareId(row.id)} ${row.name} (${row.agency}): ${plural(h5, 'grant', 'grants')} in 5 m, ${h60} in 60 m`
  }
  if (kind === 'units') {
    return `${row.name}: ${plural(h5, 'unit grant', 'unit grants')} in 5 m, ${h60} in 60 m`
  }
  return `${row.name}: ${plural(h5, 'patch event', 'patch events')} in 5 m, ${h60} in 60 m`
}

// ---------- Leaderboard order with the 5-second freeze ----------

export const REORDER_HOLD_MS = 5_000

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

/**
 * Keeps the displayed order still between reorders. Values always come from the newest
 * rows. The order changes only when the store order differs from the shown order and
 * REORDER_HOLD_MS has passed since the last change. A row that leaves the store drops out
 * at once. A new row goes to the bottom until the next reorder is allowed.
 */
export class LeaderboardOrder {
  private ids: string[] | null = null
  private changedAt = 0

  next(rows: readonly LeaderboardEntry[], now: number): LeaderboardEntry[] {
    const byId = new Map<string, LeaderboardEntry>()
    for (const row of rows) byId.set(row.id, row)

    const target = storeOrder(rows).map((row) => row.id)
    if (this.ids === null) {
      this.ids = target
      this.changedAt = now
    } else {
      const survivors = this.ids.filter((id) => byId.has(id))
      const known = new Set(survivors)
      const held = survivors.concat(target.filter((id) => !known.has(id)))
      if (!sameOrder(held, target) && now - this.changedAt >= REORDER_HOLD_MS) {
        this.ids = target
        this.changedAt = now
      } else {
        this.ids = held
      }
    }

    const ordered: LeaderboardEntry[] = []
    for (const id of this.ids) {
      const row = byId.get(id)
      if (row) ordered.push(row)
    }
    return ordered
  }
}

// ---------- Patches ----------

/** The store prunes a patch after 30 s of silence. The view drops it on the same rule. */
export const PATCH_VISIBLE_MS = 30_000
/** A TX chip and ring show for 2 s after a hit. */
export const TX_VISIBLE_MS = 2_000

export interface PatchLike {
  id: string
  members: readonly string[]
  hits: number
  lastSeen: number
  isActive: boolean
}

export function isPatchVisible(patch: Pick<PatchLike, 'lastSeen'>, now: number): boolean {
  return now - patch.lastSeen <= PATCH_VISIBLE_MS
}

export function isTxActive(patch: Pick<PatchLike, 'isActive' | 'lastSeen'>, now: number): boolean {
  return patch.isActive && now - patch.lastSeen < TX_VISIBLE_MS
}

/** Visible patches only. Active first, then lastSeen descending, then ID so equal rows never swap. */
export function patchRowsFor<T extends PatchLike>(rows: readonly T[], now: number): T[] {
  return rows
    .filter((patch) => isPatchVisible(patch, now))
    .sort(
      (a, b) =>
        Number(isTxActive(b, now)) - Number(isTxActive(a, now)) ||
        b.lastSeen - a.lastSeen ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
}

export function patchCountText(count: number): string {
  return count === 1 ? '1 patch active' : `${count} patches active`
}

export const NO_PATCHES_TEXT = 'No patches in last 30 s'

// ---------- Channels (LCN map) ----------

export interface ChannelRow {
  /** LCN hex, or null for the row that holds grants with no logical channel. */
  lcn: string | null
  /** VC hex from the store's LCN map, or null when only a grant's LCN is known. */
  vc: string | null
  /** Grants in the buffer on this LCN. */
  grants: number
  /** Timestamp of the newest grant on this LCN, or null when there is none. */
  lastAt: number | null
}

/** Hex LCN as a number, so 0x9 sorts before 0x10. Anything unparseable sorts last. */
export function lcnRank(hex: string): number {
  const value = parseInt(hex, 16)
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

function compareLcn(a: string, b: string): number {
  const ra = lcnRank(a)
  const rb = lcnRank(b)
  if (ra !== rb) return ra < rb ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * One row per LCN in the store's map, plus any LCN that grants use but the map lacks.
 * Grants with no logical channel share one 'no LCN' row, placed last. That row is left out
 * when there are no such grants.
 */
export function channelRows(
  lcnMap: readonly (readonly [string, string])[],
  grants: readonly GrantEvent[],
): ChannelRow[] {
  const perLcn = new Map<string, { grants: number; lastAt: number }>()
  let noLcn: { grants: number; lastAt: number } | null = null

  for (const grant of grants) {
    if (grant.logicalChannel) {
      const entry = perLcn.get(grant.logicalChannel) ?? { grants: 0, lastAt: -Infinity }
      entry.grants++
      entry.lastAt = Math.max(entry.lastAt, grant.timestamp)
      perLcn.set(grant.logicalChannel, entry)
    } else {
      noLcn ??= { grants: 0, lastAt: -Infinity }
      noLcn.grants++
      noLcn.lastAt = Math.max(noLcn.lastAt, grant.timestamp)
    }
  }

  const vcOf = new Map<string, string>(lcnMap)
  const lcns = new Set<string>([...vcOf.keys(), ...perLcn.keys()])
  const rows: ChannelRow[] = [...lcns].map((lcn) => {
    const seen = perLcn.get(lcn)
    return {
      lcn,
      vc: vcOf.get(lcn) ?? null,
      grants: seen?.grants ?? 0,
      lastAt: seen ? seen.lastAt : null,
    }
  })
  rows.sort((a, b) => compareLcn(a.lcn ?? '', b.lcn ?? ''))

  if (noLcn) rows.push({ lcn: null, vc: null, grants: noLcn.grants, lastAt: noLcn.lastAt })
  return rows
}

// ---------- Ages ----------

/** One age format everywhere: "4 s", "1 m 12 s", and "1 h 5 m" past an hour. */
export function formatAge(ageMs: number): string {
  const total = Math.max(0, Math.floor(ageMs / 1000))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes} m ${seconds} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

// ---------- Tabs and empty states ----------

/** Rows a leaderboard panel shows, for its own kind only. The store keeps every ID it has seen. */
export const LEADERBOARD_ROWS = 20

/** How many talkgroups the narrow-phone strip above the calls feed shows. */
export const TOP_STRIP_ROWS = 3

/** The talkgroups with the most grants in the last five minutes, for the narrow-phone strip. */
export function topTalkgroups(rows: readonly LeaderboardEntry[], limit = TOP_STRIP_ROWS): LeaderboardEntry[] {
  return splitLeaderboard(rows)
    .talkgroups.filter((row) => row.h5 > 0)
    .sort((a, b) => b.h5 - a.h5 || b.h60 - a.h60)
    .slice(0, limit)
}

export const SITES_TABS = ['talkgroups', 'units', 'members', 'channels'] as const
export type SitesTab = (typeof SITES_TABS)[number]

export const SITES_TAB_LABELS: Record<SitesTab, string> = {
  talkgroups: 'Talkgroups',
  units: 'Units',
  members: 'Members',
  channels: 'Channels',
}

/**
 * The tab that a key moves to, or null when the key does not move focus. Arrows wrap.
 * Home and End go to the ends of the list in use.
 */
export function nextTab(current: SitesTab, key: string, tabs: readonly SitesTab[]): SitesTab | null {
  if (tabs.length === 0) return null
  const index = tabs.indexOf(current)
  switch (key) {
    case 'ArrowRight':
      return index < 0 ? tabs[0] : tabs[(index + 1) % tabs.length]
    case 'ArrowLeft':
      return index < 0 ? tabs[0] : tabs[(index - 1 + tabs.length) % tabs.length]
    case 'Home':
      return tabs[0]
    case 'End':
      return tabs[tabs.length - 1]
    default:
      return null
  }
}

export const NO_EDACS_DATA_TEXT = 'No EDACS data yet - enable C-CH output'

/** Shown when connected and the session has counted no grants. */
export function showNoEdacsData(connected: boolean, sessionGrants: number): boolean {
  return connected && sessionGrants === 0
}
