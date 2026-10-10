<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import { formatClock } from '../status/statusModel'
  import { captureFocus, returnFocus } from './focusReturn'
  import { isGlgLine, isPlainKey, isTypingTarget, lastRawLines } from './overlayModel'

  // Bottom sheet over the body. It is always mounted so that L works while closed,
  // and it takes no space in the grid: 0 px closed, 220 px open.
  // Lines are scanner output and render as text only.
  let { open = $bindable(false), onClose }: { open?: boolean; onClose: () => void } = $props()

  const snapshot = $derived(getSnapshot())
  const lines = $derived(lastRawLines(snapshot.rawLog))

  let sheetEl: HTMLElement | undefined = $state()
  let logEl: HTMLElement | undefined = $state()
  let pinnedToEnd = true
  let wasOpen = false

  function dialogIsOpen(): boolean {
    return document.querySelector('dialog[open]') !== null
  }

  function scrollToEnd(): void {
    if (logEl) logEl.scrollTop = logEl.scrollHeight
  }

  function onScroll(): void {
    if (!logEl) return
    pinnedToEnd = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24
  }

  function onKey(event: KeyboardEvent): void {
    if (dialogIsOpen()) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      onClose()
      return
    }
    if (event.repeat || !isPlainKey(event) || event.key.toLowerCase() !== 'l') return
    if (isTypingTarget(document.activeElement)) return
    event.preventDefault()
    if (open) onClose()
    else open = true
  }

  $effect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  $effect(() => {
    const isOpen = open
    untrack(() => {
      if (isOpen && !wasOpen) {
        captureFocus()
        pinnedToEnd = true
        sheetEl?.focus()
        void tick().then(scrollToEnd)
      } else if (!isOpen && wasOpen) {
        const active = document.activeElement
        if (sheetEl && active instanceof HTMLElement && sheetEl.contains(active)) active.blur()
        returnFocus()
      }
      wasOpen = isOpen
    })
  })

  // New lines keep the view at the bottom only when the reader is already there.
  $effect(() => {
    if (lines && open && pinnedToEnd) void tick().then(scrollToEnd)
  })
</script>

<section
  class="sheet"
  class:is-open={open}
  aria-label="Raw log"
  tabindex="-1"
  inert={!open}
  bind:this={sheetEl}
>
  <header class="head">
    <h2 class="title">Raw log</h2>
    <span class="meta">Last {lines.length} lines, newest at the bottom</span>
    <button type="button" class="close" onclick={onClose}>Close</button>
  </header>

  <!-- The log scrolls, so keyboard users must be able to focus it. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="log" role="log" aria-live="off" aria-label="Raw scanner lines" tabindex="0" bind:this={logEl} onscroll={onScroll}>
    {#if lines.length === 0}
      <p class="empty">No lines yet.</p>
    {:else}
      {#each lines as entry (entry.id)}
        {@const glg = isGlgLine(entry.line)}
        <div class="row" class:is-glg={glg}>
          <span class="time">{formatClock(entry.timestamp)}</span>
          {#if glg}<span class="tag">GLG</span>{/if}
          <span class="text">{entry.line}</span>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    background: var(--bg-1);
    box-shadow: var(--shadow-overlay);
    transition:
      height var(--dur-base) var(--ease),
      visibility var(--dur-base) var(--ease);
  }

  .sheet.is-open {
    height: 220px;
    visibility: visible;
  }

  /* Phone: sit above the bottom tab bar. */
  @media (max-width: 639px) {
    .sheet {
      bottom: var(--h-tabbar);
    }
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    height: var(--control-h);
    flex: none;
    padding: 0 var(--s-4);
    border-bottom: 1px solid var(--line-1);
  }

  .title {
    margin: 0;
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    font-weight: var(--fw-semibold);
  }

  .meta {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .close {
    min-height: var(--hit-min);
    padding: 0 var(--s-3);
    border: 1px solid var(--line-2);
    border-radius: var(--r-tag);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .close:hover {
    background: var(--bg-2);
  }

  .log {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    background: var(--bg-inset);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    padding: 0 var(--s-4);
    min-width: 0;
  }

  .row.is-glg {
    background: var(--p25-tint);
    box-shadow: inset 2px 0 0 var(--p25);
  }

  .time {
    flex: none;
    color: var(--tx-2);
  }

  .tag {
    flex: none;
    padding: 0 var(--s-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r-tag);
    color: var(--tx-1);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
  }

  .text {
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--tx-1);
  }

  .empty {
    margin: 0;
    padding: var(--s-4);
    color: var(--tx-2);
    font-family: var(--font-sans);
    font-size: var(--fs-data);
  }
</style>
