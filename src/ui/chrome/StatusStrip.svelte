<script lang="ts">
</script>

<!-- Three zones, empty until the scanner, last-call and counters builds fill them.
     Scanner is the widest zone and leads with the hold line. -->
<div class="strip">
  <div class="zone zone-scanner" role="group" aria-label="Scanner"></div>
  <div class="zone zone-last" role="group" aria-label="Last call"></div>
  <div class="zone zone-counters" role="group" aria-label="Counters"></div>
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr);
    height: var(--h-strip);
    min-width: 0;
    background: var(--bg-1);
    border-bottom: 1px solid var(--line-1);
  }

  .zone {
    min-width: 0;
    overflow: hidden;
  }

  .zone + .zone {
    border-left: 1px solid var(--line-1);
  }
</style>
