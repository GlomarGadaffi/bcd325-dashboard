<script lang="ts">
  import { theme, type ThemeChoice } from '../state/theme.svelte'

  // System, Light or Dark. The top bar shows it on desktop; the phone menu shows it instead.
  const OPTIONS: readonly { id: ThemeChoice; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ]
</script>

<div class="theme" role="group" aria-label="Theme">
  {#each OPTIONS as option (option.id)}
    <button
      type="button"
      class="seg-btn"
      aria-pressed={theme.choice === option.id ? 'true' : 'false'}
      onclick={() => theme.set(option.id)}
    >{option.label}</button>
  {/each}
</div>

<style>
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

  /* Phone menu: 44 px targets. */
  @media (max-width: 639px) {
    .seg-btn {
      height: var(--hit-touch);
      flex: 1 1 0;
      padding: 0 var(--s-2);
      font-size: var(--fs-body);
      line-height: var(--lh-body);
    }

    .theme {
      display: flex;
      width: 100%;
    }
  }
</style>
