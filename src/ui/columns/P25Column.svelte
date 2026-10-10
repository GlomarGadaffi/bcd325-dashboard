<script lang="ts">
</script>

<!-- Placeholder. The P25 live table and all-time bars replace it. -->
<section class="column" aria-labelledby="p25-title">
  <header class="column-head">
    <h2 id="p25-title" class="column-title">P25</h2>
  </header>
  <p class="placeholder">Placeholder</p>
</section>

<style>
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: var(--pad-panel);
    background: var(--bg-1);
    border: 1px solid var(--line-1);
    border-radius: var(--r-control);
    overflow: hidden;
  }

  .column-head {
    display: flex;
    align-items: center;
    min-height: var(--h-top);
  }

  .column-title {
    margin: 0;
    font-size: var(--fs-title);
    line-height: var(--lh-title);
    font-weight: var(--fw-semibold);
  }

  .placeholder {
    margin: 0;
    color: var(--tx-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-meta);
  }
</style>
