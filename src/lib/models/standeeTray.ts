import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { union } = jscad.booleans;

// Import types from project
import type { Standee } from '#lib/types/project.js';
import { findDefinition } from '#lib/utils/findDefinition.js';
import { resolveStandeeHolder } from '#lib/utils/standeeHolder.js';
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

export interface StandeeTrayParams extends SlottedTrayCommonParams {
  standeeId: string; // Reference to a Standee by ID
}

export const defaultStandeeTrayParams: StandeeTrayParams = {
  standeeId: '', // Filled in with the first available standee at creation time
  count: 12,
  wallThickness: 2.0,
  innerWallThickness: 2.0,
  floorThickness: 2.0,
  clearance: 0.5,
  rimHeight: 2.0,
  trayWidthOverride: null,
  trayDepthOverride: null
};

// Helper to get a standee from the global standees by ID.
// Falls back to matching by name, then first available, then a minimal default.
export function getStandee(standeeId: string, standees: Standee[]): Standee {
  return findDefinition(standees, standeeId, {
    label: 'Standee',
    nameFallback: true,
    fallback: {
      id: 'default',
      name: 'Default',
      baseRadius: 9,
      baseThickness: 3,
      standeeHeight: 40,
      standeeWidth: 25,
      standeeThickness: 1.5
    }
  });
}

/**
 * Number of standees per row: two rows (the extra one on the left for odd counts).
 * A non-finite or negative count gives 0, so depth is never NaN.
 */
export function getStandeeRowCounts(count: number): [number, number] {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return [Math.ceil(n / 2), Math.floor(n / 2)];
}

// One inner wall: X of its front face and the Y of every slot (single source for geometry and preview).
interface StandeeWall {
  frontFaceX: number;
  slotYs: number[];
}

// Shared layout math so dimensions and geometry stay in sync.
interface StandeeLayout {
  trayWidth: number;
  trayDepth: number;
  trayHeight: number;
  floorRefZ: number; // top of the (raised) solid floor the standees rest on
  innerWallTopZ: number; // top of the inner walls/slots (the rim); the walls run up from floorRefZ
  innerWallThickness: number;
  // Inner walls. The left wall is anchored to the left outer wall and the right wall to the right
  // outer wall, so a custom width grows the middle cavity between them.
  walls: StandeeWall[];
  wallHeight: number; // height of the inner walls/bars above floorRefZ
  slotWidth: number;
  pivotZ: number; // Z the slot tilt pivots about
  tilt: number; // slot lean from vertical (radians)
  // Slot vertical geometry (Z)
  axisZ: number; // figure centre height — the slot pivots about this so the base stays aligned
  slotBottomZ: number; // lowest Z the slot reaches (below the floor when it cuts all the way through)
  slotTopZ: number; // top of the slot (above the rim so it is open for inserting the standee)
  outerCavityWidth: number;
  middleCavityWidth: number;
  baseRadius: number;
  baseDiameter: number;
}

function slotRowYs(rowCount: number, firstSlotY: number, yOffset: number, slotPitch: number): number[] {
  return Array.from({ length: rowCount }, (_, i) => firstSlotY + yOffset + i * slotPitch);
}

