import { PHONE_QUERY } from '../status/statusModel'

// Breakpoints the shell reads in script, to decide what is rendered: the phone menu
// content, the sheets, the Sites tabs and the Focus control. CSS keeps its own queries.
const NARROW_QUERY = '(max-width: 399px)'
const DESKTOP_QUERY = '(min-width: 1280px)'

/** A media query as reactive state. Without matchMedia it reads as false. */
function watch(query: string): { readonly matches: boolean } {
  function read(): boolean {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : false
    } catch {
      return false
    }
  }

  let matches = $state(read())

  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      window.matchMedia(query).addEventListener('change', (event) => {
        matches = event.matches
      })
    }
  } catch {
    // No live updates. The value read at load still applies.
  }

  return {
    get matches(): boolean {
      return matches
    },
  }
}

const phone = watch(PHONE_QUERY)
const narrow = watch(NARROW_QUERY)
const desktop = watch(DESKTOP_QUERY)

/** Layout breakpoints. Reading a flag in a template or $derived tracks it. */
export const layout = {
  /** Under 640 px: one column, the bottom tab bar, and the phone menu content. */
  get phone(): boolean {
    return phone.matches
  },
  /** Under 400 px: the Sites tabs drop Channels and Units. */
  get narrow(): boolean {
    return narrow.matches
  },
  /** 1280 px and up: the Focus control and three columns. */
  get desktop(): boolean {
    return desktop.matches
  },
}

/**
 * Touch devices confirm every hold. Checked when a hold is requested, so a
 * connected touch screen reads as touch even if it was not at load.
 */
export function isTouchDevice(): boolean {
  try {
    return navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}
