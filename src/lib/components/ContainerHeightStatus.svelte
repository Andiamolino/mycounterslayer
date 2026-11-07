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
</script>

<p
  class="containerHeightStatus containerHeightStatus__total"
  class:containerHeightStatus--tooTall={check.status === 'tooTall'}
  class:containerHeightStatus--ok={check.status !== 'tooTall'}
  role="status"
>
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

  .containerHeightStatus--tooTall {
    color: var(--fgDanger);
  }
</style>
