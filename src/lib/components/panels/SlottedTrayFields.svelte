<script lang="ts">
  import type { Snippet } from 'svelte';
  import { clampFloorInput } from '#lib/utils/floorThickness.js';
  import { commitDecimalInput, commitOptionalDecimalInput } from '#lib/utils/numberInput.js';
  import type { SlottedTrayCommonParams } from '#lib/models/slottedTrayCore.js';
  import NumberField from '../NumberField.svelte';
  import HintedField from './HintedField.svelte';

  // Labels and hints that differ per tray kind / mode (the tile editor passes its own)
  export interface SlottedTrayFieldText {
    innerWall: string;
    innerWallHint: string;
    rimHeight: string;
    rimHeightHint: string;
    width: string;
    length: string;
    // Plural of the held element for the size hint ("standees", "tiles")
    elements: string;
  }

  interface Props {
    params: SlottedTrayCommonParams;
    // Auto size without overrides, shown as placeholder of the width/length inputs
    autoDimensions: { width: number; depth: number };
    onUpdate: <K extends keyof SlottedTrayCommonParams>(key: K, value: SlottedTrayCommonParams[K]) => void;
    text: SlottedTrayFieldText;
    // Further hints inside the inner wall field (e.g. bar gap)
    innerWallExtra?: Snippet;
    // Further fields at the end of the grid (e.g. bar height)
    extraFields?: Snippet;
  }

  let { params, autoDimensions, onUpdate, text, innerWallExtra, extraFields }: Props = $props();

  // Width/length overrides are only minimums (the geometry grows the tray when the elements need more)
  const sizeHint = (dimension: 'width' | 'length') =>
    `Tray ${dimension} including walls. Grows automatically if the ${text.elements} need more.`;

  // Width/depth overrides: blank = auto, otherwise the value (clamped to the auto minimum at generation)
  function updateSizeOverride(key: 'trayWidthOverride' | 'trayDepthOverride', input: HTMLInputElement) {
    onUpdate(key, commitOptionalDecimalInput(input, params[key]));
  }
</script>

<div class="formGrid">
  <NumberField
    label="Wall"
    name="wallThickness"
    value={params.wallThickness}
    onCommit={(v) => onUpdate('wallThickness', v)}
  />
  <HintedField
    label={text.innerWall}
    name="innerWallThickness"
    hint={text.innerWallHint}
    hintTestid="hintInnerWall"
    value={params.innerWallThickness}
    onChange={(input) => onUpdate('innerWallThickness', commitDecimalInput(input, params.innerWallThickness))}
    extra={innerWallExtra}
  />
  <NumberField
    label="Floor"
    name="floorThickness"
    value={params.floorThickness}
    commit={clampFloorInput}
    onCommit={(v) => onUpdate('floorThickness', v)}
  />
  <NumberField label="Clearance" name="clearance" value={params.clearance} onCommit={(v) => onUpdate('clearance', v)} />
  <HintedField
    label={text.rimHeight}
    name="rimHeight"
    hint={text.rimHeightHint}
    hintTestid="hintRimHeight"
    value={params.rimHeight}
    onChange={(input) => onUpdate('rimHeight', commitDecimalInput(input, params.rimHeight))}
  />
  <HintedField
    label={text.width}
    name="trayWidthOverride"
    hint={sizeHint('width')}
    hintTestid="hintWidth"
    value={params.trayWidthOverride ?? ''}
    onChange={(input) => updateSizeOverride('trayWidthOverride', input)}
    placeholder={`Auto (${autoDimensions.width.toFixed(1)})`}
  />
  <HintedField
    label={text.length}
    name="trayDepthOverride"
    hint={sizeHint('length')}
    hintTestid="hintLength"
    value={params.trayDepthOverride ?? ''}
    onChange={(input) => updateSizeOverride('trayDepthOverride', input)}
    placeholder={`Auto (${autoDimensions.depth.toFixed(1)})`}
  />
  {@render extraFields?.()}
</div>

<style>
  .formGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
</style>
