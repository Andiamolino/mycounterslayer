/**
 * Pure helpers shared by all slotted holder definitions (standee, tile): tilt angle, slot clearance,
 * bar positions. No JSCad imports. Single source of the defaults for geometry, UI, package
 * comparison and migration.
 */

export const HOLDER_DEFAULTS = {
  angleToFloor: 70,
  slotClearance: 1,
  barPositionLeft: 25,
  barPositionRight: 25
} as const;

export const MIN_ANGLE_TO_FLOOR = 45;
export const MAX_ANGLE_TO_FLOOR = 90;
export const MIN_BAR_POSITION = 0;
export const MAX_BAR_POSITION = 50;

/** Type guard for a finite number (shared by the holder normalizers and the part package validation). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Finite number clamped to [45, 90], otherwise undefined. */
export function normalizeAngleToFloor(value: unknown): number | undefined {
  return isFiniteNumber(value) ? clamp(value, MIN_ANGLE_TO_FLOOR, MAX_ANGLE_TO_FLOOR) : undefined;
}

/** Finite number >= 0, otherwise undefined. */
export function normalizeSlotClearance(value: unknown): number | undefined {
  return isFiniteNumber(value) && value >= 0 ? value : undefined;
}

/** Finite number clamped to [0, 50], otherwise undefined (one normalizer for left and right). */
export function normalizeBarPosition(value: unknown): number | undefined {
  return isFiniteNumber(value) ? clamp(value, MIN_BAR_POSITION, MAX_BAR_POSITION) : undefined;
}

/**
 * Keeps valid optional fields (normalized), drops invalid ones, leaves missing ones missing.
 * Returns a copy without added keys, so an object without the fields stays JSON-identical.
 */
export function normalizeOptionalFields<T extends object>(
  obj: T,
  fields: readonly (readonly [string, (value: unknown) => unknown])[]
): T {
  const result: Record<string, unknown> = { ...(obj as object) };
  for (const [key, normalize] of fields) {
    if (!(key in obj)) continue;
    const value = normalize((obj as object as Record<string, unknown>)[key]);
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result as T;
}

export interface ResolvedSlotGeometry {
  angleToFloor: number;
  slotClearance: number;
  slotWidth: number; // element thickness + slotClearance (mm)
  tiltFromVertical: number; // radians, 0 = upright
  angleRad: number; // angleToFloor in radians
}

/** Normalization plus defaults for the slot of an element with the given thickness. */
export function resolveSlotGeometry(
  angleToFloor: unknown,
  slotClearance: unknown,
  thickness: number
): ResolvedSlotGeometry {
  const angle = normalizeAngleToFloor(angleToFloor) ?? HOLDER_DEFAULTS.angleToFloor;
  const clearance = normalizeSlotClearance(slotClearance) ?? HOLDER_DEFAULTS.slotClearance;
  return {
    angleToFloor: angle,
    slotClearance: clearance,
    slotWidth: thickness + clearance,
    tiltFromVertical: ((90 - angle) * Math.PI) / 180,
    angleRad: (angle * Math.PI) / 180
  };
}

/**
 * Effective bar layout for a single row between two bars (centres in mm from the left edge of the element width).
 * Clamped so no bar protrudes (left >= iw/2, right <= W - iw/2) and the bars never overlap.
 * If the bars do not fit (W < 2*iw or overlapping positions) they sit flush side by side around
 * the middle with gap 0 (limited = true); they may then protrude over the element edges
 * (W < 2*iw), and for W < iw they overlap, so the shared slots stay open. Never NaN or negative.
 * gap = clear distance between the bars; limited = the saved bar positions were not applied as entered.
 */
export function resolveBarLayout(
  width: number,
  innerWallThickness: number,
  holder: { barPositionLeft: number; barPositionRight: number }
): { left: number; right: number; gap: number; limited: boolean } {
  const w = isFiniteNumber(width) && width > 0 ? width : 0;
  const iw = isFiniteNumber(innerWallThickness) && innerWallThickness > 0 ? innerWallThickness : 0;
  const wantedLeft = (holder.barPositionLeft * w) / 100;
  const wantedRight = w - (holder.barPositionRight * w) / 100;
  const left = Math.max(wantedLeft, iw / 2);
  const right = Math.min(wantedRight, w - iw / 2);
  if (right - left >= iw) {
    return { left, right, gap: right - left - iw, limited: left !== wantedLeft || right !== wantedRight };
  }
  const half = Math.min(iw, w) / 2;
  return { left: w / 2 - half, right: w / 2 + half, gap: 0, limited: true };
}

/** Effective bar centres only (see resolveBarLayout). */
export function resolveBarCenters(
  width: number,
  innerWallThickness: number,
  holder: { barPositionLeft: number; barPositionRight: number }
): { left: number; right: number } {
  const { left, right } = resolveBarLayout(width, innerWallThickness, holder);
  return { left, right };
}
