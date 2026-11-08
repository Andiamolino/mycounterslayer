<script lang="ts">
  import type { Snippet } from 'svelte';
  import { commitDecimalInput } from '#lib/utils/numberInput.js';
  import { Input, FormControl, Spacer, Select } from '@tableslayer/ui';
  import SlottedTrayFields, { type SlottedTrayFieldText } from './SlottedTrayFields.svelte';
  import type { SlottedTrayCommonParams } from '#lib/models/slottedTrayCore.js';

  // Shared body of the standee and tile tray editors: definition select, count with distribution
  // text and the common tray settings. Only the texts, the lookups and the extra fields differ.
  type Dimensions = { width: number; depth: number; height: number };

  interface Props {
    params: SlottedTrayCommonParams & { count: number };
    // Section title and select of the held definition, e.g. "Tile" / "Tile type" / "tileId"
    title: string;
    typeLabel: string;
    typeName: string;
    selectedId: string;
    options: { value: string; label: string }[];
    onSelectId: (id: string) => void;
    // Short description of the selected definition (hidden when undefined)
    selectedInfo?: string;
    countTitle: string;
    countLabel: string;
    // Prefix of the data-testids: "<prefix>" = distribution text, "<prefix>Info" = explanation
    distributionTestid: string;
    distributionText: string;
    distributionInfo: string;
    // Tray size for the given params (with overrides); the editor adds actualHeight / displayDimensions
    calcDimensions: (params: SlottedTrayCommonParams) => Dimensions;
    actualHeight?: number;
    displayDimensions?: Dimensions | null;
    onUpdate: <K extends keyof SlottedTrayCommonParams>(key: K, value: SlottedTrayCommonParams[K]) => void;
    onUpdateCount: (count: number) => void;
    fieldText: SlottedTrayFieldText;
    innerWallExtra?: Snippet;
    extraFields?: Snippet;
  }

  let {
    params,
    title,
    typeLabel,
    typeName,
    selectedId,
    options,
    onSelectId,
    selectedInfo,
    countTitle,
    countLabel,
    distributionTestid,
    distributionText,
    distributionInfo,
    calcDimensions,
    actualHeight,
    displayDimensions,
    onUpdate,
    onUpdateCount,
    fieldText,
    innerWallExtra,
    extraFields
  }: Props = $props();

  // Compute dimensions, using actualHeight if provided (when tray expands to match box height)
  // If displayDimensions is provided (with rotation applied), use those for display
  let dimensions = $derived.by(() => {
    if (displayDimensions) {
      return displayDimensions;
    }
    const baseDims = calcDimensions(params);
    return {
      ...baseDims,
      height: actualHeight && actualHeight > baseDims.height ? actualHeight : baseDims.height
    };
  });

  // Auto dimensions (ignoring overrides) - used as placeholders / minimums for the width & depth inputs
  let autoDimensions = $derived(calcDimensions({ ...params, trayWidthOverride: null, trayDepthOverride: null }));
</script>

<div class="panelFormSection">
  <section class="section">
    <h3 class="sectionTitle">{title}</h3>
    <Spacer size="0.5rem" />
    <FormControl label={typeLabel} name={typeName}>
      {#snippet input({ inputProps })}
        <Select
          {...inputProps}
          selected={[selectedId]}
          {options}
          onSelectedChange={(selected) => {
            if (selected[0]) {
              onSelectId(selected[0]);
            }
          }}
        />
      {/snippet}
    </FormControl>
    {#if selectedInfo !== undefined}
      <Spacer size="0.25rem" />
      <p class="slottedInfo">{selectedInfo}</p>
    {/if}
  </section>

  <Spacer size="0.5rem" />

  <section class="section">
    <h3 class="sectionTitle">{countTitle}</h3>
    <Spacer size="0.5rem" />
    <FormControl label={countLabel} name="count">
      {#snippet input({ inputProps })}
        <Input
          {...inputProps}
          type="text"
          inputmode="decimal"
          value={params.count}
          onchange={(e) => onUpdateCount(commitDecimalInput(e.currentTarget, params.count, { min: 1, int: true }))}
        />
      {/snippet}
    </FormControl>
    <Spacer size="0.25rem" />
    <p class="slottedInfo" data-testid={distributionTestid}>{distributionText}</p>
    <p class="slottedInfo" data-testid="{distributionTestid}Info">{distributionInfo}</p>
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
    <SlottedTrayFields {params} {autoDimensions} {onUpdate} text={fieldText} {innerWallExtra} {extraFields} />
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

  .slottedInfo {
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
