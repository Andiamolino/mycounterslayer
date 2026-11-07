import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { cuboid } = jscad.primitives;
const { subtract, union } = jscad.booleans;
const { translate, rotateX, scale, mirrorY } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

// Import types from project
import type { Standee, StandeeArrangement } from '#lib/types/project.js';
import { resolveBarCenters, resolveStandeeHolder, type ResolvedStandeeHolder } from '#lib/utils/standeeHolder.js';

// Clearance (mm) kept between opposing standees in the depth direction, on top of the geometric
// minimum, so staggered rows never touch.
const STANDEE_GAP = 2;

// oneSided: automatic bar height is a third of the standing height, but at least this much (mm) so
// a small element still has a grip.
const MIN_AUTO_SLOT_WALL_HEIGHT = 10;
// oneSided: the slot starts this far below the floor / ends this far above the bar top (mm), so the
// angled cut leaves no sliver.
const SLOT_BELOW_FLOOR = 4;
const SLOT_ABOVE_BAR = 1;

export interface StandeeTrayParams {
  standeeId: string; // Reference to a Standee by ID
  count: number; // Total number of standees stored (two rows when alternating, one row when oneSided)
  wallThickness: number; // Outer wall + floor wall thickness
  innerWallThickness: number; // Thickness of the two slotted inner walls
  floorThickness: number;
  clearance: number; // Tolerance around standees
  rimHeight: number; // Extra height above the tallest content
  trayWidthOverride: number | null; // null = auto from standees; acts as a minimum, content is centred
  trayDepthOverride: number | null; // null = auto from standees; acts as a minimum, content is centred
  slotWallHeight: number | null; // null = auto; height of the slotted bars (oneSided only)
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
  trayDepthOverride: null,
  slotWallHeight: null
};

// Helper to get a standee from the global standees by ID.
// Falls back to matching by name, then first available, then a minimal default.
export function getStandee(standeeId: string, standees: Standee[]): Standee {
  let standee = standees.find((s) => s.id === standeeId);
  if (standee) return standee;

  standee = standees.find((s) => s.name === standeeId);
  if (standee) {
    console.warn(`Standee ID "${standeeId}" not found, matched by name instead`);
    return standee;
  }

  if (standees.length > 0) {
    console.warn(`Standee "${standeeId}" not found by ID or name, using first available standee`);
    return standees[0];
  }

  return {
    id: 'default',
    name: 'Default',
    baseRadius: 9,
    baseThickness: 3,
    standeeHeight: 40,
    standeeWidth: 25,
    standeeThickness: 1.5
  };
}

/**
 * Number of standees per row: alternating = two rows (the extra one on the left for odd counts),
 * oneSided = a single row. A non-finite or negative count gives 0, so depth is never NaN.
 */
