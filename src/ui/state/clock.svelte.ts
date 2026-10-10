// Module-level 1 Hz clock. Age labels read clock.now, so only the small leaf
// components that show ages re-render each second, not the lists around them.
let now = $state(Date.now())

const timer: ReturnType<typeof setInterval> = setInterval(() => {
  now = Date.now()
}, 1000)

export const clock = {
  /** Current time in ms, updated once per second. Reading it tracks it. */
  get now(): number {
    return now
  },
}

/** Stops the 1 Hz update. Intended for tests; the app never calls it. */
export function stopClock(): void {
  clearInterval(timer)
}
