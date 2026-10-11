<script lang="ts">
  import { tick } from 'svelte'
  import { connect, disconnect, getSnapshot } from './state/adapter.svelte'
  import { clock } from './state/clock.svelte'
  import { isTouchDevice, layout } from './state/layout.svelte'
  import TopBar, { FOCUS_MODES, type FocusMode } from './chrome/TopBar.svelte'
  import StatusStrip from './chrome/StatusStrip.svelte'
  import ThemeToggle from './chrome/ThemeToggle.svelte'
  import ScannerZone from './scanner/ScannerZone.svelte'
  import HoldConfirmSheet, { type HoldTarget } from './scanner/HoldConfirmSheet.svelte'
  import DisconnectHoldDialog from './scanner/DisconnectHoldDialog.svelte'
  import OfflineBanner from './scanner/OfflineBanner.svelte'
  import { holdController, holdNeedsConfirm } from './scanner/holdMachine'
  import StatusTiles from './status/StatusTiles.svelte'
  import CallsColumn from './columns/CallsColumn.svelte'
  import P25Column from './columns/P25Column.svelte'
  import SitesColumn from './columns/SitesColumn.svelte'
  import TopTalkgroups from './sites/TopTalkgroups.svelte'
  import MenuPopover from './overlays/MenuPopover.svelte'
  import RawLogSheet from './overlays/RawLogSheet.svelte'
  import WipeDialog from './overlays/WipeDialog.svelte'
  import ChannelsSheet from './overlays/ChannelsSheet.svelte'
  import { returnFocus } from './overlays/focusReturn'
  import { countNew, talkgroupAgency, talkgroupName } from './p25/p25Model'
  import { SITES_TABS, type SitesTab } from './sites/sitesModel'

  type Tab = 'calls' | 'p25' | 'sites'

  const FOCUS_KEY = 'bearsentinel.focus'
  const TABS: readonly { id: Tab; label: string }[] = [
    { id: 'calls', label: 'Calls' },
    { id: 'p25', label: 'P25' },
    { id: 'sites', label: 'Sites' },
  ]
  // Under 400 px Sites folds into the top of Calls, which leaves two tabs.
  const NARROW_TABS: readonly { id: Tab; label: string }[] = TABS.filter((item) => item.id !== 'sites')
  // Phone drops Channels from the Sites tabs; it opens from the menu as a sheet instead.
  const PHONE_SITE_TABS: readonly SitesTab[] = ['talkgroups', 'units', 'members']
  // Under 400 px the Units tab goes too.
  const NARROW_SITE_TABS: readonly SitesTab[] = ['talkgroups', 'members']
  // Checked once at load. Chrome and Edge expose navigator.serial; other browsers do not.
  const hasWebSerial = typeof navigator !== 'undefined' && 'serial' in navigator

  /** Focus is the only layout state kept in the browser. A bad or missing value reads as Balanced. */
  function readFocus(): FocusMode {
    try {
      const stored = localStorage.getItem(FOCUS_KEY)
      const match = FOCUS_MODES.find((mode) => mode.id === stored)
      return match ? match.id : 'balanced'
    } catch {
      return 'balanced'
    }
  }

  function writeFocus(mode: FocusMode): void {
    try {
      localStorage.setItem(FOCUS_KEY, mode)
    } catch {
      // Storage is unavailable. Focus still applies for this page load.
    }
  }

  // Focus sets column weights on desktop only. Column minimums never change.
  let focus = $state<FocusMode>(readFocus())
  // Phone shows one column at a time, chosen by the bottom tab bar.
  let tab = $state<Tab>('calls')
  let sitesTab = $state<SitesTab>('talkgroups')

  let menuOpen = $state(false)
  let rawOpen = $state(false)
  let wipeOpen = $state(false)
  let channelsOpen = $state(false)
  /** A real connect failure (not a cancelled picker). Drives the pill and the banner. */
  let portError = $state(false)
  /** The hold waiting for the confirm sheet, on touch and phone. */
  let holdTarget = $state<HoldTarget | null>(null)
  /** The talkgroup a disconnect would leave held. The confirm dialog shows while set. */
  let disconnectTg = $state<string | null>(null)

  const snap = $derived(getSnapshot())
  const hold = $derived($holdController)
  const newCount = $derived(countNew(snap.p25Cards, snap.persistentP25, clock.now))
  const tabs = $derived(layout.narrow ? NARROW_TABS : TABS)
  // A phone resized across 400 px while on Sites lands on Calls, not on a hidden region.
  const activeTab = $derived(layout.narrow && tab === 'sites' ? 'calls' : tab)
  const siteTabs = $derived(layout.narrow ? NARROW_SITE_TABS : layout.phone ? PHONE_SITE_TABS : SITES_TABS)
  // The banner shows when disconnected with data seen before, or when Web Serial is missing.
  // A port error always shows, since it answers the operator's own Connect.
  const bannerShown = $derived(
    portError || (!snap.connected && (!hasWebSerial || snap.lastRawAt !== null)),
  )

  function setFocus(mode: FocusMode): void {
    focus = mode
    writeFocus(mode)
  }

  function targetFor(tgid: string): HoldTarget {
    const card = getSnapshot().p25Cards.find((row) => row.tgid === tgid)
    return { tgid, name: talkgroupName(tgid, card?.name), agency: talkgroupAgency(tgid) }
  }

  /** Every hold comes here. Touch and phone confirm first; desktop mouse holds at once. */
  function requestHold(tgid: string): void {
    if (holdNeedsConfirm(isTouchDevice(), window.innerWidth)) holdTarget = targetFor(tgid)
    else holdController.hold(tgid)
  }

  function confirmHold(): void {
    const target = holdTarget
    holdTarget = null
    if (target) holdController.hold(target.tgid)
  }

  function cancelHold(): void {
    holdTarget = null
  }

  /** Release is not a hold, so it goes straight through. */
  function releaseHold(): void {
    holdController.release()
  }

  async function toggleConnection(): Promise<void> {
    if (!getSnapshot().connected) {
      const result = await connect()
      // A cancelled picker is silent. Any other name is a real failure to open the port.
      portError = result !== null && result !== 'NotFoundError'
      return
    }
    if (hold.storeHold !== null) {
      disconnectTg = hold.storeHold
      return
    }
    await disconnect()
  }

  async function confirmDisconnect(): Promise<void> {
    disconnectTg = null
    await disconnect()
  }

  function openChannels(): void {
    if (layout.phone) {
      channelsOpen = true
      return
    }
    // Desktop: Channels is a tab in the Sites column. Focus moves to that tab.
    returnFocus()
    sitesTab = 'channels'
    void tick().then(() => document.getElementById('sites-tab-channels')?.focus())
  }

  // Outside pointer closes the menu. Clicks on the menu or its trigger do not.
  function onPointerDown(event: PointerEvent): void {
    if (!menuOpen) return
    const target = event.target
    if (target instanceof Element && target.closest('.menu, [data-menu-trigger]')) return
    menuOpen = false
  }
