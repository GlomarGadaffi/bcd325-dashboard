<script lang="ts">
  import { untrack } from 'svelte'
  import AgencyTag from '../primitives/AgencyTag.svelte'
  import GrantTypeTag from '../primitives/GrantTypeTag.svelte'
  import { clock } from '../state/clock.svelte'
  import { countNewer, formatAge, isStale, type GrantView } from './callsModel'

  // Rows are virtualised. OVERSCAN extra rows above and below keep a fast scroll from
  // showing a gap. Rows read the clock only in their own text and class bindings, so
  // a tick updates text, never the list.
  const OVERSCAN = 4
  const FLASH_MS = 800
  const MARKER_MS = 10_000
  const FALLBACK_ROW_H = 40

  let {
    rows,
    paused,
    resetKey,
    emptyText,
  }: { rows: GrantView[]; paused: boolean; resetKey: string; emptyText: string | null } = $props()

  let list = $state<HTMLDivElement>()
  let viewportH = $state(0)
  let viewportW = $state(0)
  let scrollTop = $state(0)
  let rowH = $state(FALLBACK_ROW_H)

  let pointerIn = $state(false)
  let focusIn = $state(false)
  // The list captured when a hold starts (pause, pointer or focus). Null while live.
  let frozen = $state.raw<GrantView[] | null>(null)
  let frozenKey = $state<string | null>(null)

  const holding = $derived(paused || pointerIn || focusIn)
  const displayed = $derived(frozen ?? rows)
  // Only a paused list counts new grants. A hover or focus hold catches up on release.
  const newCount = $derived(paused && frozen ? countNewer(rows, frozen[0]?.id ?? 0) : 0)

  // A hold captures the live list. A window or filter change while held recaptures it.
  $effect(() => {
    const hold = holding
    const key = resetKey
    untrack(() => {
      if (!hold) {
        frozen = null
        frozenKey = null
      } else if (frozen === null || frozenKey !== key) {
        frozen = rows
        frozenKey = key
      }
    })
  })

  function jumpToNewest(): void {
    frozen = rows
    frozenKey = resetKey
    if (list) list.scrollTop = 0
  }

  // Scroll anchor: while the reader is scrolled down, the row at the top stays put as
  // new rows arrive above it. At the top, the list follows the newest row.
  let anchorId: number | null = null
  let anchorOffset = 0

  function onScroll(): void {
    if (!list) return
    scrollTop = list.scrollTop
    const index = Math.floor(list.scrollTop / rowH)
    anchorId = displayed[index]?.id ?? null
    anchorOffset = list.scrollTop - index * rowH
  }

  $effect(() => {
    const current = displayed
    untrack(() => {
      if (!list || anchorId === null || list.scrollTop === 0) return
      const index = current.findIndex((row) => row.id === anchorId)
      if (index < 0) return
      const target = index * rowH + anchorOffset
      if (target !== list.scrollTop) {
        list.scrollTop = target
        scrollTop = target
      }
    })
  })

  // The row height comes from the CSS custom property, which container queries set.
  $effect(() => {
    void viewportW
    void viewportH
    if (!list) return
    const value = parseFloat(getComputedStyle(list).getPropertyValue('--row-h'))
    if (Number.isFinite(value) && value > 0) rowH = value
  })

  const total = $derived(displayed.length)
  const firstIndex = $derived(Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN))
  const lastIndex = $derived(Math.min(total, Math.ceil((scrollTop + viewportH) / rowH) + OVERSCAN))
  const visibleRows = $derived(displayed.slice(firstIndex, Math.max(firstIndex, lastIndex)))
  const spacerH = $derived(total * rowH)

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    if (next instanceof Node && list?.contains(next)) return
    focusIn = false
  }

  // The newest row flashes once. Under reduced motion it gets an inset marker for 10 s.
  let flashId = $state<number | null>(null)
  let markerId = $state<number | null>(null)
  let lastTopId: number | null | undefined = undefined
  let flashTimer: ReturnType<typeof setTimeout> | undefined
  let markerTimer: ReturnType<typeof setTimeout> | undefined

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  }

  $effect(() => {
    const top = displayed[0]?.id ?? null
    untrack(() => {
      const first = lastTopId === undefined
      if (top === lastTopId) return
      lastTopId = top
      if (first || top === null) return
      if (prefersReducedMotion()) {
        markerId = top
        clearTimeout(markerTimer)
        markerTimer = setTimeout(() => (markerId = null), MARKER_MS)
      } else {
        flashId = top
        clearTimeout(flashTimer)
        flashTimer = setTimeout(() => (flashId = null), FLASH_MS)
      }
    })
  })

  $effect(() => () => {
    clearTimeout(flashTimer)
    clearTimeout(markerTimer)
  })
</script>

