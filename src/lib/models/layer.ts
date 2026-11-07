/**
 * Layer model - handles arrangement and height calculation for layers
 * A layer contains boxes (with trays inside) and loose trays (not in boxes)
 */

import type {
  Box,
  CardSize,
  CounterShape,
  Layer,
  ManualBoxPlacement,
  ManualLooseTrayPlacement,
  Project,
  Standee,
  Tray
} from '#lib/types/project.js';
import { packItems, stackItemsVertically, type PackingItem } from '#lib/utils/binPacking.js';
import { getBoxExteriorDimensions, getTrayDimensionsForTray } from './box';

export interface BoxDimensions {
  width: number;
  depth: number;
  height: number;
}

export interface BoxPlacement {
  box: Box;
  dimensions: BoxDimensions;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface LooseTrayPlacement {
  tray: Tray;
  dimensions: { width: number; depth: number; height: number };
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface LayerArrangement {
  boxes: BoxPlacement[];
  looseTrays: LooseTrayPlacement[];
  layerHeight: number;
  totalWidth: number;
  totalDepth: number;
}

// One placeable element of a layer; the only place that knows the element kinds is getLayerElementHeight
export type LayerElement = { kind: 'box'; id: string; box: Box } | { kind: 'looseTray'; id: string; tray: Tray };

/**
 * All placeable elements of a layer: boxes first, then loose trays
 */
export function getLayerElements(layer: Layer): LayerElement[] {
  return [
    ...layer.boxes.map((box): LayerElement => ({ kind: 'box', id: box.id, box })),
    ...layer.looseTrays.map((tray): LayerElement => ({ kind: 'looseTray', id: tray.id, tray }))
  ];
}

// Definitions needed to compute element/layer heights
export type HeightDefs = {
  cardSizes: CardSize[];
  counterShapes: CounterShape[];
  // Required on purpose: a forgotten caller fails svelte-check instead of silently using default standees
  standees: Standee[];
};

/**
 * Single place that builds the height definitions from a project (missing lists -> [])
 * Pick, so the worker's partial project and the CLI's parsed JSON fit as well
 */
export function getHeightDefs(source: Partial<Pick<Project, 'cardSizes' | 'counterShapes' | 'standees'>>): HeightDefs {
  return {
    cardSizes: source.cardSizes ?? [],
    counterShapes: source.counterShapes ?? [],
    standees: source.standees ?? []
  };
}

/**
 * Card sizes and counter shapes only, as needed by the layout (arrangeLayerContents) - no standees on purpose
 * (keeps the current layout behaviour unchanged)
 */
export function getLayoutDefs(source: Partial<Pick<Project, 'cardSizes' | 'counterShapes'>>) {
  return { cardSizes: source.cardSizes ?? [], counterShapes: source.counterShapes ?? [] };
}

/**
 * Height of one layer element: box exterior height (incl. lid) or loose tray content height
 */
export function getLayerElementHeight(
  element: LayerElement,
  options: HeightDefs
): number {
  const { cardSizes, counterShapes, standees } = options;
  if (element.kind === 'box') {
    return getBoxExteriorDimensions(element.box, cardSizes, counterShapes, standees).height;
  }
  return getTrayDimensionsForTray(element.tray, cardSizes, counterShapes, standees).height;
}

/**
 * Calculate the height of a layer
 * Layer height = max of all element heights (0 for an empty layer)
 */
export function calculateLayerHeight(
  layer: Layer,
  options: HeightDefs
): number {
  return Math.max(0, ...getLayerElements(layer).map((element) => getLayerElementHeight(element, options)));
}

/**
 * Sum of all layer heights (layers are stacked), 0 for no layers
 */
export function calculateTotalLayerHeight(layers: Layer[], options: HeightDefs): number {
  return layers.reduce((sum, layer) => sum + calculateLayerHeight(layer, options), 0);
}

/**
 * Get dimensions of a box's exterior (including walls, floor, lid)
 * This is used for layer-level arrangement
 */
export function getBoxDimensions(
  box: Box,
  cardSizes: CardSize[],
  counterShapes: CounterShape[],
  standees: Standee[] = []
): BoxDimensions {
  return getBoxExteriorDimensions(box, cardSizes, counterShapes, standees);
}

/**
 * Arrange boxes and loose trays within a layer
 * Uses bin-packing similar to arrangeTrays but at the layer level
 */
export function arrangeLayerContents(
  layer: Layer,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
    gap?: number;
  }
): LayerArrangement {
  const { cardSizes, counterShapes, standees = [] } = options;

  // Calculate layer height first
  const layerHeight = calculateLayerHeight(layer, getHeightDefs(options));

  // If manual layout exists, use it
  if (layer.manualLayout) {
    return arrangeLayerManual(layer, layerHeight, options);
  }

  // Auto-arrange using bin packing
  return arrangeLayerAuto(layer, layerHeight, options);
}

/**
 * Arrange layer contents using manual placements
 */
function arrangeLayerManual(
  layer: Layer,
  layerHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
  }
): LayerArrangement {
  const { cardSizes, counterShapes, standees = [] } = options;
  const boxPlacements: BoxPlacement[] = [];
  const looseTrayPlacements: LooseTrayPlacement[] = [];

  // Place boxes from manual layout
  if (layer.manualLayout?.boxes) {
    for (const manual of layer.manualLayout.boxes) {
      const box = layer.boxes.find((b) => b.id === manual.boxId);
      if (!box) continue;

      const dims = getBoxDimensions(box, cardSizes, counterShapes, standees);
      // Apply rotation: 90° and 270° swap width/depth
      // Use layerHeight for consistent layer stacking
      const swapDims = manual.rotation === 90 || manual.rotation === 270;
      const effectiveDims: BoxDimensions = swapDims
        ? { width: dims.depth, depth: dims.width, height: layerHeight }
        : { width: dims.width, depth: dims.depth, height: layerHeight };

      boxPlacements.push({
        box,
        dimensions: effectiveDims,
        x: manual.x,
        y: manual.y,
        rotation: manual.rotation
      });
    }
  }

  // Place loose trays from manual layout
  if (layer.manualLayout?.looseTrays) {
    for (const manual of layer.manualLayout.looseTrays) {
      const tray = layer.looseTrays.find((t) => t.id === manual.trayId);
      if (!tray) continue;

      const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes, standees);
      // Apply rotation: 90° and 270° swap width/depth
      const swapDims = manual.rotation === 90 || manual.rotation === 270;
      const effectiveDims = swapDims
        ? { width: dims.depth, depth: dims.width, height: layerHeight }
        : { width: dims.width, depth: dims.depth, height: layerHeight };

      looseTrayPlacements.push({
        tray,
        dimensions: effectiveDims,
        x: manual.x,
        y: manual.y,
        rotation: manual.rotation
      });
    }
  }

  // Add any items not in manual layout using auto-arrangement
  const manualBoxIds = new Set(layer.manualLayout?.boxes?.map((m) => m.boxId) || []);
  const manualTrayIds = new Set(layer.manualLayout?.looseTrays?.map((m) => m.trayId) || []);

  const unplacedBoxes = layer.boxes.filter((b) => !manualBoxIds.has(b.id));
  const unplacedTrays = layer.looseTrays.filter((t) => !manualTrayIds.has(t.id));

  if (unplacedBoxes.length > 0 || unplacedTrays.length > 0) {
    // Find max Y of placed items
    let maxY = 0;
    for (const p of boxPlacements) {
      maxY = Math.max(maxY, p.y + p.dimensions.depth);
    }
    for (const p of looseTrayPlacements) {
      maxY = Math.max(maxY, p.y + p.dimensions.depth);
    }

    // Auto-arrange remaining items
    const tempLayer: Layer = {
      ...layer,
      boxes: unplacedBoxes,
      looseTrays: unplacedTrays,
      manualLayout: undefined
    };
    const autoArrangement = arrangeLayerAuto(tempLayer, layerHeight, options);

    // Offset and add to placements
    for (const p of autoArrangement.boxes) {
      boxPlacements.push({
        ...p,
        y: p.y + maxY
      });
    }
    for (const p of autoArrangement.looseTrays) {
      looseTrayPlacements.push({
        ...p,
        y: p.y + maxY
      });
    }
  }

  // Calculate total dimensions
  let totalWidth = 0;
  let totalDepth = 0;
  for (const p of boxPlacements) {
    totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
    totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
  }
  for (const p of looseTrayPlacements) {
    totalWidth = Math.max(totalWidth, p.x + p.dimensions.width);
    totalDepth = Math.max(totalDepth, p.y + p.dimensions.depth);
  }

  return {
    boxes: boxPlacements,
    looseTrays: looseTrayPlacements,
    layerHeight,
    totalWidth,
    totalDepth
  };
}

