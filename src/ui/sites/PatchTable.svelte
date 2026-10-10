<script lang="ts">
  import type { PatchRow } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import SiteAge from './SiteAge.svelte'
  import { NO_PATCHES_TEXT, isTxActive, patchCountText, patchRowsFor } from './sitesModel'

  // Patches seen in the last 30 s. Member chips show the raw ID only: a member number
  // is not a talkgroup, so no DB name is looked up for it.
  let {
    patches,
    persistent,
    compact = false,
  }: { patches: PatchRow[]; persistent: Record<string, number>; compact?: boolean } = $props()

  // Phone: the list collapses behind a summary line.
  let expanded = $state(false)
  const visible = $derived(patchRowsFor(patches, clock.now))
  const showList = $derived(visible.length > 0 && (!compact || expanded))
</script>

<section class="patches" class:compact aria-labelledby="patches-title">
  <header class="head">
    <h3 id="patches-title" class="title">Patches</h3>
    <span class="meta">last 30 s</span>
  </header>

  {#if visible.length === 0}
    <p class="empty">{NO_PATCHES_TEXT}</p>
  {:else if compact}
    <button
      type="button"
      class="summary"
      aria-expanded={expanded ? 'true' : 'false'}
      aria-controls={expanded ? 'patches-list' : undefined}
      onclick={() => (expanded = !expanded)}
    >{patchCountText(visible.length)}</button>
  {/if}

  {#if showList}
    <div id="patches-list" role="table" class="grid" aria-labelledby="patches-title">
      <div role="row" class="row head-row" class:sr-only={compact}>
        <span role="columnheader" class="cell c-id">Patch</span>
        <span role="columnheader" class="cell c-members">Members</span>
        <span role="columnheader" class="cell c-tx">TX</span>
        <span role="columnheader" class="cell c-last">Last TX</span>
        <span role="columnheader" class="cell c-hits">Hits this burst</span>
        <span role="columnheader" class="cell c-all">All time</span>
      </div>
      <div role="rowgroup">
        {#each visible as patch (patch.id)}
          {@const tx = isTxActive(patch, clock.now)}
          <div role="row" class="row" class:is-tx={tx}>
            <span role="cell" class="cell c-id">{patch.id}</span>
            <span role="cell" class="cell c-members">
              {#each patch.members as member, index (index)}<span class="member">{member}</span>{/each}
            </span>
            <span role="cell" class="cell c-tx">{#if tx}<span class="tx">TX</span>{/if}</span>
            <span role="cell" class="cell c-last" data-unit="Last TX"><SiteAge at={patch.lastSeen} /></span>
            <span role="cell" class="cell c-hits" data-unit="Hits this burst">{patch.hits}</span>
            <span role="cell" class="cell c-all" data-unit="All time">{persistent[patch.id] ?? 0}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>

<style>
  .patches {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 0;
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

  .meta,
  .empty {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .summary {
    min-height: var(--control-h);
    padding: 0 var(--s-3);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    text-align: left;
    cursor: pointer;
  }

  .summary:hover {
    background: var(--bg-2);
  }

  .grid {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .row {
    display: grid;
    grid-template-columns: 3.75em minmax(0, 1fr) 2.5em 5.5em 3.5em 3.5em;
    grid-template-areas: "id members tx last hits all";
    align-items: center;
    column-gap: var(--s-2);
    min-height: var(--row-h);
    padding: var(--s-1) var(--s-3);
    border-bottom: 1px solid var(--line-1);
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    font-variant-numeric: tabular-nums;
  }

  .head-row {
    min-height: var(--row-h);
    align-items: end;
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* 2px ink ring for the 2 s after a hit. Static, so reduced motion keeps it too. */
  .row.is-tx {
    outline: 2px solid var(--tx-1);
    outline-offset: -2px;
  }

  .cell {
    min-width: 0;
  }

  .c-id {
    grid-area: id;
    font-family: var(--font-mono);
    color: var(--tx-1);
  }

  .c-members {
    grid-area: members;
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1) var(--s-2);
  }

  .c-tx {
    grid-area: tx;
  }

  .c-last {
    grid-area: last;
  }

  .c-hits {
    grid-area: hits;
    text-align: right;
  }

  .c-all {
    grid-area: all;
    text-align: right;
    color: var(--tx-2);
  }

  .member {
    display: inline-block;
    padding: 0 var(--s-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r-tag);
    color: var(--tx-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .tx {
    display: inline-block;
    padding: 0 var(--s-2);
    border-radius: var(--r-tag);
    background: var(--edacs-tint);
    color: var(--edacs);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
  }

  /* Phone: ID, TX and last TX on the first line, members across, then hits and all time. */
  .compact .row {
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      "id tx last"
      "members members members"
      "hits all all";
    row-gap: var(--s-1);
    min-height: var(--row-h-phone);
    padding: var(--s-2) var(--s-3);
  }

  .compact .c-hits {
    text-align: left;
  }

  .compact .c-all {
    justify-self: start;
  }

  .compact [data-unit]::before {
    content: attr(data-unit) " ";
    color: var(--tx-2);
    font-family: var(--font-sans);
  }
</style>