function computeLayout(
  params: StandeeTrayParams,
  standee: Standee,
  targetHeight?: number,
  floorSpacerHeight?: number
): StandeeLayout {
  const { wallThickness, innerWallThickness, floorThickness, clearance, rimHeight } = params;

  const { baseRadius, standeeHeight, standeeWidth } = standee;
  const baseDiameter = baseRadius * 2;
  const holder = resolveStandeeHolder(standee);
  const { slotWidth, tiltFromVertical: tilt } = holder;

  // Slots split across the two walls (left gets the extra one for odd counts).
  const [leftRowCount, rightRowCount] = getStandeeRowCounts(params.count);
  const maxRowCount = Math.max(leftRowCount, rightRowCount, 1);

  // --- Height (Z) ---
  // The base lies on its side as a vertical disc (baseDiameter tall) and the figure (standeeWidth
  // tall) is centred on the disc centre. The figure axis sits a base-radius above whatever floor the
  // standees rest on.
  // Natural height the standee + rim need on their own (measured from a floor at floorThickness). The
  // inner walls, slots and the standee spacing below are all sized from this so they never change
  // when the box stretches the tray taller — otherwise the slot sweep (and therefore the tray depth)
  // would grow with the box height and overflow the footprint the packer reserved.
  const naturalAxisZ = floorThickness + baseRadius;
  const contentTopZ = Math.max(floorThickness + baseDiameter, naturalAxisZ + standeeWidth / 2);
  // The whole standee layout — floor, inner walls, slots and figures — shifts up by `lift`; the
  // cavity above stays the natural size and the slot spacing is unchanged (it uses differences that
  // cancel the lift).
  const { trayHeight, lift, floorRefZ, innerWallTopZ } = resolveSlottedTrayHeights({
    floorThickness,
    rimHeight,
    contentTopZ,
    targetHeight,
    floorSpacerHeight
  });
  const axisZ = naturalAxisZ + lift;

  // --- Slot vertical extent (Z) ---
  // The slot holds the figure (centred on the axis) and stays open at the top of the inner wall so
  // the standee drops in. It plunges only as deep as the figure reaches: if the figure bottom is at
  // or below the (raised) floor the standee is as wide as / wider than the base, so it cuts all the
  // way through — extended a few mm below the floor so the angled cut leaves no sliver; otherwise it
  // stops at the figure bottom.
  const figureBottomZ = axisZ - standeeWidth / 2;
  const cutsThrough = figureBottomZ <= floorRefZ;
  const slotBottomZ = cutsThrough ? floorRefZ - SLOT_BELOW_FLOOR : figureBottomZ;
  const slotTopZ = innerWallTopZ + SLOT_ABOVE_BAR;

  // --- Depth (Y): one slot per standee ---
  // Both inner walls tilt their slots the SAME direction, so the standees on the two walls run
  // parallel rather than converging like a herringbone — which lets the row pitch be set by the base
  // discs (the widest part) instead of the slot's sideways sweep, packing the tray much shorter than
  // opposed slots would. The right row is then offset by HALF a pitch so its standees sit centred
  // between the left row's, so each reads clearly from above instead of hiding behind its neighbour.
  // The pitch is floored at twice the parallel-figure clearance so that half-pitch offset always
  // keeps opposing figures apart. topSweep/botSweep (the slot's sideways sweep above/below the figure
  // axis) are still used for the end margins below.
  const topSweep = (innerWallTopZ - axisZ) * Math.tan(tilt);
  const botSweep = (axisZ - floorRefZ) * Math.tan(tilt);
  const figureClearance = slotWidth + HOLDER_ELEMENT_GAP; // min offset for opposing parallel figures to clear
  const slotPitch = Math.max(baseDiameter + 1, 2 * figureClearance);
  const staggerY = slotPitch / 2; // half-pitch so the right row centres between the left row's standees

  // End margin so the end standees still slide in past the end walls. The base disc needs
  // baseRadius, and because the standee enters from the (tilted) top of the slot its base swings
  // toward the end by the slot's sweep before seating — so add that sweep on top of the radius.
  const endSweep = Math.max(topSweep, botSweep);
  const endMargin = wallThickness + clearance + baseRadius + endSweep;
  const naturalFirstSlotY = endMargin;
  const lastSlotY = endMargin + (maxRowCount - 1) * slotPitch + staggerY;
  const autoDepth = lastSlotY + baseRadius + endSweep + clearance + wallThickness;

  // --- Width (X) ---
  // The base is a thin vertical disc against the side wall, so the outer cavity only needs the base
  // thickness plus a little room (baseThickness + 5mm). The figure points inward across the inner
  // wall into the middle cavity. A lying standee's full length is baseThickness + standeeHeight, and
  // it must fit across its outer cavity plus the middle cavity (opposing rows interleave there).
  const standeeLength = standee.baseThickness + standeeHeight;
  const outerCavityWidth = standee.baseThickness + 5;
  const middleCavityWidth = Math.max(standeeLength + clearance - outerCavityWidth, outerCavityWidth);

  const leftWallX = wallThickness + outerCavityWidth;
  const naturalRightWallX = leftWallX + innerWallThickness + middleCavityWidth;
  const autoWidth = naturalRightWallX + innerWallThickness + outerCavityWidth + wallThickness;

  // --- Custom width / length override ---
  // Each override is a minimum; values below the auto size are ignored. Widening keeps the outer
  // walls and the outer cavities (where the bases sit) exactly where auto fit put them — only the
  // MIDDLE cavity grows, so the two opposing rows spread apart. Lengthening centres the slot row
  // along the depth. The outer-wall thickness never changes.
  const trayWidth = applySizeOverride(autoWidth, params.trayWidthOverride);
  const trayDepth = applySizeOverride(autoDepth, params.trayDepthOverride);
  // Left inner wall stays put; the right inner wall is anchored to the right outer wall so the middle
  // cavity absorbs the extra width.
  const rightWallX = trayWidth - wallThickness - outerCavityWidth - innerWallThickness;
  // Centre the slot row along the (possibly longer) depth.
  const firstSlotY = naturalFirstSlotY + (trayDepth - autoDepth) / 2;

  return {
    trayWidth,
    trayDepth,
    trayHeight,
    floorRefZ,
    innerWallTopZ,
    innerWallThickness,
    wallHeight: innerWallTopZ - floorRefZ,
    walls: [
      { frontFaceX: leftWallX, slotYs: slotRowYs(leftRowCount, firstSlotY, 0, slotPitch) },
      { frontFaceX: rightWallX, slotYs: slotRowYs(rightRowCount, firstSlotY, staggerY, slotPitch) }
    ],
    slotWidth,
    pivotZ: axisZ,
    tilt,
    axisZ,
    slotBottomZ,
    slotTopZ,
    outerCavityWidth,
    middleCavityWidth,
    baseRadius,
    baseDiameter
  };
}

