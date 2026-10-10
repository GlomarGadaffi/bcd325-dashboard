<script lang="ts">
  import { untrack } from 'svelte'
  import AgencyTag from '../primitives/AgencyTag.svelte'
  import StateChip from '../primitives/StateChip.svelte'
  import { formatAge } from '../scanner/format'
  import { getSnapshot, type P25Row } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import {
    HOLD_ACTIVE_NOTE,
    HOLD_DISCONNECTED_NOTE,
    acknowledgeNew,
    countOf,
    emptyMessage,
    hasAnyTotals,
    newTalkgroups,
    passesAgencyFilter,
    sortRows,
    talkgroupAgency,
    talkgroupName,
    type P25AgencyKey,
  } from './p25Model'

  // Live P25 talkgroups. Hold and Release both go to the parent, which sends them through
  // the hold controller. This table never writes to the store itself.
  let {
    onHold,
    onRelease,
    agencyOn,
  }: {
    onHold: (tgid: string) => void
    onRelease: (tgid: string) => void
    agencyOn: Record<P25AgencyKey, boolean>
  } = $props()

  const snap = $derived(getSnapshot())
  const heldTg = $derived(snap.p25HoldingTG)

  // Acknowledging a NEW row changes session memory that Svelte cannot see. Reading the
  // revision here makes the set run again straight after the click.
  let ackRevision = $state(0)
  const newTgids = $derived.by(() => {
    void ackRevision
    return newTalkgroups(snap.p25Cards, snap.persistentP25, clock.now)
  })

  const liveRows = $derived(sortRows(snap.p25Cards, heldTg))
  const liveByTg = $derived(new Map(snap.p25Cards.map((row) => [row.tgid, row])))

  // Freeze. While the pointer or focus is inside the table, the rows and their order stay
  // as they were on entry. Each row's values still come from the live snapshot, so a
  // Hold state change or an age is never stale.
  let frozen = $state.raw<P25Row[] | null>(null)
  let pointerInside = false
  let focusInside = false
  let root: HTMLDivElement | undefined

  function settle(): void {
    const hold = pointerInside || focusInside
    if (!hold) frozen = null
    else if (frozen === null) frozen = liveRows
  }

  // A focused element that leaves the DOM sends no focusout, so the focus flag is
  // read from the document after each change to the NEW chips.
  $effect(() => {
    void newTgids
    untrack(() => {
      focusInside = root !== undefined && root.contains(document.activeElement)
      settle()
    })
  })

  const rows = $derived(frozen === null ? liveRows : frozen.map((row) => liveByTg.get(row.tgid) ?? row))
  const visible = $derived(rows.filter((row) => passesAgencyFilter(row.tgid, agencyOn, heldTg)))
  const hiddenCount = $derived(rows.length - visible.length)
  const message = $derived(
    emptyMessage({
      connected: snap.connected,
      cards: rows.length,
      visible: visible.length,
      hasAnyTotals: hasAnyTotals(snap.persistentP25),
    }),
  )

  function onRowHold(row: P25Row): void {
    if (heldTg === row.tgid) onRelease(row.tgid)
    else onHold(row.tgid)
  }

  function acknowledge(tgid: string): void {
    acknowledgeNew(tgid)
    ackRevision++
  }

  function onPointerEnter(): void {
    pointerInside = true
    settle()
  }

  function onPointerLeave(): void {
    pointerInside = false
    settle()
  }

  function onFocusIn(): void {
    focusInside = true
    settle()
  }

  function onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget
    focusInside = next instanceof Node && root !== undefined && root.contains(next)
    settle()
  }
</script>

<div
  class="p25-table"
  role="group"
  aria-label="P25 talkgroups"
  bind:this={root}
  onpointerenter={onPointerEnter}
  onpointerleave={onPointerLeave}
  onfocusin={onFocusIn}
  onfocusout={onFocusOut}
