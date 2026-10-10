<script lang="ts">
  import { untrack } from 'svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import StatusChip, { type ChipGlyph, type ChipTone } from './StatusChip.svelte'
  import { connectionTracker } from './connection.svelte'
  import {
    connectionView,
    dataStoppedLabel,
    NO_DATA_COPY,
    PORT_ERROR_COPY,
    UNSUPPORTED_COPY,
  } from './connection'
  import { formatClock } from './format'

  // Visible notice for connection problems, plus an always-present assertive region so a
  // drop, a reconnect or a port error is announced when its text appears.
  let { hasWebSerial, portError = false }: { hasWebSerial: boolean; portError?: boolean } = $props()

  const snapshot = $derived(getSnapshot())

  $effect(() => {
    const connected = snapshot.connected
    untrack(() => connectionTracker.observe(connected))
  })

  const view = $derived(
    connectionView({
      connected: snapshot.connected,
      hasWebSerial,
      portError,
      lastRawAt: snapshot.lastRawAt,
      since: connectionTracker.since,
      droppedAt: connectionTracker.droppedAt,
      now: clock.now,
    }),
  )

  const stopped = $derived(dataStoppedLabel(snapshot.connected, snapshot.lastRawAt))

  const notice = $derived.by((): { glyph: ChipGlyph; tone: ChipTone; label: string; text: string } | null => {
    switch (view.notice) {
      case 'unsupported':
        return { glyph: 'octagon', tone: 'error', label: 'ERROR', text: UNSUPPORTED_COPY }
      case 'port-error':
        return { glyph: 'octagon', tone: 'error', label: 'ERROR', text: PORT_ERROR_COPY }
      case 'offline':
        return {
          glyph: 'octagon',
          tone: 'error',
          label: 'OFFLINE',
          text: stopped ? `Scanner disconnected. Lists keep their last content; ${stopped}.` : 'Scanner disconnected.',
        }
      case 'no-data':
        return { glyph: 'triangle', tone: 'warn', label: 'WARN', text: NO_DATA_COPY }
      case null:
        return null
    }
  })

  const alertText = $derived.by((): string => {
    if (portError) return PORT_ERROR_COPY
    const change = connectionTracker.lastChange
    if (change === null) return ''
    return change.kind === 'dropped'
      ? `Scanner disconnected at ${formatClock(change.at)}.`
      : `Scanner reconnected at ${formatClock(change.at)}.`
  })
</script>

{#if notice}
  <div class="banner">
    <StatusChip glyph={notice.glyph} tone={notice.tone} label={notice.label} />
    <p class="text">{notice.text}</p>
  </div>
{/if}

<p class="sr-only" aria-live="assertive">{alertText}</p>

<style>
  /* Fixed under the top bar so the grid does not reflow when a notice appears. */
  .banner {
    position: fixed;
    top: var(--h-top);
    left: 0;
    right: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: var(--control-h);
    padding: var(--s-2) var(--s-4);
    background: var(--bg-1);
    border-bottom: 1px solid var(--line-1);
  }

  .text {
    margin: 0;
    min-width: 0;
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
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

  @media (max-width: 639px) {
    .banner {
      top: var(--h-top);
      align-items: flex-start;
      padding: var(--s-3) var(--s-5);
    }

    .text {
      font-size: var(--fs-body);
      line-height: var(--lh-body);
    }
  }
</style>
