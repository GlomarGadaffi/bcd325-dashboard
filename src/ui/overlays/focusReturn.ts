// One focus-return slot shared by the menu, the raw log sheet and the wipe dialog.
// The menu records its trigger when it opens. A sheet or dialog opened from the
// menu leaves that record alone, so closing it returns focus to the trigger and
// not to the menu item that was removed on the way.

let target: HTMLElement | null = null

/** Records the focused element unless a trigger is already recorded. */
export function captureFocus(): void {
  if (target) return
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body) target = active
}

/** Moves focus back to the recorded trigger, if it is still on the page. */
export function returnFocus(): void {
  const next = target
  target = null
  if (next && next.isConnected) next.focus()
}
