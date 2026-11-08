import { getStandeePositions, getStandeeTrayDimensions, type StandeeTrayParams } from '#lib/models/standeeTray.js';
import type { Standee } from '#lib/types/project.js';
import { firstStandeeTray, makeStandee, startProject, viaFile } from '#lib/utils/partTestFixtures.js';
import { migrateProjectData } from '#lib/utils/storage.js';
import { describe, expect, it } from 'vitest';
import { STANDEE_HOLDER_DEFAULTS, STANDEE_HOLDER_FIELDS, resolveStandeeHolder } from './standeeHolder.js';

const baseStandee: Standee = makeStandee();

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
      angleToFloor: 90,
      slotClearance: NaN
    });
    expect(holder).toMatchObject({ angleToFloor: 90, slotClearance: 1 });
    expect(holder.tiltFromVertical).toBe(0);
    expect(holder.slotWidth).toBe(baseStandee.standeeThickness + 1);
  });

  // E6: legacy one-sided fields are ignored
  it('ignores legacy arrangement / barPosition* fields', () => {
    const legacy = { ...baseStandee, arrangement: 'oneSided', barPositionLeft: 10, barPositionRight: 40 };
    const holder = resolveStandeeHolder(legacy as Standee);
    expect(holder).toEqual(resolveStandeeHolder(baseStandee));
    expect('arrangement' in holder || 'barPositionLeft' in holder).toBe(false);
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
    const valid = { angleToFloor: 80, slotClearance: 0.5 };
    expect(migratedStandee(valid)).toMatchObject(valid);
  });

  // E6: no migration, no deletion; the legacy fields stay as dead fields and the project loads
  it('loads a standee with legacy arrangement / barPosition* fields without error', () => {
    const legacy = { arrangement: 'oneSided', barPositionLeft: 10, barPositionRight: 40 };
    expect(migratedStandee(legacy)).toMatchObject(legacy);
  });

  it.each([
    ['angleToFloor', 30, 45],
    ['angleToFloor', 100, 90]
  ])('clamps %s %s -> %s', (key, input, expected) => {
    expect(migratedStandee({ [key]: input })[key]).toBe(expected);
  });

  it.each(STANDEE_HOLDER_FIELDS.map(([key]) => key))('removes the invalid value of %s', (key) => {
    for (const bad of ['70', NaN, null, {}]) {
      expect(key in migratedStandee({ [key]: bad })).toBe(false);
    }
  });

  it('is idempotent', () => {
    const once = migrateProjectData(rawWithStandee({ angleToFloor: 30, slotClearance: -1 }));
    const twice = migrateProjectData(JSON.parse(JSON.stringify(once)));
    expect(twice.standees).toEqual(once.standees);
  });
});

// E6: a project with a legacy one-sided standee and a standee tray with slotWallHeight loads and is two-row
describe('legacy one-sided project (E6)', () => {
  it('loads without error and models the standee tray as a normal (two-row) one', () => {
    const clean = viaFile(startProject());
    const cleanStandees = migrateProjectData(clean).standees;
    const cleanTray = firstStandeeTray(migrateProjectData(viaFile(startProject()))).params as StandeeTrayParams;

    const raw = viaFile(startProject());
    raw.standees = raw.standees.map((st: Standee) => ({
      ...st,
      arrangement: 'oneSided',
      barPositionLeft: 10,
      barPositionRight: 40
    }));
    const legacyTray = firstStandeeTray(raw) as unknown as { params: Record<string, unknown> };
    legacyTray.params.slotWallHeight = 5;

    const loaded = migrateProjectData(raw);
    const loadedTray = firstStandeeTray(loaded).params as StandeeTrayParams;
    expect(getStandeeTrayDimensions(loadedTray, loaded.standees)).toEqual(
      getStandeeTrayDimensions(cleanTray, cleanStandees)
    );
    expect(getStandeePositions(loadedTray, loaded.standees)).toEqual(getStandeePositions(cleanTray, cleanStandees));
    // two rows: positions on both walls
    expect(new Set(getStandeePositions(loadedTray, loaded.standees).map((p) => p.figureDir)).size).toBe(2);
  });
});
