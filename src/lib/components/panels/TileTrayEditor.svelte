<script lang="ts">
  import { commitOptionalDecimalInput } from '#lib/utils/numberInput.js';
  import HintedField from './HintedField.svelte';
  import SlottedTrayEditor from './SlottedTrayEditor.svelte';
  import type { SlottedTrayFieldText } from './SlottedTrayFields.svelte';
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

  function updateParam<K extends keyof TileTrayParams>(key: K, value: TileTrayParams[K]) {
    onUpdateParams({ ...tray.params, [key]: value });
  }
</script>

<SlottedTrayEditor
  params={tray.params}
  title="Tile"
  typeLabel="Tile type"
  typeName="tileId"
  selectedId={tray.params.tileId}
  options={tiles.map((t) => ({ value: t.id, label: `${t.name} (${t.width}×${t.height} mm)` }))}
  onSelectId={(id) => updateParam('tileId', id)}
  selectedInfo={selectedTile ? `${selectedTile.width}mm × ${selectedTile.height}mm tile` : undefined}
  countTitle="Tile Count"
  countLabel="Number of tiles"
  distributionTestid="tileDistribution"
  distributionText="One row of {tray.params.count}"
  distributionInfo="One row across two slotted bars, no base."
  calcDimensions={(params) => getTileTrayDimensions({ ...tray.params, ...params }, tiles)}
  {actualHeight}
  {displayDimensions}
  onUpdate={(key, value) => onUpdateParams({ ...tray.params, [key]: value })}
  onUpdateCount={(count) => updateParam('count', count)}
  fieldText={FIELD_TEXT}
  innerWallExtra={barGapInfo}
  extraFields={barHeightField}
/>

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
  .tileInfo {
    font-size: 0.75rem;
    color: var(--fgMuted);
    margin: 0;
  }

  .fieldHint {
    margin-top: 0.25rem;
  }
</style>
