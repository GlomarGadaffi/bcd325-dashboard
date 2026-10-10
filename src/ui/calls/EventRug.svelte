<script lang="ts">
  import Tooltip from '../primitives/Tooltip.svelte'
  import { buildRug, captionText, laneTooltip, type GrantView } from './callsModel'

  // Fallback for quiet windows. One tick per grant, one lane per LCN that has grants in
  // the window. The time axis is the same covered span the histogram uses.
  let { views, lcnMap }: { views: readonly GrantView[]; lcnMap: readonly [string, string][] } = $props()
  const uid = $props.id()
  const rug = $derived(buildRug(views, lcnMap))
</script>

<figure class="chart">
  <figcaption class="caption">{captionText(rug.span)}</figcaption>
  <div class="lanes">
    {#each rug.lanes as lane, position (lane.key)}
      <Tooltip id="{uid}-{position}" text={laneTooltip(lane)}>
        {#snippet children(id)}
          <div class="lane">
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- Focus on the lane label shows the same tooltip as hover. -->
            <span class="label" tabindex="0" aria-describedby={id}>{lane.label}</span>
            <span class="track">
              {#each lane.ticks as tick (tick.id)}
                <span class="tick" style="left: {tick.position * 100}%"></span>
              {/each}
            </span>
          </div>
        {/snippet}
      </Tooltip>
    {/each}
  </div>
</figure>

<style>
  .chart {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    height: 160px;
    margin: 0;
    min-width: 0;
    min-height: 0;
  }

  .caption {
    margin: 0;
    overflow: hidden;
    color: var(--tx-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lanes {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 2px;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--s-2) var(--s-3);
    background: var(--bg-inset);
    border-radius: var(--r-control);
  }

  .lane {
    display: grid;
    grid-template-columns: minmax(0, 9.5em) minmax(0, 1fr);
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    height: 20px;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    color: var(--tx-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track {
    position: relative;
    height: 100%;
    min-width: 0;
  }

  .track::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    border-top: 1px solid var(--line-1);
  }

  /* One 2 px by 12 px tick per grant. */
  .tick {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 12px;
    margin: -6px 0 0 -1px;
    background: var(--edacs);
  }
</style>
