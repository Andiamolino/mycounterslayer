<script lang="ts">
  import {
    Input,
    InputCheckbox,
    FormControl,
    Spacer,
    Hr,
    Select,
    Link,
    Icon,
    Panel,
    Button,
    ConfirmActionButton,
    Text,
    addToast
  } from '@tableslayer/ui';
  import {
    IconSquare,
    IconCircle,
    IconHexagon,
    IconTriangle,
    IconRectangle,
    IconCards,
    IconUser
  } from '@tabler/icons-svelte';
  import type { CounterShape, CounterBaseShape, CardSize, Standee } from '#lib/types/project.js';
  import PartImportDialog from './PartImportDialog.svelte';
  import ContainerHeightStatus from './ContainerHeightStatus.svelte';
  import { MIN_CONTAINER_HEIGHT_INPUT } from '#lib/utils/containerHeight.js';
  import { commitDecimalInput, commitOptionalDecimalInput } from '#lib/utils/numberInput.js';
  import {
    buildPartPackage,
    type DefinitionKind,
    type ImportReport,
    type PartPackage
  } from '#lib/utils/partPackage.js';
  import {
    describeImportReport,
    describePartImportFailure,
    describePartImportPreview,
    downloadPartPackage,
    parsePartFile,
    PART_EXPORT_FAILED_TITLE,
    PART_FILE_READ_ERROR_MESSAGE,
    PART_KIND_LABELS,
    type PartImportPreview
  } from '#lib/utils/partFile.js';
  import {
    getProject,
    getGameContainerHeight,
    setGameContainerHeight,
    getContainerHeightCheck,
    isCounterTray,
    isCardDrawTray,
    isCardDividerTray,
    isStandeeTray,
    getCounterShapes,
    getCardSizes,
    getStandees,
    addCounterShape,
    updateCounterShape,
    deleteCounterShape,
    addCardSize,
    updateCardSize,
    deleteCardSize,
    addStandee,
    updateStandee,
    deleteStandee,
    previewPartImport,
    applyPartImport,
    DEFAULT_COUNTER_THICKNESS
  } from '#lib/stores/project.svelte.js';

  interface Props {
    globalSettings: { gameContainerWidth: number; gameContainerDepth: number };
    onGlobalSettingsChange: (updates: { gameContainerWidth?: number; gameContainerDepth?: number }) => void;
    projectName: string;
    // Returns false when the name was rejected (empty after trimming)
    onProjectNameChange: (newName: string) => boolean;
  }

  let { globalSettings, onGlobalSettingsChange, projectName, onProjectNameChange }: Props = $props();

  // Always write the stored name back so rejected or trimmed input shows the real value
  function onProjectNameInputChange(event: Event & { currentTarget: HTMLInputElement }) {
    onProjectNameChange(event.currentTarget.value);
    event.currentTarget.value = projectName;
  }

  // Escape restores the stored name; resetting the value programmatically prevents a later change event
  function onProjectNameInputKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key !== 'Escape') return;
    event.currentTarget.value = projectName;
    event.currentTarget.blur();
  }

  // --- Part export / import (shared by counters, card sizes and standees) ---

  interface PendingPartImport {
    pkg: PartPackage;
    expectedKind: DefinitionKind;
    preview: PartImportPreview;
    returnFocusElement: HTMLElement | null;
  }

  let pendingPartImport: PendingPartImport | null = $state.raw(null);
  let importFileInputs: Partial<Record<DefinitionKind, HTMLInputElement>> = {};
  let importLinkWrappers: Partial<Record<DefinitionKind, HTMLElement>> = {};

  function showImportFailure(expectedKind: DefinitionKind, message?: string) {
    addToast({ data: { ...describePartImportFailure(expectedKind, message) } });
  }

  function showExportFailure(message?: string) {
    addToast({ data: { title: PART_EXPORT_FAILED_TITLE, body: message ?? '', type: 'danger' } });
  }

  function handleExportDefinition(kind: DefinitionKind, id: string) {
    const result = buildPartPackage(getProject(), { kind, id }, new Date());
    if (!result.ok) {
      showExportFailure(result.error.message);
      return;
    }
    try {
      downloadPartPackage(result.package);
    } catch (e) {
      showExportFailure(e instanceof Error ? e.message : undefined);
    }
  }

  // Read, validate and preview the chosen file; nothing is changed until the dialog is confirmed
  async function handleImportDefinitionFile(expectedKind: DefinitionKind, event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      let text: string;
      try {
        text = await file.text();
      } catch {
        showImportFailure(expectedKind, PART_FILE_READ_ERROR_MESSAGE);
        return;
      }
      const parsed = parsePartFile(text);
      if (!parsed.ok) {
        showImportFailure(expectedKind, parsed.error.message);
        return;
      }
      let report: ImportReport;
      try {
        report = previewPartImport(parsed.package);
      } catch (e) {
        showImportFailure(expectedKind, e instanceof Error ? e.message : undefined);
        return;
      }
      pendingPartImport = {
        pkg: parsed.package,
        expectedKind,
        preview: describePartImportPreview(parsed.package, report, expectedKind),
        returnFocusElement: importLinkWrappers[expectedKind]?.querySelector('button') ?? null
      };
    } finally {
      // Same file can be chosen again
      input.value = '';
    }
  }

  function confirmPartImport() {
    const pending = pendingPartImport;
    if (!pending) return;
    // Close first so a double click cannot import twice
    pendingPartImport = null;
    try {
      const report = applyPartImport(pending.pkg);
      addToast({ data: { ...describeImportReport(report, pending.pkg, pending.expectedKind) } });
    } catch (e) {
      showImportFailure(pending.expectedKind, e instanceof Error ? e.message : undefined);
    }
  }

  function cancelPartImport() {
    pendingPartImport = null;
  }

  // Track which counter is expanded (null = none)
  let expandedIndex: number | null = $state(null);
  // Track which card size is expanded (null = none)
  let expandedCardIndex: number | null = $state(null);
  // Track which standee is expanded (null = none)
  let expandedStandeeIndex: number | null = $state(null);

  // Get shapes, card sizes and standees from project level
  let counterShapes = $derived(getCounterShapes());
  let cardSizes = $derived(getCardSizes());
  let standees = $derived(getStandees());

  // Get the shape icon component for a base shape
  function getShapeIcon(baseShape: CounterBaseShape) {
    switch (baseShape) {
      case 'square':
        return IconSquare;
      case 'circle':
        return IconCircle;
      case 'hex':
        return IconHexagon;
      case 'triangle':
        return IconTriangle;
      case 'rectangle':
      default:
        return IconRectangle;
    }
  }

  // Calculate icon scale relative to max size (with clamping)
  function getRelativeIconScale(shape: CounterShape): number {
    const maxWidth = Math.max(...counterShapes.map((s) => Math.max(s.width, s.length)));
    const shapeSize = Math.max(shape.width, shape.length);
    const minScale = 0.6;
    const maxScale = 1.4;
    const ratio = maxWidth > 0 ? shapeSize / maxWidth : 1;
    return minScale + ratio * (maxScale - minScale);
  }

  // Get display size string for a shape
  function getSizeDisplay(shape: CounterShape): string {
    const baseShape = shape.baseShape ?? 'rectangle';
    if (baseShape === 'rectangle') {
      return `${shape.width} × ${shape.length}`;
    }
    return `${shape.width}`;
  }

  const baseShapeOptions: { value: CounterBaseShape; label: string }[] = [
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'square', label: 'Square' },
    { value: 'circle', label: 'Circle' },
    { value: 'hex', label: 'Hex' },
    { value: 'triangle', label: 'Triangle' }
  ];

  // Custom shape handlers - now using project-level store functions
  function handleAddShape() {
    const newName = `Custom ${counterShapes.length + 1}`;
    const newShape = addCounterShape({
      name: newName,
      baseShape: 'rectangle',
      width: 20,
      length: 30,
      thickness: DEFAULT_COUNTER_THICKNESS
    });
    // Find the index of the newly added shape
    const newIndex = getCounterShapes().findIndex((s) => s.id === newShape.id);
    expandedIndex = newIndex;
  }

  function handleUpdateShape(
    shapeId: string,
    field: keyof CounterShape | 'cornerRadius' | 'pointyTop',
    value: string | number | boolean
  ) {
    const shape = counterShapes.find((s) => s.id === shapeId);
    if (!shape) return;

    if (field === 'name') {
      const newName = value as string;
      // Don't allow duplicate names
      if (counterShapes.some((s) => s.id !== shapeId && s.name === newName)) {
        return;
      }
      updateCounterShape(shapeId, { name: newName });
      return;
    }

    // Handle baseShape changes - sync length to width for non-rectangle shapes
    if (field === 'baseShape') {
      const baseShape = value as CounterBaseShape;
      if (baseShape !== 'rectangle') {
        updateCounterShape(shapeId, { baseShape, length: shape.width });
      } else {
        updateCounterShape(shapeId, { baseShape });
      }
      return;
    }

    // Handle width changes for non-rectangle shapes - sync length
    if (field === 'width') {
      const baseShape = shape.baseShape ?? 'rectangle';
      if (baseShape !== 'rectangle') {
        updateCounterShape(shapeId, { width: value as number, length: value as number });
      } else {
        updateCounterShape(shapeId, { width: value as number });
      }
      return;
    }

    // Handle other fields
    updateCounterShape(shapeId, { [field]: value });
  }

  // Count stacks using a given shape across ALL counter trays in the project
  function countStacksUsingShape(shapeId: string): number {
    const project = getProject();
    let count = 0;

    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        for (const tray of box.trays) {
          if (isCounterTray(tray)) {
            count += tray.params.topLoadedStacks.filter((stack) => stack[0] === shapeId).length;
            count += tray.params.edgeLoadedStacks.filter((stack) => stack[0] === shapeId).length;
          }
        }
      }
      for (const tray of layer.looseTrays) {
        if (isCounterTray(tray)) {
          count += tray.params.topLoadedStacks.filter((stack) => stack[0] === shapeId).length;
          count += tray.params.edgeLoadedStacks.filter((stack) => stack[0] === shapeId).length;
        }
      }
    }

    return count;
  }

  function handleRemoveShape(shapeId: string) {
    deleteCounterShape(shapeId);
    expandedIndex = null;
  }

  // Card size handlers - now using project-level store functions
  function handleAddCardSize() {
    const newName = `Custom Card ${cardSizes.length + 1}`;
    const newCardSize = addCardSize({
      name: newName,
      width: 66,
      length: 91,
      thickness: 0.5
    });
    // Find the index of the newly added card size
    const newIndex = getCardSizes().findIndex((s) => s.id === newCardSize.id);
    expandedCardIndex = newIndex;
  }

  function handleUpdateCardSize(cardSizeId: string, field: keyof CardSize, value: string | number) {
    if (field === 'name') {
      const newName = value as string;
      // Don't allow duplicate names
      if (cardSizes.some((s) => s.id !== cardSizeId && s.name === newName)) {
        return;
      }
    }
    updateCardSize(cardSizeId, { [field]: value });
  }

  // Count card trays using a given card size
  function countTraysUsingCardSize(cardSizeId: string): number {
    const project = getProject();
    let count = 0;

    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        for (const tray of box.trays) {
          if (isCardDrawTray(tray)) {
            if (tray.params.cardSizeId === cardSizeId) {
              count++;
            }
          }
          if (isCardDividerTray(tray)) {
            count += tray.params.stacks.filter((s) => s.cardSizeId === cardSizeId).length;
          }
        }
      }
      for (const tray of layer.looseTrays) {
        if (isCardDrawTray(tray)) {
          if (tray.params.cardSizeId === cardSizeId) {
            count++;
          }
        }
        if (isCardDividerTray(tray)) {
          count += tray.params.stacks.filter((s) => s.cardSizeId === cardSizeId).length;
        }
      }
    }

    return count;
  }

  function handleRemoveCardSize(cardSizeId: string) {
    deleteCardSize(cardSizeId);
    expandedCardIndex = null;
  }

  // Standee handlers - using project-level store functions
  function handleAddStandee() {
    const newName = `Custom Standee ${standees.length + 1}`;
    const newStandee = addStandee({
      name: newName,
      baseRadius: 9,
      baseThickness: 3,
      standeeHeight: 40,
      standeeWidth: 25,
      standeeThickness: 1.5
    });
    const newIndex = getStandees().findIndex((s) => s.id === newStandee.id);
    expandedStandeeIndex = newIndex;
  }

  function handleUpdateStandee(standeeId: string, field: keyof Standee, value: string | number) {
    if (field === 'name') {
      const newName = value as string;
      // Don't allow duplicate names
      if (standees.some((s) => s.id !== standeeId && s.name === newName)) {
        return;
      }
    }
    updateStandee(standeeId, { [field]: value });
  }

  // Count standee trays using a given standee
  function countTraysUsingStandee(standeeId: string): number {
    const project = getProject();
    let count = 0;
    for (const layer of project.layers) {
      for (const box of layer.boxes) {
        for (const tray of box.trays) {
          if (isStandeeTray(tray) && tray.params.standeeId === standeeId) count++;
        }
      }
      for (const tray of layer.looseTrays) {
        if (isStandeeTray(tray) && tray.params.standeeId === standeeId) count++;
      }
    }
    return count;
  }

  function handleRemoveStandee(standeeId: string) {
    deleteStandee(standeeId);
    expandedStandeeIndex = null;
  }
