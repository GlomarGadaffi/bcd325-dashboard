<script lang="ts">
  import { untrack } from 'svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import AgencyTag from '../primitives/AgencyTag.svelte'
  import { DB } from '../../core/AgencyDB'
  import StatusChip, { type ChipGlyph, type ChipTone } from './StatusChip.svelte'
  import { HOLD_ECHO_MS, holdController, isQuiet, type HoldPhase } from './holdMachine'
  import { formatAge } from './format'

  // The state line is driven by the hold controller, which takes HELD only from a scanner
  // line for the requested TG. lcdState is shown verbatim as secondary text and never
  // decides the state, because the store writes it on click. The shell passes onHold so a
  // Confirm on a stale hold can open the confirm sheet on touch and phone.
  let {
    onHold = (tgid: string) => holdController.hold(tgid),
  }: { onHold?: (tgid: string) => void } = $props()

  const snapshot = $derived(getSnapshot())
  const hold = $derived($holdController)
  const phase = $derived(hold.phase)
  const quiet = $derived(isQuiet(phase, clock.now))

  $effect(() => {
    holdController.connection(snapshot.connected)
  })

  const phaseTg = $derived(phase.kind === 'AUTO_SKIP' ? null : phase.tgid)

  function nameOf(tgid: string): { name: string; agency: string } {
    const card = snapshot.p25Cards.find((c) => c.tgid === tgid)
    if (card) return { name: card.name, agency: card.agency }
    const info = DB[tgid]
    return info ? { name: info.n, agency: info.a } : { name: 'Unknown TG', agency: 'UNK' }
  }

  const info = $derived(phaseTg === null ? null : nameOf(phaseTg))

  const chip = $derived.by((): { glyph: ChipGlyph; tone: ChipTone; label: string } => {
    switch (phase.kind) {
      case 'AUTO_SKIP':
        return { glyph: 'skip', tone: 'skip', label: 'AUTO-SKIP' }
      case 'PENDING':
        return { glyph: 'pending', tone: 'pending', label: 'HOLD PENDING' }
      case 'HELD':
        return quiet
          ? { glyph: 'pin', tone: 'held-quiet', label: 'HELD QUIET' }
          : { glyph: 'pin', tone: 'held', label: `HELD TG ${phase.tgid}` }
      case 'MISMATCH':
        return { glyph: 'triangle', tone: 'warn', label: 'HELD MISMATCH' }
      case 'FAILED':
        return { glyph: 'octagon', tone: 'error', label: 'HOLD FAILED' }
      case 'STALE':
        return { glyph: 'clock', tone: 'stale', label: 'STALE HOLD' }
    }
  })

  // Assertive only for a confirmed or failed hold. The text changes only on those
  // transitions, so it is not repeated every second.
  let announcement = $state('')
  let announcedKind = $state<HoldPhase['kind']>('AUTO_SKIP')
  $effect(() => {
    const next = phase
    const previous = untrack(() => announcedKind)
    if (next.kind === previous) return
    announcedKind = next.kind
    if (next.kind === 'HELD' && (previous === 'PENDING' || previous === 'FAILED' || previous === 'STALE')) {
      announcement = `Hold confirmed on TG ${next.tgid}.`
    } else if (next.kind === 'FAILED') {
      announcement = `Hold failed on TG ${next.tgid}. No echo from the scanner within ${HOLD_ECHO_MS / 1000} seconds.`
    }
  })
</script>

<section class="scanner" aria-label="Scanner hold">
  <div class="row">
    <StatusChip glyph={chip.glyph} tone={chip.tone} label={chip.label} />

    <p class="detail">
      {#if phase.kind === 'AUTO_SKIP'}
        P25 traffic is skipped unless held.
      {:else if phase.kind === 'PENDING'}
        Command sent for TG {phase.tgid}. Waiting for the scanner.
      {:else if phase.kind === 'HELD'}
        {#if quiet}
          {phase.lastAudioAt === null ? 'No audio since hold' : `Last audio ${formatAge(clock.now - phase.lastAudioAt)} ago`}
        {:else if info}
          <span class="name">{info.name}</span> <AgencyTag code={info.agency} />
        {/if}
      {:else if phase.kind === 'MISMATCH'}
        Scanner reports TG {phase.reportedTg}, not TG {phase.tgid}.
      {:else if phase.kind === 'FAILED'}
        No echo from the scanner within {HOLD_ECHO_MS / 1000} seconds.
      {:else}
        Hold from before disconnect: TG {phase.tgid}. Confirm or release.
      {/if}
    </p>

    <div class="actions">
      {#if phase.kind === 'STALE'}
        <button type="button" class="btn" disabled={!hold.connected} onclick={() => onHold(phase.tgid)}>
          Confirm
        </button>
      {/if}
      {#if hold.storeHold !== null}
        <button type="button" class="btn" disabled={!hold.connected} onclick={() => holdController.release()}>
          Release
        </button>
      {/if}
    </div>
  </div>

  <p class="meta">
    <span class="lcd">{snapshot.lcdState}</span>
    {#if !hold.connected && hold.storeHold !== null}
      <span class="reason">Disabled while the scanner is disconnected.</span>
    {/if}
  </p>

  <p class="sr-only" aria-live="assertive">{announcement}</p>
</section>

<style>
  .scanner {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--s-1);
    height: 100%;
    min-width: 0;
    padding: 0 var(--pad-panel);
    font-size: var(--fs-data);
    line-height: var(--lh-data);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-width: 0;
  }

  .detail {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tx-1);
  }

  .name {
    font-weight: var(--fw-medium);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-4);
    margin: 0;
    min-width: 0;
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    color: var(--tx-2);
  }

  /* lcdState is the scanner's own text: secondary, mono, shown as received. */
  .lcd {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .reason {
    color: var(--tx-2);
  }

  .actions {
    display: flex;
    flex: none;
    gap: var(--s-2);
  }

  .btn {
    min-height: var(--control-h);
    padding: 0 var(--s-3);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease);
  }

  .btn:hover:not(:disabled) {
    background: var(--bg-2);
  }

  .btn:disabled {
    color: var(--tx-2);
    border-style: dashed;
    cursor: not-allowed;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  /* Phone: 44px controls, and the state line may wrap onto a second row. */
  @media (max-width: 639px) {
    .scanner {
      padding: 0;
    }

    .row {
      flex-wrap: wrap;
    }

    .detail {
      flex-basis: 100%;
      white-space: normal;
    }

    .btn {
      min-height: var(--hit-touch);
      padding: 0 var(--s-5);
      font-size: var(--fs-body);
    }
  }
</style>
