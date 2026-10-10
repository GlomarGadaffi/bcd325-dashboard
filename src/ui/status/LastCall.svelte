<script lang="ts">
  import { DB } from '../../core/AgencyDB'
  import { getSnapshot } from '../state/adapter.svelte'
  import { clock } from '../state/clock.svelte'
  import GrantTypeTag from '../primitives/GrantTypeTag.svelte'
  import { formatAge, isStale, lastGrant, lastP25 } from './statusModel'

  // The last EDACS grant beside the last P25 transmission. Names are scanner
  // strings or DB names, rendered as text only.
  const snapshot = $derived(getSnapshot())
  const now = $derived(clock.now)
  const edacs = $derived(lastGrant(snapshot.grants, now, (id) => DB[id]?.n))
  const p25 = $derived(lastP25(snapshot.p25Cards, now))
</script>

<div class="last-call">
  <div class="item">
    <span class="kind">EDACS</span>
    {#if edacs}
      <span class="detail"><GrantTypeTag type={edacs.grantType} /></span>
      <span class="detail mono id">{edacs.idText}</span>
      <span class="name">{edacs.name}</span>
      <span class="age mono" class:is-stale={isStale(edacs.ageMs)}>
        {#if isStale(edacs.ageMs)}
          <svg class="glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M6 3.4 V6.2 L7.9 7.3" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        {/if}
        {formatAge(edacs.ageMs)}
      </span>
    {:else}
      <span class="name none">No grant yet</span>
    {/if}
  </div>

  <div class="item">
    <span class="kind">P25</span>
    {#if p25}
      <span class="detail mono id">{p25.tgid}</span>
      <span class="name">{p25.name}</span>
      <span class="age mono" class:is-stale={isStale(p25.ageMs)}>
        {#if isStale(p25.ageMs)}
          <svg class="glyph" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <circle cx="6" cy="6" r="4.4" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M6 3.4 V6.2 L7.9 7.3" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        {/if}
        {formatAge(p25.ageMs)}
      </span>
    {:else}
      <span class="name none">No P25 traffic</span>
    {/if}
  </div>
</div>

<style>
  .last-call {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--s-1);
    min-width: 0;
    height: 100%;
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    color: var(--tx-1);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-width: 0;
  }

  .kind {
    flex: none;
    width: 44px;
    color: var(--tx-2);
    font-size: var(--fs-caps);
    line-height: var(--lh-caps);
    font-weight: var(--fw-semibold);
    letter-spacing: var(--ls-caps);
    text-transform: uppercase;
  }

  .name {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .none {
    color: var(--tx-2);
  }

  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }

  .id {
    flex: none;
    color: var(--tx-2);
  }

  .age {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    color: var(--tx-2);
  }

  /* Stale is a glyph and a text colour change, never opacity. */
  .age.is-stale {
    color: var(--tx-3);
  }

  .glyph {
    width: 10px;
    height: 10px;
    flex: none;
  }

  /* Phone: the second line of the strip. Name and age only, side by side. */
  @media (max-width: 639px) {
    .last-call {
      flex-direction: row;
      gap: var(--s-4);
      justify-content: flex-start;
    }

    .item {
      flex: 1 1 0;
      gap: var(--s-2);
    }

    .kind {
      width: auto;
    }

    .detail {
      display: none;
    }
  }
</style>
