import type { GrantEvent } from '../../types'
import { AGENCY_CODES, agencyFill, isAgencyCode, type AgencyCode } from '../lib/agency'

// Pure logic for the EDACS calls column: windows, grant views, filters, histogram
// buckets, the event rug, ages and the stale rule. No DOM, no store reads.

export type WindowId = '5m' | '60m' | 'buffer'
export type GrantTypeKey = 'TG' | 'ICALL' | 'CPT' | 'UNKNOWN'
/** The six agencies, plus UNIT for unit calls and UNK for grants with no DB entry. */
export type AgencyKey = AgencyCode | 'UNIT' | 'UNK'
/** Histogram stack slot. NEUTRAL holds unit calls and unidentified grants. */
export type SlotKey = AgencyCode | 'NEUTRAL'
export type GrantKind = 'talkgroup' | 'unit' | 'none'

export const WINDOW_IDS: readonly WindowId[] = ['5m', '60m', 'buffer']
export const WINDOW_LABELS: Record<WindowId, string> = { '5m': '5 m', '60m': '60 m', buffer: 'Buffer' }
export const WINDOW_MS: Record<'5m' | '60m', number> = { '5m': 5 * 60_000, '60m': 60 * 60_000 }
export const WINDOW_STORAGE_KEY = 'bearsentinel.window'

export const AGENCY_KEYS: readonly AgencyKey[] = [...AGENCY_CODES, 'UNIT', 'UNK']
export const TYPE_KEYS: readonly GrantTypeKey[] = ['TG', 'ICALL', 'CPT', 'UNKNOWN']
/** Stack order from the base upward. Never sorted by size. */
export const STACK_ORDER: readonly SlotKey[] = [...AGENCY_CODES, 'NEUTRAL']

export const STALE_AFTER_MS = 60_000
export const AWAITING_SITE = 'AWAITING C-CH'
export const NO_CHANNEL = '—'

/** Allowed bucket widths in ms: 10 s, 30 s, 1 min, 5 min. */
export const BUCKET_STEPS_MS: readonly number[] = [10_000, 30_000, 60_000, 300_000]
export const TARGET_BUCKETS = 50
export const PHONE_MAX_BUCKETS = 40
/** The histogram is used only when the average bucket holds at least this many grants. */
export const MIN_AVERAGE_PER_BUCKET = 3

/** The fields of a DB entry that the feed needs. Matches AgencyInfo in src/core/AgencyDB.ts. */
export interface AgencyInfoLike {
  a: string
  n: string
}
export type NameLookup = (talkgroupId: string) => AgencyInfoLike | undefined

// ---------- Windows ----------

export function isWindowId(value: unknown): value is WindowId {
  return typeof value === 'string' && (WINDOW_IDS as readonly string[]).includes(value)
}

/** A stored or missing value reads as the 5-minute window. */
export function parseWindow(value: unknown): WindowId {
  return isWindowId(value) ? value : '5m'
}

export function inWindow(timestamp: number, windowId: WindowId, now: number): boolean {
  if (windowId === 'buffer') return true
  return timestamp >= now - WINDOW_MS[windowId]
}

export function filterWindow<T extends { timestamp: number }>(
  items: readonly T[],
  windowId: WindowId,
  now: number,
): T[] {
  return items.filter((item) => inWindow(item.timestamp, windowId, now))
}

