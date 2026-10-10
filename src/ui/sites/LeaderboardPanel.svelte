<script lang="ts">
  import type { LeaderboardEntry } from '../../types'
  import AgencyTag from '../primitives/AgencyTag.svelte'
  import Tooltip from '../primitives/Tooltip.svelte'
  import { clock } from '../state/clock.svelte'
  import {
    LEADERBOARD_ROWS,
    LeaderboardOrder,
    axisMax,
    bareId,
    leaderboardKind,
    leaderboardTip,
    nestedBar,
    storeOrder,
    type LeaderboardKind,
  } from './sitesModel'

  // One leaderboard panel. Each instance has its own axis and its own reorder freeze.
  // The bar is a nested pair from zero: solid h5, remainder to h60. The table cells are the twin.
  const TEXT: Record<LeaderboardKind, { title: string; metric: string; empty: string }> = {
    talkgroups: { title: 'Talkgroups', metric: 'grants', empty: 'No talkgroup grants in 60 minutes' },
    units: { title: 'Units', metric: 'unit grants', empty: 'No unit grants in 60 minutes' },
    members: { title: 'Members', metric: 'patch events', empty: 'No patch events in 60 minutes' },
  }

  let {
    kind,
    rows,
    compact = false,
  }: { kind: LeaderboardKind; rows: LeaderboardEntry[]; compact?: boolean } = $props()

  const text = $derived(TEXT[kind])
  // Only this panel's kind, in store order, capped at LEADERBOARD_ROWS. The core keeps every ID.
  const shown = $derived(
    storeOrder(rows.filter((row) => leaderboardKind(row.id) === kind)).slice(0, LEADERBOARD_ROWS),
  )
  const axis = $derived(axisMax(shown))
  // Holds the frozen order between derivations. The clock drives the 5-second check.
  const order = new LeaderboardOrder()
  const ordered = $derived(order.next(shown, clock.now))

  const titleId = $derived(`lb-${kind}-title`)

  function tipId(key: string): string {
    return `lb-${kind}-${key.replace(/[^A-Za-z0-9_-]/g, '-')}`
  }
</script>

<section class="panel kind-{kind}" class:compact aria-labelledby={titleId}>
  <header class="head">
    <h3 id={titleId} class="title">{text.title}</h3>
    <span class="metric">{text.metric}</span>
  </header>

  {#if shown.length === 0}
    <p class="empty">{text.empty}</p>
  {:else}
    <div role="table" class="grid" aria-labelledby={titleId}>
      <div role="row" class="row head-row" class:sr-only={compact}>
        <span role="columnheader" class="cell c-rank">Rank</span>
        <span role="columnheader" class="cell c-id">ID</span>
        <span role="columnheader" class="cell c-name">Name</span>
        <span role="columnheader" class="cell c-agency">Agency</span>
        <span role="columnheader" class="cell c-bar">5 m</span>
        <span role="columnheader" class="cell c-total">60 m</span>
      </div>
      <div role="rowgroup">
        {#each ordered as entry, index (entry.id)}
          {@const bar = nestedBar(entry, axis)}
          <Tooltip id={tipId(entry.id)} text={leaderboardTip(kind, entry)}>
            {#snippet children(describedBy)}
              <div role="row" class="row" tabindex="0" aria-describedby={describedBy}>
                <span role="cell" class="cell c-rank">{index + 1}</span>
                <span role="cell" class="cell c-id">{bareId(entry.id)}</span>
                <span role="cell" class="cell c-name">{entry.name}</span>
                <span role="cell" class="cell c-agency"><AgencyTag code={entry.agency} /></span>
                <span role="cell" class="cell c-bar">
                  <span class="track" aria-hidden="true">
                    <span class="total" style:--frac={bar.total}>
                      <span class="solid" style:--share={bar.solid}></span>
                    </span>
                  </span>
                  <span class="tip" data-unit="5 m" style:--frac={bar.total}>{bar.h5}</span>
                </span>
                <span role="cell" class="cell c-total" data-unit="60 m">{bar.h60}</span>
              </div>
            {/snippet}
          </Tooltip>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  /* Own colours per panel. Units and members are never talkgroup-coloured. */
  .panel {
    --bar-solid: var(--edacs);
    --bar-rest: var(--edacs-tint);
    --tip-gap: 2.75em;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 0;
  }

  .panel.kind-units {
    --bar-solid: var(--line-2);
    --bar-rest: var(--bg-inset);
  }

  .panel.kind-members {
    --bar-solid: var(--ag-neutral);
    --bar-rest: var(--bg-inset);
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--s-3);
  }

  .title {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  .metric {
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .empty {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .grid {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 2.25em 3.75em minmax(0, 1fr) auto minmax(84px, 0.8fr) 3em;
    grid-template-areas: "rank id name agency bar total";
    align-items: center;
    column-gap: var(--s-3);
    min-height: var(--row-h);
    padding: 0 var(--s-3);
    border-bottom: 1px solid var(--line-1);
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    font-variant-numeric: tabular-nums;
  }

  .head-row {
    min-height: var(--row-h);
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  /* The header stays for assistive tech in compact mode; the cells carry their units. */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* The whole row is the hover and focus target. */
  .panel [role="row"]:not(.head-row):hover,
  .panel [role="row"]:not(.head-row):focus-visible {
    background: var(--bg-2);
  }

  .cell {
    min-width: 0;
  }

  .c-rank,
  .c-id,
  .c-total {
    font-family: var(--font-mono);
  }

  .c-rank {
    grid-area: rank;
    color: var(--tx-2);
  }

  .c-id {
    grid-area: id;
    color: var(--tx-1);
  }

  .c-name {
    grid-area: name;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .c-agency {
    grid-area: agency;
  }

  .c-bar {
    grid-area: bar;
    position: relative;
    align-self: stretch;
    min-height: var(--row-h);
  }

  .c-total {
    grid-area: total;
    text-align: right;
    color: var(--tx-2);
  }

  /* Bars sit in the cell minus the tip reserve, so the value label can follow the tip. */
  .track {
    position: absolute;
    left: 0;
    right: var(--tip-gap);
    top: 30%;
    bottom: 30%;
  }

  .total {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: calc(var(--frac) * 100%);
    background: var(--bar-rest);
  }

  .solid {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: calc(var(--share) * 100%);
    background: var(--bar-solid);
  }

  .tip {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--frac) * (100% - var(--tip-gap)) + var(--s-2));
    display: flex;
    align-items: center;
    color: var(--tx-1);
  }

  /* Phone: name first, then rank and ID, then the bars with their units. */
  .compact .row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "name agency"
      "rank id"
      "bar total";
    row-gap: var(--s-1);
    min-height: var(--row-h-phone);
    padding: var(--s-2) var(--s-3);
  }

  .compact .c-bar {
    min-height: var(--s-5);
  }

  .compact .c-name {
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    color: var(--tx-1);
  }

  .compact [data-unit]::before {
    content: attr(data-unit) " ";
    color: var(--tx-2);
    font-family: var(--font-sans);
  }

  .compact .c-total {
    justify-self: end;
  }

  /* The Tooltip primitive wraps each row; the row must span the full width. */
  :global(.panel .tooltip-anchor) {
    display: flex;
    flex-direction: column;
    width: 100%;
  }
</style>
