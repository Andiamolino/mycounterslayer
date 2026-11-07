<script lang="ts">
  import { clampFloorInput } from '#lib/utils/floorThickness.js';
  import { commitDecimalInput, commitOptionalDecimalInput } from '#lib/utils/numberInput.js';
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import NumberField from '../NumberField.svelte';
  import type { StandeeTray } from '#lib/types/project.js';
  import {
    type StandeeTrayParams,
    getStandeeTrayDimensions,
    getStandeeAutoSlotWallHeight,
    getStandeeRowCounts,
    getStandee
  } from '#lib/models/standeeTray.js';
  import { resolveStandeeHolder } from '#lib/utils/standeeHolder.js';
  import { getStandees } from '#lib/stores/project.svelte.js';

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
  let holder = $derived(resolveStandeeHolder(getStandee(tray.params.standeeId, standees)));
  let oneSided = $derived(holder.arrangement === 'oneSided');
  let rowCounts = $derived(getStandeeRowCounts(tray.params.count, holder.arrangement));
  let distributionText = $derived(
    oneSided
      ? `One row of ${rowCounts[0]}`
      : `Left ${rowCounts[0]} + right ${rowCounts[1]} = ${rowCounts[0] + rowCounts[1]}`
  );
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

  // Width/depth overrides: blank = auto, otherwise the value (clamped to the auto minimum at generation)
  function updateSizeOverride(key: 'trayWidthOverride' | 'trayDepthOverride', input: HTMLInputElement) {
    updateParam(key, commitOptionalDecimalInput(input, tray.params[key]));
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
    <div class="formGrid">
      <NumberField
        label="Wall"
        name="wallThickness"
        value={tray.params.wallThickness}
        onCommit={(v) => updateParam('wallThickness', v)}
      />
      <NumberField
        label="Inner wall"
        name="innerWallThickness"
        value={tray.params.innerWallThickness}
        onCommit={(v) => updateParam('innerWallThickness', v)}
      />
      <NumberField
        label="Floor"
        name="floorThickness"
        value={tray.params.floorThickness}
        commit={clampFloorInput}
        onCommit={(v) => updateParam('floorThickness', v)}
      />
      <FormControl label="Clearance" name="clearance">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            value={tray.params.clearance}
            onchange={(e) => updateParam('clearance', commitDecimalInput(e.currentTarget, tray.params.clearance))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Rim height" name="rimHeight">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            value={tray.params.rimHeight}
            onchange={(e) => updateParam('rimHeight', commitDecimalInput(e.currentTarget, tray.params.rimHeight))}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Width" name="trayWidthOverride">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            placeholder={`Auto (${autoDimensions.width.toFixed(1)})`}
            value={tray.params.trayWidthOverride ?? ''}
            onchange={(e) => updateSizeOverride('trayWidthOverride', e.currentTarget)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Length" name="trayDepthOverride">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            placeholder={`Auto (${autoDimensions.depth.toFixed(1)})`}
            value={tray.params.trayDepthOverride ?? ''}
            onchange={(e) => updateSizeOverride('trayDepthOverride', e.currentTarget)}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      {#if oneSided}
        <FormControl label="Slot wall height" name="standeeSlotWallHeight">
          {#snippet input({ inputProps })}
            <Input
              {...inputProps}
              type="text"
              inputmode="decimal"
              data-testid="standeeSlotWallHeight"
              placeholder={`Auto (${autoSlotWallHeight.toFixed(1)})`}
              value={tray.params.slotWallHeight ?? ''}
              onchange={(e) =>
                updateParam('slotWallHeight', commitOptionalDecimalInput(e.currentTarget, tray.params.slotWallHeight))}
            />
          {/snippet}
          {#snippet end()}mm{/snippet}
        </FormControl>
      {/if}
    </div>
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

  .formGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
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
