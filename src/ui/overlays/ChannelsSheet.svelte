<script lang="ts">
  import { untrack } from 'svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import ChannelsTable from '../sites/ChannelsTable.svelte'
  import { captureFocus, returnFocus } from './focusReturn'

  // Phone only. The Channels tab is in the Sites column on wider screens; under 640 px
  // the menu opens this sheet instead. Focus returns to the menu trigger on close.
  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  const snapshot = $derived(getSnapshot())

  let dialogEl: HTMLDialogElement | undefined = $state()
  let closeEl: HTMLButtonElement | undefined = $state()

  $effect(() => {
    const el = dialogEl
    if (!el) return
    const isOpen = open
    untrack(() => {
      if (isOpen && !el.open) {
        captureFocus()
        if (typeof el.showModal === 'function') el.showModal()
        else el.setAttribute('open', '')
        closeEl?.focus()
      } else if (!isOpen && el.open) {
        el.close()
        returnFocus()
      }
    })
  })

  function onCancelEvent(event: Event): void {
    event.preventDefault()
    onClose()
  }
</script>

<dialog class="sheet" bind:this={dialogEl} aria-labelledby="channels-title" oncancel={onCancelEvent}>
  <header class="head">
    <h2 id="channels-title" class="title">Channels</h2>
    <button bind:this={closeEl} type="button" class="close" onclick={onClose}>Close</button>
  </header>
  <div class="body">
    <ChannelsTable lcnMap={snapshot.lcnMap} grants={snapshot.grants} />
  </div>
</dialog>

<style>
  /* Bottom sheet on phone. Native dialog, so the focus trap and Escape come with it. */
  .sheet {
    position: fixed;
    inset: auto 0 0 0;
    width: 100%;
    max-width: 100%;
    max-height: 70dvh;
    margin: 0;
    padding: 0;
    border: 0;
    border-top: 1px solid var(--line-1);
    border-radius: var(--r-none);
    background: var(--bg-1);
    color: var(--tx-1);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* A closed dialog stays hidden even though the sheet sets its own display. */
  .sheet:not([open]) {
    display: none;
  }

  .sheet::backdrop {
    background: color-mix(in srgb, var(--bg-0) 60%, transparent);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: var(--hit-touch);
    padding: 0 var(--s-5);
    border-bottom: 1px solid var(--line-1);
  }

  .title {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .close {
    min-width: var(--hit-touch);
    min-height: var(--hit-touch);
    padding: 0 var(--s-4);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .close:hover {
    background: var(--bg-2);
  }

  .body {
    min-height: 0;
    padding: var(--s-3) var(--s-5) var(--s-5);
    overflow-y: auto;
  }
</style>
