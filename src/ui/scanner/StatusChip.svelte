<script module lang="ts">
  export type ChipGlyph = 'dot' | 'open' | 'pin' | 'skip' | 'pending' | 'triangle' | 'octagon' | 'clock' | 'none'
  export type ChipTone = 'live' | 'warn' | 'error' | 'held' | 'held-quiet' | 'pending' | 'skip' | 'stale' | 'neutral'
</script>

<script lang="ts">
  // Glyph and word, never colour alone. The hold and connection states use this; the
  // glyph set matches StateChip so the two read as one system.
  let { glyph, tone, label }: { glyph: ChipGlyph; tone: ChipTone; label: string } = $props()
</script>

<span class="chip tone-{tone}" class:pulse={glyph === 'dot' && tone === 'live'}>
  {#if glyph !== 'none'}
    <svg class="glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {#if glyph === 'dot'}
        <circle cx="6" cy="6" r="3.5" fill="currentColor" />
      {:else if glyph === 'open'}
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5" />
      {:else if glyph === 'pin'}
        <path d="M6 0.8 A3.2 3.2 0 0 1 9.2 4 C9.2 6.2 6 11.2 6 11.2 C6 11.2 2.8 6.2 2.8 4 A3.2 3.2 0 0 1 6 0.8 Z" fill="currentColor" />
      {:else if glyph === 'skip'}
        <path d="M0.8 2 L5.6 6 L0.8 10 Z M6.4 2 L11.2 6 L6.4 10 Z" fill="currentColor" />
      {:else if glyph === 'pending'}
        <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 1.6" />
      {:else if glyph === 'triangle'}
        <path d="M6 1.2 L11.2 10.6 L0.8 10.6 Z" fill="currentColor" />
      {:else if glyph === 'octagon'}
        <path d="M4 0.8 H8 L11.2 4 V8 L8 11.2 H4 L0.8 8 V4 Z" fill="currentColor" />
      {:else if glyph === 'clock'}
        <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M6 3.4 V6.2 L7.9 7.3" fill="none" stroke="currentColor" stroke-width="1.5" />
      {/if}
    </svg>
  {/if}
  <span class="word">{label}</span>
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    min-height: 18px;
    max-width: 100%;
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

  .word {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .glyph {
    width: 10px;
    height: 10px;
    flex: none;
  }

  .tone-live {
    background: var(--live-tint);
    color: var(--live);
  }

  .tone-warn {
    background: var(--warn-tint);
    color: var(--warn);
  }

  .tone-error {
    background: var(--error-tint);
    color: var(--error);
  }

  /* Solid ink, not a hue, so it can never read as P25 or as warning. */
  .tone-held {
    background: var(--held-fill);
    border-color: var(--held-fill);
    color: var(--held-text);
  }

  /* Same ink as HELD but outlined: normal quiet hold, not a warning. */
  .tone-held-quiet {
    border-color: var(--tx-1);
    color: var(--tx-1);
  }

  .tone-pending {
    background: var(--bg-2);
    border-color: var(--line-2);
    color: var(--tx-1);
  }

  /* Dashed outline: a skipped call is a shape difference, not only a colour one. */
  .tone-skip {
    border: 1px dashed var(--line-2);
    color: var(--tx-2);
  }

  .tone-stale {
    color: var(--tx-2);
  }

  .tone-neutral {
    border-color: var(--line-2);
    color: var(--tx-2);
  }

  .pulse .glyph {
    animation: live-pulse 1.2s ease-in-out infinite;
  }

  @keyframes live-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse .glyph {
      animation: none;
    }
  }
</style>
