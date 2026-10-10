<script lang="ts">
  // Agency code as neutral mono text. The code only, no gloss.
  let { code }: { code: string | null | undefined } = $props()
</script>

<span class="agency-tag">{code || 'UNK'}</span>

<style>
  .agency-tag {
    display: inline-block;
    padding: 0 var(--s-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r-tag);
    color: var(--tx-2);
    background: transparent;
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
