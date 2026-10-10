<script lang="ts">
  import { untrack } from 'svelte'
  import { getSnapshot, wipeDB } from '../state/adapter.svelte'
  import StateChip from '../primitives/StateChip.svelte'
  import { formatCount } from '../status/statusModel'
  import { captureFocus, returnFocus } from './focusReturn'
  import { errorMessage, WIPE_WORD, wipeArmed, wipeCounts } from './overlayModel'

  // In-app replacement for window.confirm. Cancel has focus by default. The
  // destructive button stays disabled until the exact word is typed.
  let { open, onClose }: { open: boolean; onClose: () => void } = $props()

  const snapshot = $derived(getSnapshot())
  const counts = $derived(wipeCounts(snapshot))

  let dialogEl: HTMLDialogElement | undefined = $state()
  let cancelEl: HTMLButtonElement | undefined = $state()
  let typed = $state('')
  let error = $state<string | null>(null)
  const armed = $derived(wipeArmed(typed))

  $effect(() => {
    const el = dialogEl
    if (!el) return
    const isOpen = open
    untrack(() => {
      if (isOpen && !el.open) {
        typed = ''
        error = null
        captureFocus()
        if (typeof el.showModal === 'function') el.showModal()
        else el.setAttribute('open', '')
        cancelEl?.focus()
      } else if (!isOpen && el.open) {
        el.close()
        returnFocus()
      }
    })
  })

  // The core wipe no longer asks for confirmation. This dialog is the confirmation.
  function confirmWipe(): void {
    if (!armed) return
    error = null
    try {
      wipeDB()
      onClose()
    } catch (err) {
      error = errorMessage(err)
    }
  }

  function onCancelEvent(event: Event): void {
    event.preventDefault()
    onClose()
  }
</script>

<dialog
  class="dialog"
  bind:this={dialogEl}
  aria-labelledby="wipe-title"
  aria-describedby="wipe-summary"
  oncancel={onCancelEvent}
>
  <div class="body">
    <h2 id="wipe-title" class="title">Wipe history</h2>
    <p id="wipe-summary" class="summary">
      This clears the all-time totals stored in this browser. It cannot be undone.
    </p>

    <section class="counts" aria-labelledby="wipe-deleted">
      <h3 id="wipe-deleted" class="group-title">Deleted by this action</h3>
      <dl>
        <div class="row">
          <dt>Talkgroup, unit and member totals</dt>
          <dd>{formatCount(counts.totals.leaderboard)}</dd>
        </div>
        <div class="row">
          <dt>Patch totals</dt>
          <dd>{formatCount(counts.totals.patches)}</dd>
        </div>
        <div class="row">
          <dt>P25 talkgroup totals</dt>
          <dd>{formatCount(counts.totals.p25)}</dd>
        </div>
      </dl>
    </section>

    <section class="counts" aria-labelledby="wipe-kept">
      <h3 id="wipe-kept" class="group-title">Session rows, still shown after this action</h3>
      <dl>
        <div class="row">
          <dt>EDACS grants</dt>
          <dd>{formatCount(counts.session.grants)}</dd>
        </div>
        <div class="row">
          <dt>Patch IDs</dt>
          <dd>{formatCount(counts.session.patches)}</dd>
        </div>
        <div class="row">
          <dt>P25 cards</dt>
          <dd>{formatCount(counts.session.p25Cards)}</dd>
        </div>
      </dl>
    </section>

    <label class="confirm-label" for="wipe-confirm">Type {WIPE_WORD} to enable the wipe button</label>
    <input
      id="wipe-confirm"
      class="confirm-input"
      type="text"
      autocomplete="off"
      spellcheck="false"
      bind:value={typed}
    />

    {#if error}
      <div class="error" role="status">
        <StateChip kind="ERROR">{error}</StateChip>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button type="button" class="btn" bind:this={cancelEl} onclick={onClose}>Cancel</button>
    <button type="button" class="btn destructive" disabled={!armed} onclick={confirmWipe}>Wipe history</button>
  </div>
</dialog>

<style>
  .dialog {
    width: min(440px, calc(100vw - 2 * var(--s-5)));
    max-height: calc(100vh - 2 * var(--s-5));
    padding: 0;
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    box-shadow: var(--shadow-overlay);
    overflow: auto;
  }

  /* A translucent scrim built from the background token, so no literal colour. */
  .dialog::backdrop {
    background: color-mix(in srgb, var(--bg-0) 70%, transparent);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-5);
  }

  .title {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .summary {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .counts {
    border-top: 1px solid var(--line-1);
    padding-top: var(--s-3);
  }

  .group-title {
    margin: 0 0 var(--s-2);
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  dl {
    margin: 0;
  }

  .row {
    display: flex;
    justify-content: space-between;
    gap: var(--s-3);
    font-size: var(--fs-data);
    line-height: var(--lh-data);
  }

  .row dt {
    color: var(--tx-2);
  }

  .row dd {
    margin: 0;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .confirm-label {
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .confirm-input {
    min-height: var(--control-h);
    padding: 0 var(--s-3);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-inset);
    color: var(--tx-1);
    font-family: var(--font-mono);
    font-size: var(--fs-data);
  }

  .error {
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-3);
    padding: var(--s-4) var(--s-5);
    border-top: 1px solid var(--line-1);
    background: var(--bg-2);
  }

  .btn {
    min-height: var(--hit-min);
    padding: 0 var(--s-4);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-data);
    cursor: pointer;
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-2);
  }

  .btn.destructive {
    border-color: var(--error);
    background: var(--error-tint);
    color: var(--error);
  }

  /* Disabled is text colour and a solid outline, not a faded fill. */
  .btn:disabled {
    border-color: var(--line-2);
    background: var(--bg-1);
    color: var(--tx-3);
    cursor: not-allowed;
  }

  @media (max-width: 639px) {
    .btn,
    .confirm-input {
      min-height: var(--hit-touch);
    }

    .confirm-input {
      font-size: var(--fs-body);
    }
  }
</style>
