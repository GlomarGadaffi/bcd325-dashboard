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
  import { getSnapshot } from '../state/adapter.svelte'
  import { layout } from '../state/layout.svelte'
  import { siteText } from '../status/statusModel'
  import ConnectionPill from './ConnectionPill.svelte'
  import ThemeToggle from './ThemeToggle.svelte'

  // Desktop: brand, site, connection, Focus, Connect or Disconnect, theme, menu.
  // Phone (under 640 px): brand, connection, a Connect icon and the menu. The theme
  // toggle moves into the menu there. The shell decides what Connect does, because it
  // owns the held-hold check and the port error.
  let {
    focus,
    onFocusChange,
    hasWebSerial,
    portError,
    menuOpen,
    onConnectionToggle,
    onMenuToggle,
  }: {
    focus: FocusMode
    onFocusChange: (mode: FocusMode) => void
    hasWebSerial: boolean
    portError: boolean
    menuOpen: boolean
    onConnectionToggle: () => void
    onMenuToggle: () => void
  } = $props()

  const snapshot = $derived(getSnapshot())
  const connected = $derived(snapshot.connected)
  const siteLabel = $derived(siteText(snapshot.siteId))
  const connectLabel = $derived(connected ? 'Disconnect' : 'Connect')
  const connectTitle = $derived(hasWebSerial ? undefined : 'Use Chrome or Edge on desktop.')
</script>

<header class="top">
  <h1 class="brand">BearSentinel</h1>

  {#if !layout.phone}
    <p class="site">
      <span class="site-label">Site</span>
      <span class="site-id">{siteLabel}</span>
    </p>
  {/if}

  <div class="pill-slot">
    <ConnectionPill {hasWebSerial} {portError} />
  </div>

  <div class="actions">
    {#if layout.desktop}
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
    {/if}

    <button
      type="button"
      class="btn"
      class:is-icon={layout.phone}
      aria-label={connectLabel}
      title={connectTitle}
      disabled={!hasWebSerial}
      onclick={onConnectionToggle}
    >
      {#if layout.phone}
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M5.5 1.5 V4.5 M10.5 1.5 V4.5 M3.5 4.5 H12.5 V7.5 A4.5 4.5 0 0 1 8 12 A4.5 4.5 0 0 1 3.5 7.5 Z M8 12 V14.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round" />
        </svg>
      {:else}
        {connectLabel}
      {/if}
    </button>

    {#if !layout.phone}
      <ThemeToggle />
    {/if}

    <button
      type="button"
      class="icon-btn"
      aria-label="Menu"
      aria-expanded={menuOpen ? 'true' : 'false'}
      data-menu-trigger
      onclick={onMenuToggle}
    >
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
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin-left: auto;
    min-width: 0;
  }

  .focus {
    display: inline-flex;
    align-items: center;
    gap: var(--s-3);
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

  .btn:disabled {
    color: var(--tx-3);
    border-style: dashed;
    cursor: not-allowed;
  }

  .btn.is-icon,
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-h);
    padding: 0;
    flex: none;
  }

  .btn svg,
  .icon-btn svg {
    width: 16px;
    height: 16px;
  }

  .btn:hover:not(:disabled),
  .icon-btn:hover {
    background: var(--bg-2);
  }

  /* Phone: 44 px touch targets, and the bar tightens to fit. */
  @media (max-width: 639px) {
    .top {
      gap: var(--s-3);
      padding: 0 var(--s-4);
    }

    .btn.is-icon,
    .icon-btn {
      width: var(--hit-touch);
      height: var(--hit-touch);
    }
  }
</style>