export function getStandeeRowCounts(count: number, arrangement: StandeeArrangement): number[] {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return arrangement === 'oneSided' ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
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
  elementLeftX: number; // oneSided: X of the left element edge (element centred in the tray); 0 otherwise
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

/**
 * oneSided layout: one row of cards/tiles (no base) leaning in two parallel slotted bars that run
 * along the depth. Heights (Z) come from computeLayout; this only does width, depth, bars and slots.
 * Slots lean toward the front (-Y) when going up, like the alternating slots and the preview.
 */
function computeOneSidedLayout(
  params: StandeeTrayParams,
  standee: Standee,
  holder: ResolvedStandeeHolder,
  z: { trayHeight: number; floorRefZ: number; innerWallTopZ: number; hUp: number }
): StandeeLayout {
  const { wallThickness, innerWallThickness, clearance } = params;
  const { standeeWidth, standeeHeight } = standee;
  const { slotWidth, tiltFromVertical: tilt, angleRad } = holder;
  const sinA = Math.sin(angleRad);
  const cosA = Math.cos(angleRad);

  // Bar height: automatic = a third of the standing height (at least 10 mm), an override is kept
  // within [1 mm, standing height]; a non-finite/non-positive override counts as auto.
  const override = params.slotWallHeight;
  const wallHeight =
    override != null && Number.isFinite(override) && override > 0
      ? Math.min(z.hUp, Math.max(Math.min(1, z.hUp), override))
      : Math.min(z.hUp, Math.max(MIN_AUTO_SLOT_WALL_HEIGHT, z.hUp / 3));

  // --- Depth (Y) ---
  // Parallel elements are slotWidth + gap apart measured across them, i.e. that / sin(angle) along Y.
  // slotYs are where each slot's centre line meets the floor; the element leans toward the front, so
  // the front margin holds its horizontal reach (H cos a) and the back margin only its thickness.
  const [rowCount] = getStandeeRowCounts(params.count, 'oneSided');
  const pitch = (slotWidth + STANDEE_GAP) / sinA;
  const halfSlotY = slotWidth / (2 * sinA);
  const frontMargin = wallThickness + clearance + standeeHeight * cosA + halfSlotY;
  const backMargin = wallThickness + clearance + halfSlotY;
  const autoDepth = frontMargin + backMargin + Math.max(rowCount - 1, 0) * pitch;
  const trayDepth = params.trayDepthOverride != null ? Math.max(params.trayDepthOverride, autoDepth) : autoDepth;
  // A longer tray spreads the slots evenly over the free length (a single one is centred).
  const free = trayDepth - frontMargin - backMargin;
  const slotYs = Array.from({ length: rowCount }, (_, i) =>
    rowCount === 1 ? frontMargin + free / 2 : frontMargin + (i * free) / (rowCount - 1)
  );

  // --- Width (X) ---
  // The element crosses both bars; an override is a minimum and keeps the element centred.
  const autoWidth = 2 * wallThickness + 2 * clearance + standeeWidth;
  const trayWidth = params.trayWidthOverride != null ? Math.max(params.trayWidthOverride, autoWidth) : autoWidth;
  const elementLeftX = (trayWidth - standeeWidth) / 2;
  const bars = resolveBarCenters(standeeWidth, innerWallThickness, holder);
  const frontFaceXs = [bars.left, bars.right].map((c) => elementLeftX + c - innerWallThickness / 2);

  return {
    trayWidth,
    trayDepth,
    trayHeight: z.trayHeight,
    floorRefZ: z.floorRefZ,
    innerWallTopZ: z.innerWallTopZ,
    innerWallThickness,
    walls: frontFaceXs.map((frontFaceX) => ({ frontFaceX, slotYs })),
    wallHeight,
    elementLeftX,
    slotWidth,
    pivotZ: z.floorRefZ,
    tilt,
    axisZ: z.floorRefZ,
    // Through to the floor level (the bars are cut alone, the floor stays intact)
    slotBottomZ: z.floorRefZ - SLOT_BELOW_FLOOR,
    slotTopZ: z.floorRefZ + wallHeight + SLOT_ABOVE_BAR,
    outerCavityWidth: 0,
    middleCavityWidth: 0,
    baseRadius: 0,
    baseDiameter: 0
  };
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
  const { slotWidth, tiltFromVertical: tilt, arrangement, angleRad } = holder;
  const oneSided = arrangement === 'oneSided';
  // oneSided: standing height of the leaning element incl. its lower corner (H sin a + t cos a)
  const hUp = standeeHeight * Math.sin(angleRad) + standee.standeeThickness * Math.cos(angleRad);

  // Slots split across the two walls (left gets the extra one for odd counts).
  const [leftRowCount, rightRowCount = 0] = getStandeeRowCounts(params.count, arrangement);
  const maxRowCount = Math.max(leftRowCount, rightRowCount, 1);

  // --- Height (Z) ---
  // The base lies on its side as a vertical disc (baseDiameter tall) and the figure (standeeWidth
  // tall) is centred on the disc centre. The figure axis sits a base-radius above whatever floor the
  // standees rest on.
  const spacerHeight = floorSpacerHeight ?? 0;
  // Natural height the standee + rim need on their own (measured from a floor at floorThickness). The
  // inner walls, slots and the standee spacing below are all sized from this so they never change
  // when the box stretches the tray taller — otherwise the slot sweep (and therefore the tray depth)
  // would grow with the box height and overflow the footprint the packer reserved.
  const naturalAxisZ = floorThickness + baseRadius;
  const contentTopZ = oneSided
    ? floorThickness + hUp
    : Math.max(floorThickness + baseDiameter, naturalAxisZ + standeeWidth / 2);
  const naturalTrayHeight = contentTopZ + rimHeight;
  // Outer tray height: raise the rim to the box/layer height (targetHeight), then add any floor
  // spacer — same order as the counter tray so the box's height normalisation lines up.
  const trayHeightWithoutSpacer = targetHeight && targetHeight > naturalTrayHeight ? targetHeight : naturalTrayHeight;
  const trayHeight = trayHeightWithoutSpacer + spacerHeight;
  // When the tray is stretched taller, raise the floor with a solid spacer (like the counter tray)
  // so the standees sit up near the rim rather than buried at the bottom. The whole standee layout —
  // floor, inner walls, slots and figures — shifts up by this lift; the cavity above stays the
  // natural size and the slot spacing is unchanged (it uses differences that cancel the lift).
  const lift = trayHeight - naturalTrayHeight;
  const floorRefZ = floorThickness + lift; // top of the raised solid floor the standees rest on
  const axisZ = naturalAxisZ + lift;
  const innerWallTopZ = naturalTrayHeight + lift; // inner walls run from the raised floor to the rim
  if (oneSided) return computeOneSidedLayout(params, standee, holder, { trayHeight, floorRefZ, innerWallTopZ, hUp });

  // --- Slot vertical extent (Z) ---
  // The slot holds the figure (centred on the axis) and stays open at the top of the inner wall so
  // the standee drops in. It plunges only as deep as the figure reaches: if the figure bottom is at
  // or below the (raised) floor the standee is as wide as / wider than the base, so it cuts all the
  // way through — extended a few mm below the floor so the angled cut leaves no sliver; otherwise it
  // stops at the figure bottom.
  const figureBottomZ = axisZ - standeeWidth / 2;
  const cutsThrough = figureBottomZ <= floorRefZ;
  const slotBottomZ = cutsThrough ? floorRefZ - 4 : figureBottomZ;
  const slotTopZ = innerWallTopZ + 1;

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
  const figureClearance = slotWidth + STANDEE_GAP; // min offset for opposing parallel figures to clear
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
  const trayWidth = params.trayWidthOverride != null ? Math.max(params.trayWidthOverride, autoWidth) : autoWidth;
  const trayDepth = params.trayDepthOverride != null ? Math.max(params.trayDepthOverride, autoDepth) : autoDepth;
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
    elementLeftX: 0,
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

/** Automatic height of the slotted bars (oneSided), ignoring any slotWallHeight override; used as the editor placeholder. */
export function getStandeeAutoSlotWallHeight(params: StandeeTrayParams, standees: Standee[]): number {
  return computeLayout({ ...params, slotWallHeight: null }, getStandee(params.standeeId, standees)).wallHeight;
}

// One placed standee for the 3D content preview: a round base disc against a side wall with a
// rectangular figure perpendicular to it, leaning by the slot angle. Positions are in the model's
// Z-up coordinates (x = width, y = depth, z = height).
export interface StandeePosition {
  x: number; // base disc centre (against the side wall)
  y: number; // slot position along the depth
  z: number; // figure axis height (disc centre)
  figureDir: number; // +1 / -1: the X direction the figure points (toward the centre)
  tilt: number; // signed lean angle (radians)
  baseRadius: number;
  baseThickness: number;
  figureWidth: number; // standee width (vertical extent)
  figureLength: number; // standee height (length the figure reaches inward)
  figureThickness: number;
}

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

  if (resolveStandeeHolder(standee).arrangement === 'oneSided') {
    // No base: x is the left element edge, the element (W along X, H up the slope, t thick) leans
    // along its slot's centre line, which meets the floor at the slot Y. The element rests on its
    // lowest corner: the element is shifted (t/2)*tan(tilt) up the slot line so its deepest corner
    // touches the floor; the centre then lies H/2 further up along the slot line.
    const { tilt, floorRefZ } = layout;
    const slopeShift = (standeeThickness / 2) * Math.tan(tilt) + standeeHeight / 2; // centre distance along the slot line
    return layout.walls[0].slotYs.map((slotY) => ({
      x: layout.elementLeftX,
      y: slotY - slopeShift * Math.sin(tilt),
      z: floorRefZ + slopeShift * Math.cos(tilt),
      figureDir: 1,
      tilt,
      baseRadius: 0,
      baseThickness: 0,
      figureWidth: standeeHeight,
      figureLength: standeeWidth,
      figureThickness: standeeThickness
    }));
  }

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
  // The cavity (and the inner walls) start at floorRefZ, which is raised above the real floor when
  // the tray is stretched taller — leaving a solid spacer below so the standees sit near the rim.
  const cavityHeight = trayHeight - floorRefZ;
  // The cavity spans the whole interior (only the outer walls stay solid). A custom width just makes
  // the middle cavity wider; a custom length just makes the cavity longer.
  const innerCavityDepth = trayDepth - wallThickness * 2;

  // === OPEN-TOP BOX (floor + 4 outer walls) ===
  const outerBox = translate(
    [trayWidth / 2, trayDepth / 2, trayHeight / 2],
    cuboid({ size: [trayWidth, trayDepth, trayHeight] })
  );
  const innerCavity = translate(
    [trayWidth / 2, trayDepth / 2, floorRefZ + cavityHeight / 2 + 0.1],
    cuboid({ size: [trayWidth - wallThickness * 2, innerCavityDepth, cavityHeight + 0.2] })
  );
  let tray = subtract(outerBox, innerCavity);

  // === TWO INNER WALLS spanning the depth ===
  const makeInnerWall = (frontFaceX: number): Geom3 =>
    translate(
      [frontFaceX + innerWallThickness / 2, trayDepth / 2, floorRefZ + wallHeight / 2],
      cuboid({ size: [innerWallThickness, innerCavityDepth, wallHeight] })
    );

  // === ANGLED SLOTS ===
  // Slot: a channel that pierces the wall across its thickness (X) so the standee figure can pass
  // through, narrow along the wall (Y = figure thickness + clearance). It is rotated by the tilt
  // about the X axis so it runs diagonally on the wall's face — from lower on the wall up to the
  // top while moving along the wall's length (Y). This tilts the standee toward an end wall so it
  // resists falling out, while its base still sits flush at the side. The two walls tilt in
  // opposite directions and the rows are staggered so opposing standees interleave.
  //
  // The tilt PIVOTS ABOUT THE FIGURE AXIS (Z = floor + baseRadius), so the slot stays centred on
  // the standee's nominal Y at the figure's centre height — the cut reaches the right depth there
  // and the base stays aligned. The slot runs from slotBottomZ (the figure bottom, or below the
  // floor when it cuts all the way through) up to slotTopZ (above the rim, open for insertion).
  // Slots are cut from the walls ALONE and the walls are then unioned onto the box, so a full-depth
  // cut never touches the floor.
  const { slotBottomZ, slotTopZ, pivotZ, tilt, slotWidth } = layout;
  const slotParams = {
    pivotZ,
    tilt,
    slotWidth,
    lengthBelow: (pivotZ - slotBottomZ) / Math.cos(tilt), // along the tilted bar, below the pivot
    lengthAbove: (slotTopZ - pivotZ) / Math.cos(tilt) // above the pivot
  };
  const slotThrough = innerWallThickness * 6; // generous so the angled cut always pierces fully
  const makeSlot = (
    centerX: number,
    centerY: number,
    pivot: number,
    slotTilt: number,
    width: number,
    lengthBelow: number,
    lengthAbove: number
  ): Geom3 => {
    const barLen = lengthBelow + lengthAbove;
    const barZShift = barLen / 2 - lengthBelow; // moves the pivot to the bar's origin
    let s: Geom3 = cuboid({ size: [slotThrough, width, barLen] });
    s = translate([0, 0, barZShift], s); // pivot now at the origin
    s = rotateX(slotTilt, s); // pivot the tilt about the figure axis
    s = translate([centerX, centerY, pivot], s);
    return s;
  };

  const buildWall = (frontFaceX: number, slotYs: number[], p: typeof slotParams): Geom3 => {
    let wall = makeInnerWall(frontFaceX);
    const centerX = frontFaceX + innerWallThickness / 2;
    const slots = slotYs.map((y) => makeSlot(centerX, y, p.pivotZ, p.tilt, p.slotWidth, p.lengthBelow, p.lengthAbove));
    if (slots.length > 0) wall = subtract(wall, ...slots);
    return wall;
  };

  // Both walls tilt the same way, so the standees all slant in one direction; the right row is
  // nudged by half a pitch (in its slotYs) so its figures interleave with the left row's.
  const walls = layout.walls.map((w) => buildWall(w.frontFaceX, w.slotYs, slotParams));
  tray = union(tray, ...walls);

  // === EMBOSS TRAY NAME ON BOTTOM ===
  if (showEmboss && trayName && trayName.trim().length > 0) {
    const textDepth = 0.6;
    const strokeWidth = 1.2;
    const textHeightParam = 6;
    const margin = wallThickness * 2;

    const textSegments = vectorText({ height: textHeightParam, align: 'center' }, trayName.trim().toUpperCase());

    if (textSegments.length > 0) {
      const textShapes: ReturnType<typeof extrudeLinear>[] = [];
      for (const segment of textSegments) {
        if (segment.length >= 2) {
          const pathObj = path2.fromPoints({ closed: false }, segment);
          const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 32 }, pathObj);
          const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
          textShapes.push(extruded);
        }
      }

      if (textShapes.length > 0) {
        let minX = Infinity,
          maxX = -Infinity;
        let minY = Infinity,
          maxY = -Infinity;
        for (const segment of textSegments) {
          for (const point of segment) {
            minX = Math.min(minX, point[0]);
            maxX = Math.max(maxX, point[0]);
            minY = Math.min(minY, point[1]);
            maxY = Math.max(maxY, point[1]);
          }
        }
        const textWidthCalc = maxX - minX + strokeWidth;
        const textHeightY = maxY - minY + strokeWidth;

        const availableWidth = trayWidth - margin * 2;
        const availableDepth = trayDepth - margin * 2;
        const scaleX = Math.min(1, availableWidth / textWidthCalc);
        const scaleY = Math.min(1, availableDepth / textHeightY);
        const textScale = Math.min(scaleX, scaleY);

        const centerX = trayWidth / 2;
        const centerY = trayDepth / 2;
        const textCenterX = (minX + maxX) / 2;
        const textCenterY = (minY + maxY) / 2;

        let combinedText = union(...textShapes);
        combinedText = mirrorY(combinedText);

        const positionedText = translate(
          [centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
          scale([textScale, textScale, 1], combinedText)
        );
        tray = subtract(tray, positionedText);
      }
    }
  }

  return tray;
}
