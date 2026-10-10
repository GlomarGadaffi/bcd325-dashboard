<script lang="ts">
  import { untrack } from 'svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import StatusChip from '../scanner/StatusChip.svelte'
  import { connectionTracker } from '../scanner/connection.svelte'
  import { connectionView } from '../scanner/connection'
  import { formatAge, formatClock } from '../scanner/format'

  // The notices (unsupported browser, port error, drop, no data) are in OfflineBanner.
  // The top bar is 44px tall, so the pill shows only the state and its times.
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
</script>

<div class="pill">
  {#if view.state === 'OFFLINE'}
    <StatusChip glyph="open" tone="neutral" label="OFFLINE" />
    <span class="meta">
      since <span class="mono">{formatClock(connectionTracker.since)}</span>{#if view.dataAgeMs !== null},
        last data {formatAge(view.dataAgeMs)} ago{/if}
    </span>
  {:else if view.state === 'LIVE'}
    <StatusChip glyph="dot" tone="live" label="LIVE" />
    <span class="age mono">{view.dataAgeMs === null ? 'no data yet' : formatAge(view.dataAgeMs)}</span>
  {:else}
    <StatusChip glyph="clock" tone="stale" label="STALE" />
    <span class="age mono">{formatAge(view.silentMs)}</span>
  {/if}
</div>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--s-3);
    min-width: 0;
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    white-space: nowrap;
  }

  .meta,
  .age {
    color: var(--tx-2);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 639px) {
    .pill {
      gap: var(--s-2);
    }

    .meta {
      max-width: 9ch;
    }
  }
</style>
