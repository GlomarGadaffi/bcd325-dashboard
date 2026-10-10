/** The three-state theme choice. System leaves the OS preference in charge. */
export type ThemeChoice = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'bearsentinel.theme'

/**
 * Reads the stored choice. Any value other than light or dark, a missing value,
 * or a storage failure reads as System.
 */
function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

/** Persists the choice. System clears the key. A storage failure is silent. */
function writeStored(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Storage is unavailable (private window, blocked site data). The choice still
    // applies for this page load; it just is not remembered.
  }
}

/** System removes data-theme so the media query decides. Light and Dark set it. */
function applyToDocument(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

const initial = readStored()
applyToDocument(initial)
let choice = $state<ThemeChoice>(initial)

/** The theme controller. Reading choice tracks it in templates and $derived. */
export const theme = {
  get choice(): ThemeChoice {
    return choice
  },
  set(next: ThemeChoice): void {
    choice = next
    applyToDocument(next)
    writeStored(next)
  },
}