<div class="feed">
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- Focusable so a keyboard user can scroll the log, and so focus holds the list still. -->
  <div
    bind:this={list}
    bind:clientHeight={viewportH}
    bind:clientWidth={viewportW}
    class="list"
    role="log"
    aria-live="off"
    aria-label="EDACS grants, newest first"
    tabindex="0"
    onscroll={onScroll}
    onpointerenter={() => (pointerIn = true)}
    onpointerleave={() => (pointerIn = false)}
    onfocusin={() => (focusIn = true)}
    onfocusout={onFocusOut}
  >
    <div class="spacer" style:height="{spacerH}px">
      {#each visibleRows as row, offset (row.id)}
        {@const index = firstIndex + offset}
        {@const stale = isStale(clock.now - row.timestamp)}
        <div
          class="row"
          class:stale
          class:flash={flashId === row.id}
          class:marker={markerId === row.id}
          style:top="{index * rowH}px"
          style:height="{rowH}px"
        >
          <span class="c c-time">{row.time}</span>
          <span class="c c-type"><GrantTypeTag type={row.type} /></span>
          <span class="c c-id">{row.idText}</span>
          <span class="c c-name" title={row.name}>{row.name}</span>
          <span class="c c-agency"><AgencyTag code={row.agency} /></span>
          <span class="c c-chan">{row.channel}</span>
          <span class="c c-age">
            {#if stale}
              <svg class="clock" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5" />
                <path d="M6 3.4 V6.2 L7.9 7.3" fill="none" stroke="currentColor" stroke-width="1.5" />
              </svg>
            {/if}
            {formatAge(clock.now - row.timestamp)}
          </span>
        </div>
      {/each}
    </div>
  </div>

  {#if displayed.length === 0 && emptyText}
    <p class="empty">{emptyText}</p>
  {/if}

  {#if newCount > 0}
    <button type="button" class="new-count" onclick={jumpToNewest}>+{newCount} new</button>
  {/if}
</div>

<style>
  .feed {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    /* Container queries pick the row layout from the feed's own width. */
    container: feed / inline-size;
  }

  .list {
    /* Two-line 40 px rows by default. Feeds at least 540 px wide switch to one line below; narrower ones keep the full name on its own line. */
    --row-h: 40px;
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    background: var(--bg-inset);
    border-radius: var(--r-control);
  }

  .spacer {
    position: relative;
    width: 100%;
  }

  .row {
    position: absolute;
    left: 0;
    right: 0;
    display: grid;
    align-items: center;
    column-gap: var(--s-2);
    padding: 0 var(--s-3);
    border-bottom: 1px solid var(--line-1);
    background: var(--bg-inset);
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    grid-template-columns: 58px 52px 44px 40px minmax(0, 1fr) 60px;
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'time type id agency . age'
      'name name name name name chan';
  }

  @container feed (min-width: 540px) {
    .list {
      --row-h: 28px;
    }

    .row {
      grid-template-columns: 58px 52px 44px minmax(0, 1fr) 40px 52px 60px;
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: 'time type id name agency chan age';
    }
  }

  /* Tablet rows are 32 px, from the spacing spec. */
  @media (min-width: 640px) and (max-width: 1279.98px) {
    @container feed (min-width: 540px) {
      .list {
        --row-h: 32px;
      }
    }
  }

  .c {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .c-time,
  .c-id,
  .c-chan,
  .c-age {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .c-time {
    grid-area: time;
  }

  .c-type {
    grid-area: type;
  }

  .c-id {
    grid-area: id;
  }

  .c-name {
    grid-area: name;
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    text-overflow: ellipsis;
  }

  .c-agency {
    grid-area: agency;
  }

  .c-chan {
    grid-area: chan;
    color: var(--tx-2);
  }

  .c-age {
    grid-area: age;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--s-2);
  }

  .clock {
    width: 10px;
    height: 10px;
    flex: none;
  }

  /* Rows older than 60 s: a clock glyph and secondary text, no opacity change. */
  .row.stale {
    color: var(--tx-2);
  }

  .row.flash {
    animation: calls-flash var(--dur-flash) var(--ease);
  }

  .row.marker {
    box-shadow: inset 2px 0 0 var(--tx-1);
  }

  @keyframes calls-flash {
    from {
      background: var(--edacs-tint);
    }

    to {
      background: var(--bg-inset);
    }
  }

  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: var(--s-5);
    color: var(--tx-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    text-align: center;
    pointer-events: none;
  }

  .new-count {
    position: absolute;
    top: var(--s-3);
    left: 50%;
    transform: translateX(-50%);
    min-height: var(--control-h);
    padding: 0 var(--s-4);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-2);
    color: var(--tx-1);
    box-shadow: var(--shadow-overlay);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    cursor: pointer;
  }

  @media (max-width: 639.98px) {
    .new-count {
      min-height: var(--control-h-phone);
    }
  }
</style>
