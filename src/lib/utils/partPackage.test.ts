import type { Project } from '#lib/types/project.js';
import type { DefinitionKind, PartDependencies } from '#lib/utils/partPackage.js';
import {
  buildPartPackage,
  getDefinitions,
  isPartPackage,
  migratePartPackage,
  PART_FILE_SUFFIXES,
  PART_PACKAGE_FORMAT,
  PART_PACKAGE_VERSION,
  UNNAMED_PART_NAMES,
  validatePartPackage
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

// ---------------------------------------------------------------------------
// F1.3: build, validate, migrate
// ---------------------------------------------------------------------------

function makeProject(): Project {
  return {
    name: 'P',
    layers: [],
    counterShapes: [
      { id: 'shape-square', name: 'Square', baseShape: 'square', width: 15.9, length: 15.9, thickness: 1.8 },
      { id: 'blank', name: '   ', baseShape: 'hex', width: 20, length: 20, thickness: 2, pointyTop: true }
    ],
    cardSizes: [{ id: 'card-std', name: 'Standard', width: 66, length: 91, thickness: 0.5 }],
    standees: [
      {
        id: 'standee-std',
        name: 'Hero',
        baseRadius: 9,
        baseThickness: 3,
        standeeHeight: 40,
        standeeWidth: 25,
        standeeThickness: 1.5
      }
    ],
    selectedLayerId: null,
    selectedBoxId: null,
    selectedTrayId: null
  };
}

const NOW = new Date('2026-11-06T10:00:00.000Z');

function validPackage(): Record<string, unknown> {
  return {
    format: PART_PACKAGE_FORMAT,
    formatVersion: 1,
    kind: 'counterShape',
    exportedAt: NOW.toISOString(),
    part: { id: 'shape-square', name: 'Square', baseShape: 'square', width: 15.9, length: 15.9, thickness: 1.3 },
    dependencies: { counterShapes: [], cardSizes: [], standees: [] }
  };
}

function errorCode(raw: unknown): string | undefined {
  const result = validatePartPackage(raw);
  return result.ok ? undefined : result.error.code;
}

describe('buildPartPackage', () => {
  it('builds packages for all definition kinds that validate without errors', () => {
    const project = makeProject();
    const selections: { kind: DefinitionKind; id: string }[] = [
      { kind: 'counterShape', id: 'shape-square' },
      { kind: 'cardSize', id: 'card-std' },
      { kind: 'standee', id: 'standee-std' }
    ];
    for (const selection of selections) {
      const built = buildPartPackage(project, selection, NOW);
      expect(built.ok, selection.kind).toBe(true);
      if (!built.ok) continue;
      expect(built.package.kind).toBe(selection.kind);
      expect(built.package.exportedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(built.package.dependencies).toEqual({ counterShapes: [], cardSizes: [], standees: [] });
      const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
      expect(validated).toEqual({ ok: true, package: built.package });
    }
  });

  it('copies the definition and leaves the project unchanged', () => {
    const project = makeProject();
    const copy = structuredClone(project);
    const built = buildPartPackage(project, { kind: 'counterShape', id: 'shape-square' }, NOW);
    expect(built.ok && built.package.part).toEqual(project.counterShapes[0]);
    expect(built.ok && built.package.part).not.toBe(project.counterShapes[0]);
    expect(project).toEqual(copy);
  });

  it('uses the unnamed replacement for an empty name in the package only', () => {
    const project = makeProject();
    const built = buildPartPackage(project, { kind: 'counterShape', id: 'blank' }, NOW);
    expect(built.ok && built.package.part.name).toBe('Unnamed counter');
    expect(project.counterShapes[1].name).toBe('   ');
  });

  it('returns errors instead of throwing', () => {
    const project = makeProject();
    const missing = buildPartPackage(project, { kind: 'cardSize', id: 'nope' }, NOW);
    expect(!missing.ok && missing.error.code).toBe('notFound');
    const tray = buildPartPackage(project, { kind: 'tray', id: 'x' }, NOW);
    expect(!tray.ok && tray.error.code).toBe('unsupportedKind');
  });
});

describe('validatePartPackage', () => {
  it('accepts a valid package and returns a normalized copy', () => {
    const raw = validPackage();
    (raw.part as Record<string, unknown>).extra = 'dropped';
    const copy = structuredClone(raw);
    const result = validatePartPackage(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.package.part).not.toHaveProperty('extra');
    expect(result.package.part).not.toBe(raw.part);
    expect(raw).toEqual(copy);
  });

  it('rejects non-objects and arrays', () => {
    expect(errorCode(null)).toBe('notObject');
    expect(errorCode('text')).toBe('notObject');
    expect(errorCode([validPackage()])).toBe('notObject');
  });

  it('recognizes project files', () => {
    expect(errorCode({ version: 2, name: 'P', layers: [], counterShapes: [] })).toBe('projectFile');
    expect(errorCode({ boxes: [], counterShapes: [] })).toBe('projectFile');
  });

  it('rejects foreign JSON', () => {
    expect(errorCode({ hello: 'world' })).toBe('notPartPackage');
    expect(errorCode({ ...validPackage(), format: 'other' })).toBe('notPartPackage');
  });

  it('checks the format version', () => {
    expect(errorCode({ ...validPackage(), formatVersion: undefined })).toBe('invalidVersion');
    expect(errorCode({ ...validPackage(), formatVersion: 1.5 })).toBe('invalidVersion');
    expect(errorCode({ ...validPackage(), formatVersion: 0 })).toBe('invalidVersion');
    expect(errorCode({ ...validPackage(), formatVersion: '1' })).toBe('invalidVersion');
    expect(errorCode({ ...validPackage(), formatVersion: PART_PACKAGE_VERSION + 1 })).toBe('newerVersion');
  });

  it('checks the kind', () => {
    expect(errorCode({ ...validPackage(), kind: 'widget' })).toBe('unknownKind');
    expect(errorCode({ ...validPackage(), kind: undefined })).toBe('unknownKind');
    for (const kind of ['tray', 'box', 'layer']) {
      expect(errorCode({ ...validPackage(), kind })).toBe('unsupportedKind');
    }
  });

  it('checks the part with a field path in the message', () => {
    const withPart = (part: unknown) => validatePartPackage({ ...validPackage(), part });
    const square = validPackage().part as Record<string, unknown>;
    const cases: [unknown, string][] = [
      [undefined, 'part'],
      ['x', 'part'],
      [{ ...square, id: '' }, 'part.id'],
      [{ ...square, id: 3 }, 'part.id'],
      [{ ...square, name: undefined }, 'part.name'],
      [{ ...square, width: '15' }, 'part.width'],
      [{ ...square, thickness: Number.NaN }, 'part.thickness'],
      [{ ...square, length: Infinity }, 'part.length'],
      [{ ...square, baseShape: 'star' }, 'part.baseShape'],
      [{ ...square, cornerRadius: '1' }, 'part.cornerRadius'],
      [{ ...square, pointyTop: 1 }, 'part.pointyTop']
    ];
    for (const [part, path] of cases) {
      const result = withPart(part);
      expect(result.ok, path).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('invalidPart');
      expect(result.error.message).toContain(path);
    }
    expect(withPart({ ...square, name: '' }).ok).toBe(true);
    expect(withPart({ ...square, cornerRadius: 2, pointyTop: true }).ok).toBe(true);
  });

  it('validates parts of each definition kind by their own fields', () => {
    const card = { id: 'c', name: 'C', width: 66, length: 91, thickness: 0.5 };
    expect(validatePartPackage({ ...validPackage(), kind: 'cardSize', part: card }).ok).toBe(true);
    expect(errorCode({ ...validPackage(), kind: 'cardSize', part: { ...card, thickness: null } })).toBe('invalidPart');
    expect(errorCode({ ...validPackage(), kind: 'standee', part: card })).toBe('invalidPart');
  });

  it('treats missing dependencies as empty and checks their structure', () => {
    const result = validatePartPackage({ ...validPackage(), dependencies: undefined });
    expect(result.ok && result.package.dependencies).toEqual({ counterShapes: [], cardSizes: [], standees: [] });
    const partial = validatePartPackage({ ...validPackage(), dependencies: { cardSizes: [] } });
    expect(partial.ok && partial.package.dependencies.standees).toEqual([]);

    expect(errorCode({ ...validPackage(), dependencies: [] })).toBe('invalidDependencies');
    expect(errorCode({ ...validPackage(), dependencies: { counterShapes: {} } })).toBe('invalidDependencies');
    const bad = validatePartPackage({
      ...validPackage(),
      dependencies: { cardSizes: [{ id: 'c', name: 'C', width: 1, length: 1 }] }
    });
    expect(!bad.ok && bad.error.code).toBe('invalidDependencies');
    expect(!bad.ok && bad.error.message).toContain('dependencies.cardSizes[0].thickness');
  });
});

describe('migratePartPackage', () => {
  it('returns a v1 package unchanged as a copy', () => {
    const raw = validPackage();
    const migrated = migratePartPackage(raw);
    expect(migrated).toEqual(raw);
    expect(migrated).not.toBe(raw);
  });
});
