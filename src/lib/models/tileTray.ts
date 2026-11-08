import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { union } = jscad.booleans;

import type { Tile } from '#lib/types/project.js';
import { findDefinition } from '#lib/utils/findDefinition.js';
import { resolveBarCenters } from '#lib/utils/holderSettings.js';
import { resolveTileHolder } from '#lib/utils/tileHolder.js';
import {
  applySizeOverride,
  buildSlottedWall,
  createOpenTrayBox,
  HOLDER_ELEMENT_GAP,
  resolveSlottedTrayHeights,
  SLOT_ABOVE_BAR,
  SLOT_BELOW_FLOOR,
  type HolderElementPosition,
  type SlottedTrayCommonParams
} from './slottedTrayCore.js';
import { embossTrayName } from './trayEmboss.js';

// Automatic bar height is a third of the standing height, but at least this much (mm) so a small
// tile still has a grip.
const MIN_AUTO_SLOT_WALL_HEIGHT = 10;

export interface TileTrayParams extends SlottedTrayCommonParams {
  tileId: string; // Reference to a Tile by ID
  slotWallHeight: number | null; // null = auto; height of the slotted bars
}

export const defaultTileTrayParams: TileTrayParams = {
  tileId: '', // Filled in with the first available tile at creation time
  count: 12,
  wallThickness: 2.0,
  innerWallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 0.5,
  rimHeight: 2.0,
  trayWidthOverride: null,
  trayDepthOverride: null,
  slotWallHeight: null
};

// Geometry used when no tile exists at all (empty list); the project's default tile uses the same values.
export const DEFAULT_TILE_GEOMETRY: Tile = {
  id: 'tile-standard',
  name: 'Standard',
  width: 50,
  height: 50,
  thickness: 2
};

// Looks up a tile by ID only (no name fallback). Unknown ID -> first tile -> minimal default.
export function getTile(tileId: string, tiles: Tile[]): Tile {
  return findDefinition(tiles, tileId, { label: 'Tile', nameFallback: false, fallback: DEFAULT_TILE_GEOMETRY });
}

/** Standing height of a leaning tile incl. its lower corner (H sin a + t cos a); also the bar height limit. */
export function getTileStandingHeight(tile: Tile, angleRad: number): number {
  return tile.height * Math.sin(angleRad) + tile.thickness * Math.cos(angleRad);
}

// Single row; a non-finite or negative count gives 0, so depth is never NaN.
function tileRowCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

// Shared layout math so dimensions, positions and geometry stay in sync.
interface TileLayout {
  trayWidth: number;
  trayDepth: number;
  trayHeight: number;
  floorRefZ: number; // top of the (raised) solid floor the tiles rest on
  innerWallTopZ: number;
  slotYs: number[]; // where each slot's centre line meets the floor
  barFrontFaceXs: number[]; // X of the front face of each bar
  wallHeight: number; // height of the bars above floorRefZ
  tileLeftX: number; // X of the left tile edge (tile centred in the tray)
  slotWidth: number;
  tilt: number; // slot lean from vertical (radians)
  slotBottomZ: number;
  slotTopZ: number;
}

/**
 * One row of tiles (no base) leaning in two parallel slotted bars that run along the depth.
 * Slots lean toward the front (-Y) when going up, like the preview.
 */
