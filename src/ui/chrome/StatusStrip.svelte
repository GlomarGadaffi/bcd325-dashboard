<script lang="ts">
  import type { Snippet } from 'svelte'
  import LastCall from '../status/LastCall.svelte'
  import StatusTiles from '../status/StatusTiles.svelte'
  import { PHONE_QUERY, isCompactWidth } from '../status/statusModel'

  // 64 px strip: scanner (widest, leads with the hold line), last call, counters.
  // Below 640 px it becomes two lines, scanner state and last call, and the
  // counters leave the strip (the phone menu carries them). The phone strip grows to
  // fit its two lines; the shell gives it an auto grid row.
  let { scanner, newCount = 0 }: { scanner?: Snippet; newCount?: number } = $props()

  function matchesCompact(): boolean {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(PHONE_QUERY).matches
        : isCompactWidth(window.innerWidth)
    } catch {
      return false
    }
  }

  let compact = $state(matchesCompact())

  $effect(() => {
    let query: MediaQueryList
    try {
      if (typeof window.matchMedia !== 'function') return
      query = window.matchMedia(PHONE_QUERY)
    } catch {
      return
    }
    const update = (): void => {
      compact = query.matches
    }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  })
</script>

<div class="strip" class:is-compact={compact}>
  <div class="zone zone-scanner" role="group" aria-label="Scanner">
    {#if scanner}{@render scanner()}{/if}
  </div>
  <div class="zone zone-last" role="group" aria-label="Last call">
    <LastCall />
  </div>
  {#if !compact}
    <!-- Tablet widths scroll the counters, so the zone must be keyboard reachable. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="zone zone-counters" role="group" aria-label="Counters" tabindex="0">
      <StatusTiles {newCount} />
    </div>
  {/if}
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 0.5fr) max-content;
    align-items: stretch;
    height: var(--h-strip);
    min-width: 0;
    background: var(--bg-1);
    border-bottom: 1px solid var(--line-1);
  }

  .zone {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 var(--s-4);
  }

  .zone + .zone {
    border-left: 1px solid var(--line-1);
  }

  .zone-scanner {
    overflow: hidden;
  }

  .zone-counters {
    overflow: hidden;
  }

  /* Tablet: the counters cannot all fit beside the other zones, so they scroll. */
  @media (min-width: 640px) and (max-width: 1279px) {
    .strip {
      grid-template-columns: minmax(200px, 1.2fr) minmax(200px, 0.8fr) minmax(0, 1.4fr);
    }

    .zone-counters {
      overflow-x: auto;
      overflow-y: hidden;
    }
  }

  /* Phone: two lines, scanner over last call. The scanner line can wrap, so the strip
     is at least 64 px and grows with its content. */
  @media (max-width: 639px) {
    .strip {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto;
      height: auto;
      min-height: var(--h-strip);
    }

    .zone {
      padding: var(--s-2) var(--pad-panel-phone);
    }

    .zone-scanner {
      overflow: visible;
    }

    /* Stacked lines: the divider sits above the last-call line, not beside it. */
    .zone + .zone {
      border-left: 0;
      border-top: 1px solid var(--line-1);
    }
  }
</style>
