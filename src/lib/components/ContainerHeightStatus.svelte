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
  }

  let { check, variant = 'full' }: Props = $props();

  // The text carries the message, the color is only an addition
  const text = $derived(formatContainerHeightStatus(check, variant));
  // ok and unset share the muted look; lidLift and tooTall get their own modifier
  const modifier = $derived(check.status === 'unset' ? 'ok' : check.status);
</script>

<p class="containerHeightStatus containerHeightStatus--{modifier}" role="status">
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

  .containerHeightStatus--tooTall {
    color: var(--fgDanger);
  }
</style>
