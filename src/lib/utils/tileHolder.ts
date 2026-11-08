/**
 * Pure helpers for the tile holder settings (tilt, slot clearance, bar positions of a tile).
 * No JSCad imports. The shared parts live in holderSettings.ts.
 */
import type { Tile } from '#lib/types/project.js';
import {
  HOLDER_DEFAULTS,
  normalizeAngleToFloor,
  normalizeBarPosition,
  normalizeOptionalFields,
  normalizeSlotClearance,
  resolveSlotGeometry,
  type ResolvedSlotGeometry
} from '#lib/utils/holderSettings.js';

export const TILE_HOLDER_DEFAULTS = HOLDER_DEFAULTS satisfies Pick<
  Required<Tile>,
  'angleToFloor' | 'slotClearance' | 'barPositionLeft' | 'barPositionRight'
>;

/** Optional holder fields of a tile with their normalizers (one list for packages and later consumers). */
export const TILE_HOLDER_FIELDS = [
  ['angleToFloor', normalizeAngleToFloor],
  ['slotClearance', normalizeSlotClearance],
  ['barPositionLeft', normalizeBarPosition],
  ['barPositionRight', normalizeBarPosition]
] as const;

/**
 * Keeps valid holder fields (normalized), drops invalid ones, leaves missing ones missing.
 * Returns a copy without added keys, so a tile without the fields stays JSON-identical.
 */
export function normalizeTileHolderFields<T extends Tile>(tile: T): T {
  return normalizeOptionalFields(tile, TILE_HOLDER_FIELDS);
}

export interface ResolvedTileHolder extends ResolvedSlotGeometry {
  barPositionLeft: number;
  barPositionRight: number;
}

/** Normalization plus defaults in one place; geometry, editor and package code read the holder only through this. */
export function resolveTileHolder(tile: Tile): ResolvedTileHolder {
  const d = TILE_HOLDER_DEFAULTS;
  return {
    barPositionLeft: normalizeBarPosition(tile.barPositionLeft) ?? d.barPositionLeft,
    barPositionRight: normalizeBarPosition(tile.barPositionRight) ?? d.barPositionRight,
    ...resolveSlotGeometry(tile.angleToFloor, tile.slotClearance, tile.thickness)
  };
}
