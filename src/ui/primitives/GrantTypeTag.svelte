<script module lang="ts">
  export type GrantType = 'TG' | 'ICALL' | 'CPT' | 'UNKNOWN'
</script>

<script lang="ts">
  // EDACS grant type as a code. TG is a solid EDACS tint, ICALL a one-pixel EDACS
  // outline, CPT a one-pixel line-2 outline (solid, so it never reads as SKIP),
  // UNKNOWN plain. No gloss for CPT or UNKNOWN until the meaning is confirmed.
  let { type }: { type: GrantType } = $props()
</script>

<span class="grant-tag grant-{type.toLowerCase()}">{type}</span>

<style>
  .grant-tag {
    display: inline-block;
    padding: 0 var(--s-2);
    border: 1px solid transparent;
    border-radius: var(--r-tag);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .grant-tg {
    background: var(--edacs-tint);
    border-color: var(--edacs-tint);
    color: var(--edacs);
  }

  .grant-icall {
    border-color: var(--edacs);
    color: var(--tx-1);
  }

  .grant-cpt {
    border-color: var(--line-2);
    color: var(--tx-2);
  }

  .grant-unknown {
    color: var(--tx-2);
  }
</style>
