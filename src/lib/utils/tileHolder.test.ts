import { resolveBarLayout } from '#lib/utils/holderSettings.js';
import { makeTile } from '#lib/utils/partTestFixtures.js';
import { describe, expect, it } from 'vitest';
import {
  TILE_HOLDER_DEFAULTS,
  TILE_HOLDER_FIELDS,
  normalizeTileHolderFields,
  resolveTileHolder
} from './tileHolder.js';

const baseTile = makeTile();

describe('resolveTileHolder', () => {
  it('defaults for a tile without holder fields', () => {
    const holder = resolveTileHolder(baseTile);
    expect(holder).toMatchObject(TILE_HOLDER_DEFAULTS);
    expect(holder.slotWidth).toBe(baseTile.thickness + 1);
  });

  it('tiltFromVertical at 70 degrees is 20 degrees in radians', () => {
    expect(resolveTileHolder(baseTile).tiltFromVertical).toBe((20 * Math.PI) / 180);
  });

  it('uses valid values and falls back for invalid ones', () => {
    const holder = resolveTileHolder({
      ...baseTile,
      angleToFloor: 90,
      slotClearance: 0,
      barPositionLeft: 10,
      barPositionRight: NaN
    });
    expect(holder).toMatchObject({ angleToFloor: 90, slotClearance: 0, barPositionLeft: 10, barPositionRight: 25 });
    expect(holder.tiltFromVertical).toBe(0);
    expect(holder.slotWidth).toBe(baseTile.thickness);
  });

  it('clamps out-of-range values', () => {
    const holder = resolveTileHolder({ ...baseTile, angleToFloor: 30, barPositionLeft: -5, barPositionRight: 60 });
    expect(holder).toMatchObject({ angleToFloor: 45, barPositionLeft: 0, barPositionRight: 50 });
  });

  it('bar positions are clamped by resolveBarLayout so the bars never protrude', () => {
    const holder = resolveTileHolder({ ...baseTile, barPositionLeft: 0, barPositionRight: 0 });
    const layout = resolveBarLayout(40, 2, holder);
    expect(layout.left).toBeCloseTo(1, 9); // iw / 2
    expect(layout.right).toBeCloseTo(39, 9); // W - iw / 2
    expect(layout.limited).toBe(true);
  });
});

describe('normalizeTileHolderFields', () => {
  it('a tile without the fields stays JSON-identical', () => {
    expect(JSON.stringify(normalizeTileHolderFields(baseTile))).toBe(JSON.stringify(baseTile));
  });

  it('keeps valid values and clamps', () => {
    const result = normalizeTileHolderFields({
      ...baseTile,
      angleToFloor: 100,
      slotClearance: 0.5,
      barPositionLeft: 10
    });
    expect(result).toMatchObject({ angleToFloor: 90, slotClearance: 0.5, barPositionLeft: 10 });
  });

  it.each(TILE_HOLDER_FIELDS.map(([key]) => key))('removes the invalid value of %s', (key) => {
    for (const bad of ['70', NaN, null, {}]) {
      expect(key in normalizeTileHolderFields({ ...baseTile, [key]: bad })).toBe(false);
    }
  });

  it('is idempotent', () => {
    const once = normalizeTileHolderFields({ ...baseTile, angleToFloor: 30, slotClearance: -1 });
    expect(normalizeTileHolderFields(once)).toEqual(once);
  });
});
