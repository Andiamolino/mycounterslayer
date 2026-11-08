<script lang="ts">
  import { commitDecimalInput, commitOptionalDecimalInput } from '#lib/utils/numberInput.js';
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import HintedField from './HintedField.svelte';
  import SlottedTrayFields from './SlottedTrayFields.svelte';
  import type { StandeeTray } from '#lib/types/project.js';
  import {
    type StandeeTrayParams,
    getStandeeTrayDimensions,
    getStandeeAutoSlotWallHeight,
    getStandeeStandingHeight,
    getStandeeRowCounts,
    getStandee
  } from '#lib/models/standeeTray.js';
  import { resolveBarLayout } from '#lib/utils/holderSettings.js';
  import { resolveStandeeHolder } from '#lib/utils/standeeHolder.js';
  import { formatMm } from '#lib/utils/containerHeight.js';
  import { getStandees } from '#lib/stores/project.svelte.js';

  // Mode-dependent field labels and hints in one place (one-sided: slotted bars, alternating: slotted walls)
  const COMMON_TEXT = {
    rimHeight: 'Wall height above standees',
    rimHeightHint: 'How far the outer walls rise above the highest standee.',
    width: 'Tray width',
    length: 'Tray length',
    elements: 'standees'
  } as const;
  const FIELD_TEXT = {
    oneSided: {
      ...COMMON_TEXT,
      innerWall: 'Bar thickness',
      innerWallHint: 'Thickness of the two slotted bars.',
      slotWallHeight: 'Bar height'
    },
    alternating: {
      ...COMMON_TEXT,
      innerWall: 'Slot wall thickness',
      innerWallHint: 'Thickness of the slotted walls.'
    }
  } as const;
  interface Props {
    tray: StandeeTray;
    onUpdateParams: (params: StandeeTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  let standees = $derived(getStandees());
  let selectedStandee = $derived(standees.find((s) => s.id === tray.params.standeeId));

  // Arrangement comes from the (resolved) standee definition, same fallback as the geometry
  // Resolved once: getStandee warns on fallback
  let standee = $derived(getStandee(tray.params.standeeId, standees));
  let holder = $derived(resolveStandeeHolder(standee));
  let oneSided = $derived(holder.arrangement === 'oneSided');
  let rowCounts = $derived(getStandeeRowCounts(tray.params.count, holder.arrangement));
  let distributionText = $derived(
    oneSided
      ? `One row of ${rowCounts[0]}`
      : `Left ${rowCounts[0]} + right ${rowCounts[1]} = ${rowCounts[0] + rowCounts[1]}`
  );
  let text = $derived(oneSided ? FIELD_TEXT.oneSided : FIELD_TEXT.alternating);
  // Upper limit of the bar height (= height of the leaning standees); the geometry clamps to it
  let maxBarHeight = $derived(getStandeeStandingHeight(standee, holder.angleRad));
  // Real bar gap with this tray's bar thickness; same inputs as the geometry (one-sided only)
  let barLayout = $derived(resolveBarLayout(standee.standeeWidth, tray.params.innerWallThickness, holder));
  let autoSlotWallHeight = $derived(getStandeeAutoSlotWallHeight(tray.params, standees));

  // Compute dimensions, using actualHeight if provided (when tray expands to match box height)
  // If displayDimensions is provided (with rotation applied), use those for display
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = getStandeeTrayDimensions(tray.params, getStandees());
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  // Auto dimensions (ignoring overrides) - used as placeholders / minimums for the width & depth inputs
  let autoDimensions = $derived(
    getStandeeTrayDimensions({ ...tray.params, trayWidthOverride: null, trayDepthOverride: null }, getStandees())
  );

  function updateParam<K extends keyof StandeeTrayParams>(key: K, value: StandeeTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }
</script>

<div class="panelFormSection">
  <section class="section">
    <h3 class="sectionTitle">Standee</h3>
    <Spacer size="0.5rem" />
    <FormControl label="Standee type" name="standeeId">
      {#snippet input({ inputProps })}
        <Select
          {...inputProps}
          selected={[tray.params.standeeId]}
          options={standees.map((s) => ({
            value: s.id,
            label:
              resolveStandeeHolder(s).arrangement === 'oneSided'
                ? `${s.name} (one-sided)`
                : `${s.name} (${(s.baseRadius * 2).toFixed(0)}mm base)`
          }))}
          onSelectedChange={(selected) => {
            if (selected[0]) {
              updateParam('standeeId', selected[0]);
            }
          }}
        />
      {/snippet}
    </FormControl>
    {#if selectedStandee}
      <Spacer size="0.25rem" />
      <p class="standeeInfo">
        {#if oneSided}
          {selectedStandee.standeeWidth}mm × {selectedStandee.standeeHeight}mm element, one-sided
        {:else}
          {selectedStandee.standeeWidth}mm × {selectedStandee.standeeHeight}mm figure, {(
            selectedStandee.baseRadius * 2
          ).toFixed(0)}mm base
        {/if}
      </p>
    {/if}
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <h3 class="sectionTitle">Standee Count</h3>
    <Spacer size="0.5rem" />
    <FormControl label="Number of standees" name="count">
      {#snippet input({ inputProps })}
        <Input
          {...inputProps}
          type="text"
          inputmode="decimal"
          value={tray.params.count}
          onchange={(e) =>
            updateParam('count', commitDecimalInput(e.currentTarget, tray.params.count, { min: 1, int: true }))}
        />
      {/snippet}
    </FormControl>
    <Spacer size="0.25rem" />
    <p class="standeeInfo" data-testid="standeeDistribution">{distributionText}</p>
    <p class="standeeInfo" data-testid="standeeDistributionInfo">
      {oneSided
        ? 'One row across two slotted walls, no base.'
        : 'Split across two opposing slotted walls; an odd one goes left.'}
    </p>
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <div class="sectionHeader">
      <h3 class="sectionTitle">Tray Settings</h3>
      {#if dimensions}
        <span class="dimensionsInfo">
          {dimensions.width.toFixed(1)} × {dimensions.depth.toFixed(1)} × {dimensions.height.toFixed(1)} mm
        </span>
      {/if}
    </div>
    <Spacer size="0.5rem" />
    <SlottedTrayFields
      params={tray.params}
      {autoDimensions}
      onUpdate={(key, value) => onUpdateParams({ ...tray.params, [key]: value })}
      {text}
      innerWallExtra={barGapInfo}
      extraFields={oneSided ? barHeightField : undefined}
    />
  </section>
</div>

{#snippet barGapInfo()}
  {#if oneSided}
    <p class="standeeInfo fieldHint" data-testid="standeeBarGap">Bar gap: {formatMm(barLayout.gap)}</p>
    {#if barLayout.limited}
      <p class="standeeInfo fieldHint" data-testid="standeeBarLimited">Bars limited to fit the standee width.</p>
    {/if}
  {/if}
{/snippet}

{#snippet barHeightField()}
  <HintedField
    label={FIELD_TEXT.oneSided.slotWallHeight}
    name="standeeSlotWallHeight"
    hint={`Max ${formatMm(maxBarHeight)}. Max = height of the leaning standees. For bars flush with the walls set 'Wall height above standees' to 0.`}
    hintTestid="hintBarHeight"
    value={tray.params.slotWallHeight ?? ''}
    onChange={(input) => updateParam('slotWallHeight', commitOptionalDecimalInput(input, tray.params.slotWallHeight))}
    placeholder={`Auto (${autoSlotWallHeight.toFixed(1)})`}
    inputTestid="standeeSlotWallHeight"
  />
{/snippet}

<style>
  .panelFormSection {
    padding: 0 0.75rem;
  }

  .section {
    margin-bottom: 1rem;
  }

  .sectionHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .sectionTitle {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .sectionHeader .sectionTitle {
    margin-bottom: 0;
  }

  .standeeInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
