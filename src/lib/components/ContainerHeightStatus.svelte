<script lang="ts">
  import { formatMm, formatMmCeil, type ContainerHeightCheck } from '#lib/utils/containerHeight.js';

  interface Props {
    check: ContainerHeightCheck;
    // full: sentence for the Globals panel, compact: short form for the navigation
    variant?: 'full' | 'compact';
  }

  let { check, variant = 'full' }: Props = $props();

  // The text carries the message, the color is only an addition
  const text = $derived.by(() => {
    const total = formatMm(check.totalHeight);
    const container = check.containerHeight !== undefined ? formatMm(check.containerHeight) : '';
    if (variant === 'compact') {
      if (check.status === 'unset') return `Total ${total}`;
      if (check.status === 'tooTall') return `too tall by ${formatMmCeil(check.overBy ?? 0)}`;
      const base = `Total ${formatMm(check.totalHeight).replace(' mm', '')} / ${container}`;
      return check.status === 'lidLift' ? `${base} – lid lifts by ${formatMmCeil(check.liftBy ?? 0)}` : base;
    }
    if (check.status === 'unset') return `Layers total: ${total}`;
    const base = `Layers total: ${total} of ${container}`;
    if (check.status === 'tooTall') return `${base} – too tall by ${formatMmCeil(check.overBy ?? 0)}`;
    if (check.status === 'lidLift') return `${base} – lid lifts by ${formatMmCeil(check.liftBy ?? 0)}`;
    return base;
  });
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
