<script lang="ts">
  import Tooltip from '../primitives/Tooltip.svelte'
  import { getSnapshot } from '../state/adapter.svelte'
  import { allTimeTooltip, topAllTime } from './p25Model'

  // Persistent totals, so this block is always labelled all time and never live.
  let open = $state(true)

  const snap = $derived(getSnapshot())
  const board = $derived(topAllTime(snap.persistentP25, snap.p25Cards))
  const top = $derived(board.rows[0]?.count ?? 0)
</script>

<section class="all-time" aria-labelledby="p25-all-time-title">
  <button
    type="button"
    class="toggle"
    aria-expanded={open ? 'true' : 'false'}
    aria-controls="p25-all-time-body"
    onclick={() => (open = !open)}
  >
    <span id="p25-all-time-title">All time, top 10</span>
    <span class="caret" aria-hidden="true">{open ? 'Hide' : 'Show'}</span>
  </button>

  {#if open}
    <div id="p25-all-time-body" class="body">
      {#if board.rows.length === 0}
        <p class="empty">No all-time P25 totals yet.</p>
      {:else}
        <ol class="bars">
          {#each board.rows as row (row.tgid)}
            <li class="bar-item">
              <Tooltip id="p25-all-time-{row.tgid}" text={allTimeTooltip(row)}>
                {#snippet children(id)}
                  <div class="bar-row" tabindex="0" aria-describedby={id}>
                    <span class="tg">{row.tgid}</span>
                    <span class="name">{row.name}</span>
                    <span class="track" style:--ratio={top > 0 ? row.count / top : 0}>
                      <span class="fill"></span>
                      <span class="value">{row.count}</span>
                    </span>
                  </div>
                {/snippet}
              </Tooltip>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* About 30 percent of the column at most. The body scrolls inside that cap. */
  .all-time {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    min-height: 0;
    max-height: 30%;
    padding-top: var(--s-2);
    border-top: 1px solid var(--line-1);
  }

  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    min-height: var(--hit-min);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-semibold);
    text-align: left;
    cursor: pointer;
  }

  .caret {
    color: var(--tx-2);
    font-weight: var(--fw-medium);
  }

  .body {
    min-height: 0;
    overflow-y: auto;
  }

  .empty {
    margin: 0;
    padding: var(--s-2) 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .bar-item :global(.tooltip-anchor) {
    display: flex;
    width: 100%;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 48px minmax(0, 40%) minmax(0, 1fr);
    align-items: center;
    column-gap: var(--s-3);
    min-height: var(--hit-min);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .tg {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--tx-1);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tx-2);
  }

  /* The value sits 48px short of the track's end, so the largest value still fits. */
  .track {
    position: relative;
    height: 16px;
    min-width: 0;
  }

  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: calc((100% - 48px) * var(--ratio));
    min-width: 2px;
    border-radius: 0 var(--r-tag) var(--r-tag) 0;
    background: var(--p25);
  }

  .value {
    position: absolute;
    top: 50%;
    left: calc((100% - 48px) * var(--ratio) + var(--s-2));
    transform: translateY(-50%);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--tx-1);
  }
</style>