</script>

<div class="globalsPanel">
  <section class="section">
    <h3 class="sectionTitle">Project</h3>
    <FormControl label="Name" name="projectName">
      {#snippet input({ inputProps })}
        <Input
          {...inputProps}
          type="text"
          value={projectName}
          onchange={onProjectNameInputChange}
          onkeydown={onProjectNameInputKeydown}
        />
      {/snippet}
    </FormControl>
  </section>

  <Hr />

  <section class="section">
    <h3 class="sectionTitle">Game Container</h3>
    <div class="gameContainerInputs">
      <FormControl label="Width" name="gameContainerWidth">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            value={globalSettings.gameContainerWidth}
            onchange={(e) =>
              onGlobalSettingsChange({
                gameContainerWidth: commitDecimalInput(e.currentTarget, globalSettings.gameContainerWidth, {
                  min: 100,
                  int: true
                })
              })}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Depth" name="gameContainerDepth">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            value={globalSettings.gameContainerDepth}
            onchange={(e) =>
              onGlobalSettingsChange({
                gameContainerDepth: commitDecimalInput(e.currentTarget, globalSettings.gameContainerDepth, {
                  min: 100,
                  int: true
                })
              })}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
      <FormControl label="Height" name="gameContainerHeight">
        {#snippet input({ inputProps })}
          <Input
            {...inputProps}
            type="text"
            inputmode="decimal"
            placeholder="Optional"
            value={getGameContainerHeight() ?? ''}
            onchange={(e) =>
              setGameContainerHeight(
                commitOptionalDecimalInput(e.currentTarget, getGameContainerHeight() ?? null, {
                  min: MIN_CONTAINER_HEIGHT_INPUT
                })
              )}
          />
        {/snippet}
        {#snippet end()}mm{/snippet}
      </FormControl>
    </div>
    <Spacer size="0.5rem" />
    <Text size="0.875rem" color="var(--fgMuted)">
      Inner height with the lid closed. Leave empty to skip the height check.
    </Text>
    <Spacer size="0.5rem" />
    <ContainerHeightStatus check={getContainerHeightCheck()} />
    <Spacer size="0.5rem" />
    <Text size="0.875rem" color="var(--fgMuted)">
      Set to the inner dimensions of the actual cardboard box your game uses. It provides the bounding area for layout
      calculations.
    </Text>
  </section>

  <Hr />

  <section class="section">
    <h3 class="sectionTitle">Counters</h3>
    <Spacer size="0.5rem" />
    <div class="customShapesList">
      {#each counterShapes as shape, index (shape.id)}
        {@const baseShape = shape.baseShape ?? 'rectangle'}
        {@const isExpanded = expandedIndex === index}
        {#if isExpanded}
          <!-- Expanded view: full form in Panel -->
          <Panel class="shapePanel">
            <div class="shapePanelContent">
              <div class="shapeFormGrid">
                <FormControl label="Name" name="name-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      value={shape.name}
                      onchange={(e) => handleUpdateShape(shape.id, 'name', e.currentTarget.value)}
                      placeholder="Name"
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Shape" name="baseShape-{index}">
                  {#snippet input({ inputProps })}
                    <Select
                      selected={[baseShape]}
                      onSelectedChange={(selected) => handleUpdateShape(shape.id, 'baseShape', selected[0])}
                      options={baseShapeOptions}
                      {...inputProps}
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Thickness" name="thickness-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={shape.thickness}
                      onchange={(e) =>
                        handleUpdateShape(
                          shape.id,
                          'thickness',
                          commitDecimalInput(e.currentTarget, shape.thickness, { min: 0.1 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                {#if baseShape === 'rectangle'}
                  <FormControl label="Width" name="width-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.width}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'width',
                            commitDecimalInput(e.currentTarget, shape.width, { min: 1 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                  <FormControl label="Length" name="length-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.length}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'length',
                            commitDecimalInput(e.currentTarget, shape.length, { min: 1 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {:else if baseShape === 'square'}
                  <FormControl label="Size" name="size-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.width}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'width',
                            commitDecimalInput(e.currentTarget, shape.width, { min: 1 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {:else if baseShape === 'circle'}
                  <FormControl label="Diameter" name="diameter-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.width}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'width',
                            commitDecimalInput(e.currentTarget, shape.width, { min: 1 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {:else if baseShape === 'hex'}
                  <FormControl label="Flat-to-flat" name="flatToFlat-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.width}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'width',
                            commitDecimalInput(e.currentTarget, shape.width, { min: 1 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                  <InputCheckbox
                    checked={shape.pointyTop ?? false}
                    onchange={(e) => handleUpdateShape(shape.id, 'pointyTop', e.currentTarget.checked ? 1 : 0)}
                    label="Pointy top"
                  />
                {:else if baseShape === 'triangle'}
                  <FormControl label="Side" name="side-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.width}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'width',
                            commitDecimalInput(e.currentTarget, shape.width, { min: 1 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                  <FormControl label="Radius" name="cornerRadius-{index}">
                    {#snippet input({ inputProps })}
                      <Input
                        {...inputProps}
                        type="text"
                        inputmode="decimal"
                        value={shape.cornerRadius ?? 1.5}
                        onchange={(e) =>
                          handleUpdateShape(
                            shape.id,
                            'cornerRadius',
                            commitDecimalInput(e.currentTarget, shape.cornerRadius ?? 1.5, { min: 0 })
                          )}
                      />
                    {/snippet}
                    {#snippet end()}mm{/snippet}
                  </FormControl>
                {/if}
              </div>
            </div>
            <Hr />
            {@const stackCount = countStacksUsingShape(shape.id)}
            <div class="shapePanelActions">
              <Button size="sm" onclick={() => (expandedIndex = null)}>Save</Button>
              {@render exportButton('counterShape', shape.id)}
              <ConfirmActionButton action={() => handleRemoveShape(shape.id)} actionButtonText="Delete counter">
                {#snippet trigger({ triggerProps })}
                  <Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
                {/snippet}
                {#snippet actionMessage()}
                  <div style="max-width: 15rem;">
                    <Text weight={600} color="var(--fgDanger)">Warning</Text>
                    <Spacer size="0.5rem" />
                    {#if stackCount > 0}
                      <Text size="0.875rem">
                        Deleting the "{shape.name}" counter will also remove
                        <Text as="span" color="var(--fgDanger)">
                          {stackCount}
                          stack{stackCount === 1 ? '' : 's'}
                        </Text> using it.
                      </Text>
                    {:else}
                      <Text size="0.875rem">Delete the "{shape.name}" counter?</Text>
                    {/if}
                    <Spacer size="0.5rem" />
                  </div>
                {/snippet}
              </ConfirmActionButton>
            </div>
          </Panel>
        {:else}
          {@const iconScale = getRelativeIconScale(shape)}
          <div class="shapeCard">
            <!-- Collapsed view: compact summary -->
            <button class="shapeSummary" onclick={() => (expandedIndex = index)} title="Click to edit {shape.name}">
              <span class="shapeIcon" style="transform: scale({iconScale}); --stroke-width: {2 / iconScale};">
                <Icon Icon={getShapeIcon(baseShape)} size={16} />
              </span>
              <span class="shapeName">{shape.name}</span>
              <span class="shapeSize">{getSizeDisplay(shape)} mm</span>
            </button>
          </div>
        {/if}
      {/each}
    </div>
    <Spacer />
    {@render partLinks('counterShape', '+ New counter', handleAddShape)}
  </section>

  <Hr />

  <section class="section">
    <h3 class="sectionTitle">Card Sizes (Sleeved)</h3>
    <Spacer size="0.5rem" />
    <div class="customShapesList">
      {#each cardSizes as cardSize, index (cardSize.id)}
        {@const isExpanded = expandedCardIndex === index}
        {#if isExpanded}
          <!-- Expanded view: full form in Panel -->
          <Panel class="shapePanel">
            <div class="shapePanelContent">
              <div class="shapeFormGrid">
                <FormControl label="Name" name="cardName-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      value={cardSize.name}
                      onchange={(e) => handleUpdateCardSize(cardSize.id, 'name', e.currentTarget.value)}
                      placeholder="Name"
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Width" name="cardWidth-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={cardSize.width}
                      onchange={(e) =>
                        handleUpdateCardSize(
                          cardSize.id,
                          'width',
                          commitDecimalInput(e.currentTarget, cardSize.width, { min: 10 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Length" name="cardLength-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={cardSize.length}
                      onchange={(e) =>
                        handleUpdateCardSize(
                          cardSize.id,
                          'length',
                          commitDecimalInput(e.currentTarget, cardSize.length, { min: 10 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Thickness" name="cardThickness-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={cardSize.thickness}
                      onchange={(e) =>
                        handleUpdateCardSize(
                          cardSize.id,
                          'thickness',
                          commitDecimalInput(e.currentTarget, cardSize.thickness, { min: 0.1 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
              </div>
            </div>
            <Hr />
            {@const trayCount = countTraysUsingCardSize(cardSize.id)}
            <div class="shapePanelActions">
              <Button size="sm" onclick={() => (expandedCardIndex = null)}>Save</Button>
              {@render exportButton('cardSize', cardSize.id)}
              <ConfirmActionButton action={() => handleRemoveCardSize(cardSize.id)} actionButtonText="Delete card size">
                {#snippet trigger({ triggerProps })}
                  <Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
                {/snippet}
                {#snippet actionMessage()}
                  <div style="max-width: 15rem;">
                    <Text weight={600} color="var(--fgDanger)">Warning</Text>
                    <Spacer size="0.5rem" />
                    {#if trayCount > 0}
                      <Text size="0.875rem">
                        Deleting "{cardSize.name}" will affect
                        <Text as="span" color="var(--fgDanger)">
                          {trayCount}
                          card tray{trayCount === 1 ? '' : 's'}
                        </Text> using it.
                      </Text>
                    {:else}
                      <Text size="0.875rem">Delete the "{cardSize.name}" card size?</Text>
                    {/if}
                    <Spacer size="0.5rem" />
                  </div>
                {/snippet}
              </ConfirmActionButton>
            </div>
          </Panel>
        {:else}
          <div class="shapeCard">
            <!-- Collapsed view: compact summary -->
            <button
              class="shapeSummary"
              onclick={() => (expandedCardIndex = index)}
              title="Click to edit {cardSize.name}"
            >
              <span class="shapeIcon">
                <Icon Icon={IconCards} size={16} />
              </span>
              <span class="shapeName">{cardSize.name}</span>
              <span class="shapeSize">{cardSize.width}×{cardSize.length} mm</span>
            </button>
          </div>
        {/if}
      {/each}
    </div>
    <Spacer />
    {@render partLinks('cardSize', '+ New card size', handleAddCardSize)}
  </section>

  <Hr />

  <section class="section">
    <h3 class="sectionTitle">Standees</h3>
    <Spacer size="0.5rem" />
    <div class="customShapesList">
      {#each standees as standee, index (standee.id)}
        {@const isExpanded = expandedStandeeIndex === index}
        {#if isExpanded}
          <!-- Expanded view: full form in Panel -->
          <Panel class="shapePanel">
            <div class="shapePanelContent">
              <div class="shapeFormGrid">
                <FormControl label="Name" name="standeeName-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      value={standee.name}
                      onchange={(e) => handleUpdateStandee(standee.id, 'name', e.currentTarget.value)}
                      placeholder="Name"
                    />
                  {/snippet}
                </FormControl>
                <FormControl label="Base radius" name="baseRadius-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={standee.baseRadius}
                      onchange={(e) =>
                        handleUpdateStandee(
                          standee.id,
                          'baseRadius',
                          commitDecimalInput(e.currentTarget, standee.baseRadius, { min: 1 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Base thickness" name="baseThickness-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={standee.baseThickness}
                      onchange={(e) =>
                        handleUpdateStandee(
                          standee.id,
                          'baseThickness',
                          commitDecimalInput(e.currentTarget, standee.baseThickness, { min: 0.5 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Standee height" name="standeeHeight-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={standee.standeeHeight}
                      onchange={(e) =>
                        handleUpdateStandee(
                          standee.id,
                          'standeeHeight',
                          commitDecimalInput(e.currentTarget, standee.standeeHeight, { min: 1 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Standee width" name="standeeWidth-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={standee.standeeWidth}
                      onchange={(e) =>
                        handleUpdateStandee(
                          standee.id,
                          'standeeWidth',
                          commitDecimalInput(e.currentTarget, standee.standeeWidth, { min: 1 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
                <FormControl label="Standee thickness" name="standeeThickness-{index}">
                  {#snippet input({ inputProps })}
                    <Input
                      {...inputProps}
                      type="text"
                      inputmode="decimal"
                      value={standee.standeeThickness}
                      onchange={(e) =>
                        handleUpdateStandee(
                          standee.id,
                          'standeeThickness',
                          commitDecimalInput(e.currentTarget, standee.standeeThickness, { min: 0.1 })
                        )}
                    />
                  {/snippet}
                  {#snippet end()}mm{/snippet}
                </FormControl>
              </div>
            </div>
            <Hr />
            {@const trayCount = countTraysUsingStandee(standee.id)}
            <div class="shapePanelActions">
              <Button size="sm" onclick={() => (expandedStandeeIndex = null)}>Save</Button>
              {@render exportButton('standee', standee.id)}
              <ConfirmActionButton action={() => handleRemoveStandee(standee.id)} actionButtonText="Delete standee">
                {#snippet trigger({ triggerProps })}
                  <Button {...triggerProps} size="sm" variant="ghost">Delete</Button>
                {/snippet}
                {#snippet actionMessage()}
                  <div style="max-width: 15rem;">
                    <Text weight={600} color="var(--fgDanger)">Warning</Text>
                    <Spacer size="0.5rem" />
                    {#if trayCount > 0}
                      <Text size="0.875rem">
                        Deleting "{standee.name}" will affect
                        <Text as="span" color="var(--fgDanger)">
                          {trayCount}
                          standee tray{trayCount === 1 ? '' : 's'}
                        </Text> using it.
                      </Text>
                    {:else}
                      <Text size="0.875rem">Delete the "{standee.name}" standee?</Text>
                    {/if}
                    <Spacer size="0.5rem" />
                  </div>
                {/snippet}
              </ConfirmActionButton>
            </div>
          </Panel>
        {:else}
          <div class="shapeCard">
            <!-- Collapsed view: compact summary -->
            <button
              class="shapeSummary"
              onclick={() => (expandedStandeeIndex = index)}
              title="Click to edit {standee.name}"
            >
              <span class="shapeIcon">
                <Icon Icon={IconUser} size={16} />
              </span>
              <span class="shapeName">{standee.name}</span>
              <span class="shapeSize">{standee.standeeWidth}×{standee.standeeHeight} mm</span>
            </button>
          </div>
        {/if}
      {/each}
    </div>
    <Spacer />
    {@render partLinks('standee', '+ New standee', handleAddStandee)}
  </section>

  <Hr />
</div>

{#snippet exportButton(kind: DefinitionKind, id: string)}
  <Button
    size="sm"
    variant="ghost"
    aria-label="Export {PART_KIND_LABELS[kind]}"
    onclick={() => handleExportDefinition(kind, id)}
  >
    Export
  </Button>
{/snippet}

{#snippet partLinks(kind: DefinitionKind, addLabel: string, onAdd: () => void)}
  <div class="partLinks">
    <Link as="button" onclick={onAdd}>{addLabel}</Link>
    <span bind:this={importLinkWrappers[kind]}>
      <Link as="button" onclick={() => importFileInputs[kind]?.click()}>Import {PART_KIND_LABELS[kind]}…</Link>
    </span>
    <input
      bind:this={importFileInputs[kind]}
      type="file"
      accept=".json"
      aria-label="Import {PART_KIND_LABELS[kind]} file"
      onchange={(event) => handleImportDefinitionFile(kind, event)}
      style="display: none;"
    />
  </div>
{/snippet}

{#if pendingPartImport}
  <PartImportDialog
    preview={pendingPartImport.preview}
    onConfirm={confirmPartImport}
    onCancel={cancelPartImport}
    returnFocusElement={pendingPartImport.returnFocusElement}
  />
{/if}

<style>
  .globalsPanel {
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem 0;
  }

  .section {
    padding: 0 0.75rem;
  }

  .gameContainerInputs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    gap: 0.75rem;
  }

  .sectionTitle {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--fgMuted);
  }

  .customShapesList {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .shapeCard {
    border-radius: var(--radius-2);
    background: var(--contrastLowest);
    overflow: hidden;
  }

  :global(.panel.shapePanel) {
    padding: 0;
    background: var(--contrastLow) !important;
  }

  .shapePanelContent {
    padding: 0.75rem;
  }

  .shapeFormGrid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 0.75rem;
  }

  .partLinks {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
  }

  .shapePanelActions {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .shapeSummary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: inherit;
  }

  .shapeSummary:hover {
    background: var(--contrastLow);
  }

  .shapeIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    color: var(--fgMuted);
  }

  .shapeIcon :global(svg) {
    stroke-width: var(--stroke-width, 2);
  }

  .shapeName {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .shapeSize {
    font-size: 0.75rem;
    color: var(--fgMuted);
    font-family: var(--font-mono);
  }
</style>
