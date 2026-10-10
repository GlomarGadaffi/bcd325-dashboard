<script lang="ts" module>
  export type FocusMode = 'balanced' | 'calls' | 'p25' | 'sites'

  export const FOCUS_MODES: readonly { id: FocusMode; label: string }[] = [
    { id: 'balanced', label: 'Balanced' },
    { id: 'calls', label: 'Calls' },
    { id: 'p25', label: 'P25' },
    { id: 'sites', label: 'Sites' },
  ]
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { connect, disconnect, getSnapshot } from '../state/adapter.svelte'
  import { theme, type ThemeChoice } from '../state/theme.svelte'

  const THEME_OPTIONS: readonly { id: ThemeChoice; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ]

  let {
    focus,
    onFocusChange,
    pill,
  }: {
    focus: FocusMode
    onFocusChange: (mode: FocusMode) => void
    /** Connection pill slot. The ConnectionPill component fills it in a later step. */
    pill?: Snippet
  } = $props()

  const snapshot = $derived(getSnapshot())
  const connected = $derived(snapshot.connected)
  const siteLabel = $derived(snapshot.siteId || 'AWAITING C-CH')

  function toggleConnection(): void {
    if (connected) void disconnect()
    else void connect()
  }
</script>

<header class="top">
  <h1 class="brand">BearSentinel</h1>
  <p class="site">
    <span class="site-label">Site</span>
    <span class="site-id">{siteLabel}</span>
  </p>
  <div class="pill-slot">
    {#if pill}{@render pill()}{/if}
  </div>

  <div class="actions">
    <div class="focus" role="group" aria-label="Focus">
      <span class="group-label">Focus</span>
      {#each FOCUS_MODES as mode (mode.id)}
        <button
          type="button"
          class="seg-btn"
          aria-pressed={focus === mode.id ? 'true' : 'false'}
          onclick={() => onFocusChange(mode.id)}
        >{mode.label}</button>
      {/each}
    </div>

    <button type="button" class="btn" onclick={toggleConnection}>
      {connected ? 'Disconnect' : 'Connect'}
    </button>

    <div class="theme" role="group" aria-label="Theme">
      {#each THEME_OPTIONS as option (option.id)}
        <button
          type="button"
          class="seg-btn"
          aria-pressed={theme.choice === option.id ? 'true' : 'false'}
          onclick={() => theme.set(option.id)}
        >{option.label}</button>
      {/each}
    </div>

    <button type="button" class="icon-btn" aria-label="Menu">
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M2 4 H14 M2 8 H14 M2 12 H14" stroke="currentColor" stroke-width="1.5" fill="none" />
      </svg>
    </button>
  </div>
</header>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: var(--s-4);
    height: var(--h-top);
    min-width: 0;
    padding: 0 var(--s-4);
    background: var(--bg-1);
    border-bottom: 1px solid var(--line-1);
  }

  .brand {
    margin: 0;
    flex: none;
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    font-weight: var(--fw-semibold);
    white-space: nowrap;
  }

  .site {
    display: flex;
    align-items: baseline;
    gap: var(--s-2);
    margin: 0;
    min-width: 0;
    white-space: nowrap;
  }

  .site-label,
  .group-label {
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
    color: var(--tx-2);
  }

  .site-id {
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    color: var(--tx-1);
    font-variant-numeric: tabular-nums;
  }

  .pill-slot {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-left: auto;
    min-width: 0;
  }

  .focus {
    display: none;
    align-items: center;
    gap: var(--s-3);
  }

  .theme {
    display: inline-flex;
    align-items: center;
  }

  .seg-btn {
    height: var(--control-h);
    padding: 0 var(--s-3);
    border: 1px solid var(--line-2);
    border-right-width: 0;
    background: var(--bg-1);
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .seg-btn:first-of-type {
    border-radius: var(--r-control) 0 0 var(--r-control);
  }

  .seg-btn:last-of-type {
    border-right-width: 1px;
    border-radius: 0 var(--r-control) var(--r-control) 0;
  }

  .seg-btn:hover {
    background: var(--bg-2);
  }

  .seg-btn[aria-pressed="true"] {
    background: var(--bg-2);
    color: var(--tx-1);
    border-bottom: 2px solid var(--tx-1);
  }

  .btn,
  .icon-btn {
    height: var(--control-h);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease);
  }

  .btn {
    padding: 0 var(--s-3);
  }

  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-h);
    padding: 0;
    flex: none;
  }

  .icon-btn svg {
    width: 16px;
    height: 16px;
  }

  .btn:hover,
  .icon-btn:hover {
    background: var(--bg-2);
  }

  /* Desktop only: the Focus control changes column weights and needs the full width. */
  @media (min-width: 1280px) {
    .focus {
      display: inline-flex;
    }
  }

  /* Phone: the site ID leaves the bar and the bar tightens to fit. The theme group
     stays here until the phone menu takes it over. */
  @media (max-width: 639px) {
    .site {
      display: none;
    }

    .top {
      gap: var(--s-3);
      padding: 0 var(--s-3);
    }

    .seg-btn {
      padding: 0 var(--s-2);
    }
  }
</style>
