<script lang="ts">
  import { DB } from '../../core/AgencyDB'
  import FilterChip from '../primitives/FilterChip.svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import CallsFeed from '../calls/CallsFeed.svelte'
  import EventRug from '../calls/EventRug.svelte'
  import GrantHistogram from '../calls/GrantHistogram.svelte'
  import {
    AGENCY_KEYS,
    PHONE_MAX_BUCKETS,
    TYPE_KEYS,
    WINDOW_IDS,
    WINDOW_LABELS,
    WINDOW_STORAGE_KEY,
    allOn,
    buildHistogram,
    createViewCache,
    feedEmptyText,
    filterWindow,
    parseWindow,
    passesFilters,
    usesHistogram,
    type AgencyKey,
    type GrantTypeKey,
    type WindowId,
  } from '../calls/callsModel'

  // Composition root for the EDACS calls column. It owns the window, pause and filter
  // state, and derives the chart and feed inputs from one snapshot and the clock.
  const viewOf = createViewCache((id) => DB[id])

  // The window is the one control kept in the browser. Pause is not, so a reload
  // never opens with the feed silently frozen.
  function readWindow(): WindowId {
    try {
      return parseWindow(localStorage.getItem(WINDOW_STORAGE_KEY))
    } catch {
      return '5m'
    }
  }

  function writeWindow(next: WindowId): void {
    try {
      localStorage.setItem(WINDOW_STORAGE_KEY, next)
    } catch {
      // Storage is unavailable. The window still applies for this page load.
    }
  }

  let windowId = $state<WindowId>(readWindow())
  let paused = $state(false)
  let agencyOn = $state<Record<AgencyKey, boolean>>(allOn(AGENCY_KEYS))
  let typeOn = $state<Record<GrantTypeKey, boolean>>(allOn(TYPE_KEYS))

  // Phone bucket cap, from the same 640 px breakpoint as the shell.
  let phone = $state(false)
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 639.98px)')
    phone = query.matches
    const onChange = (event: MediaQueryListEvent) => {
      phone = event.matches
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  })

  const snap = $derived(getSnapshot())
  const views = $derived(snap.grants.map((grant) => viewOf(grant)))
  // The chart shows the whole window. Filters hide feed rows only.
  const inWin = $derived(filterWindow(views, windowId, clock.now))
  const visible = $derived(inWin.filter((view) => passesFilters(view, agencyOn, typeOn)))
  const hiddenCount = $derived(inWin.length - visible.length)
  const model = $derived(buildHistogram(inWin, phone ? PHONE_MAX_BUCKETS : Infinity))
  const histogram = $derived(usesHistogram(model))
  const resetKey = $derived(
    `${windowId}|${AGENCY_KEYS.map((key) => (agencyOn[key] ? 1 : 0)).join('')}|${TYPE_KEYS.map((key) => (typeOn[key] ? 1 : 0)).join('')}`,
  )
  const emptyText = $derived(
    feedEmptyText({
      siteId: snap.siteId,
      bufferCount: snap.grants.length,
      windowCount: inWin.length,
      visibleCount: visible.length,
    }),
  )

  function setWindow(next: WindowId): void {
    windowId = next
    writeWindow(next)
  }

  function toggleAgency(key: AgencyKey): void {
    agencyOn[key] = !agencyOn[key]
  }

  function toggleType(key: GrantTypeKey): void {
    typeOn[key] = !typeOn[key]
  }
</script>

<section class="column" aria-labelledby="calls-title">
  <header class="head">
    <h2 id="calls-title" class="title">EDACS calls</h2>
    <button
      type="button"
      class="ctl pause"
      aria-pressed={paused ? 'true' : 'false'}
      onclick={() => (paused = !paused)}
    >Pause</button>
  </header>

  <div class="bar">
    <div class="windows" role="group" aria-label="Window">
      {#each WINDOW_IDS as id (id)}
        <button
          type="button"
          class="ctl seg"
          aria-pressed={windowId === id ? 'true' : 'false'}
          onclick={() => setWindow(id)}
        >{WINDOW_LABELS[id]}</button>
      {/each}
    </div>
    {#if hiddenCount > 0}
      <p class="hidden">{hiddenCount} hidden by filters</p>
    {/if}
  </div>

  <div class="filters" role="group" aria-label="Filters">
    {#each AGENCY_KEYS as key (key)}
      <FilterChip pressed={agencyOn[key]} onToggle={() => toggleAgency(key)}>{key}</FilterChip>
    {/each}
    {#each TYPE_KEYS as key (key)}
      <FilterChip pressed={typeOn[key]} onToggle={() => toggleType(key)}>{key}</FilterChip>
    {/each}
  </div>

  {#if histogram}
    <GrantHistogram {model} />
  {:else}
    <EventRug views={inWin} lcnMap={snap.lcnMap} />
  {/if}

  <CallsFeed rows={visible} {paused} {resetKey} {emptyText} />
</section>

<style>
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--pad-panel);
    background: var(--bg-1);
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    overflow: hidden;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: var(--h-top);
  }

  .title {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
  }

  .windows {
    display: inline-flex;
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    overflow: hidden;
  }

  .ctl {
    min-height: var(--control-h);
    padding: 0 var(--s-3);
    border: 0;
    background: var(--bg-1);
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease);
  }

  .ctl:hover {
    background: var(--bg-2);
  }

  .ctl[aria-pressed="true"] {
    background: var(--bg-2);
    color: var(--tx-1);
  }

  .seg + .seg {
    border-left: 1px solid var(--line-2);
  }

  .pause {
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
  }

  .hidden {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    white-space: nowrap;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  @media (max-width: 639.98px) {
    .column {
      padding: var(--pad-panel-phone);
    }

    .ctl {
      min-height: var(--control-h-phone);
    }

    .filters :global(.filter-chip) {
      min-height: var(--hit-touch);
    }
  }
</style>
