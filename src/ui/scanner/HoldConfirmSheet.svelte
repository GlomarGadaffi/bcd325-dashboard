<script module lang="ts">
  export interface HoldTarget {
    tgid: string
    name: string
    agency: string
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import AgencyTag from '../primitives/AgencyTag.svelte'

  // Shown before a hold on touch devices and at phone width. A native dialog gives the
  // focus trap and Escape for free; this component adds the focus return to the trigger.
  let {
    target,
    onConfirm,
    onCancel,
  }: { target: HoldTarget; onConfirm: () => void; onCancel: () => void } = $props()

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

  // Escape is a cancel. The default would close the dialog without telling the parent.
  function onEscape(event: Event): void {
    event.preventDefault()
    onCancel()
  }
</script>

<dialog bind:this={dialog} class="sheet" aria-labelledby="hold-sheet-title" oncancel={onEscape}>
  <h2 id="hold-sheet-title" class="title">Hold this talkgroup?</h2>
  <p class="target">
    <span class="tgid">TG {target.tgid}</span>
    <span class="name">{target.name}</span>
    <AgencyTag code={target.agency} />
  </p>
  <p class="note">Other P25 traffic is not recorded while held.</p>
  <div class="actions">
    <button bind:this={cancelButton} type="button" class="btn" onclick={onCancel}>Cancel</button>
    <button type="button" class="btn btn-primary" onclick={onConfirm}>Hold TG {target.tgid}</button>
  </div>
</dialog>

<style>
  /* Edge-attached bottom sheet on phone; a centred dialog on wider touch screens. */
  .sheet {
    position: fixed;
    inset: auto 0 0 0;
    margin: 0;
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    padding: var(--s-5);
    border: 0;
    border-top: 1px solid var(--line-1);
    border-radius: var(--r-none);
    background: var(--bg-1);
    color: var(--tx-1);
    box-shadow: var(--shadow-overlay);
  }

  .sheet::backdrop {
    background: color-mix(in srgb, var(--bg-0) 60%, transparent);
  }

  .title {
    margin: 0 0 var(--s-3);
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .target {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-3);
    margin: 0 0 var(--s-3);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  .tgid {
    font-family: var(--font-mono);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }

  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .note {
    margin: 0 0 var(--s-5);
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
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

  .btn-primary {
    background: var(--held-fill);
    border-color: var(--held-fill);
    color: var(--held-text);
  }

  .btn-primary:hover {
    background: var(--held-fill);
    opacity: 0.9;
  }

  @media (max-width: 639px) {
    .actions {
      flex-direction: column-reverse;
    }

    .btn {
      width: 100%;
    }
  }

  @media (min-width: 640px) {
    .sheet {
      inset: 0;
      width: min(440px, 100%);
      height: fit-content;
      margin: auto;
      border: 1px solid var(--line-1);
      border-radius: var(--r-control);
    }
  }
</style>
