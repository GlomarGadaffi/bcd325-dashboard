<script lang="ts">
  import Tooltip from '../primitives/Tooltip.svelte'
  import {
    STACK_ORDER,
    bucketLabel,
    bucketTooltip,
    captionText,
    segmentsOf,
    slotFill,
    slotLabel,
    type Bucket,
    type HistogramModel,
  } from './callsModel'

  // Stacked grant counts per wall-clock bucket. Segments stack from the base in fixed
  // slot order. Labels appear only on the peak bar and the latest bar.
  let { model }: { model: HistogramModel } = $props()
  const uid = $props.id()
  const lastPosition = $derived(model.buckets.length - 1)
</script>

{#snippet bar(bucket: Bucket, position: number)}
  {@const segs = segmentsOf(bucket)}
  <span class="stack">
    {#each segs as seg, k (seg.slot)}
      <span
        class="seg"
        class:gap={k < segs.length - 1}
        style="flex-grow: {seg.count}; background: {slotFill(seg.slot)}"
      ></span>
    {/each}
  </span>
  {#if position === model.peakIndex || position === lastPosition}
    <span class="value">{bucket.total}</span>
  {/if}
{/snippet}

<figure class="chart">
  <figcaption class="caption">{captionText(model.span)}</figcaption>
  <div class="plot" style="--n: {model.buckets.length}">
    <span class="gridline" style="--at: 1"></span>
    <span class="gridline" style="--at: 0.5"></span>
    <span class="baseline"></span>
    {#each model.buckets as bucket, position (bucket.start)}
      {#if bucket.total > 0}
        <Tooltip id="{uid}-{position}" text={bucketTooltip(bucket)}>
          {#snippet children(id)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- Each bucket is a focusable data point; its tooltip is the description. -->
            <span
              class="hit"
              role="img"
              tabindex="0"
              aria-describedby={id}
              aria-label={bucketLabel(bucket)}
              style="--ratio: {bucket.total / model.yMax}"
            >
              {@render bar(bucket, position)}
            </span>
          {/snippet}
        </Tooltip>
      {:else}
        <span class="band"></span>
      {/if}
    {/each}
  </div>
  <ul class="legend" aria-label="Segments, from the base up">
    {#each STACK_ORDER as slot (slot)}
      <li><span class="swatch" style="background: {slotFill(slot)}"></span>{slotLabel(slot)}</li>
    {/each}
  </ul>
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

  .plot {
    /* Room above the bars for the peak and latest labels. */
    --label-h: 16px;
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr);
    background: var(--bg-inset);
    border-radius: var(--r-control);
  }

  .gridline,
  .baseline {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 1px solid var(--line-1);
    pointer-events: none;
  }

  .gridline {
    bottom: calc((100% - var(--label-h)) * var(--at));
  }

  .baseline {
    bottom: 0;
  }

  .band {
    position: relative;
  }

  /* The whole band, label row included, is the hover and focus target. */
  .hit {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
  }

  .stack {
    position: absolute;
    left: 50%;
    bottom: 0;
    width: min(24px, calc(100% - 2px));
    height: calc((100% - var(--label-h)) * var(--ratio));
    transform: translateX(-50%);
    display: flex;
    flex-direction: column-reverse;
    overflow: hidden;
    border-radius: var(--r-control) var(--r-control) 0 0;
  }

  .seg {
    flex: 1 1 0;
    min-height: 2px;
  }

  /* 2 px surface gap between adjacent segments. */
  .seg.gap {
    border-top: 2px solid var(--bg-inset);
  }

  .value {
    position: absolute;
    left: 50%;
    bottom: calc((100% - var(--label-h)) * var(--ratio) + 2px);
    transform: translateX(-50%);
    color: var(--tx-1);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: 14px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }

  /* The last six bands open their tooltips to the left so they stay inside the column. */
  .plot > :global(.tooltip-anchor:nth-last-child(-n + 6)) > :global(.tooltip) {
    left: auto;
    right: 0;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--s-3);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--tx-2);
    font-family: var(--font-mono);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    letter-spacing: var(--ls-caps);
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
  }

  .swatch {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: var(--r-tag);
  }
</style>
