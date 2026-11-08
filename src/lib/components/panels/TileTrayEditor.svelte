<script lang="ts">
  import { commitDecimalInput, commitOptionalDecimalInput } from '#lib/utils/numberInput.js';
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import HintedField from './HintedField.svelte';
  import SlottedTrayFields, { type SlottedTrayFieldText } from './SlottedTrayFields.svelte';
  import type { TileTray } from '#lib/types/project.js';
  import {
    type TileTrayParams,
    getTileTrayDimensions,
    getTileAutoSlotWallHeight,
    getTileStandingHeight,
    getTile
  } from '#lib/models/tileTray.js';
  import { resolveBarLayout } from '#lib/utils/holderSettings.js';
  import { resolveTileHolder } from '#lib/utils/tileHolder.js';
  import { formatMm } from '#lib/utils/containerHeight.js';
  import { getTiles } from '#lib/stores/project.svelte.js';

  const FIELD_TEXT: SlottedTrayFieldText = {
    innerWall: 'Bar thickness',
    innerWallHint: 'Thickness of the two slotted bars.',
    rimHeight: 'Wall height above tiles',
    rimHeightHint: 'How far the outer walls rise above the highest tile.',
    width: 'Tray width',
    length: 'Tray length',
    elements: 'tiles'
  };

  interface Props {
    tray: TileTray;
    onUpdateParams: (params: TileTrayParams) => void;
    actualHeight?: number;
    displayDimensions?: { width: number; depth: number; height: number } | null;
  }

  let { tray, onUpdateParams, actualHeight, displayDimensions }: Props = $props();

  let tiles = $derived(getTiles());
  let selectedTile = $derived(tiles.find((t) => t.id === tray.params.tileId));

  // Resolved once, same fallback as the geometry
  let tile = $derived(getTile(tray.params.tileId, tiles));
  let holder = $derived(resolveTileHolder(tile));
  // Upper limit of the bar height (= height of the leaning tiles); the geometry clamps to it
  let maxBarHeight = $derived(getTileStandingHeight(tile, holder.angleRad));
  // Real bar gap with this tray's bar thickness; same inputs as the geometry
  let barLayout = $derived(resolveBarLayout(tile.width, tray.params.innerWallThickness, holder));
  let autoSlotWallHeight = $derived(getTileAutoSlotWallHeight(tray.params, tiles));

  // Compute dimensions, using actualHeight if provided (when tray expands to match box height)
  // If displayDimensions is provided (with rotation applied), use those for display
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = getTileTrayDimensions(tray.params, tiles);
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  // Auto dimensions (ignoring overrides) - used as placeholders / minimums for the width & depth inputs
  let autoDimensions = $derived(
    getTileTrayDimensions({ ...tray.params, trayWidthOverride: null, trayDepthOverride: null }, tiles)
  );

  function updateParam<K extends keyof TileTrayParams>(key: K, value: TileTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }
</script>

<div class="panelFormSection">
  <section class="section">
    <h3 class="sectionTitle">Tile</h3>
    <Spacer size="0.5rem" />
    <FormControl label="Tile type" name="tileId">
      {#snippet input({ inputProps })}
        <Select
          {...inputProps}
          selected={[tray.params.tileId]}
          options={tiles.map((t) => ({ value: t.id, label: `${t.name} (${t.width}×${t.height} mm)` }))}
          onSelectedChange={(selected) => {
            if (selected[0]) {
              updateParam('tileId', selected[0]);
            }
          }}
        />
      {/snippet}
    </FormControl>
    {#if selectedTile}
      <Spacer size="0.25rem" />
      <p class="tileInfo">{selectedTile.width}mm × {selectedTile.height}mm tile</p>
    {/if}
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <h3 class="sectionTitle">Tile Count</h3>
    <Spacer size="0.5rem" />
    <FormControl label="Number of tiles" name="count">
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
    <p class="tileInfo" data-testid="tileDistribution">One row of {tray.params.count}</p>
    <p class="tileInfo" data-testid="tileDistributionInfo">One row across two slotted bars, no base.</p>
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
      innerWallExtra={barGapInfo}
      extraFields={barHeightField}
    />
  </section>
</div>

{#snippet barGapInfo()}
  <p class="tileInfo fieldHint" data-testid="tileBarGap">Bar gap: {formatMm(barLayout.gap)}</p>
  {#if barLayout.limited}
    <p class="tileInfo fieldHint" data-testid="tileBarLimited">Bars limited to fit the tile width.</p>
  {/if}
{/snippet}

{#snippet barHeightField()}
  <HintedField
    label="Bar height"
    name="tileSlotWallHeight"
    hint={`Max ${formatMm(maxBarHeight)}. Max = height of the leaning tiles. For bars flush with the walls set 'Wall height above tiles' to 0.`}
    hintTestid="hintBarHeight"
    value={tray.params.slotWallHeight ?? ''}
    onChange={(input) => updateParam('slotWallHeight', commitOptionalDecimalInput(input, tray.params.slotWallHeight))}
    placeholder={`Auto (${autoSlotWallHeight.toFixed(1)})`}
    inputTestid="tileSlotWallHeight"
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

  .tileInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .fieldHint {
    margin-top: 0.25rem;
  }

  .dimensionsInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }
</style>
