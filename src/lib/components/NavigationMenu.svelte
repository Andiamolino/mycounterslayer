<script lang="ts">
  import { IconButton, Icon, ConfirmActionButton, Hr, Panel, Popover, Text, addToast } from '@tableslayer/ui';
  import { IconX, IconPackage, IconRuler, IconStack2 } from '@tabler/icons-svelte';
  import { computePosition, offset, flip, shift } from '@floating-ui/dom';
  import { tick } from 'svelte';
  import TrayTypePreview from './TrayTypePreview.svelte';
  import ContainerHeightStatus from './ContainerHeightStatus.svelte';
  import PartImportDialog from './PartImportDialog.svelte';
  import {
    getProject,
    getSelectedBox,
    getSelectedTray,
    getSelectedLayer,
    selectBox,
    selectTray,
    selectLayer,
    addBox,
    deleteBox,
    addTray,
    deleteTray,
    addLayer,
    deleteLayer,
    addLooseTray,
    deleteLooseTray,
    previewPartImport,
    applyPartImport,
    getTrayLetterById,
    getContainerHeightCheck,
    isCounterTray,
    isCardTray,
    isCardDividerTray,
    isCardWellTray,
    isCupTray,
    isStandeeTray,
    type Box,
    type Layer,
    type Tray,
    type TrayType
  } from '#lib/stores/project.svelte.js';
  import type { PartImportTarget } from '#lib/utils/partImport.js';
  import { hasImportTarget, type PartKind, type PartPackage } from '#lib/utils/partPackage.js';
  import {
    describeImportReport,
    describePartImportFailure,
    describePartImportPreview,
    parsePartFile,
    PART_FILE_READ_ERROR_MESSAGE,
    type PartImportContext,
    type PartImportPreview
  } from '#lib/utils/partFile.js';
  import { calculateLayerHeight, getHeightDefs } from '#lib/models/layer.js';
  import { formatMm } from '#lib/utils/containerHeight.js';
  import { countCups } from '#lib/types/cupLayout.js';
  import { countCells } from '#lib/types/cardWellLayout.js';

  type SelectionType = 'dimensions' | 'layer' | 'box' | 'tray';

  interface Props {
    selectionType: SelectionType;
    onSelectionChange: (type: SelectionType) => void;
    onExpandPanel: () => void;
    isMobile?: boolean;
  }

  let { selectionType, onSelectionChange, onExpandPanel, isMobile = false }: Props = $props();

  let project = $derived(getProject());
  let selectedLayer = $derived(getSelectedLayer());
  let selectedBox = $derived(getSelectedBox());
  let selectedTray = $derived(getSelectedTray());

  // Hover preview state
  let hoveredTrayType = $state<TrayType | null>(null);
  let hoverAnchorElement = $state<HTMLElement | null>(null);
  let previewElement = $state<HTMLElement | null>(null);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
  let previewStyles = $state('');

  function handleTrayTypeHover(trayType: TrayType, element: HTMLElement) {
    hoverAnchorElement = element;
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = setTimeout(() => {
      hoveredTrayType = trayType;
    }, 150);
  }

  function handleTrayTypeLeave() {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    hoverTimeout = null;
    hoveredTrayType = null;
  }

  // Position the preview popover using floating-ui
  $effect(() => {
    if (hoverAnchorElement && hoveredTrayType && previewElement) {
      tick().then(async () => {
        if (!hoverAnchorElement || !previewElement) return;
        const result = await computePosition(hoverAnchorElement, previewElement, {
          placement: 'right',
          middleware: [offset(8), flip(), shift({ padding: 8 })]
        });
        previewStyles = `left: ${result.x}px; top: ${result.y}px;`;
      });
    }
  });

  function handleDimensionsClick() {
    onSelectionChange('dimensions');
    onExpandPanel();
  }

  function handleLayerClick(layer: Layer) {
    selectLayer(layer.id);
    onSelectionChange('layer');
    onExpandPanel();
  }

  function handleBoxClick(box: Box) {
    selectBox(box.id);
    onSelectionChange('box');
    onExpandPanel();
  }

  function handleTrayClick(tray: Tray, box: Box | null) {
    if (box) {
      selectBox(box.id);
    }
    selectTray(tray.id);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddLayer() {
    addLayer();
    onSelectionChange('layer');
    onExpandPanel();
  }

  function handleAddBox(layerId: string, trayType: TrayType) {
    addBox(layerId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddTray(boxId: string, trayType: TrayType) {
    addTray(boxId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  function handleAddLooseTray(layerId: string, trayType: TrayType) {
    addLooseTray(layerId, trayType);
    onSelectionChange('tray');
    onExpandPanel();
  }

  // --- Tray import (from "Import from file…" in the add popovers) ---
  // Mirrors the import handlers in GlobalsPanel (not shared: that would need a rebuild of GlobalsPanel)

  interface PendingTrayImport {
    pkg: PartPackage;
    target: PartImportTarget;
    expectedKind: PartKind;
    context: PartImportContext | undefined;
    preview: PartImportPreview;
    returnFocusElement: HTMLElement | null;
  }

  let pendingTrayImport: PendingTrayImport | null = $state.raw(null);
  // One hidden file chooser per popover kind (keyed by expectedKind)
  let importInputs: Partial<Record<PartKind, HTMLInputElement>> = $state({});
  // Target, expected kind and focus-return element are set before the file chooser opens
  let importTarget: PartImportTarget | null = null;
  let importExpectedKind: PartKind = 'tray';
  let importReturnFocus: HTMLElement | null = null;
  // Popover triggers by target, to return focus to them after the dialog closes
  let importTriggers: Record<string, HTMLElement | undefined> = {};

  // expectedKind = kind of the popover the file was chosen in (decides which file chooser opens)
  function startPartImport(target: PartImportTarget, expectedKind: PartKind, triggerKey: string) {
    importTarget = target;
    importExpectedKind = expectedKind;
    importReturnFocus = importTriggers[triggerKey] ?? null;
    importInputs[expectedKind]?.click();
  }

  // A box package always lands in a layer, so a box target is named by its layer then
  function describeImportContext(target: PartImportTarget, pkgKind: PartKind): PartImportContext | undefined {
    if (pkgKind === 'layer') return undefined;
    if (target.kind === 'box') {
      for (const layer of project.layers) {
        const box = layer.boxes.find((b) => b.id === target.boxId);
        if (!box) continue;
        return pkgKind === 'box'
          ? { targetKind: 'layer', targetName: layer.name }
          : { targetKind: 'box', targetName: box.name };
      }
      return undefined;
    }
    // A layer always goes on top of the project, so it needs no named target
    if (target.kind === 'project') return undefined;
    const layer = project.layers.find((l) => l.id === target.layerId);
    return layer ? { targetKind: 'layer', targetName: layer.name } : undefined;
  }

  function showImportFailure(expectedKind: PartKind, message?: string) {
    addToast({ data: { ...describePartImportFailure(expectedKind, message) } });
  }

  // Read, validate and preview the chosen file; nothing is changed until the dialog is confirmed
  async function handleImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    const target = importTarget;
    const returnFocusElement = importReturnFocus;
    const expectedKind = importExpectedKind;
    // One-shot: a later change event must not reuse an old target
    importTarget = null;
    importReturnFocus = null;
    if (!file || !target) {
      input.value = '';
      return;
    }

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
      const pkg = parsed.package;
      // A definition file (wrong kind) is offered as definition import, without target.
      // A tray or box file in the other popover keeps its target (resolved to the layer in the import).
      const hasTarget = hasImportTarget(pkg.kind);
      let report;
      try {
        report = previewPartImport(pkg, hasTarget ? target : undefined);
      } catch (e) {
        showImportFailure(expectedKind, e instanceof Error ? e.message : undefined);
        return;
      }
      // The preview has already thrown if the target is gone
      const context = hasTarget ? describeImportContext(target, pkg.kind) : undefined;
      pendingTrayImport = {
        pkg,
        target,
        expectedKind,
        context,
        preview: describePartImportPreview(pkg, report, expectedKind, context),
        returnFocusElement
      };
    } finally {
      // Same file can be chosen again
      input.value = '';
    }
  }

  function confirmTrayImport() {
    const pending = pendingTrayImport;
    if (!pending) return;
    // Close first so a double click cannot import twice
    pendingTrayImport = null;
    const kind = pending.pkg.kind;
    const hasTarget = hasImportTarget(kind);
    try {
      const report = applyPartImport(pending.pkg, hasTarget ? pending.target : undefined);
      addToast({ data: { ...describeImportReport(report, pending.pkg, pending.expectedKind, pending.context) } });
      // Like "Add tray" / a box click: the new part is selected and the editor opens
      if (hasTarget) {
        onSelectionChange(kind === 'layer' ? 'layer' : kind === 'box' ? 'box' : 'tray');
        onExpandPanel();
      }
    } catch (e) {
      showImportFailure(pending.expectedKind, e instanceof Error ? e.message : undefined);
    }
  }

  function cancelTrayImport() {
    pendingTrayImport = null;
  }

  function handleDeleteLayer(layerId: string, layerName: string) {
    deleteLayer(layerId);
    addToast({ data: { title: 'Layer deleted', body: `"${layerName}" has been deleted`, type: 'success' } });
    // If we deleted the selected layer, switch to first layer
    if (selectedLayer?.id === layerId) {
      onSelectionChange('layer');
    }
  }

  function handleDeleteBox(boxId: string, boxName: string) {
    deleteBox(boxId);
    addToast({ data: { title: 'Box deleted', body: `"${boxName}" has been deleted`, type: 'success' } });
    // If we deleted the selected box, switch to layer view
    if (selectedBox?.id === boxId) {
      onSelectionChange('layer');
    }
  }

  function handleDeleteTray(boxId: string | null, trayId: string, trayName: string) {
    if (boxId) {
      deleteTray(boxId, trayId);
    } else {
      deleteLooseTray(trayId);
    }
    addToast({ data: { title: 'Tray deleted', body: `"${trayName}" has been deleted`, type: 'success' } });
    // If we deleted the selected tray, switch to layer view
    if (selectedTray?.id === trayId) {
      onSelectionChange('layer');
    }
  }

  function getTrayStats(tray: Tray): {
    stacks: number;
    counters: number;
    isCardTray: boolean;
    isCardDivider: boolean;
    isCardWell: boolean;
    isCupTray: boolean;
  } {
    if (isCupTray(tray)) {
      const cupTotal = countCups(tray.params.layout);
      return {
        stacks: cupTotal,
        counters: cupTotal,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: true
      };
    }
    if (isCardWellTray(tray)) {
      const cellTotal = countCells(tray.params.layout);
      const totalCards = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
      return {
        stacks: cellTotal,
        counters: totalCards,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: true,
        isCupTray: false
      };
    }
    if (isCardDividerTray(tray)) {
      const totalCards = tray.params.stacks.reduce((sum, s) => sum + s.count, 0);
      return {
        stacks: tray.params.stacks.length,
        counters: totalCards,
        isCardTray: false,
        isCardDivider: true,
        isCardWell: false,
        isCupTray: false
      };
    }
    if (isCardTray(tray)) {
      return {
        stacks: 1,
        counters: tray.params.cardCount,
        isCardTray: true,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false
      };
    }
    if (isStandeeTray(tray)) {
      return {
        stacks: 1,
        counters: tray.params.count,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false
      };
    }
    if (!isCounterTray(tray)) {
      return {
        stacks: 0,
        counters: 0,
        isCardTray: false,
        isCardDivider: false,
        isCardWell: false,
        isCupTray: false
      };
    }
    const topCount = tray.params.topLoadedStacks.reduce((sum, s) => sum + s[1], 0);
    const edgeCount = tray.params.edgeLoadedStacks.reduce((sum, s) => sum + s[1], 0);
    return {
      stacks: tray.params.topLoadedStacks.length + tray.params.edgeLoadedStacks.length,
      counters: topCount + edgeCount,
      isCardTray: false,
      isCardDivider: false,
      isCardWell: false,
      isCupTray: false
    };
  }
</script>

<Panel class="navMenu {isMobile ? 'navMenu--mobile' : ''}">
  <!-- Dimensions (Globals) -->
  <button
    class="navItem navItem--dimensions {selectionType === 'dimensions' ? 'navItem--selected' : ''}"
    onclick={handleDimensionsClick}
  >
    <span class="navItemIcon">
      <Icon Icon={IconRuler} size="1rem" />
    </span>
    Project & dimensions
  </button>
  <Hr />

  <!-- Layers, Boxes, and Trays -->
  <div class="navTree">
    {#each project.layers as layer (layer.id)}
      {@const isLayerSelected = selectedLayer?.id === layer.id && selectionType === 'layer'}
      {@const totalItems = layer.boxes.length + layer.looseTrays.length}

      <div class="navLayerGroup">
        <!-- Layer Item -->
        <button
          class="navItem navItem--layer {isLayerSelected ? 'navItem--selected' : ''}"
          onclick={() => handleLayerClick(layer)}
        >
          <span class="navItemIcon">
            <Icon Icon={IconStack2} size="1rem" />
          </span>
          <span class="navItemLabel">
            {layer.name}
          </span>
          <span class="navItemHeight">{formatMm(calculateLayerHeight(layer, getHeightDefs(project)))}</span>
          {#if project.layers.length > 1}
            <span
              class="navItemDelete"
              role="none"
              onclick={(e) => e.stopPropagation()}
              onkeydown={(e) => e.stopPropagation()}
            >
              <ConfirmActionButton
                action={() => handleDeleteLayer(layer.id, layer.name)}
                actionButtonText="Delete layer"
                positioning={{ placement: 'right' }}
                portal=".appContainer"
              >
                {#snippet trigger({ triggerProps })}
                  <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete layer">
                    <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                  </IconButton>
                {/snippet}
                {#snippet actionMessage()}
                  <p>Delete this layer and all its contents?</p>
                {/snippet}
              </ConfirmActionButton>
            </span>
          {/if}
        </button>

        <!-- Content within Layer -->
        <div class="navLayerContent">
          <!-- Boxes within Layer -->
          {#each layer.boxes as box (box.id)}
            {@const isBoxSelected = selectedBox?.id === box.id && selectionType === 'box'}

            <div class="navBoxGroup">
              <!-- Box Item -->
              <button
                class="navItem navItem--box {isBoxSelected ? 'navItem--selected' : ''}"
                onclick={() => handleBoxClick(box)}
              >
                <span class="navItemIcon">
                  <Icon Icon={IconPackage} size="1rem" />
                </span>
                <span class="navItemLabel">
                  {box.name}
                </span>
                {#if totalItems > 1}
                  <span
                    class="navItemDelete"
                    role="none"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => e.stopPropagation()}
                  >
                    <ConfirmActionButton
                      action={() => handleDeleteBox(box.id, box.name)}
                      actionButtonText="Delete box"
                      positioning={{ placement: 'right' }}
                      portal=".appContainer"
                    >
                      {#snippet trigger({ triggerProps })}
                        <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete box">
                          <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                        </IconButton>
                      {/snippet}
                      {#snippet actionMessage()}
                        <p>Delete this box and all its trays?</p>
                      {/snippet}
                    </ConfirmActionButton>
                  </span>
                {/if}
              </button>

              <!-- Trays within Box -->
              <div class="navTrayList">
                {#each box.trays as tray (tray.id)}
                  {@const isTraySelected = selectedTray?.id === tray.id && selectionType === 'tray'}
                  {@const letter = getTrayLetterById(project.layers, tray.id)}
                  {@const stats = getTrayStats(tray)}

                  <button
                    class="navItem navItem--tray {isTraySelected ? 'navItem--selected' : ''}"
                    onclick={() => handleTrayClick(tray, box)}
                    title="{tray.name} ({letter}: {stats.isCardTray
                      ? stats.counters + ' cards'
                      : stats.isCardDivider
                        ? stats.counters + ' cards/' + stats.stacks + 's'
                        : stats.isCardWell
                          ? stats.counters + ' cards/' + stats.stacks + 'c'
                          : stats.isCupTray
                            ? stats.stacks + ' cups'
                            : stats.counters + 'c in ' + stats.stacks + 's'})"
                  >
                    <span class="navItemLabel">
                      <span class="trayLetter">{letter}</span>
                      {tray.name}
                    </span>
                    <span
                      class="navItemDelete"
                      role="none"
                      onclick={(e) => e.stopPropagation()}
                      onkeydown={(e) => e.stopPropagation()}
                    >
                      <ConfirmActionButton
                        action={() => handleDeleteTray(box.id, tray.id, tray.name)}
                        actionButtonText="Delete tray"
                        positioning={{ placement: 'right' }}
                        portal=".appContainer"
                      >
                        {#snippet trigger({ triggerProps })}
                          <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete tray">
                            <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                          </IconButton>
                        {/snippet}
                        {#snippet actionMessage()}
                          <p>Delete this tray?</p>
                        {/snippet}
                      </ConfirmActionButton>
                    </span>
                  </button>
                {/each}

                <!-- Add Tray Button with Popover -->
                <Popover
                  positioning={{ placement: 'right-start' }}
                  portal=".appContainer"
                  contentClass="trayTypePopover"
                >
                  {#snippet trigger()}
                    <button class="navItem navItem--add navItem--tray" bind:this={importTriggers[`box:${box.id}`]}>
                      <span class="addIcon">+</span>
                      <span class="addLabel">Add tray</span>
                    </button>
                  {/snippet}
                  {#snippet content({ contentProps })}
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'counter');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('counter', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Counters</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cardDraw');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cardDraw', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Card draw</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cardDivider');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cardDivider', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Card divider</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Divided stacks of cards, divided by walls</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cardWell');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cardWell', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Card well</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Flat stacks of cards</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'cup');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Cups</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Segmented cups for loose objects</Text>
                    </button>
                    <button
                      class="trayTypeOption"
                      onclick={() => {
                        handleAddTray(box.id, 'standee');
                        contentProps.close();
                      }}
                      onmouseenter={(e) => handleTrayTypeHover('standee', e.currentTarget)}
                      onmouseleave={handleTrayTypeLeave}
                    >
                      <Text weight={500}>Standees</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Slotted tray for vertical standees</Text>
                    </button>
                    <button
                      class="trayTypeOption trayTypeOption--import"
                      onclick={() => {
                        startPartImport({ kind: 'box', boxId: box.id }, 'tray', `box:${box.id}`);
                        contentProps.close();
                      }}
                    >
                      <Text weight={500}>Import from file…</Text>
                      <Text size="0.75rem" color="var(--fgMuted)">Tray from a .tray.json file</Text>
                    </button>
                  {/snippet}
                </Popover>
              </div>
            </div>
          {/each}

          <!-- Loose Trays within Layer -->
          {#each layer.looseTrays as tray (tray.id)}
            {@const isTraySelected = selectedTray?.id === tray.id && selectionType === 'tray'}
            {@const letter = getTrayLetterById(project.layers, tray.id)}
            {@const stats = getTrayStats(tray)}

            <button
              class="navItem navItem--looseTray {isTraySelected ? 'navItem--selected' : ''}"
              onclick={() => handleTrayClick(tray, null)}
              title="{tray.name} (Loose {letter}: {stats.isCardTray
                ? stats.counters + ' cards'
                : stats.isCardDivider
                  ? stats.counters + ' cards/' + stats.stacks + 's'
                  : stats.isCardWell
                    ? stats.counters + ' cards/' + stats.stacks + 'c'
                    : stats.isCupTray
                      ? stats.stacks + ' cups'
                      : stats.counters + 'c in ' + stats.stacks + 's'})"
            >
              <span class="navItemLabel">
                <span class="trayLetter">{letter}</span>
                {tray.name}
                <span class="looseBadge">loose</span>
              </span>
              {#if totalItems > 1}
                <span
                  class="navItemDelete"
                  role="none"
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => e.stopPropagation()}
                >
                  <ConfirmActionButton
                    action={() => handleDeleteTray(null, tray.id, tray.name)}
                    actionButtonText="Delete tray"
                    positioning={{ placement: 'right' }}
                    portal=".appContainer"
                  >
                    {#snippet trigger({ triggerProps })}
                      <IconButton {...triggerProps} size="sm" variant="ghost" title="Delete tray">
                        <Icon Icon={IconX} size="1rem" color="var(--fgMuted)" />
                      </IconButton>
                    {/snippet}
                    {#snippet actionMessage()}
                      <p>Delete this loose tray?</p>
                    {/snippet}
                  </ConfirmActionButton>
                </span>
              {/if}
            </button>
          {/each}

          <!-- Add Box Button with Popover -->
          <Popover positioning={{ placement: 'right-start' }} portal=".appContainer" contentClass="trayTypePopover">
            {#snippet trigger()}
              <button class="navItem navItem--add navItem--box" bind:this={importTriggers[`addBox:${layer.id}`]}>
                <span class="addIcon">+</span>
                <span class="addLabel">Add box</span>
              </button>
            {/snippet}
            {#snippet content({ contentProps })}
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'counter');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('counter', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Counters</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cardDraw');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDraw', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card draw</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cardDivider');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDivider', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card divider</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Divided stacks of cards, divided by walls</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cardWell');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardWell', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card well</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Flat stacks of cards</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'cup');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Cup tray</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddBox(layer.id, 'standee');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('standee', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Standees</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Slotted tray for vertical standees</Text>
              </button>
              <button
                class="trayTypeOption trayTypeOption--import"
                onclick={() => {
                  startPartImport({ kind: 'layer', layerId: layer.id }, 'box', `addBox:${layer.id}`);
                  contentProps.close();
                }}
              >
                <Text weight={500}>Import from file…</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Box from a .box.json file</Text>
              </button>
            {/snippet}
          </Popover>

          <!-- Add Loose Tray Button with Popover -->
          <Popover positioning={{ placement: 'right-start' }} portal=".appContainer" contentClass="trayTypePopover">
            {#snippet trigger()}
              <button class="navItem navItem--add navItem--looseTray" bind:this={importTriggers[`layer:${layer.id}`]}>
                <span class="addIcon">+</span>
                <span class="addLabel">Add loose tray</span>
              </button>
            {/snippet}
            {#snippet content({ contentProps })}
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'counter');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('counter', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Counters</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Stacks of geometric tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cardDraw');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDraw', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card draw</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Single stack of cards, draw from top</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cardDivider');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardDivider', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card divider</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Divided stacks of cards, divided by walls</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cardWell');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cardWell', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Card well</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Flat stacks of cards</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'cup');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('cup', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Cup tray</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Bowl-shaped cups for dice and tokens</Text>
              </button>
              <button
                class="trayTypeOption"
                onclick={() => {
                  handleAddLooseTray(layer.id, 'standee');
                  contentProps.close();
                }}
                onmouseenter={(e) => handleTrayTypeHover('standee', e.currentTarget)}
                onmouseleave={handleTrayTypeLeave}
              >
                <Text weight={500}>Standees</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Slotted tray for vertical standees</Text>
              </button>
              <button
                class="trayTypeOption trayTypeOption--import"
                onclick={() => {
                  startPartImport({ kind: 'layer', layerId: layer.id }, 'tray', `layer:${layer.id}`);
                  contentProps.close();
                }}
              >
                <Text weight={500}>Import from file…</Text>
                <Text size="0.75rem" color="var(--fgMuted)">Tray from a .tray.json file</Text>
              </button>
            {/snippet}
          </Popover>
        </div>
        <Hr />
      </div>
    {/each}

    <ContainerHeightStatus check={getContainerHeightCheck()} variant="compact" />

    <!-- Add Layer Button -->
    <Popover positioning={{ placement: 'right-start' }} portal=".appContainer" contentClass="trayTypePopover">
      {#snippet trigger()}
        <button class="navItem navItem--add navItem--addLayer" bind:this={importTriggers['addLayer']}>
          <span class="addIcon">+</span>
          <span class="addLabel">Add layer</span>
        </button>
      {/snippet}
      {#snippet content({ contentProps })}
        <button
          class="trayTypeOption"
          onclick={() => {
            handleAddLayer();
            contentProps.close();
          }}
        >
          <Text weight={500}>Empty layer</Text>
          <Text size="0.75rem" color="var(--fgMuted)">A new layer without boxes or trays</Text>
        </button>
        <button
          class="trayTypeOption trayTypeOption--import"
          onclick={() => {
            startPartImport({ kind: 'project' }, 'layer', 'addLayer');
            contentProps.close();
          }}
        >
          <Text weight={500}>Import from file…</Text>
          <Text size="0.75rem" color="var(--fgMuted)">Layer from a .layer.json file</Text>
        </button>
      {/snippet}
    </Popover>
  </div>
</Panel>

<!-- Hidden file chooser for tray import, outside the popovers (they close on click and unmount their content).
     Its accept value differs from the project import input (accept=".json") on purpose, so e2e helpers and
     selectors that look for input[accept=".json"] still find only the project input. -->
<input
  bind:this={importInputs.tray}
  type="file"
  accept=".json,application/json"
  aria-label="Import tray file"
  onchange={handleImportFile}
  style="display: none;"
/>
<input
  bind:this={importInputs.box}
  type="file"
  accept=".json,application/json"
  aria-label="Import box file"
  onchange={handleImportFile}
  style="display: none;"
/>
<input
  bind:this={importInputs.layer}
  type="file"
  accept=".json,application/json"
  aria-label="Import layer file"
  onchange={handleImportFile}
  style="display: none;"
/>

{#if pendingTrayImport}
  <PartImportDialog
    preview={pendingTrayImport.preview}
    onConfirm={confirmTrayImport}
    onCancel={cancelTrayImport}
    returnFocusElement={pendingTrayImport.returnFocusElement}
  />
{/if}

<!-- Tray type preview popover -->
{#if hoveredTrayType && hoverAnchorElement}
  <div bind:this={previewElement} class="popContent trayTypePreviewPopover" style={previewStyles}>
    <TrayTypePreview trayType={hoveredTrayType} />
  </div>
{/if}

<style>
  :global(.navMenu) {
    position: fixed;
    top: 4rem;
    left: 1.5rem;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 0;
    min-width: 12rem;
    max-width: 16rem;
    max-height: calc(100vh - 8rem);
    overflow-y: auto;
  }

  .navItem {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    padding: 0 0.5rem;
    font-size: 0.875rem;
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .navItem:hover {
    background: var(--contrastLow);
  }

  .navItem--selected {
    background: var(--contrastMedium);
    box-shadow: inset 3px 0 0 var(--fgPrimary);
  }

  .navItem--add {
    color: var(--fgMuted);
  }

  .navItem--add:hover {
    color: var(--fg);
  }

  .navItemIcon,
  .trayLetter,
  .addIcon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    color: var(--fgMuted);
    font-family: var(--font-mono);
    font-size: 0.625rem;
  }

  .navItemIcon {
    width: 1.25rem;
  }

  .navItemLabel {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .navItemHeight {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: var(--fgMuted);
  }

  .navItemDelete {
    opacity: 0;
  }

  .navItem:hover .navItemDelete {
    opacity: 1;
  }

  .navTree {
    display: flex;
    flex-direction: column;
  }

  .navLayerGroup {
    display: flex;
    flex-direction: column;
  }

  .navLayerContent {
    display: flex;
    flex-direction: column;

    .navItem--box,
    .navItem--looseTray {
      padding-left: 1.5rem;
    }

    .navItem--add.navItem--box,
    .navItem--add.navItem--looseTray {
      padding-left: 1.5rem;
    }
  }

  .navBoxGroup {
    display: flex;
    flex-direction: column;
  }

  .navTrayList {
    display: flex;
    flex-direction: column;

    .navItem {
      padding-left: 3rem;
    }
  }

  .looseBadge {
    font-size: 0.625rem;
    padding: 0.125rem 0.25rem;
    background: var(--contrastLow);
    border-radius: 2px;
    color: var(--fgMuted);
    margin-left: 0.25rem;
  }

  .addLabel {
    flex: 1;
  }

  /* Mobile styles - inline nav panel, not fixed */
  :global(.navMenu--mobile) {
    position: relative;
    top: auto;
    left: auto;
    max-width: none;
    max-height: none;
    border-radius: 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  /* Tray type popover */
  :global(.popContent.trayTypePopover) {
    display: flex;
    flex-direction: column;
    min-width: 14rem;
    padding: 0 !important;
    background: var(--contrastLowest) !important;
  }

  :global(.trayTypeOption) {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s ease;
  }

  :global(.trayTypeOption:not(:last-child)) {
    border-bottom: var(--borderThin);
  }

  :global(.trayTypeOption:hover) {
    background: var(--contrastLow);
  }

  :global(.trayTypePreviewPopover) {
    position: fixed;
    z-index: 1100;
    pointer-events: none;
    background: var(--contrastLowest);
    border: var(--borderThin);
    overflow: hidden;
  }
</style>
