<script lang="ts">
  import { getSnapshot } from '../state/adapter.svelte'
  import ChannelsTable from '../sites/ChannelsTable.svelte'
  import LeaderboardPanel from '../sites/LeaderboardPanel.svelte'
  import PatchTable from '../sites/PatchTable.svelte'
  import SitesTabs from '../sites/SitesTabs.svelte'
  import {
    NO_EDACS_DATA_TEXT,
    SITES_TABS,
    showNoEdacsData,
    splitLeaderboard,
    type SitesTab,
  } from '../sites/sitesModel'

  // Composition root for the EDACS sites column. Patches sit on top, capped at 40% of the
  // column; the tabbed panels fill the rest. Compact and tabs are set by the shell.
  let {
    compact = false,
    tabs = SITES_TABS,
  }: { compact?: boolean; tabs?: readonly SitesTab[] } = $props()

  let tab = $state<SitesTab>('talkgroups')

  const snap = $derived(getSnapshot())
  const groups = $derived(splitLeaderboard(snap.leaderboard))
  const noData = $derived(showNoEdacsData(snap.connected, snap.stats.grants))
</script>

<section class="column" aria-labelledby="sites-title">
  <header class="column-head">
    <h2 id="sites-title" class="column-title">EDACS sites</h2>
  </header>

  <div class="patches">
    <PatchTable patches={snap.patches} persistent={snap.persistentPatches} {compact} />
  </div>

  {#if noData}
    <p class="note">{NO_EDACS_DATA_TEXT}</p>
  {/if}

  <SitesTabs bind:value={tab} {tabs}>
    {#snippet panel(id)}
      {#if id === 'talkgroups'}
        <LeaderboardPanel kind="talkgroups" rows={groups.talkgroups} {compact} />
      {:else if id === 'units'}
        <LeaderboardPanel kind="units" rows={groups.units} {compact} />
      {:else if id === 'members'}
        <LeaderboardPanel kind="members" rows={groups.members} {compact} />
      {:else}
        <ChannelsTable lcnMap={snap.lcnMap} grants={snap.grants} />
      {/if}
    {/snippet}
  </SitesTabs>
</section>

<style>
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--pad-panel);
    background: var(--bg-1);
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    overflow: hidden;
  }

  .column-head {
    display: flex;
    align-items: center;
    min-height: var(--h-top);
  }

  .column-title {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  /* Patches take at most 40% of the column; the list scrolls inside that. */
  .patches {
    flex: 0 1 auto;
    max-height: 40%;
    min-height: 0;
    overflow-y: auto;
  }

  .note {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  @media (max-width: 639.98px) {
    .column {
      padding: var(--pad-panel-phone);
    }
  }
</style>