function computeLayout(
  params: TileTrayParams,
  tile: Tile,
  targetHeight?: number,
  floorSpacerHeight?: number
): TileLayout {
  const { wallThickness, innerWallThickness, floorThickness, clearance, rimHeight } = params;
  const { width, height } = tile;
  const holder = resolveTileHolder(tile);
  const { slotWidth, tiltFromVertical: tilt, angleRad } = holder;
  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);
  const hUp = getTileStandingHeight(tile, angleRad);

  // --- Height (Z) ---
  // Natural height from a floor at floorThickness; a taller box lifts the whole layout (floor spacer).
  const { trayHeight, floorRefZ, innerWallTopZ } = resolveSlottedTrayHeights({
    floorThickness,
    rimHeight,
    contentTopZ: floorThickness + hUp,
    targetHeight,
    floorSpacerHeight
  });

  // Bar height: automatic = a third of the standing height (at least 10 mm), an override is kept
  // within [1 mm, standing height]; a non-finite/non-positive override counts as auto.
  const override = params.slotWallHeight;
  const wallHeight =
    override != null && Number.isFinite(override) && override > 0
      ? Math.min(hUp, Math.max(Math.min(1, hUp), override))
      : Math.min(hUp, Math.max(MIN_AUTO_SLOT_WALL_HEIGHT, hUp / 3));

  // --- Depth (Y) ---
  // Parallel tiles are slotWidth + gap apart measured across them, i.e. that / sin(angle) along Y.
  // The tile leans toward the front, so the front margin holds its horizontal reach (H cos a) and the
  // back margin only its thickness.
  const rowCount = tileRowCount(params.count);
  const pitch = (slotWidth + HOLDER_ELEMENT_GAP) / sinA;
  const halfSlotY = slotWidth / (2 * sinA);
  const frontMargin = wallThickness + clearance + height * cosA + halfSlotY;
  const backMargin = wallThickness + clearance + halfSlotY;
  const autoDepth = frontMargin + backMargin + Math.max(rowCount - 1, 0) * pitch;
  const trayDepth = applySizeOverride(autoDepth, params.trayDepthOverride);
  // A longer tray spreads the slots evenly over the free length (a single one is centred).
  const free = trayDepth - frontMargin - backMargin;
  const slotYs = Array.from({ length: rowCount }, (_, i) =>
    rowCount === 1 ? frontMargin + free / 2 : frontMargin + (i * free) / (rowCount - 1)
  );

  // --- Width (X) ---
  // The tile crosses both bars; an override is a minimum and keeps the tile centred.
  const trayWidth = applySizeOverride(2 * wallThickness + 2 * clearance + width, params.trayWidthOverride);
  const tileLeftX = (trayWidth - width) / 2;
  const bars = resolveBarCenters(width, innerWallThickness, holder);
  const barFrontFaceXs = [bars.left, bars.right].map((c) => tileLeftX + c - innerWallThickness / 2);

  return {
    trayWidth,
    trayDepth,
    trayHeight,
    floorRefZ,
    innerWallTopZ,
    slotYs,
    barFrontFaceXs,
    wallHeight,
    tileLeftX,
    slotWidth,
    tilt,
    // Through to the floor level (the bars are cut alone, the floor stays intact)
    slotBottomZ: floorRefZ - SLOT_BELOW_FLOOR,
    slotTopZ: floorRefZ + wallHeight + SLOT_ABOVE_BAR
  };
}

export function getTileTrayDimensions(
  params: TileTrayParams,
  tiles: Tile[]
): {
  width: number;
  depth: number;
  height: number;
} {
  const layout = computeLayout(params, getTile(params.tileId, tiles));
  return { width: layout.trayWidth, depth: layout.trayDepth, height: layout.trayHeight };
}

/** Automatic height of the slotted bars, ignoring any slotWallHeight override; used as the editor placeholder. */
export function getTileAutoSlotWallHeight(params: TileTrayParams, tiles: Tile[]): number {
  return computeLayout({ ...params, slotWallHeight: null }, getTile(params.tileId, tiles)).wallHeight;
}

export function getTilePositions(
  params: TileTrayParams,
  tiles: Tile[],
  targetHeight?: number,
  floorSpacerHeight?: number
): HolderElementPosition[] {
  const tile = getTile(params.tileId, tiles);
  const layout = computeLayout(params, tile, targetHeight, floorSpacerHeight);
  const { width, height, thickness } = tile;

  // No base: x is the left tile edge, the tile (W along X, H up the slope, t thick) leans along its
  // slot's centre line, which meets the floor at the slot Y. The tile rests on its lowest corner: it
  // is shifted (t/2)*tan(tilt) up the slot line so its deepest corner touches the floor; the centre
  // then lies H/2 further up along the slot line.
  const { tilt, floorRefZ } = layout;
  const slopeShift = (thickness / 2) * Math.tan(tilt) + height / 2; // centre distance along the slot line
  return layout.slotYs.map((slotY) => ({
    x: layout.tileLeftX,
    y: slotY - slopeShift * Math.sin(tilt),
    z: floorRefZ + slopeShift * Math.cos(tilt),
    figureDir: 1,
    tilt,
    baseRadius: 0,
    baseThickness: 0,
    figureWidth: height,
    figureLength: width,
    figureThickness: thickness
  }));
}

export function createTileTray(
  params: TileTrayParams,
  tiles: Tile[],
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, innerWallThickness } = params;
  const layout = computeLayout(params, getTile(params.tileId, tiles), targetHeight, floorSpacerHeight);
  const { trayWidth, trayDepth, trayHeight, floorRefZ, wallHeight, slotYs } = layout;

  // Open-top box; the cavity starts at floorRefZ, which is raised above the real floor when the tray
  // is stretched taller, leaving a solid spacer below so the tiles sit near the rim.
  let tray = createOpenTrayBox(trayWidth, trayDepth, trayHeight, wallThickness, floorRefZ);

  // The tilt pivots about the floor level, so each slot stays centred on its Y where the tile rests.
  const { slotBottomZ, slotTopZ, tilt, slotWidth } = layout;
  const slotParams = { pivotZ: floorRefZ, tilt, slotWidth, slotBottomZ, slotTopZ };
  const wallParams = { innerWallThickness, trayDepth, wallThickness, floorRefZ, wallHeight };
  const bars = layout.barFrontFaceXs.map((x) => buildSlottedWall(x, slotYs, wallParams, slotParams));
  tray = union(tray, ...bars);

  if (showEmboss) tray = embossTrayName(tray, trayName, trayWidth, trayDepth, wallThickness);

  return tray;
}