>
  {#if heldTg !== null}
    <p class="note note-held">{HOLD_ACTIVE_NOTE}</p>
  {/if}
  {#if !snap.connected}
    <p class="note" id="p25-hold-reason">{HOLD_DISCONNECTED_NOTE}</p>
  {/if}
  {#if hiddenCount > 0}
    <p class="note">{hiddenCount} hidden by filters</p>
  {/if}

  {#if message !== null}
    <p class="empty">{message}</p>
  {:else}
    <ul class="rows" aria-label="Talkgroups">
      {#each visible as row (row.tgid)}
        {@const held = row.tgid === heldTg}
        {@const isNew = newTgids.has(row.tgid)}
        {@const agency = talkgroupAgency(row.tgid)}
        <li class="row" class:is-held={held}>
          <button
            type="button"
            class="hold"
            aria-pressed={held ? 'true' : 'false'}
            aria-label="{held ? 'Release' : 'Hold'} TG {row.tgid}"
            disabled={!snap.connected}
            aria-describedby={snap.connected ? undefined : 'p25-hold-reason'}
            onclick={() => onRowHold(row)}
          >{held ? 'Release' : 'Hold'}</button>

          <div class="head">
            <span class="tg">{row.tgid}</span>
            <span class="name">{talkgroupName(row.tgid, row.name)}</span>
          </div>

          <div class="state">
            {#if held}
              <StateChip kind="HELD" />
            {:else if isNew}
              <button
                type="button"
                class="new-button"
                aria-label="Acknowledge NEW, TG {row.tgid}"
                onclick={() => acknowledge(row.tgid)}
              >
                <StateChip kind="NEW" />
              </button>
            {/if}
          </div>

          <div class="detail">
            <AgencyTag code={agency} />
            <span class="stat"><span class="label">this burst</span> <span class="num">{row.hits}</span></span>
            <span class="stat"><span class="label">all time</span> <span class="num">{countOf(snap.persistentP25, row.tgid)}</span></span>
            <span class="stat"><span class="label">last</span> <span class="num">{formatAge(clock.now - row.lastSeen)}</span></span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .p25-table {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: var(--s-2);
    min-height: 0;
  }

  .note {
    margin: 0;
    padding: var(--s-1) var(--s-3);
    border-radius: var(--r-control);
    background: var(--bg-2);
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .note-held {
    color: var(--tx-1);
  }

  .empty {
    margin: 0;
    padding: var(--s-4) 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .rows {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    border-top: 1px solid var(--line-1);
  }

  /* Two lines per talkgroup: identity and state first, then the counts. */
  .row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas:
      "hold head state"
      "hold detail detail";
    align-items: center;
    column-gap: var(--s-3);
    row-gap: var(--s-1);
    padding: var(--s-2);
    border-bottom: 1px solid var(--line-1);
  }

  .row:hover {
    background: var(--bg-2);
  }

  /* An outline rather than a shadow, so forced-colors mode keeps the ring. */
  .row.is-held {
    outline: 2px solid var(--tx-1);
    outline-offset: -2px;
  }

  .hold {
    grid-area: hold;
    align-self: center;
    min-width: 44px;
    min-height: var(--control-h);
    padding: 0 var(--s-2);
    border: 1px solid var(--line-2);
    border-radius: var(--r-control);
    background: var(--bg-1);
    color: var(--tx-1);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    font-weight: var(--fw-medium);
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease);
  }

  .hold:hover {
    background: var(--bg-2);
  }

  .hold[aria-pressed="true"] {
    background: var(--held-fill);
    border-color: var(--held-fill);
    color: var(--held-text);
  }

  .hold:disabled {
    background: var(--bg-2);
    border-color: var(--line-2);
    color: var(--tx-2);
    cursor: not-allowed;
  }

  .hold[aria-pressed="true"]:disabled {
    background: var(--bg-2);
    border-color: var(--tx-1);
    color: var(--tx-1);
  }

  .head {
    grid-area: head;
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    min-width: 0;
  }

  .tg {
    flex: none;
    font-family: var(--font-mono);
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    font-variant-numeric: tabular-nums;
    color: var(--tx-1);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    font-size: var(--fs-data);
    line-height: var(--lh-data);
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tx-1);
  }

  .state {
    grid-area: state;
    display: flex;
    align-items: center;
  }

  .new-button {
    display: inline-flex;
    align-items: center;
    min-height: var(--hit-min);
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .detail {
    grid-area: detail;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--s-1) var(--s-4);
    min-width: 0;
    color: var(--tx-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }

  .stat {
    display: inline-flex;
    gap: var(--s-2);
    white-space: nowrap;
  }

  .num {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--tx-1);
  }

  @media (max-width: 639.98px) {
    .row {
      padding: var(--s-3) var(--s-2);
    }

    .hold {
      min-height: var(--control-h-phone);
    }

    .new-button {
      min-height: var(--hit-touch);
    }
  }
</style>
