<script lang="ts">
  import {
    formatContainerHeightStatus,
    type ContainerHeightCheck,
    type ContainerHeightStatusVariant
  } from '#lib/utils/containerHeight.js';

  interface Props {
    check: ContainerHeightCheck;
    // full: sentence for the Globals panel, compact: short form for the navigation
    variant?: ContainerHeightStatusVariant;
    // live region only where the text is the primary status; off for the always-visible navigation
    live?: boolean;
  }

  let { check, variant = 'full', live = true }: Props = $props();

  // The text carries the message, the color is only an addition
  const text = $derived(formatContainerHeightStatus(check, variant));
  // ok and unset share the muted look; lidLift and tooTall get their own modifier
  const modifier = $derived(check.status === 'unset' ? 'ok' : check.status);
</script>

<p class="containerHeightStatus containerHeightStatus--{modifier}" role={live ? 'status' : undefined}>
  {text}
</p>

<style>
  .containerHeightStatus {
    margin: 0;
    font-size: 0.875rem;
  }

  .containerHeightStatus--ok {
    color: var(--fgMuted);
  }

  /* Local amber token (not in @tableslayer/ui); contrast >= 4.5:1 against the light and dark backgrounds */
  .containerHeightStatus--lidLift {
    --statusAmber: #8a5200;
    color: var(--statusAmber);
  }

  :global(.dark) .containerHeightStatus--lidLift {
    --statusAmber: #e0a93b;
  }

  /* Local red token; contrast: light #b3261e >= 4.8:1 on #ddd/#e5e5e5/#eee/#fff (4.81/5.19/5.63/6.54),
     dark #ff6b6b >= 6.5:1 on #151515/#111 (6.58/6.8). Clearly distinct from the amber hue. */
  .containerHeightStatus--tooTall {
    --statusRed: #b3261e;
    color: var(--statusRed);
  }

  :global(.dark) .containerHeightStatus--tooTall {
    --statusRed: #ff6b6b;
  }
</style>
