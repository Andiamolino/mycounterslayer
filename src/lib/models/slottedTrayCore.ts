import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';
import type { CounterStack } from './counterTray';

const { cuboid } = jscad.primitives;
const { subtract } = jscad.booleans;
const { translate, rotateX } = jscad.transforms;

// Shared geometry/layout core of the slotted trays (standee tray, tile tray).

// Clearance (mm) kept between neighbouring elements in the depth direction, on top of the geometric
// minimum, so staggered rows never touch.
export const HOLDER_ELEMENT_GAP = 2;
// The slot starts this far below the floor / ends this far above the bar top (mm), so the angled
// cut leaves no sliver and the slot stays open at the top.
export const SLOT_BELOW_FLOOR = 4;
export const SLOT_ABOVE_BAR = 1;

/** Editable parameters every slotted tray (standee tray, tile tray) has in common. */
export interface SlottedTrayCommonParams {
  count: number; // Total number of elements stored
  wallThickness: number; // Outer wall + floor wall thickness
  innerWallThickness: number; // Thickness of the slotted inner walls / bars
  floorThickness: number;
  clearance: number; // Tolerance around the elements
  rimHeight: number; // Extra height above the tallest content
  trayWidthOverride: number | null; // null = auto; acts as a minimum, content is centred
  trayDepthOverride: number | null; // null = auto; acts as a minimum, content is centred
}

/**
 * One placed element for the 3D content preview (standee with base disc, or base-less tile): a
 * rectangular figure perpendicular to the base, leaning by the slot angle. Positions are in the
 * model's Z-up coordinates (x = width, y = depth, z = height).
 */
export interface HolderElementPosition {
  x: number; // base disc centre (against the side wall); base-less: left element edge
  y: number; // slot position along the depth
  z: number; // figure axis height (disc centre)
  figureDir: number; // +1 / -1: the X direction the figure points (toward the centre)
  tilt: number; // signed lean angle (radians)
  baseRadius: number;
  baseThickness: number;
  figureWidth: number; // vertical extent of the figure
  figureLength: number; // length the figure reaches inward (along X)
  figureThickness: number;
}

/**
 * Preview stacks for the placed elements of a slotted tray (standee, tile): each element is a round
 * base disc with a perpendicular rectangle, leaning in its slot. Base-less elements (radius/thickness 0)
 * show only the leaning rectangle. The label names the element in the preview.
 */
export function holderElementStacks(placed: HolderElementPosition[], label: string): CounterStack[] {
  return placed.map((s) => ({
    shape: 'custom' as const,
    customShapeName: label,
    customBaseShape: 'rectangle' as const,
    x: s.x,
    y: s.y,
    z: s.z,
    width: s.figureWidth,
    length: s.figureLength,
    thickness: s.figureThickness,
    count: 1,
    hexPointyTop: false,
    color: '#c9a36a',
    isHolderElement: true,
    holderBaseRadius: s.baseRadius,
    holderBaseThickness: s.baseThickness,
    holderFigureDir: s.figureDir,
    holderTilt: s.tilt
  }));
}

/** A size override is a minimum: values below the automatic size are ignored; null = automatic. */
export function applySizeOverride(auto: number, override: number | null): number {
  return override != null ? Math.max(override, auto) : auto;
}

export interface SlottedTrayHeights {
  trayHeight: number; // outer height incl. any floor spacer
  lift: number; // how far the stretched tray raises the floor (and everything resting on it)
  floorRefZ: number; // top of the (raised) solid floor the elements rest on
  innerWallTopZ: number; // top of the inner walls/slots (the rim)
  naturalTrayHeight: number; // height the content + rim need on their own
}

/**
 * Vertical layout (Z). The natural height is the content top plus the rim, measured from a floor at
 * floorThickness. A taller target raises the rim to targetHeight, a floor spacer adds on top (same
 * order as the counter tray so the box's height normalisation lines up). The stretched tray raises
 * the floor by `lift` with a solid spacer, so the elements sit up near the rim; the cavity above
 * stays the natural size.
 */
