<script lang="ts">
  import { commitDecimalInput } from '#lib/utils/numberInput.js';
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import SlottedTrayFields, { type SlottedTrayFieldText } from './SlottedTrayFields.svelte';
  import type { StandeeTray } from '#lib/types/project.js';
  import {
    type StandeeTrayParams,
    getStandeeTrayDimensions,
    getStandeeRowCounts,
    getStandee
  } from '#lib/models/standeeTray.js';
  import { getStandees } from '#lib/stores/project.svelte.js';

  const FIELD_TEXT: SlottedTrayFieldText = {
    innerWall: 'Slot wall thickness',
    innerWallHint: 'Thickness of the slotted walls.',
    rimHeight: 'Wall height above standees',
    rimHeightHint: 'How far the outer walls rise above the highest standee.',
    width: 'Tray width',
    length: 'Tray length',
    elements: 'standees'
  };

  interface Props {
    tray: StandeeTray;
    onUpdateParams: (params: StandeeTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  let standees = $derived(getStandees());
  let selectedStandee = $derived(standees.find((s) => s.id === tray.params.standeeId));

  let rowCounts = $derived(getStandeeRowCounts(tray.params.count));
  let distributionText = $derived(`Left ${rowCounts[0]} + right ${rowCounts[1]} = ${rowCounts[0] + rowCounts[1]}`);

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
            label: `${s.name} (${(s.baseRadius * 2).toFixed(0)}mm base)`
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
        {selectedStandee.standeeWidth}mm × {selectedStandee.standeeHeight}mm figure, {(
          selectedStandee.baseRadius * 2
        ).toFixed(0)}mm base
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
      Split across two opposing slotted walls; an odd one goes left.
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
      text={FIELD_TEXT}
    />
  </section>
</div>

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
