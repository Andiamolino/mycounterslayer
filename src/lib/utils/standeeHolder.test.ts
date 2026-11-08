import type { Standee } from '#lib/types/project.js';
import { makeStandee, startProject, viaFile } from '#lib/utils/partTestFixtures.js';
import { migrateProjectData } from '#lib/utils/storage.js';
import { describe, expect, it } from 'vitest';
import {
  STANDEE_HOLDER_DEFAULTS,
  STANDEE_HOLDER_FIELDS,
  normalizeStandeeArrangement,
  resolveStandeeHolder
} from './standeeHolder.js';

const baseStandee: Standee = makeStandee();

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
    expect(holder).toMatchObject({
      arrangement: 'oneSided',
      angleToFloor: 90,
      slotClearance: 0,
      barPositionLeft: 10,
      barPositionRight: 25
    });
    expect(holder.tiltFromVertical).toBe(0);
    expect(holder.slotWidth).toBe(2);
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
    const valid = {
      arrangement: 'oneSided',
      angleToFloor: 80,
      slotClearance: 0.5,
      barPositionLeft: 10,
      barPositionRight: 40
    };
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
