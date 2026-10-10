<script lang="ts">
  import { onMount } from 'svelte'

  // Asked before a disconnect while a hold is set. The scanner keeps the hold after the
  // port closes, so the operator should choose that on purpose.
  let {
    tgid,
    onConfirm,
    onCancel,
  }: { tgid: string; onConfirm: () => void; onCancel: () => void } = $props()

  let dialog: HTMLDialogElement | undefined = $state()
  let cancelButton: HTMLButtonElement | undefined = $state()

  onMount(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const el = dialog
    if (el) {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    }
    cancelButton?.focus()
    return () => {
      if (el?.open) el.close()
      if (trigger?.isConnected) trigger.focus()
    }
  })

  function onEscape(event: Event): void {
    event.preventDefault()
    onCancel()
  }
</script>

<dialog bind:this={dialog} class="dialog" aria-labelledby="disconnect-hold-title" aria-describedby="disconnect-hold-body" oncancel={onEscape}>
  <h2 id="disconnect-hold-title" class="title">Disconnect the scanner?</h2>
  <p id="disconnect-hold-body" class="body">Scanner stays on TG {tgid} after disconnect.</p>
  <div class="actions">
    <button bind:this={cancelButton} type="button" class="btn" onclick={onCancel}>Cancel</button>
    <button type="button" class="btn" onclick={onConfirm}>Disconnect</button>
  </div>
</dialog>

<style>
  .dialog {
    width: min(420px, calc(100% - var(--s-5) * 2));
    margin: auto;
    padding: var(--s-5);
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    box-shadow: var(--shadow-overlay);
  }

  .dialog::backdrop {
    background: color-mix(in srgb, var(--bg-0) 60%, transparent);
  }

  .title {
    margin: 0 0 var(--s-3);
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .body {
    margin: 0 0 var(--s-5);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .actions {
    display: flex;
    gap: var(--s-3);
    justify-content: flex-end;
  }

  .btn {
    min-width: var(--hit-touch);
    min-height: var(--hit-touch);
    padding: 0 var(--s-5);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .btn:hover {
    background: var(--bg-2);
  }

  @media (max-width: 639px) {
    .actions {
      flex-direction: column-reverse;
    }

    .btn {
      width: 100%;
    }
  }
</style>
