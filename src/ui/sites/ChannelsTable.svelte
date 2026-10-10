<script lang="ts">
  import type { GrantEvent } from '../../types'
  import SiteAge from './SiteAge.svelte'
  import { channelRows } from './sitesModel'

  // LCN to VC lookup from the store's learned map, with buffer counts per LCN. Not a chart.
  let { lcnMap, grants }: { lcnMap: [string, string][]; grants: GrantEvent[] } = $props()

  const rows = $derived(channelRows(lcnMap, grants))
</script>

{#if rows.length === 0}
  <p class="empty">No channels seen yet</p>
{:else}
  <table class="channels">
    <caption class="sr-only">Channels: LCN and VC in hex, with grants in the buffer</caption>
    <thead>
      <tr>
        <th scope="col">LCN (hex)</th>
        <th scope="col">VC (hex)</th>
        <th scope="col" class="num">Grants in buffer</th>
        <th scope="col" class="num">Last grant</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.lcn ?? 'none')}
        <tr>
          <td class="mono" class:muted={row.lcn === null}>{row.lcn ?? 'No LCN'}</td>
          <td class="mono">{row.vc ?? '—'}</td>
          <td class="num">{row.grants}</td>
          <td class="num"><SiteAge at={row.lastAt} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  .empty {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .channels {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    font-variant-numeric: tabular-nums;
  }

  th {
    padding: var(--s-2) var(--s-3);
    border-bottom: 1px solid var(--line-1);
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-align: left;
    text-transform: uppercase;
  }

  td {
    height: var(--row-h);
    padding: 0 var(--s-3);
    border-bottom: 1px solid var(--line-1);
    color: var(--tx-1);
    text-align: left;
    vertical-align: middle;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .muted {
    color: var(--tx-2);
  }

  .num {
    text-align: right;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
