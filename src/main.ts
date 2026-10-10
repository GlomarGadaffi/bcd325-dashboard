import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './ui/styles/tokens.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { Serial } from './core/SerialMonitor'
import { coreStore, setSnapshot } from './ui/state/adapter.svelte'

/** Dev-only hooks for the browser test harness. Production builds do not include this block. */
declare global {
  interface Window {
    bearsentinelDev?: {
      setSnapshot: typeof setSnapshot
      coreStore: typeof coreStore
      ingest: (chunk: string) => void
    }
  }
}

const target = document.getElementById('root')
if (!target) {
  throw new Error('BearSentinel: the #root element is missing from index.html')
}

mount(App, { target })

if (import.meta.env.DEV) {
  window.bearsentinelDev = {
    setSnapshot,
    coreStore,
    ingest: (chunk: string) => Serial.ingest(chunk),
  }
}