</script>

<svelte:window onpointerdown={onPointerDown} />

<div class="shell">
  <TopBar
    {focus}
    onFocusChange={setFocus}
    {hasWebSerial}
    {portError}
    {menuOpen}
    onConnectionToggle={toggleConnection}
    onMenuToggle={() => (menuOpen = !menuOpen)}
  />

  <div class="notice">
    <OfflineBanner {hasWebSerial} {portError} visible={bannerShown} />
  </div>

  <StatusStrip {newCount}>
    {#snippet scanner()}
      <ScannerZone onHold={requestHold} />
    {/snippet}
  </StatusStrip>

  <main class="body" data-focus={focus}>
    <div class="region region-calls" class:is-active={activeTab === 'calls'}>
      {#if layout.narrow}<TopTalkgroups />{/if}
      <div class="calls-fill"><CallsColumn /></div>
    </div>
    <div class="region region-p25" class:is-active={activeTab === 'p25'}>
      <P25Column onHold={requestHold} onRelease={releaseHold} />
    </div>
    <div class="region region-sites" class:is-active={activeTab === 'sites'}>
      <SitesColumn compact={layout.phone} tabs={siteTabs} bind:tab={sitesTab} />
    </div>
  </main>

  <nav class="tabbar" aria-label="Sections">
    {#each tabs as item (item.id)}
      <button
        type="button"
        class="tab"
        aria-pressed={activeTab === item.id ? 'true' : 'false'}
        onclick={() => (tab = item.id)}
      >{item.label}</button>
    {/each}
  </nav>
</div>

{#snippet phoneExtras()}
  <div class="menu-extra">
    <p class="section-label">Counters</p>
    <div class="menu-counters">
      <StatusTiles {newCount} />
    </div>
  </div>
  <div class="menu-extra">
    <p class="section-label">Theme</p>
    <ThemeToggle />
  </div>
{/snippet}

{#if menuOpen}
  <MenuPopover
    onRawLog={() => (rawOpen = true)}
    onChannels={openChannels}
    onWipe={() => (wipeOpen = true)}
    onClose={() => (menuOpen = false)}
    extra={layout.phone ? phoneExtras : undefined}
  />
{/if}

<RawLogSheet bind:open={rawOpen} onClose={() => (rawOpen = false)} />
<WipeDialog open={wipeOpen} onClose={() => (wipeOpen = false)} />
<ChannelsSheet open={channelsOpen} onClose={() => (channelsOpen = false)} />

{#if holdTarget}
  <HoldConfirmSheet target={holdTarget} onConfirm={confirmHold} onCancel={cancelHold} />
{/if}

{#if disconnectTg !== null}
  <DisconnectHoldDialog
    tgid={disconnectTg}
    onConfirm={confirmDisconnect}
    onCancel={() => (disconnectTg = null)}
  />
{/if}

<style>
  /* Phone (under 640px) is the base. Tablet and desktop are added upward. The notice row
     is always present, so it holds no height while the banner is hidden. */
  .shell {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: var(--h-top) auto auto minmax(0, 1fr) var(--h-tabbar);
    height: 100vh;
    height: 100dvh;
    min-width: 0;
    overflow: hidden;
  }

  .notice {
    min-width: 0;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--gutter-phone);
    min-width: 0;
    min-height: 0;
    padding: var(--pad-panel-phone);
    overflow-x: hidden;
    overflow-y: auto;
  }

  .region {
    display: none;
    min-width: 0;
    min-height: 0;
  }

  .region.is-active {
    display: block;
    height: 100%;
  }

  /* Under 400 px the top-talkgroups strip sits above the calls column in the same region. */
  @media (max-width: 399px) {
    .region-calls.is-active {
      display: flex;
      flex-direction: column;
    }

    .calls-fill {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  .tabbar {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    background: var(--bg-1);
    border-top: 1px solid var(--line-1);
  }

  .tab {
    min-height: var(--hit-touch);
    border: 0;
    border-top: 2px solid transparent;
    background: transparent;
    color: var(--tx-2);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .tab[aria-pressed="true"] {
    color: var(--tx-1);
    border-top-color: var(--tx-1);
  }

  /* Phone menu content: counters and the theme toggle. */
  .menu-extra {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--line-1);
  }

  .menu-extra + .menu-extra {
    border-bottom: 0;
  }

  .section-label {
    margin: 0;
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  /* The first counter carries its delta, so it takes the full width. The rest pair up. */
  .menu-counters :global(.tiles) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3) var(--s-4);
    height: auto;
  }

  .menu-counters :global(.tile:first-child) {
    grid-column: 1 / -1;
  }

  /* Tablet: two columns, Calls on the left; P25 above Sites on the right. */
  @media (min-width: 640px) {
    .shell {
      grid-template-rows: var(--h-top) auto var(--h-strip) minmax(0, 1fr);
    }

    .body {
      display: grid;
      gap: var(--gutter-tablet);
      padding: var(--pad-panel);
      grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
      grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "calls p25"
        "calls sites";
      overflow: hidden;
    }

    .region {
      display: block;
    }

    .region-calls {
      grid-area: calls;
    }

    .region-p25 {
      grid-area: p25;
    }

    .region-sites {
      grid-area: sites;
    }

    .tabbar {
      display: none;
    }
  }

  /* Desktop: three columns with fixed minimums. Focus changes weights only. */
  @media (min-width: 1280px) {
    .body {
      grid-template-columns: minmax(340px, 31fr) minmax(420px, 38fr) minmax(340px, 31fr);
      grid-template-rows: minmax(0, 1fr);
      grid-template-areas: "calls p25 sites";
      gap: 0 var(--gutter);
      padding: var(--pad-panel);
    }

    .body[data-focus="calls"] {
      grid-template-columns: minmax(340px, 50fr) minmax(420px, 25fr) minmax(340px, 25fr);
    }

    .body[data-focus="p25"] {
      grid-template-columns: minmax(340px, 25fr) minmax(420px, 50fr) minmax(340px, 25fr);
    }

    .body[data-focus="sites"] {
      grid-template-columns: minmax(340px, 25fr) minmax(420px, 25fr) minmax(340px, 50fr);
    }
  }
</style>
