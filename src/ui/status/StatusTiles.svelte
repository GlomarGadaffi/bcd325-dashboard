<script lang="ts">
  import { getSnapshot } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import {
    bufferCoverageStart,
    elapsedMs,
    formatAge,
    formatCount,
    formatDelta,
    grantDelta,
    hasDeltaCoverage,
    siteText,
  } from './statusModel'

  // Counters for the strip. Each label names its true scope. The largest figure is
  // a 20 px mono counter; there is no hero number.
  let { newCount = 0 }: { newCount?: number } = $props()

  const snapshot = $derived(getSnapshot())
  const now = $derived(clock.now)
  const coverageStart = $derived(bufferCoverageStart(snapshot.grants, snapshot.stats.sessionStart))
  const delta = $derived(hasDeltaCoverage(now, coverageStart) ? grantDelta(snapshot.grants, now) : null)
  const session = $derived(formatAge(elapsedMs(now, snapshot.stats.sessionStart)))
  const site = $derived(siteText(snapshot.siteId))
</script>

<dl class="tiles">
  <div class="tile">
    <dt>EDACS grants, this session</dt>
    <dd>
      <span class="num">{formatCount(snapshot.stats.grants)}</span>
      {#if delta}
        <span class="sub" title="Last 5 minutes compared with the 5 minutes before">{formatDelta(delta.delta)} vs prior 5 m</span>
      {/if}
    </dd>
  </div>

  <div class="tile">
    <dt>Patch IDs seen</dt>
    <dd>
      <span class="num">{formatCount(snapshot.stats.patches)}</span>
      <span class="sub">{formatCount(snapshot.patches.length)} live now</span>
    </dd>
  </div>

  <div class="tile">
    <dt>P25 transmissions, all time</dt>
    <dd><span class="num">{formatCount(snapshot.stats.p25Total)}</span></dd>
  </div>

  <div class="tile">
    <dt>NEW</dt>
    <dd><span class="num">{formatCount(newCount)}</span></dd>
  </div>

  <div class="tile">
    <dt>Session</dt>
    <dd><span class="time">{session}</span></dd>
  </div>

  <div class="tile">
    <dt>Site</dt>
    <dd><span class="site">{site}</span></dd>
  </div>
</dl>

<style>
  .tiles {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    height: 100%;
    margin: 0;
    min-width: 0;
  }

  .tile {
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }

  dt {
    max-width: 9em;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-regular);
  }

  dd {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    margin: 0;
    color: var(--tx-1);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .num {
    font-size: var(--fs-counter);
    line-height: var(--lh-counter);
    font-weight: var(--fw-medium);
  }

  .sub {
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .time {
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-medium);
  }

  .site {
    font-size: var(--fs-data);
    line-height: var(--lh-data);
  }
</style>
