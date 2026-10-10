/** Local time as HH:MM:SS. Used for every wall-clock time on the screen. */
export function formatClock(ms: number): string {
  const d = new Date(ms)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

/** The one age format: '4 s', then '1 m 12 s'. Negative spans (clock skew) read as 0 s. */
export function formatAge(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 60) return `${total} s`
  return `${Math.floor(total / 60)} m ${total % 60} s`
}
