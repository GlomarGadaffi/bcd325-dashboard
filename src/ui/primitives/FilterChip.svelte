<script lang="ts">
  import type { Snippet } from 'svelte'

  // A toggle that hides rows elsewhere. It never recolours anything: pressed shows
  // a check glyph, a heavier border and a raised fill.
  let {
    pressed,
    onToggle,
    children,
  }: { pressed: boolean; onToggle: () => void; children: Snippet } = $props()
</script>

<button
  type="button"
  class="filter-chip"
  aria-pressed={pressed ? 'true' : 'false'}
  onclick={onToggle}
>
  {#if pressed}
    <svg class="check" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M2 6.5 L4.8 9 L10 3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" />
    </svg>
  {/if}
  {@render children()}
</button>

<style>
  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: var(--hit-min);
    padding: 0 var(--s-3);
    border: 1px solid var(--line-2);
    border-radius: var(--r-tag);
    background: var(--bg-1);
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease);
  }

  .filter-chip:hover {
    background: var(--bg-2);
  }

  .filter-chip[aria-pressed="true"] {
    background: var(--bg-2);
    border-color: var(--tx-1);
    color: var(--tx-1);
  }

  .check {
    width: 12px;
    height: 12px;
    flex: none;
  }
</style>
