<script lang="ts">
  import TopBar, { FOCUS_MODES, type FocusMode } from './chrome/TopBar.svelte'
  import StatusStrip from './chrome/StatusStrip.svelte'
  import CallsColumn from './columns/CallsColumn.svelte'
  import P25Column from './columns/P25Column.svelte'
  import SitesColumn from './columns/SitesColumn.svelte'

  type Tab = 'calls' | 'p25' | 'sites'

  const FOCUS_KEY = 'bearsentinel.focus'
  const TABS: readonly { id: Tab; label: string }[] = [
    { id: 'calls', label: 'Calls' },
    { id: 'p25', label: 'P25' },
    { id: 'sites', label: 'Sites' },
  ]

  /** Focus is the only layout state kept in the browser. A bad or missing value reads as Balanced. */
  function readFocus(): FocusMode {
    try {
      const stored = localStorage.getItem(FOCUS_KEY)
      const match = FOCUS_MODES.find((mode) => mode.id === stored)
      return match ? match.id : 'balanced'
    } catch {
      return 'balanced'
    }
  }

  function writeFocus(mode: FocusMode): void {
    try {
      localStorage.setItem(FOCUS_KEY, mode)
    } catch {
      // Storage is unavailable. Focus still applies for this page load.
    }
  }

  // Focus sets column weights on desktop only. Column minimums never change.
  let focus = $state<FocusMode>(readFocus())
  // Phone shows one column at a time, chosen by the bottom tab bar.
  let tab = $state<Tab>('calls')

  function setFocus(mode: FocusMode): void {
    focus = mode
    writeFocus(mode)
  }
</script>

<div class="shell">
  <TopBar {focus} onFocusChange={setFocus} />
  <StatusStrip />

  <main class="body" data-focus={focus}>
    <div class="region region-calls" class:is-active={tab === 'calls'}>
      <CallsColumn />
    </div>
    <div class="region region-p25" class:is-active={tab === 'p25'}>
      <P25Column />
    </div>
    <div class="region region-sites" class:is-active={tab === 'sites'}>
      <SitesColumn />
    </div>
  </main>

  <nav class="tabbar" aria-label="Sections">
    {#each TABS as item (item.id)}
      <button
        type="button"
        class="tab"
        aria-pressed={tab === item.id ? 'true' : 'false'}
        onclick={() => (tab = item.id)}
      >{item.label}</button>
    {/each}
  </nav>
</div>

<style>
  /* Phone (under 640px) is the base. Tablet and desktop are added upward. */
  .shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: var(--h-top) var(--h-strip) minmax(0, 1fr) var(--h-tabbar);
    height: 100vh;
    height: 100dvh;
    min-width: 0;
    overflow: hidden;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--gutter-phone);
    min-width: 0;
    min-height: 0;
    padding: var(--pad-panel-phone);
    overflow-x: hidden;
    overflow-y: auto;
  }

  .region {
    display: none;
    min-width: 0;
    min-height: 0;
  }

  .region.is-active {
    display: block;
    height: 100%;
  }

  .tabbar {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    background: var(--bg-1);
    border-top: 1px solid var(--line-1);
  }

  .tab {
    min-height: var(--hit-touch);
    border: 0;
    border-top: 2px solid transparent;
    background: transparent;
    color: var(--tx-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .tab[aria-pressed="true"] {
    color: var(--tx-1);
    border-top-color: var(--tx-1);
  }

  /* Tablet: Calls on the left; P25 above Sites on the right. */
  @media (min-width: 640px) {
    .shell {
      grid-template-rows: var(--h-top) var(--h-strip) minmax(0, 1fr);
    }

    .body {
      display: grid;
      gap: var(--gutter-tablet);
      padding: var(--pad-panel);
      grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "calls p25"
        "calls sites";
      overflow: hidden;
    }

    .region {
      display: block;
    }

    .region-calls {
      grid-area: calls;
    }

    .region-p25 {
      grid-area: p25;
    }

    .region-sites {
      grid-area: sites;
    }

    .tabbar {
      display: none;
    }
  }

  /* Desktop: three columns with fixed minimums. Focus changes weights only. */
  @media (min-width: 1280px) {
    .body {
      grid-template-columns: minmax(340px, 31fr) minmax(420px, 38fr) minmax(340px, 31fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "calls p25 sites";
      gap: 0 var(--gutter);
      padding: var(--pad-panel);
    }

    .body[data-focus="calls"] {
      grid-template-columns: minmax(340px, 50fr) minmax(420px, 25fr) minmax(340px, 25fr);
    }

    .body[data-focus="p25"] {
      grid-template-columns: minmax(340px, 25fr) minmax(420px, 50fr) minmax(340px, 25fr);
    }

    .body[data-focus="sites"] {
      grid-template-columns: minmax(340px, 25fr) minmax(420px, 25fr) minmax(340px, 50fr);
    }
  }
</style>