// ---------- Time text ----------

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Local HH:MM:SS. */
export function formatClock(timestamp: number): string {
  const d = new Date(timestamp)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** One age format everywhere: "4 s", "1 m 12 s", and "1 h 5 m" past an hour. */
export function formatAge(ageMs: number): string {
  const total = Math.max(0, Math.floor(ageMs / 1000))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes} m ${seconds} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`
}

/** Rows older than 60 seconds are stale. Exactly 60 s is not. */
export function isStale(ageMs: number): boolean {
  return ageMs > STALE_AFTER_MS
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

// ---------- Grant views ----------

export interface GrantView {
  id: number
  timestamp: number
  time: string
  type: GrantTypeKey
  kind: GrantKind
  /** Talkgroup in decimal, unit ID as the decoder emits it (hex), or a dash. */
  idText: string
  name: string
  /** Agency tag text and filter key. */
  agency: AgencyKey
  slot: SlotKey
  lcn: string | null
  vc: string | null
  /** "LCN to VC" in hex, for example "0A1→0B2". */
  channel: string
}

function typeKey(value: string): GrantTypeKey {
  return (TYPE_KEYS as readonly string[]).includes(value) ? (value as GrantTypeKey) : 'UNKNOWN'
}

export function formatChannel(lcn: string | null, vc: string | null): string {
  if (!lcn && !vc) return NO_CHANNEL
  return `${lcn ?? NO_CHANNEL}→${vc ?? NO_CHANNEL}`
}

export function toGrantView(grant: GrantEvent, lookup: NameLookup): GrantView {
  let kind: GrantKind
  let idText: string
  let name: string
  let agency: AgencyKey

  if (grant.talkgroupId) {
    kind = 'talkgroup'
    idText = grant.talkgroupId
    const info = lookup(grant.talkgroupId)
    if (info) {
      name = info.n
      agency = isAgencyCode(info.a) ? info.a : 'UNK'
    } else {
      name = 'Unknown ID'
      agency = 'UNK'
    }
  } else if (grant.unitId) {
    kind = 'unit'
    idText = grant.unitId
    name = `Unit ${grant.unitId}`
    agency = 'UNIT'
  } else {
    kind = 'none'
    idText = NO_CHANNEL
    name = 'Unknown ID'
    agency = 'UNK'
  }

  const lcn = grant.logicalChannel || null
  const vc = grant.voiceChannel || null

  return {
    id: grant.id,
    timestamp: grant.timestamp,
    time: formatClock(grant.timestamp),
    type: typeKey(grant.grantType),
    kind,
    idText,
    name,
    agency,
    slot: isAgencyCode(agency) ? agency : 'NEUTRAL',
    lcn,
    vc,
    channel: formatChannel(lcn, vc),
  }
}

/**
 * Memoises views by grant object. The store keeps the same grant objects from one
 * snapshot to the next, so a grant is converted once, and rows keep their identity.
 */
export function createViewCache(lookup: NameLookup): (grant: GrantEvent) => GrantView {
  const cache = new WeakMap<GrantEvent, GrantView>()
  return (grant) => {
    let view = cache.get(grant)
    if (!view) {
      view = toGrantView(grant, lookup)
      cache.set(grant, view)
    }
    return view
  }
}

// ---------- Filters ----------

export function allOn<K extends string>(keys: readonly K[]): Record<K, boolean> {
  return Object.fromEntries(keys.map((key) => [key, true])) as Record<K, boolean>
}

export function passesFilters(
  view: GrantView,
  agencyOn: Record<AgencyKey, boolean>,
  typeOn: Record<GrantTypeKey, boolean>,
): boolean {
  return agencyOn[view.agency] && typeOn[view.type]
}

/** Number of grants newer than the given ID. Used for the paused "+N new" count. */
export function countNewer(views: readonly GrantView[], afterId: number): number {
  let count = 0
  for (const view of views) if (view.id > afterId) count++
  return count
}

export function siteIsSet(siteId: string): boolean {
  return siteId !== '' && siteId !== AWAITING_SITE
}

/** Empty-state copy for the feed, or null when there is something to show. */
export function feedEmptyText(input: {
  siteId: string
  bufferCount: number
  windowCount: number
  visibleCount: number
}): string | null {
  if (input.visibleCount > 0) return null
  if (input.bufferCount === 0 && siteIsSet(input.siteId)) {
    return `Site ${input.siteId} locked. Waiting for voice grants.`
  }
  if (input.windowCount === 0) return 'No grants in this window.'
  return 'No grants match these filters.'
}

// ---------- Covered span and captions ----------

export interface CoveredSpan {
  start: number
  end: number
  count: number
}

/** First and last grant time across the views, or null when there are none. */
export function coveredSpan(views: readonly GrantView[]): CoveredSpan | null {
  if (views.length === 0) return null
  let start = Infinity
  let end = -Infinity
  for (const view of views) {
    if (view.timestamp < start) start = view.timestamp
    if (view.timestamp > end) end = view.timestamp
  }
  return { start, end, count: views.length }
}

/** "14:02:10 to 14:19:55, 200 grants". Never "last hour". */
export function captionText(span: CoveredSpan | null): string {
  if (!span) return 'No grants in this window.'
  return `${formatClock(span.start)} to ${formatClock(span.end)}, ${span.count} ${plural(span.count, 'grant', 'grants')}`
}

/** 0 at the start of the span and 1 at its end. A zero-length span puts the grant at the right edge. */
export function timePosition(timestamp: number, start: number, end: number): number {
  const span = end - start
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (timestamp - start) / span))
}

// ---------- Bucket width ----------

/** clamp(span / 50, 10 s, 5 min), before snapping. */
export function idealBucketMs(spanMs: number): number {
  const lo = BUCKET_STEPS_MS[0]
  const hi = BUCKET_STEPS_MS[BUCKET_STEPS_MS.length - 1]
  return Math.min(hi, Math.max(lo, spanMs / TARGET_BUCKETS))
}

function stepIndex(widthMs: number): number {
  return BUCKET_STEPS_MS.indexOf(widthMs)
}

/**
 * Snaps to the allowed step nearest on a log scale, since the steps are log-spaced.
 * An exact tie goes to the coarser step.
 */
export function snapBucketMs(idealMs: number): number {
  let best = BUCKET_STEPS_MS[0]
  let bestDistance = Infinity
  for (const step of BUCKET_STEPS_MS) {
    const distance = Math.abs(Math.log(step) - Math.log(idealMs))
    if (distance <= bestDistance) {
      best = step
      bestDistance = distance
    }
  }
  return best
}

/** Wall-clock buckets touched by [start, end]. Buckets align to the epoch. */
export function bucketCount(start: number, end: number, widthMs: number): number {
  return Math.floor(end / widthMs) - Math.floor(start / widthMs) + 1
}

/**
 * The bucket width for a span. The phone cap coarsens the width until the span fits
 * in maxBuckets. Desktop passes Infinity and keeps the snapped width.
 */
export function bucketWidthMs(start: number, end: number, maxBuckets = Infinity): number {
  let index = stepIndex(snapBucketMs(idealBucketMs(end - start)))
  const last = BUCKET_STEPS_MS.length - 1
  while (index < last && bucketCount(start, end, BUCKET_STEPS_MS[index]) > maxBuckets) index++
  return BUCKET_STEPS_MS[index]
}

// ---------- Histogram ----------

export interface Bucket {
  index: number
  start: number
  end: number
  total: number
  slots: Record<SlotKey, number>
  /** Agencies with at least one grant, sorted by count, then by stack order. */
  agencies: { code: AgencyCode; count: number }[]
  unit: number
  unidentified: number
}

export interface HistogramModel {
  width: number
  buckets: Bucket[]
  /** Grants inside the buckets. Smaller than the window only when the phone cap cuts the oldest. */
  total: number
  span: CoveredSpan | null
  peakIndex: number
  yMax: number
}

function emptySlots(): Record<SlotKey, number> {
  return Object.fromEntries(STACK_ORDER.map((slot) => [slot, 0])) as Record<SlotKey, number>
}

function emptyBucket(index: number, start: number, width: number): Bucket {
  return {
    index,
    start,
    end: start + width,
    total: 0,
    slots: emptySlots(),
    agencies: [],
    unit: 0,
    unidentified: 0,
  }
}

/** The smallest "nice" axis maximum at or above the value: 1, 2, 5 or 10 times a power of ten. */
export function niceMax(value: number): number {
  if (!(value > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const multiple of [1, 2, 5, 10]) {
    if (multiple * magnitude >= value) return multiple * magnitude
  }
  return 10 * magnitude
}

/**
 * Buckets the views on wall-clock boundaries. Empty buckets between the first and
 * last grant stay in the series so the time axis is continuous. A finite maxBuckets
 * keeps only the newest buckets when the span would exceed it.
 */
export function buildHistogram(views: readonly GrantView[], maxBuckets = Infinity): HistogramModel {
  const span = coveredSpan(views)
  if (!span) return { width: 0, buckets: [], total: 0, span: null, peakIndex: -1, yMax: 1 }

  const cap = Math.max(1, maxBuckets)
  const width = bucketWidthMs(span.start, span.end, cap)
  const lastIndex = Math.floor(span.end / width)
  const firstIndex = Math.max(Math.floor(span.start / width), lastIndex - cap + 1)

  const buckets: Bucket[] = []
  for (let i = firstIndex; i <= lastIndex; i++) buckets.push(emptyBucket(i, i * width, width))

  let total = 0
  let minTs = Infinity
  let maxTs = -Infinity
  for (const view of views) {
    const index = Math.floor(view.timestamp / width)
    if (index < firstIndex || index > lastIndex) continue
    const bucket = buckets[index - firstIndex]
    bucket.total++
    bucket.slots[view.slot]++
    if (view.kind === 'unit') bucket.unit++
    else if (view.slot === 'NEUTRAL') bucket.unidentified++
    total++
    if (view.timestamp < minTs) minTs = view.timestamp
    if (view.timestamp > maxTs) maxTs = view.timestamp
  }

  let peakIndex = -1
  let peak = 0
  buckets.forEach((bucket, position) => {
    const agencies = AGENCY_CODES.map((code) => ({ code, count: bucket.slots[code] }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || AGENCY_CODES.indexOf(a.code) - AGENCY_CODES.indexOf(b.code))
    bucket.agencies = agencies
    if (bucket.total > peak) {
      peak = bucket.total
      peakIndex = position
    }
  })

  return {
    width,
    buckets,
    total,
    span: total > 0 ? { start: minTs, end: maxTs, count: total } : null,
    peakIndex,
    yMax: niceMax(peak),
  }
}

/** The histogram is shown only when the average bucket holds at least three grants. */
export function usesHistogram(model: HistogramModel): boolean {
  return model.buckets.length > 0 && model.total >= MIN_AVERAGE_PER_BUCKET * model.buckets.length
}

export function segmentsOf(bucket: Bucket): { slot: SlotKey; count: number }[] {
  return STACK_ORDER.map((slot) => ({ slot, count: bucket.slots[slot] })).filter((seg) => seg.count > 0)
}

export function slotFill(slot: SlotKey): string {
  return agencyFill(slot === 'NEUTRAL' ? null : slot)
}

export function slotLabel(slot: SlotKey): string {
  return slot === 'NEUTRAL' ? 'UNIT / UNK' : slot
}

/** "14:02:00 to 14:02:59". The end is the last whole second inside the bucket. */
export function bucketRangeText(bucket: Bucket): string {
  return `${formatClock(bucket.start)} to ${formatClock(bucket.end - 1000)}`
}

export function bucketLabel(bucket: Bucket): string {
  return `${bucket.total} ${plural(bucket.total, 'grant', 'grants')}, ${bucketRangeText(bucket)}`
}

/** Range, total, agency counts by count, then the unit and unidentified split. */
export function bucketTooltip(bucket: Bucket): string {
  const parts = [`${bucketRangeText(bucket)}: ${bucket.total} ${plural(bucket.total, 'grant', 'grants')}.`]
  if (bucket.agencies.length > 0) {
    parts.push(`${bucket.agencies.map((entry) => `${entry.code} ${entry.count}`).join(', ')}.`)
  }
  parts.push(`Unit ${bucket.unit}, unidentified ${bucket.unidentified}.`)
  return parts.join(' ')
}

// ---------- Event rug ----------

export interface RugTick {
  id: number
  position: number
  timestamp: number
}

export interface RugLane {
  key: string
  label: string
  count: number
  lastTs: number
  sortValue: number
  ticks: RugTick[]
}

export interface RugModel {
  span: CoveredSpan | null
  lanes: RugLane[]
}

/** Hex LCN values sort numerically, so 0x9 comes before 0x10. */
export function lcnSortValue(hex: string): number {
  const value = parseInt(hex, 16)
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

/**
 * One lane per LCN that has a grant in the views. Labels come from the store's LCN
 * map, falling back to the grant's own voice channel. Grants with no LCN share a
 * last lane. Lanes with no grants are left out so a busy site stays readable.
 */
export function buildRug(views: readonly GrantView[], lcnMap: readonly [string, string][]): RugModel {
  const span = coveredSpan(views)
  const vcFor = new Map(lcnMap)
  const lanes = new Map<string, RugLane>()

  for (const view of views) {
    const key = view.lcn ?? 'none'
    let lane = lanes.get(key)
    if (!lane) {
      const vc = view.lcn ? (vcFor.get(view.lcn) ?? view.vc) : null
      lane = {
        key,
        label: view.lcn ? `LCN ${view.lcn} to VC ${vc ?? NO_CHANNEL}` : 'No LCN',
        count: 0,
        lastTs: -Infinity,
        sortValue: view.lcn ? lcnSortValue(view.lcn) : Number.POSITIVE_INFINITY,
        ticks: [],
      }
      lanes.set(key, lane)
    }
    lane.count++
    if (view.timestamp > lane.lastTs) lane.lastTs = view.timestamp
    lane.ticks.push({
      id: view.id,
      position: span ? timePosition(view.timestamp, span.start, span.end) : 1,
      timestamp: view.timestamp,
    })
  }

  const sorted = [...lanes.values()].sort((a, b) => a.sortValue - b.sortValue || a.key.localeCompare(b.key))
  return { span, lanes: sorted }
}

export function laneTooltip(lane: RugLane): string {
  return `${lane.label}: ${lane.count} ${plural(lane.count, 'grant', 'grants')}. Last grant ${formatClock(lane.lastTs)}.`
}
