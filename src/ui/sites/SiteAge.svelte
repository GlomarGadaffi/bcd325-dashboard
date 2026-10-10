<script lang="ts">
  import { clock } from '../state/clock.svelte'
  import { formatAge } from './sitesModel'

  // Age text in its own leaf, so the list around it does not re-render each second.
  let { at }: { at: number | null } = $props()
</script>

<span class="site-age">{at === null ? '—' : formatAge(clock.now - at)}</span>

<style>
  .site-age {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--tx-3);
    white-space: nowrap;
  }
</style>
