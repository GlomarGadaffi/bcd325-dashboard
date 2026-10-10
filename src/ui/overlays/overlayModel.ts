// Pure logic for the raw log sheet, the menu and the wipe dialog.

export const RAW_LOG_LINES = 200
export const WIPE_WORD = 'WIPE'

/** The GLG status reply. The decoder matches the same "GLG," prefix. */
const GLG_LINE = /^GLG\b/

export function isGlgLine(line: string): boolean {
  return GLG_LINE.test(line)
}

/** The newest `limit` lines, in arrival order (oldest first). */
export function lastRawLines<T>(lines: readonly T[], limit: number = RAW_LOG_LINES): T[] {
  return lines.slice(-limit)
}

/** Single-key shortcuts ignore chords such as Ctrl+L or Cmd+L. */
export function isPlainKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey
}

/** True when keystrokes belong to a text field, so single-key shortcuts must not run. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.matches('input, textarea, select')) return true
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null
}

/** The wipe needs the exact word. Case and spacing count. */
export function wipeArmed(typed: string): boolean {
  return typed === WIPE_WORD
}

export interface WipeSource {
  persistentSlers: Record<string, number>
  persistentPatches: Record<string, number>
  persistentP25: Record<string, number>
  grants: readonly unknown[]
  patches: readonly unknown[]
  p25Cards: readonly unknown[]
}

export interface WipeCounts {
  /** Removed by the wipe: all-time totals kept in this browser. */
  totals: { leaderboard: number; patches: number; p25: number }
  /** Still on screen after the wipe: the session rows. */
  session: { grants: number; patches: number; p25Cards: number }
}

/**
 * Counts for the wipe dialog. The core wipe clears the persistent totals only,
 * so those are the "deleted" group and the session rows are reported apart.
 */
export function wipeCounts(source: WipeSource): WipeCounts {
  return {
    totals: {
      leaderboard: Object.keys(source.persistentSlers).length,
      patches: Object.keys(source.persistentPatches).length,
      p25: Object.keys(source.persistentP25).length,
    },
    session: {
      grants: source.grants.length,
      patches: source.patches.length,
      p25Cards: source.p25Cards.length,
    },
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unknown error'
}
