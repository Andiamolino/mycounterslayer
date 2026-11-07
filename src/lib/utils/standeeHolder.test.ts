import { describe, it, expect } from 'vitest';
import {
  STANDEE_HOLDER_DEFAULTS,
  STANDEE_HOLDER_FIELDS,
  normalizeAngleToFloor,
  normalizeBarPosition,
  normalizeSlotClearance,
  normalizeStandeeArrangement,
  resolveBarCenters,
  resolveStandeeHolder
} from './standeeHolder.js';
import { migrateProjectData } from '#lib/utils/storage.js';
import { startProject, viaFile } from '#lib/utils/partTestFixtures.js';
import type { Standee } from '#lib/types/project.js';

const baseStandee: Standee = {
  id: 's1',
  name: 'S',
  baseRadius: 10,
  baseThickness: 2,
  standeeHeight: 50,
  standeeWidth: 30,
  standeeThickness: 2
};

describe('normalizers', () => {
  it.each([
    ['alternating', 'alternating'],
    ['oneSided', 'oneSided'],
    ['other', undefined],
    [1, undefined],
    [null, undefined]
  ])('arrangement %s -> %s', (input, expected) => {
    expect(normalizeStandeeArrangement(input)).toBe(expected);
  });

  it.each([
    [70, 70],
    [45, 45],
    [90, 90],
    [30, 45],
    [100, 90],
    ['70', undefined],
    [NaN, undefined],
    [Infinity, undefined],
    [-1, 45],
    [null, undefined]
  ])('angleToFloor %s -> %s', (input, expected) => {
    expect(normalizeAngleToFloor(input)).toBe(expected);
  });

  it.each([
    [1, 1],
    [0, 0],
    [2.5, 2.5],
    [-1, undefined],
    ['1', undefined],
    [NaN, undefined],
    [null, undefined]
  ])('slotClearance %s -> %s', (input, expected) => {
    expect(normalizeSlotClearance(input)).toBe(expected);
  });

  it.each([
    [25, 25],
    [0, 0],
    [50, 50],
    [-5, 0],
    [60, 50],
    ['25', undefined],
    [NaN, undefined],
    [null, undefined]
  ])('barPosition %s -> %s', (input, expected) => {
    expect(normalizeBarPosition(input)).toBe(expected);
  });
});

describe('resolveStandeeHolder', () => {
  it('defaults for a standee without holder fields', () => {
    const holder = resolveStandeeHolder(baseStandee);
    expect(holder).toMatchObject(STANDEE_HOLDER_DEFAULTS);
    expect(holder.slotWidth).toBe(baseStandee.standeeThickness + 1);
  });

  it('tiltFromVertical at 70 degrees is bit-identical to the old constant', () => {
    expect(resolveStandeeHolder(baseStandee).tiltFromVertical).toBe((20 * Math.PI) / 180);
  });

  it('uses valid values and falls back for invalid ones', () => {
    const holder = resolveStandeeHolder({
      ...baseStandee,
      arrangement: 'oneSided',
      angleToFloor: 90,
      slotClearance: 0,
      barPositionLeft: 10,
      barPositionRight: NaN
    });
    expect(holder).toMatchObject({ arrangement: 'oneSided', angleToFloor: 90, slotClearance: 0, barPositionLeft: 10, barPositionRight: 25 });
    expect(holder.tiltFromVertical).toBe(0);
    expect(holder.slotWidth).toBe(2);
  });
});

describe('resolveBarCenters', () => {
  const holder = (barPositionLeft: number, barPositionRight: number) => ({ barPositionLeft, barPositionRight });

  it('default 25 % / 25 % on W=100: centres 25 and 75', () => {
    expect(resolveBarCenters(100, 2, holder(25, 25))).toEqual({ left: 25, right: 75 });
  });

  it('0 %: bar centres move in so the bars do not protrude', () => {
    expect(resolveBarCenters(100, 2, holder(0, 0))).toEqual({ left: 1, right: 99 });
  });

  it('50 % / 50 %: flush in the middle, gap 0', () => {
    expect(resolveBarCenters(100, 2, holder(50, 50))).toEqual({ left: 49, right: 51 });
  });

  it('W=1 mm: no NaN, not negative, inside [0, W]', () => {
    for (const [l, r] of [[25, 25], [0, 0], [50, 50]]) {
      const { left, right } = resolveBarCenters(1, 2, holder(l, r));
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(1);
      expect(right).toBeGreaterThanOrEqual(left);
    }
  });

  it('W < 2*iw: bars flush in the middle', () => {
    expect(resolveBarCenters(3, 2, holder(25, 25))).toEqual({ left: 0.5, right: 2.5 });
  });

  it.each([[NaN, 2], [0, 2], [-5, 2], [100, NaN]])('degenerate input W=%s iw=%s is finite', (w, iw) => {
    const { left, right } = resolveBarCenters(w, iw, holder(25, 25));
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(right)).toBe(true);
    expect(left).toBeGreaterThanOrEqual(0);
  });
});

describe('standee holder fields in migrateProjectData', () => {
  function rawWithStandee(extra: Record<string, unknown>): any {
    const raw = viaFile(startProject());
    raw.standees = [{ ...baseStandee, ...extra }];
    return raw;
  }
  const migratedStandee = (extra: Record<string, unknown>) =>
    migrateProjectData(rawWithStandee(extra)).standees.find((s) => s.id === 's1') as unknown as Record<string, unknown>;

  it('project without the new fields stays JSON-identical', () => {
    const raw = rawWithStandee({});
    const before = JSON.stringify(raw.standees[0]);
    expect(JSON.stringify(migrateProjectData(raw).standees.find((s) => s.id === 's1'))).toBe(before);
  });

  it('keeps valid values', () => {
    const valid = { arrangement: 'oneSided', angleToFloor: 80, slotClearance: 0.5, barPositionLeft: 10, barPositionRight: 40 };
    expect(migratedStandee(valid)).toMatchObject(valid);
  });

  it.each([
    ['angleToFloor', 30, 45],
    ['angleToFloor', 100, 90],
    ['barPositionLeft', -5, 0],
    ['barPositionRight', 60, 50]
  ])('clamps %s %s -> %s', (key, input, expected) => {
    expect(migratedStandee({ [key]: input })[key]).toBe(expected);
  });

  it.each(STANDEE_HOLDER_FIELDS.map(([key]) => key))('removes the invalid value of %s', (key) => {
    for (const bad of ['70', NaN, null, {}]) {
      expect(key in migratedStandee({ [key]: bad })).toBe(false);
    }
  });

  it('is idempotent', () => {
    const once = migrateProjectData(rawWithStandee({ angleToFloor: 30, slotClearance: -1, arrangement: 'oneSided' }));
    const twice = migrateProjectData(JSON.parse(JSON.stringify(once)));
    expect(twice.standees).toEqual(once.standees);
  });
});
