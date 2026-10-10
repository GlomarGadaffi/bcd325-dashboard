<script lang="ts">
  import type { Snippet } from 'svelte'
  import { SITES_TABS, SITES_TAB_LABELS, nextTab, type SitesTab } from './sitesModel'

  // Tab strip for the sites column. One tab stop (roving tabindex); arrows, Home and End
  // move focus and select. Phone draws the same tabs as a segmented control.
  let {
    value = $bindable('talkgroups'),
    tabs = SITES_TABS,
    panel,
  }: {
    value?: SitesTab
    tabs?: readonly SitesTab[]
    panel: Snippet<[SitesTab]>
  } = $props()

  // A value that is not in the list in use shows the first tab that is.
  const active = $derived<SitesTab>(tabs.includes(value) ? value : (tabs[0] ?? 'talkgroups'))

  let buttons: (HTMLButtonElement | undefined)[] = []

  function select(next: SitesTab): void {
    value = next
    buttons[tabs.indexOf(next)]?.focus()
  }

  function handleKey(event: KeyboardEvent, id: SitesTab): void {
    const next = nextTab(id, event.key, tabs)
    if (next === null) return
    event.preventDefault()
    select(next)
  }
</script>

<div class="sites-tabs">
  <div role="tablist" aria-label="EDACS sites" class="tablist" style="--tab-count: {tabs.length}">
    {#each tabs as id, index (id)}
      {@const selected = id === active}
      <button
        bind:this={buttons[index]}
        type="button"
        role="tab"
        id="sites-tab-{id}"
        class="tab"
        aria-selected={selected ? 'true' : 'false'}
        aria-controls="sites-panel"
        tabindex={selected ? 0 : -1}
        onclick={() => (value = id)}
        onkeydown={(event) => handleKey(event, id)}
      >{SITES_TAB_LABELS[id]}</button>
    {/each}
  </div>

  <div role="tabpanel" id="sites-panel" aria-labelledby="sites-tab-{active}" class="panel">
    {@render panel(active)}
  </div>
</div>

<style>
  .sites-tabs {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    flex: 1 1 auto;
    min-height: 0;
  }

  .tablist {
    display: flex;
    border-bottom: 1px solid var(--line-1);
  }

  .tab {
    min-height: var(--control-h);
    padding: 0 var(--s-3);
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease), color var(--dur-fast) var(--ease);
  }

  .tab:hover {
    background: var(--bg-2);
  }

  .tab[aria-selected="true"] {
    color: var(--tx-1);
    border-bottom-color: var(--tx-1);
  }

  .panel {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  @media (max-width: 639.98px) {
    .tablist {
      display: grid;
      grid-template-columns: repeat(var(--tab-count), minmax(0, 1fr));
      border: 1px solid var(--line-2);
      border-radius: var(--r-control);
      overflow: hidden;
    }

    .tab {
      min-height: var(--control-h-phone);
      padding: 0 var(--s-2);
      border: 0;
      border-radius: 0;
      font-size: var(--fs-body);
      line-height: var(--lh-body);
    }

    .tab + .tab {
      border-left: 1px solid var(--line-2);
    }

    .tab[aria-selected="true"] {
      background: var(--bg-2);
      border-bottom-color: transparent;
    }
  }
</style>
