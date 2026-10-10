<script lang="ts">
  import type { Snippet } from 'svelte'

  // Anchored to the element it wraps, never to a pixel position. Opens on hover and
  // on keyboard focus with the same text. Escape dismisses. The trigger receives the
  // tooltip id as its describedBy argument, so it can set aria-describedby.
  let {
    id,
    text,
    children,
  }: { id: string; text: string; children: Snippet<[string]> } = $props()

  let open = $state(false)

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      open = false
    }
  }
</script>

<span
  class="tooltip-anchor"
  role="presentation"
  onmouseenter={() => (open = true)}
  onmouseleave={() => (open = false)}
  onfocusin={() => (open = true)}
  onfocusout={() => (open = false)}
  onkeydown={onKeydown}
>
  {@render children(id)}
  <span role="tooltip" {id} class="tooltip" hidden={!open}>{text}</span>
</span>

<style>
  .tooltip-anchor {
    position: relative;
    display: inline-flex;
  }

  .tooltip {
    display: block;
    position: absolute;
    top: calc(100% + var(--s-2));
    left: 0;
    z-index: 10;
    max-width: 240px;
    padding: var(--s-1) var(--s-3);
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    background: var(--bg-2);
    color: var(--tx-1);
    box-shadow: var(--shadow-overlay);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
    white-space: normal;
    pointer-events: none;
  }

  .tooltip[hidden] {
    display: none;
  }
</style>