export function resolveSlottedTrayHeights(input: {
  floorThickness: number;
  rimHeight: number;
  contentTopZ: number; // top of the content measured from a floor at floorThickness
  targetHeight?: number;
  floorSpacerHeight?: number;
}): SlottedTrayHeights {
  const { floorThickness, rimHeight, contentTopZ, targetHeight, floorSpacerHeight } = input;
  const spacerHeight = floorSpacerHeight ?? 0;
  const naturalTrayHeight = contentTopZ + rimHeight;
  const trayHeightWithoutSpacer = targetHeight && targetHeight > naturalTrayHeight ? targetHeight : naturalTrayHeight;
  const trayHeight = trayHeightWithoutSpacer + spacerHeight;
  const lift = trayHeight - naturalTrayHeight;
  return {
    trayHeight,
    lift,
    floorRefZ: floorThickness + lift,
    innerWallTopZ: naturalTrayHeight + lift,
    naturalTrayHeight
  };
}

/**
 * Open-top box (floor + 4 outer walls). The cavity spans the whole interior and starts at
 * floorRefZ, which is raised above the real floor when the tray is stretched taller.
 */
export function createOpenTrayBox(
  width: number,
  depth: number,
  height: number,
  wallThickness: number,
  floorRefZ: number
): Geom3 {
  const cavityHeight = height - floorRefZ;
  const innerCavityDepth = depth - wallThickness * 2;
  const outerBox = translate([width / 2, depth / 2, height / 2], cuboid({ size: [width, depth, height] }));
  const innerCavity = translate(
    [width / 2, depth / 2, floorRefZ + cavityHeight / 2 + 0.1],
    cuboid({ size: [width - wallThickness * 2, innerCavityDepth, cavityHeight + 0.2] })
  );
  return subtract(outerBox, innerCavity);
}

export interface SlottedWallParams {
  innerWallThickness: number;
  trayDepth: number;
  wallThickness: number; // outer wall thickness; the inner wall spans the interior depth
  floorRefZ: number;
  wallHeight: number; // height of the inner wall above floorRefZ
}

export interface SlotParams {
  pivotZ: number; // Z the slot tilt pivots about
  tilt: number; // lean from vertical (radians)
  slotWidth: number;
  slotBottomZ: number; // lowest Z the slot reaches
  slotTopZ: number; // top of the slot (above the rim so it stays open for inserting)
}

/**
 * One inner wall spanning the depth, with angled slots cut from the wall ALONE (the caller unions
 * the walls onto the box afterwards, so a full-depth cut never touches the floor).
 * A slot is a channel that pierces the wall across its thickness (X), narrow along the wall (Y).
 * It is rotated by the tilt about the X axis, pivoting about pivotZ so the slot stays centred on
 * the slot's Y at that height.
 */
export function buildSlottedWall(
  frontFaceX: number,
  slotYs: number[],
  wallParams: SlottedWallParams,
  slotParams: SlotParams
): Geom3 {
  const { innerWallThickness, trayDepth, wallThickness, floorRefZ, wallHeight } = wallParams;
  const { pivotZ, tilt, slotWidth, slotBottomZ, slotTopZ } = slotParams;
  const innerCavityDepth = trayDepth - wallThickness * 2;
  const lengthBelow = (pivotZ - slotBottomZ) / Math.cos(tilt); // along the tilted bar, below the pivot
  const lengthAbove = (slotTopZ - pivotZ) / Math.cos(tilt); // above the pivot
  const slotThrough = innerWallThickness * 6; // generous so the angled cut always pierces fully

  const makeInnerWall = (): Geom3 =>
    translate(
      [frontFaceX + innerWallThickness / 2, trayDepth / 2, floorRefZ + wallHeight / 2],
      cuboid({ size: [innerWallThickness, innerCavityDepth, wallHeight] })
    );

  const makeSlot = (centerX: number, centerY: number): Geom3 => {
    const barLen = lengthBelow + lengthAbove;
    const barZShift = barLen / 2 - lengthBelow; // moves the pivot to the bar's origin
    let s: Geom3 = cuboid({ size: [slotThrough, slotWidth, barLen] });
    s = translate([0, 0, barZShift], s); // pivot now at the origin
    s = rotateX(tilt, s); // pivot the tilt about the pivot height
    s = translate([centerX, centerY, pivotZ], s);
    return s;
  };

  let wall = makeInnerWall();
  const centerX = frontFaceX + innerWallThickness / 2;
  const slots = slotYs.map((y) => makeSlot(centerX, y));
  if (slots.length > 0) wall = subtract(wall, ...slots);
  return wall;
}
