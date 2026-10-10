<script lang="ts">
  import FilterChip from '../primitives/FilterChip.svelte'
  import P25AllTime from '../p25/P25AllTime.svelte'
  import P25Table from '../p25/P25Table.svelte'
  import { P25_AGENCY_KEYS, allAgenciesOn, type P25AgencyKey } from '../p25/p25Model'

  // Composition root for the P25 column. It owns the agency chips and passes Hold requests
  // up. The live table and the all-time bars read the snapshot themselves.
  let { onHold }: { onHold: (tgid: string) => void } = $props()

  let agencyOn = $state<Record<P25AgencyKey, boolean>>(allAgenciesOn())

  function toggleAgency(key: P25AgencyKey): void {
    agencyOn[key] = !agencyOn[key]
  }
</script>

<section class="column" aria-labelledby="p25-title">
  <header class="head">
    <h2 id="p25-title" class="title">P25</h2>
  </header>

  <div class="filters" role="group" aria-label="P25 agency filter">
    {#each P25_AGENCY_KEYS as key (key)}
      <FilterChip pressed={agencyOn[key]} onToggle={() => toggleAgency(key)}>{key}</FilterChip>
    {/each}
  </div>

  <P25Table {onHold} {agencyOn} />
  <P25AllTime />
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

  .head {
    display: flex;
    align-items: center;
    min-height: var(--h-top);
  }

  .title {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  @media (max-width: 639.98px) {
    .column {
      padding: var(--pad-panel-phone);
    }

    .filters :global(.filter-chip) {
      min-height: var(--hit-touch);
    }
  }
</style>
