import { describe, it, expect } from 'vitest';
import {
  HEIGHT_EPSILON,
  MIN_CONTAINER_HEIGHT_INPUT,
  evaluateContainerHeight,
  formatContainerHeightStatus,
  formatMm,
  formatMmCeil,
  getDisplayedFree,
  normalizeContainerHeight,
  normalizeLidLiftAllowance
} from './containerHeight.js';
import { migrateProjectData } from '#lib/utils/storage.js';
import { PART_TEST_CONTAINER, startProject, viaFile } from '#lib/utils/partTestFixtures.js';

describe.each([
  ['normalizeContainerHeight', normalizeContainerHeight],
  ['normalizeLidLiftAllowance', normalizeLidLiftAllowance]
] as const)('%s', (_name, normalize) => {
  it.each([60, 60.5, 1.5])('keeps %s', (value) => {
    expect(normalize(value)).toBe(value);
  });

  it.each([0, -1, NaN, Infinity, '60', null, undefined])('rejects %s', (value) => {
    expect(normalize(value)).toBeUndefined();
  });
});

describe('MIN_CONTAINER_HEIGHT_INPUT', () => {
  it('minimum input is 1 mm', () => {
    expect(MIN_CONTAINER_HEIGHT_INPUT).toBe(1);
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

  it('lidLiftAllowance 2: liftBy never exceeds the allowance (float tolerance 2.005 -> 2)', () => {
    const check = evaluateContainerHeight({ totalHeight: 62.005, containerHeight: 60, lidLiftAllowance: 2 });
    expect(check.status).toBe('lidLift');
    expect(check.liftBy).toBe(2);
    expect(formatContainerHeightStatus(check, 'full')).toContain('lid lifts by 2.0 mm');
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

describe('formatContainerHeightStatus', () => {
  const unset = evaluateContainerHeight({ totalHeight: 52.4 });
  const ok = evaluateContainerHeight({ totalHeight: 52.4, containerHeight: 60 });
  const lidLift = evaluateContainerHeight({ totalHeight: 61.2, containerHeight: 60, lidLiftAllowance: 2 });
  const tooTall = evaluateContainerHeight({ totalHeight: 65, containerHeight: 60, lidLiftAllowance: 2 });

  it('full variant (default)', () => {
    expect(formatContainerHeightStatus(unset)).toBe('Layers total: 52.4 mm');
    expect(formatContainerHeightStatus(ok, 'full')).toBe('Layers total: 52.4 mm of 60.0 mm – 7.6 mm free');
    expect(formatContainerHeightStatus(lidLift, 'full')).toBe('Layers total: 61.2 mm of 60.0 mm – lid lifts by 1.2 mm');
    expect(formatContainerHeightStatus(tooTall, 'full')).toBe('Layers total: 65.0 mm of 60.0 mm – too tall by 3.0 mm');
  });

  it('compact variant', () => {
    expect(formatContainerHeightStatus(unset, 'compact')).toBe('Total 52.4 mm');
    expect(formatContainerHeightStatus(ok, 'compact')).toBe('Total 52.4 / 60.0 mm · 7.6 mm free');
    expect(formatContainerHeightStatus(lidLift, 'compact')).toBe('Total 61.2 / 60.0 mm · lid lifts by 1.2 mm');
    expect(formatContainerHeightStatus(tooTall, 'compact')).toBe('too tall by 3.0 mm');
  });
});

describe('getDisplayedFree / remaining space text', () => {
  const full = (totalHeight: number, containerHeight: number) =>
    formatContainerHeightStatus(evaluateContainerHeight({ totalHeight, containerHeight }), 'full');
  const compact = (totalHeight: number, containerHeight: number) =>
    formatContainerHeightStatus(evaluateContainerHeight({ totalHeight, containerHeight }), 'compact');

  it('free 10 -> "10.0 mm free"', () => {
    expect(full(50, 60)).toBe('Layers total: 50.0 mm of 60.0 mm – 10.0 mm free');
    expect(compact(50, 60)).toBe('Total 50.0 / 60.0 mm · 10.0 mm free');
  });

  it('rounding: total 52.45 / height 60 -> shown total + shown free = shown height', () => {
    const check = evaluateContainerHeight({ totalHeight: 52.45, containerHeight: 60 });
    expect(formatMm(check.totalHeight)).toBe('52.5 mm');
    expect(getDisplayedFree(check)).toBeCloseTo(7.5, 9);
    expect(formatContainerHeightStatus(check, 'full')).toBe('Layers total: 52.5 mm of 60.0 mm – 7.5 mm free');
  });

  it('equal and +0.005 -> 0.0 mm free', () => {
    expect(full(60, 60)).toBe('Layers total: 60.0 mm of 60.0 mm – 0.0 mm free');
    expect(compact(60.005, 60)).toBe('Total 60.0 / 60.0 mm · 0.0 mm free');
  });

  it('height 60.04 / total 60.05 (ok): never negative', () => {
    const check = evaluateContainerHeight({ totalHeight: 60.05, containerHeight: 60.04 });
    expect(check.status).toBe('ok');
    expect(getDisplayedFree(check)).toBe(0);
    expect(formatContainerHeightStatus(check, 'full')).toContain('0.0 mm free');
  });

  it('only status ok has a displayed free value and a "free" text', () => {
    const unset = evaluateContainerHeight({ totalHeight: 50 });
    const lidLift = evaluateContainerHeight({ totalHeight: 61, containerHeight: 60, lidLiftAllowance: 2 });
    const tooTall = evaluateContainerHeight({ totalHeight: 65, containerHeight: 60 });
    for (const check of [unset, lidLift, tooTall]) {
      expect(getDisplayedFree(check)).toBeUndefined();
      expect(formatContainerHeightStatus(check, 'full')).not.toContain('free');
      expect(formatContainerHeightStatus(check, 'compact')).not.toContain('free');
    }
  });
});

describe.each([['gameContainerHeight', 60], ['lidLiftAllowance', 2]] as const)(
  'optional measure %s in migrateProjectData',
  (key, valid) => {
    function rawWith(settings: unknown): any {
      const raw = viaFile(startProject());
      if (settings === undefined) delete raw.globalSettings;
      else raw.globalSettings = settings;
      return raw;
    }

    it('keeps a valid value', () => {
      const migrated = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER, [key]: valid }));
      expect((migrated.globalSettings as any)[key]).toBe(valid);
    });

    it.each([0, -1, NaN, '2', null])('removes the invalid value %s', (value) => {
      const migrated = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER, [key]: value }));
      expect(key in migrated.globalSettings!).toBe(false);
    });

    it('project without the field gets no key', () => {
      const migrated = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER }));
      expect(JSON.stringify(migrated.globalSettings)).not.toContain(key);
    });

    it('printBedSize keeps the value', () => {
      const migrated = migrateProjectData(rawWith({ printBedSize: 180, [key]: valid }));
      expect(migrated.globalSettings).toEqual({ gameContainerWidth: 180, gameContainerDepth: 180, [key]: valid });
    });

    it('does not create globalSettings when there are none', () => {
      expect(migrateProjectData(rawWith(undefined)).globalSettings).toBeUndefined();
    });

    it('migrating twice gives the same result', () => {
      const once = migrateProjectData(rawWith({ printBedSize: 180, [key]: valid }));
      const twice = migrateProjectData(JSON.parse(JSON.stringify(once)));
      expect(twice.globalSettings).toEqual(once.globalSettings);
    });

    it('migrating twice with an invalid value gives the same result', () => {
      const bad = migrateProjectData(rawWith({ ...PART_TEST_CONTAINER, [key]: -3 }));
      expect(migrateProjectData(JSON.parse(JSON.stringify(bad))).globalSettings).toEqual(bad.globalSettings);
    });
  }
);
