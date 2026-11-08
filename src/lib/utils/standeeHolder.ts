/**
 * Pure helpers for the standee holder settings (tilt and slot clearance on top of the shared holder settings).
 * No JSCad imports. The shared parts live in holderSettings.ts.
 */
import type { Standee } from '#lib/types/project.js';
import {
  HOLDER_DEFAULTS,
  normalizeAngleToFloor,
  normalizeOptionalFields,
  normalizeSlotClearance,
  resolveSlotGeometry,
  type ResolvedSlotGeometry
} from '#lib/utils/holderSettings.js';

export const STANDEE_HOLDER_DEFAULTS = {
  angleToFloor: HOLDER_DEFAULTS.angleToFloor,
  slotClearance: HOLDER_DEFAULTS.slotClearance
} as const satisfies Pick<Required<Standee>, 'angleToFloor' | 'slotClearance'>;

/** Optional holder fields of a standee with their normalizers (one list for edits and later consumers). */
export const STANDEE_HOLDER_FIELDS = [
  ['angleToFloor', normalizeAngleToFloor],
  ['slotClearance', normalizeSlotClearance]
] as const;

/**
 * Keeps valid holder fields (normalized), drops invalid ones, leaves missing ones missing.
 * Returns a copy without added keys, so a project without the fields stays JSON-identical.
 * Unknown legacy keys (arrangement, barPosition*) are left untouched and ignored (no migration).
 */
export function normalizeStandeeHolderFields<T extends Standee>(standee: T): T {
  return normalizeOptionalFields(standee, STANDEE_HOLDER_FIELDS);
}

export type ResolvedStandeeHolder = ResolvedSlotGeometry;

/** Normalization plus defaults in one place; geometry, editor and package code read the holder only through this. */
export function resolveStandeeHolder(standee: Standee): ResolvedStandeeHolder {
  return resolveSlotGeometry(standee.angleToFloor, standee.slotClearance, standee.standeeThickness);
}
