<script lang="ts">
  import type { Snippet } from 'svelte'

  // Status chip. Every kind carries a glyph and a word; colour is never the only signal.
  export type StateKind = 'LIVE' | 'WARN' | 'ERROR' | 'HELD' | 'SKIP' | 'STALE' | 'NEW'

  let { kind, children }: { kind: StateKind; children?: Snippet } = $props()
</script>

<span class="state-chip state-{kind.toLowerCase()}">
  <svg class="glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    {#if kind === 'LIVE'}
      <circle cx="6" cy="6" r="3.5" fill="currentColor" />
    {:else if kind === 'WARN'}
      <path d="M6 1.2 L11.2 10.6 L0.8 10.6 Z" fill="currentColor" />
    {:else if kind === 'ERROR'}
      <path d="M4 0.8 H8 L11.2 4 V8 L8 11.2 H4 L0.8 8 V4 Z" fill="currentColor" />
    {:else if kind === 'HELD'}
      <path d="M6 0.8 A3.2 3.2 0 0 1 9.2 4 C9.2 6.2 6 11.2 6 11.2 C6 11.2 2.8 6.2 2.8 4 A3.2 3.2 0 0 1 6 0.8 Z" fill="currentColor" />
    {:else if kind === 'SKIP'}
      <path d="M0.8 2 L5.6 6 L0.8 10 Z M6.4 2 L11.2 6 L6.4 10 Z" fill="currentColor" />
    {:else if kind === 'STALE'}
      <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path d="M6 3.4 V6.2 L7.9 7.3" fill="none" stroke="currentColor" stroke-width="1.5" />
    {:else}
      <path d="M6 0.8 L7.2 4.8 L11.2 6 L7.2 7.2 L6 11.2 L4.8 7.2 L0.8 6 L4.8 4.8 Z" fill="currentColor" />
    {/if}
  </svg>
  <span class="word">{kind}</span>
  {#if children}{@render children()}{/if}
</span>

<style>
  .state-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 18px;
    padding: 0 var(--s-2);
    border: 1px solid transparent;
    border-radius: var(--r-tag);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .glyph {
    width: 10px;
    height: 10px;
    flex: none;
  }

  .state-live {
    background: var(--live-tint);
    color: var(--live);
  }

  .state-warn {
    background: var(--warn-tint);
    color: var(--warn);
  }

  .state-error {
    background: var(--error-tint);
    color: var(--error);
  }

  /* Solid ink, not a hue, so it can never read as P25 or as warning. */
  .state-held {
    background: var(--held-fill);
    border-color: var(--held-fill);
    color: var(--held-text);
  }

  /* Dashed outline: a skipped call is a shape difference, not only a colour one. */
  .state-skip {
    border: 1px dashed var(--line-2);
    color: var(--tx-2);
  }

  .state-stale {
    color: var(--tx-3);
  }

  .state-new {
    background: var(--p25-tint);
    color: var(--tx-1);
  }

  .state-new .glyph {
    color: var(--p25);
  }
</style>
