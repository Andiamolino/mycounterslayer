import type { PartDependencies } from '#lib/utils/partPackage.js';
import {
  getDefinitions,
  isPartPackage,
  PART_FILE_SUFFIXES,
  PART_PACKAGE_FORMAT,
  PART_PACKAGE_VERSION,
  UNNAMED_PART_NAMES
} from '#lib/utils/partPackage.js';
import { describe, expect, it } from 'vitest';

describe('isPartPackage', () => {
  it('detects a package by its format field', () => {
    expect(isPartPackage({ format: PART_PACKAGE_FORMAT, formatVersion: PART_PACKAGE_VERSION, kind: 'tray' })).toBe(
      true
    );
    expect(isPartPackage({ format: 'counterslayer-part' })).toBe(true);
  });

  it('rejects projects, other formats and non-objects', () => {
    expect(isPartPackage({ version: 2, layers: [] })).toBe(false);
    expect(isPartPackage({ format: 'something-else' })).toBe(false);
    expect(isPartPackage(null)).toBe(false);
    expect(isPartPackage(undefined)).toBe(false);
    expect(isPartPackage('counterslayer-part')).toBe(false);
    expect(isPartPackage([{ format: PART_PACKAGE_FORMAT }])).toBe(false);
  });
});

describe('part constants', () => {
  it('has a file suffix and an unnamed replacement for every kind', () => {
    expect(PART_FILE_SUFFIXES.counterShape).toBe('.counter');
    expect(PART_FILE_SUFFIXES.layer).toBe('.layer');
    expect(Object.keys(UNNAMED_PART_NAMES).sort()).toEqual(Object.keys(PART_FILE_SUFFIXES).sort());
    expect(UNNAMED_PART_NAMES.cardSize).toBe('Unnamed card size');
  });
});

describe('getDefinitions', () => {
  it('returns the array for each definition kind', () => {
    const deps: PartDependencies = {
      counterShapes: [{ id: 'c', name: 'C', baseShape: 'square', width: 1, length: 1, thickness: 1 }],
      cardSizes: [],
      standees: []
    };
    expect(getDefinitions(deps, 'counterShape').map((d) => d.id)).toEqual(['c']);
    expect(getDefinitions(deps, 'cardSize')).toEqual([]);
    expect(getDefinitions({} as PartDependencies, 'standee')).toEqual([]);
  });
});
