import { describe, it, expect } from 'vitest';
import {
  HEIGHT_EPSILON,
  MIN_CONTAINER_HEIGHT_INPUT,
  evaluateContainerHeight,
  formatMm,
  formatMmCeil,
  normalizeContainerHeight
} from './containerHeight.js';
import { migrateProjectData } from '#lib/utils/storage.js';
import { PART_TEST_CONTAINER, startProject, viaFile } from '#lib/utils/partTestFixtures.js';

describe('normalizeContainerHeight', () => {
  it('keeps finite numbers > 0', () => {
    expect(normalizeContainerHeight(60)).toBe(60);
    expect(normalizeContainerHeight(60.5)).toBe(60.5);
  });

  it.each([0, -1, NaN, Infinity, '60', null, undefined])('rejects %s', (value) => {
    expect(normalizeContainerHeight(value)).toBeUndefined();
  });

  it('minimum input is 1 mm', () => {
    expect(MIN_CONTAINER_HEIGHT_INPUT).toBe(1);
  });
});

describe('gameContainerHeight in migrateProjectData', () => {
  function rawWith(settings: unknown): any {
    const raw = viaFile(startProject());
    if (settings === undefined) delete raw.globalSettings;
    else raw.globalSettings = settings;
    return raw;
  }

  it('keeps a valid height', () => {
    const migrated = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER, gameContainerHeight: 60 }));
    expect(migrated.globalSettings?.gameContainerHeight).toBe(60);
  });

  it.each([0, -1, '60', null])('removes the invalid height %s', (value) => {
    const migrated = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER, gameContainerHeight: value }));
    expect(migrated.globalSettings).toBeDefined();
    expect('gameContainerHeight' in migrated.globalSettings!).toBe(false);
  });

  it('project without the field gets no key', () => {
    const migrated = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER }));
    expect(JSON.stringify(migrated.globalSettings)).not.toContain('gameContainerHeight');
  });

  it('printBedSize plus height keeps the height', () => {
    const migrated = migrateProjectData(rawWith({ printBedSize: 180, gameContainerHeight: 55 }));
    expect(migrated.globalSettings).toEqual({
      gameContainerWidth: 180,
      gameContainerDepth: 180,
      gameContainerHeight: 55
    });
  });

  it('printBedSize without height gets no key', () => {
    const migrated = migrateProjectData(rawWith({ printBedSize: 180 }));
    expect('gameContainerHeight' in migrated.globalSettings!).toBe(false);
  });

  it('does not create globalSettings when there are none', () => {
    expect(migrateProjectData(rawWith(undefined)).globalSettings).toBeUndefined();
  });

  it('is idempotent', () => {
    const once = migrateProjectData(rawWith({ printBedSize: 180, gameContainerHeight: 55 }));
    const twice = migrateProjectData(JSON.parse(JSON.stringify(once)));
    expect(twice.globalSettings).toEqual(once.globalSettings);
    const bad = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER, gameContainerHeight: -3 }));
    expect(migrateProjectData(JSON.parse(JSON.stringify(bad))).globalSettings).toEqual(bad.globalSettings);
  });
});

describe('evaluateContainerHeight', () => {
  it('unset without a (valid) container height', () => {
    expect(evaluateContainerHeight({ totalHeight: 50, containerHeight: undefined })).toEqual({ status: 'unset', totalHeight: 50 });
    expect(evaluateContainerHeight({ totalHeight: 50, containerHeight: 0 }).status).toBe('unset');
  });

  it('ok with free space', () => {
    expect(evaluateContainerHeight({ totalHeight: 50, containerHeight: 60 })).toEqual({
      status: 'ok',
      totalHeight: 50,
      containerHeight: 60,
      free: 10
    });
  });

  it('equal counts as ok (free 0)', () => {
    const check = evaluateContainerHeight({ totalHeight: 60, containerHeight: 60 });
    expect(check.status).toBe('ok');
    expect(check.free).toBe(0);
  });

  it('+0.005 is still ok (float tolerance), free never negative', () => {
    const check = evaluateContainerHeight({ totalHeight: 60.005, containerHeight: 60 });
    expect(check.status).toBe('ok');
    expect(check.free).toBe(0);
    expect(HEIGHT_EPSILON).toBe(0.01);
  });

  it('+0.02 is tooTall', () => {
    const check = evaluateContainerHeight({ totalHeight: 60.02, containerHeight: 60 });
    expect(check.status).toBe('tooTall');
    expect(check.overBy).toBeCloseTo(0.02, 6);
  });

  it('lidLiftAllowance 2: inside -> lidLift with liftBy', () => {
    const check = evaluateContainerHeight({ totalHeight: 61.5, containerHeight: 60, lidLiftAllowance: 2 });
    expect(check.status).toBe('lidLift');
    expect(check.liftBy).toBeCloseTo(1.5, 6);
    expect(check.overBy).toBeUndefined();
  });

  it('lidLiftAllowance 2: exactly at the limit is lidLift', () => {
    expect(evaluateContainerHeight({ totalHeight: 62, containerHeight: 60, lidLiftAllowance: 2 }).status).toBe('lidLift');
  });

  it('lidLiftAllowance 2: beyond -> tooTall with overBy reduced by the allowance', () => {
    const check = evaluateContainerHeight({ totalHeight: 63, containerHeight: 60, lidLiftAllowance: 2 });
    expect(check.status).toBe('tooTall');
    expect(check.overBy).toBeCloseTo(1, 6);
  });

  it.each([-3, NaN, Infinity, undefined])('invalid lift %s counts as 0', (lift) => {
    expect(evaluateContainerHeight({ totalHeight: 61, containerHeight: 60, lidLiftAllowance: lift as any }).status).toBe('tooTall');
  });
});

describe('formatMm / formatMmCeil', () => {
  it('formatMm: one decimal, dot, normal rounding', () => {
    expect(formatMm(0)).toBe('0.0 mm');
    expect(formatMm(28.44)).toBe('28.4 mm');
    expect(formatMm(28.45)).toBe('28.5 mm');
    expect(formatMm(100)).toBe('100.0 mm');
    expect(formatMm(-0.01)).toBe('0.0 mm');
  });

  it('formatMmCeil (E6): a real excess is never shown as 0.0 mm', () => {
    expect(formatMmCeil(0.02)).toBe('0.1 mm');
    expect(formatMmCeil(0.011)).toBe('0.1 mm');
    expect(formatMmCeil(0.3)).toBe('0.3 mm');
    expect(formatMmCeil(0.1 + 0.2)).toBe('0.3 mm');
    expect(formatMmCeil(1.5)).toBe('1.5 mm');
  });

  it('formatMmCeil of an evaluated overBy 0.02 -> "0.1 mm"', () => {
    const check = evaluateContainerHeight({ totalHeight: 60.02, containerHeight: 60 });
    expect(formatMmCeil(check.overBy!)).toBe('0.1 mm');
  });
});
