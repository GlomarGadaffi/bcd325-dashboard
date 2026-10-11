<script lang="ts">
  import { getSnapshot } from '../state/adapter.svelte'
  import { topTalkgroups } from './sitesModel'

  // Narrow-phone stand-in for the Sites column: the busiest talkgroups of the last five minutes.
  const rows = $derived(topTalkgroups(getSnapshot().leaderboard))
</script>

{#if rows.length > 0}
  <section class="top" aria-label="Busiest talkgroups, last 5 minutes">
    <h3 class="label">Top 5 m</h3>
    <ol class="list">
      {#each rows as row (row.id)}
        <li class="item">
          <span class="id">{row.id}</span>
          <span class="name" title={row.name}>{row.name}</span>
          <span class="count">{row.h5}</span>
        </li>
      {/each}
    </ol>
  </section>
{/if}

<style>
  .top {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    margin-bottom: var(--s-3);
    padding: var(--s-2) var(--s-3);
    background: var(--bg-1);
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
  }

  .label {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr) auto;
    column-gap: var(--s-2);
    align-items: center;
    min-height: var(--control-h);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .id,
  .count {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
