import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './ui/styles/tokens.css'
import { mount } from 'svelte'
import App from './App.svelte'

const target = document.getElementById('root')
if (!target) {
  throw new Error('BearSentinel: the #root element is missing from index.html')
}

mount(App, { target })
