/**
 * Pure helpers for the standee holder settings (arrangement, tilt, slot clearance, bar positions).
 * No JSCad imports. Single source of the defaults for geometry, UI, package comparison and migration.
 */
import type { Standee, StandeeArrangement } from '#lib/types/project.js';

export const STANDEE_ARRANGEMENTS = ['alternating', 'oneSided'] as const;

export const STANDEE_HOLDER_DEFAULTS = {
  arrangement: 'alternating',
  angleToFloor: 70,
  slotClearance: 1,
  barPositionLeft: 25,
  barPositionRight: 25
} as const satisfies Pick<
  Required<Standee>,
  'arrangement' | 'angleToFloor' | 'slotClearance' | 'barPositionLeft' | 'barPositionRight'
>;

export const MIN_ANGLE_TO_FLOOR = 45;
export const MAX_ANGLE_TO_FLOOR = 90;
export const MIN_BAR_POSITION = 0;
export const MAX_BAR_POSITION = 50;

/** Type guard for a finite number (shared by the holder normalizers and the part package validation). */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Returns the value if it is a known arrangement, otherwise undefined (= default). */
export function normalizeStandeeArrangement(value: unknown): StandeeArrangement | undefined {
  return (STANDEE_ARRANGEMENTS as readonly unknown[]).includes(value) ? (value as StandeeArrangement) : undefined;
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

/** Optional holder fields of a standee with their normalizers (one list for migration and later consumers). */
export const STANDEE_HOLDER_FIELDS = [
  ['arrangement', normalizeStandeeArrangement],
  ['angleToFloor', normalizeAngleToFloor],
  ['slotClearance', normalizeSlotClearance],
  ['barPositionLeft', normalizeBarPosition],
  ['barPositionRight', normalizeBarPosition]
] as const;

/**
 * Keeps valid holder fields (normalized), drops invalid ones, leaves missing ones missing.
 * Returns a copy without added keys, so a project without the fields stays JSON-identical.
 */
export function normalizeStandeeHolderFields<T extends Standee>(standee: T): T {
  const result: Record<string, unknown> = { ...(standee as object) };
  for (const [key, normalize] of STANDEE_HOLDER_FIELDS) {
    if (!(key in standee)) continue;
    const value = normalize((standee as object as Record<string, unknown>)[key]);
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result as T;
}

export interface ResolvedStandeeHolder {
  arrangement: StandeeArrangement;
  angleToFloor: number;
  slotClearance: number;
  barPositionLeft: number;
  barPositionRight: number;
  slotWidth: number; // standeeThickness + slotClearance (mm)
  tiltFromVertical: number; // radians, 0 = upright
  angleRad: number; // angleToFloor in radians
}

/** Normalization plus defaults in one place; geometry, editor and package code read the holder only through this. */
export function resolveStandeeHolder(standee: Standee): ResolvedStandeeHolder {
  const d = STANDEE_HOLDER_DEFAULTS;
  const angleToFloor = normalizeAngleToFloor(standee.angleToFloor) ?? d.angleToFloor;
  const slotClearance = normalizeSlotClearance(standee.slotClearance) ?? d.slotClearance;
  return {
    arrangement: normalizeStandeeArrangement(standee.arrangement) ?? d.arrangement,
    angleToFloor,
    slotClearance,
    barPositionLeft: normalizeBarPosition(standee.barPositionLeft) ?? d.barPositionLeft,
    barPositionRight: normalizeBarPosition(standee.barPositionRight) ?? d.barPositionRight,
    slotWidth: standee.standeeThickness + slotClearance,
    tiltFromVertical: ((90 - angleToFloor) * Math.PI) / 180,
    angleRad: (angleToFloor * Math.PI) / 180
  };
}

/**
 * Effective bar layout for oneSided (centres in mm from the left edge of the standee width).
 * Clamped so no bar protrudes (left >= iw/2, right <= W - iw/2) and the bars never overlap.
 * If the bars do not fit (W < 2*iw or overlapping positions) they sit flush side by side around
 * the middle with gap 0 (limited = true); they may then protrude over the element edges
 * (W < 2*iw), and for W < iw they overlap, so the shared slots stay open. Never NaN or negative.
 * gap = clear distance between the bars; limited = the saved bar positions were not applied as entered.
 */
export function resolveBarLayout(
  width: number,
  innerWallThickness: number,
  holder: Pick<ResolvedStandeeHolder, 'barPositionLeft' | 'barPositionRight'>
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
  holder: Pick<ResolvedStandeeHolder, 'barPositionLeft' | 'barPositionRight'>
): { left: number; right: number } {
  const { left, right } = resolveBarLayout(width, innerWallThickness, holder);
  return { left, right };
}