// Item data for layer bin packing
interface LayerItemData {
  itemType: 'box' | 'looseTray';
  item: Box | Tray;
  originalWidth: number;
  originalDepth: number;
}

/**
 * Auto-arrange layer contents using shared bin packing utility
 */
function arrangeLayerAuto(
  layer: Layer,
  layerHeight: number,
  options: {
    gameContainerWidth: number;
    gameContainerDepth: number;
    cardSizes: CardSize[];
    counterShapes: CounterShape[];
    standees?: Standee[];
  }
): LayerArrangement {
  const { gameContainerWidth, gameContainerDepth, cardSizes, counterShapes, standees = [] } = options;

  if (layer.boxes.length === 0 && layer.looseTrays.length === 0) {
    return {
      boxes: [],
      looseTrays: [],
      layerHeight: 0,
      totalWidth: 0,
      totalDepth: 0
    };
  }

  // Collect all items with their dimensions
  const packingItems: PackingItem<LayerItemData>[] = [];

  // Add boxes
  for (const box of layer.boxes) {
    const dims = getBoxDimensions(box, cardSizes, counterShapes, standees);
    packingItems.push({
      data: { itemType: 'box', item: box, originalWidth: dims.width, originalDepth: dims.depth },
      width: dims.width,
      depth: dims.depth
    });
  }

  // Add loose trays
  for (const tray of layer.looseTrays) {
    const dims = getTrayDimensionsForTray(tray, cardSizes, counterShapes, standees);
    packingItems.push({
      data: { itemType: 'looseTray', item: tray, originalWidth: dims.width, originalDepth: dims.depth },
      width: dims.width,
      depth: dims.depth
    });
  }

  // Try bin packing
  const packResult = packItems(packingItems, gameContainerWidth, gameContainerDepth);

  // Convert packing result to layer placements
  const convertToPlacement = (result: typeof packResult) => {
    if (!result) return null;

    const boxPlacements: BoxPlacement[] = [];
    const looseTrayPlacements: LooseTrayPlacement[] = [];

    for (const packed of result.items) {
      const { data, x, y, width, depth, rotated } = packed;

      if (data.itemType === 'box') {
        boxPlacements.push({
          box: data.item as Box,
          dimensions: { width, depth, height: layerHeight },
          x,
          y,
          rotation: rotated ? 90 : 0
        });
      } else {
        looseTrayPlacements.push({
          tray: data.item as Tray,
          dimensions: { width, depth, height: layerHeight },
          x,
          y,
          rotation: rotated ? 90 : 0
        });
      }
    }

    return {
      boxes: boxPlacements,
      looseTrays: looseTrayPlacements,
      layerHeight,
      totalWidth: result.totalWidth,
      totalDepth: result.totalDepth
    };
  };

  // Use packing result if successful
  const placement = convertToPlacement(packResult);
  if (placement) return placement;

  // Fallback: stack vertically
  const fallback = stackItemsVertically(packingItems);
  const fallbackPlacement = convertToPlacement(fallback);
  return (
    fallbackPlacement || {
      boxes: [],
      looseTrays: [],
      layerHeight,
      totalWidth: 0,
      totalDepth: 0
    }
  );
}

/**
 * Convert layer arrangement to manual placements for saving
 */
export function arrangementToManualPlacements(arrangement: LayerArrangement): {
  boxes: ManualBoxPlacement[];
  looseTrays: ManualLooseTrayPlacement[];
} {
  const boxes: ManualBoxPlacement[] = arrangement.boxes.map((p) => ({
    boxId: p.box.id,
    x: p.x,
    y: p.y,
    rotation: p.rotation
  }));

  const looseTrays: ManualLooseTrayPlacement[] = arrangement.looseTrays.map((p) => ({
    trayId: p.tray.id,
    x: p.x,
    y: p.y,
    rotation: p.rotation
  }));

  return { boxes, looseTrays };
}