export function getStandeeTrayDimensions(
  params: StandeeTrayParams,
  standees: Standee[]
): {
  width: number;
  depth: number;
  height: number;
} {
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee);
  return { width: layout.trayWidth, depth: layout.trayDepth, height: layout.trayHeight };
}

// Placed standee for the 3D content preview (shape shared with the tile tray)
export type StandeePosition = HolderElementPosition;

export function getStandeePositions(
  params: StandeeTrayParams,
  standees: Standee[],
  targetHeight?: number,
  floorSpacerHeight?: number
): StandeePosition[] {
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee, targetHeight, floorSpacerHeight);
  const { wallThickness } = params;
  const { baseRadius, baseThickness, standeeWidth, standeeHeight, standeeThickness } = standee;

  // Base disc sits flush against the side outer wall in its outer cavity (unchanged by a custom
  // width — only the middle cavity between the rows grows).
  const leftX = wallThickness + baseThickness / 2;
  const rightX = layout.trayWidth - wallThickness - baseThickness / 2;

  const common = {
    z: layout.axisZ,
    baseRadius,
    baseThickness,
    figureWidth: standeeWidth,
    figureLength: standeeHeight,
    figureThickness: standeeThickness
  };

  const positions: StandeePosition[] = [];
  // Both rows lean the same way (figureDir still points inward from the right wall)
  const sides = [
    { x: leftX, figureDir: 1 },
    { x: rightX, figureDir: -1 }
  ];
  layout.walls.forEach((wall, w) => {
    for (const y of wall.slotYs)
      positions.push({ ...common, x: sides[w].x, y, figureDir: sides[w].figureDir, tilt: layout.tilt });
  });
  return positions;
}

export function createStandeeTray(
  params: StandeeTrayParams,
  standees: Standee[],
  trayName?: string,
  targetHeight?: number,
  floorSpacerHeight?: number,
  showEmboss: boolean = true
): Geom3 {
  const { wallThickness, innerWallThickness } = params;
  const standee = getStandee(params.standeeId, standees);
  const layout = computeLayout(params, standee, targetHeight, floorSpacerHeight);

  const { trayWidth, trayDepth, trayHeight, floorRefZ, wallHeight } = layout;

  // Open-top box; the cavity starts at floorRefZ, which is raised above the real floor when the tray
  // is stretched taller — leaving a solid spacer below so the standees sit near the rim.
  let tray = createOpenTrayBox(trayWidth, trayDepth, trayHeight, wallThickness, floorRefZ);

  // Angled slots: the tilt PIVOTS ABOUT THE FIGURE AXIS (Z = floor + baseRadius), so the slot stays
  // centred on the standee's nominal Y at the figure's centre height — the cut reaches the right depth
  // there and the base stays aligned. The slot runs from slotBottomZ (the figure bottom, or below the
  // floor when it cuts all the way through) up to slotTopZ (above the rim, open for insertion).
  const { slotBottomZ, slotTopZ, pivotZ, tilt, slotWidth } = layout;
  const slotParams = { pivotZ, tilt, slotWidth, slotBottomZ, slotTopZ };
  const wallParams = { innerWallThickness, trayDepth, wallThickness, floorRefZ, wallHeight };

  // Both walls tilt the same way, so the standees all slant in one direction; the right row is
  // nudged by half a pitch (in its slotYs) so its figures interleave with the left row's.
  const walls = layout.walls.map((w) => buildSlottedWall(w.frontFaceX, w.slotYs, wallParams, slotParams));
  tray = union(tray, ...walls);

  if (showEmboss) tray = embossTrayName(tray, trayName, trayWidth, trayDepth, wallThickness);

  return tray;
}
