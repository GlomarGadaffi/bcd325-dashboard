<script lang="ts">
  import { onMount, type Snippet } from 'svelte'
  import { exportCSV, exportJSON } from '../state/adapter.svelte'
  import StateChip from '../primitives/StateChip.svelte'
  import { captureFocus, returnFocus } from './focusReturn'
  import { errorMessage } from './overlayModel'

  // Top-right popover. Sheets and dialogs opened from here take focus over;
  // closing them returns focus to the menu trigger. On phone the shell passes extra
  // content (counters and the theme toggle) above the actions.
  let {
    onRawLog,
    onChannels,
    onWipe,
    onClose,
    extra,
  }: {
    onRawLog: () => void
    onChannels: () => void
    onWipe: () => void
    onClose: () => void
    extra?: Snippet
  } = $props()

  let menuEl: HTMLElement | undefined = $state()
  let exportError = $state<string | null>(null)
  let handedOff = false

  onMount(() => {
    captureFocus()
    menuEl?.querySelector<HTMLButtonElement>('.item')?.focus()
    return () => {
      if (!handedOff) returnFocus()
    }
  })

  function runExport(action: () => void): void {
    try {
      action()
      onClose()
    } catch (error) {
      exportError = errorMessage(error)
    }
  }

  function openRawLog(): void {
    handedOff = true
    onRawLog()
    onClose()
  }

  function openChannels(): void {
    // Channels either opens a sheet or moves focus to the Sites tab, so the menu
    // does not return focus to its trigger on the way out.
    handedOff = true
    onChannels()
    onClose()
  }

  function openWipe(): void {
    handedOff = true
    onWipe()
    onClose()
  }

  function onWindowKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="menu" class:is-wide={extra !== undefined} role="group" aria-label="Menu" bind:this={menuEl}>
  {#if extra}{@render extra()}{/if}

  <div class="group">
    <button type="button" class="item" onclick={() => runExport(exportJSON)}>Export JSON</button>
    <button type="button" class="item" onclick={() => runExport(exportCSV)}>Export CSV</button>
  </div>

  <div class="group">
    <button type="button" class="item" onclick={openRawLog}>Raw log</button>
    <button type="button" class="item" onclick={openChannels}>Channels</button>
  </div>

  <div class="group danger">
    <p class="group-label">Danger</p>
    <button type="button" class="item is-danger" onclick={openWipe}>Wipe history</button>
  </div>

  {#if exportError}
    <div class="error" role="status">
      <StateChip kind="ERROR">{exportError}</StateChip>
    </div>
  {/if}
</div>

<style>
  .menu {
    position: fixed;
    top: calc(var(--h-top) + var(--s-2));
    right: var(--s-3);
    z-index: 30;
    width: min(240px, calc(100vw - 2 * var(--s-5)));
    max-height: calc(100dvh - var(--h-top) - var(--s-5));
    overflow-y: auto;
    padding: var(--s-2) 0;
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    background: var(--bg-2);
    box-shadow: var(--shadow-overlay);
  }

  /* Phone: counters and the theme toggle make the menu wider. */
  .menu.is-wide {
    width: min(320px, calc(100vw - 2 * var(--s-3)));
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  .group + .group {
    margin-top: var(--s-2);
    padding-top: var(--s-2);
    border-top: 1px solid var(--line-1);
  }

  .group-label {
    margin: 0;
    padding: 0 var(--s-4);
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  .item {
    min-height: var(--hit-min);
    padding: 0 var(--s-4);
    border: 0;
    background: transparent;
    color: var(--tx-1);
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    text-align: left;
    cursor: pointer;
  }

  .item:hover {
    background: var(--bg-1);
  }

  .item.is-danger {
    color: var(--error);
  }

  .error {
    margin: var(--s-2) var(--s-4) 0;
    max-width: 100%;
    overflow-wrap: anywhere;
  }

  /* Phone: 44 px touch targets. */
  @media (max-width: 639px) {
    .item {
      min-height: var(--hit-touch);
      font-size: var(--fs-body);
      line-height: var(--lh-body);
    }
  }
</style>
