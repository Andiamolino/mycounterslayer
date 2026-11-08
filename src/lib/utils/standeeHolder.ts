/**
 * Pure helpers for the standee holder settings (arrangement on top of the shared holder settings).
 * No JSCad imports. The shared parts (tilt, clearance, bars) live in holderSettings.ts.
 */
import type { Standee, StandeeArrangement } from '#lib/types/project.js';
import {
  HOLDER_DEFAULTS,
  normalizeAngleToFloor,
  normalizeBarPosition,
  normalizeOptionalFields,
  normalizeSlotClearance,
  resolveSlotGeometry,
  type ResolvedSlotGeometry
} from '#lib/utils/holderSettings.js';

export const STANDEE_ARRANGEMENTS = ['alternating', 'oneSided'] as const;

export const STANDEE_HOLDER_DEFAULTS = {
  arrangement: 'alternating',
  ...HOLDER_DEFAULTS
} as const satisfies Pick<
  Required<Standee>,
  'arrangement' | 'angleToFloor' | 'slotClearance' | 'barPositionLeft' | 'barPositionRight'
>;

/** Returns the value if it is a known arrangement, otherwise undefined (= default). */
export function normalizeStandeeArrangement(value: unknown): StandeeArrangement | undefined {
  return (STANDEE_ARRANGEMENTS as readonly unknown[]).includes(value) ? (value as StandeeArrangement) : undefined;
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
  return normalizeOptionalFields(standee, STANDEE_HOLDER_FIELDS);
}

export interface ResolvedStandeeHolder extends ResolvedSlotGeometry {
  arrangement: StandeeArrangement;
  barPositionLeft: number;
  barPositionRight: number;
}

/** Normalization plus defaults in one place; geometry, editor and package code read the holder only through this. */
export function resolveStandeeHolder(standee: Standee): ResolvedStandeeHolder {
  const d = STANDEE_HOLDER_DEFAULTS;
  return {
    arrangement: normalizeStandeeArrangement(standee.arrangement) ?? d.arrangement,
    barPositionLeft: normalizeBarPosition(standee.barPositionLeft) ?? d.barPositionLeft,
    barPositionRight: normalizeBarPosition(standee.barPositionRight) ?? d.barPositionRight,
    ...resolveSlotGeometry(standee.angleToFloor, standee.slotClearance, standee.standeeThickness)
  };
}
