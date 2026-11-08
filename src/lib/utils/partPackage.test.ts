/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate foreign-shaped tray data */
import type { Project, Tray } from '#lib/types/project.js';
import type { DefinitionKind, PartDependencies } from '#lib/utils/partPackage.js';
import {
  buildPartPackage,
  DEFINITION_FIELD_SPECS,
  DEFINITION_KINDS,
  emptyDependencies,
  getDefinitions,
  isPartPackage,
  migratePartPackage,
  PART_FILE_SUFFIXES,
  PART_PACKAGE_FORMAT,
  PART_PACKAGE_VERSION,
  UNNAMED_PART_NAMES,
  validatePartPackage
} from '#lib/utils/partPackage.js';
import { makeTile, PART_TEST_NOW } from '#lib/utils/partTestFixtures.js';
import { readFileSync } from 'node:fs';
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
      standees: [],
      tiles: []
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
    tiles: [],
    selectedLayerId: null,
    selectedBoxId: null,
    selectedTrayId: null
  };
}

function validPackage(): Record<string, unknown> {
  return {
    format: PART_PACKAGE_FORMAT,
    formatVersion: 1,
    kind: 'counterShape',
    exportedAt: PART_TEST_NOW.toISOString(),
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
      const built = buildPartPackage(project, selection, PART_TEST_NOW);
      expect(built.ok, selection.kind).toBe(true);
      if (!built.ok) continue;
      expect(built.package.kind).toBe(selection.kind);
      expect(built.package.exportedAt).toBe('2026-11-06T10:00:00.000Z');
      expect(built.package.dependencies).toEqual({ counterShapes: [], cardSizes: [], standees: [], tiles: [] });
      const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
      expect(validated).toEqual({ ok: true, package: built.package });
    }
  });

  it('copies the definition and leaves the project unchanged', () => {
    const project = makeProject();
    const copy = structuredClone(project);
    const built = buildPartPackage(project, { kind: 'counterShape', id: 'shape-square' }, PART_TEST_NOW);
    expect(built.ok && built.package.part).toEqual(project.counterShapes[0]);
    expect(built.ok && built.package.part).not.toBe(project.counterShapes[0]);
    expect(project).toEqual(copy);
  });

  it('uses the unnamed replacement for an empty name in the package only', () => {
    const project = makeProject();
    const built = buildPartPackage(project, { kind: 'counterShape', id: 'blank' }, PART_TEST_NOW);
    expect(built.ok && built.package.part.name).toBe('Unnamed counter');
    expect(project.counterShapes[1].name).toBe('   ');
  });

  it('returns errors instead of throwing', () => {
    const project = makeProject();
    const missing = buildPartPackage(project, { kind: 'cardSize', id: 'nope' }, PART_TEST_NOW);
    expect(!missing.ok && missing.error.code).toBe('notFound');
    const tray = buildPartPackage(project, { kind: 'tray', id: 'x' }, PART_TEST_NOW);
    expect(!tray.ok && tray.error.code).toBe('notFound');
    const box = buildPartPackage(project, { kind: 'box', id: 'x' }, PART_TEST_NOW);
    expect(!box.ok && box.error.code).toBe('notFound');
    const layer = buildPartPackage(project, { kind: 'layer', id: 'x' }, PART_TEST_NOW);
    expect(!layer.ok && layer.error.code).toBe('notFound');
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
    // A layer package needs a layer part (a definition has no boxes)
    expect(errorCode({ ...validPackage(), kind: 'layer' })).toBe('invalidPart');
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
    expect(result.ok && result.package.dependencies).toEqual({
      counterShapes: [],
      cardSizes: [],
      standees: [],
      tiles: []
    });
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

// ---------------------------------------------------------------------------
// Additional edge cases (tester)
// ---------------------------------------------------------------------------

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

describe('module purity (F1.2)', () => {
  it('imports models and types as types only and nothing from stores or components', () => {
    for (const file of ['partPackage.ts', 'partImport.ts']) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      const imports = source.match(/^import[\s\S]*?from\s+'[^']+';/gm) ?? [];
      for (const statement of imports) {
        const from = statement.match(/from\s+'([^']+)'/)?.[1] ?? '';
        expect(from, `${file}: ${from}`).not.toMatch(/stores|components|routes|svelte|@jscad|three/);
        if (/\/(models|types)\//.test(from)) {
          expect(statement.startsWith('import type'), `${file}: ${statement}`).toBe(true);
        }
      }
    }
  });
});

describe('validatePartPackage edge cases', () => {
  const square = () => validPackage().part as Record<string, unknown>;

  it('rejects an array or null as part', () => {
    expect(errorCode({ ...validPackage(), part: [square()] })).toBe('invalidPart');
    expect(errorCode({ ...validPackage(), part: null })).toBe('invalidPart');
  });

  it('rejects NaN, Infinity and -Infinity in every number field', () => {
    for (const field of ['width', 'length', 'thickness', 'cornerRadius']) {
      for (const bad of [Number.NaN, Infinity, -Infinity, null]) {
        const result = validatePartPackage({ ...validPackage(), part: { ...square(), [field]: bad } });
        expect(result.ok, `${field}=${bad}`).toBe(false);
        expect(!result.ok && result.error.message).toContain(`part.${field}`);
      }
    }
  });

  it('rejects NaN in a dependency with its path', () => {
    const result = validatePartPackage({
      ...validPackage(),
      dependencies: { standees: [{ ...makeProject().standees[0], baseRadius: Number.NaN }] }
    });
    expect(!result.ok && result.error.code).toBe('invalidDependencies');
    expect(!result.ok && result.error.message).toContain('dependencies.standees[0].baseRadius');
  });

  it('rejects odd format versions', () => {
    for (const version of [1.5, '1', Number.NaN, Infinity, -1, null, true]) {
      expect(errorCode({ ...validPackage(), formatVersion: version }), String(version)).toBe('invalidVersion');
    }
  });

  it('rejects a whitespace-only id and a non-string name', () => {
    expect(errorCode({ ...validPackage(), part: { ...square(), id: '   ' } })).toBe('invalidPart');
    expect(errorCode({ ...validPackage(), part: { ...square(), name: 5 } })).toBe('invalidPart');
  });

  it('does not treat a project-like object with a format field as project file', () => {
    expect(errorCode({ format: 'other', layers: [] })).toBe('notPartPackage');
    expect(errorCode({ layers: {} })).toBe('notPartPackage');
  });

  it('accepts all three definition kinds after a JSON round trip', () => {
    const project = makeProject();
    const card = validatePartPackage({ ...validPackage(), kind: 'cardSize', part: project.cardSizes[0] });
    const hero = validatePartPackage({ ...validPackage(), kind: 'standee', part: project.standees[0] });
    expect(card.ok && card.package.part).toEqual(project.cardSizes[0]);
    expect(hero.ok && hero.package.part).toEqual(project.standees[0]);
  });

  it('works on deep-frozen input and leaves it unchanged', () => {
    const raw = deepFreeze({
      ...validPackage(),
      dependencies: { counterShapes: [{ ...square(), id: 'dep' }], cardSizes: [], standees: [] }
    });
    const copy = structuredClone(raw);
    const result = validatePartPackage(raw);
    expect(result.ok).toBe(true);
    expect(raw).toEqual(copy);
    if (!result.ok) return;
    expect(result.package.dependencies.counterShapes[0]).not.toBe(raw.dependencies.counterShapes[0]);
    expect(Object.isFrozen(result.package.part)).toBe(false);
  });

  it('never throws for exotic input', () => {
    const withFunction = { ...validPackage(), exportedAt: () => 'x' };
    expect(() => validatePartPackage(withFunction)).not.toThrow();
    expect(errorCode(withFunction)).toBe('invalidData');
    expect(() => validatePartPackage(Object.create(null))).not.toThrow();
  });

  it('uses an empty exportedAt when it is missing', () => {
    const result = validatePartPackage({ ...validPackage(), exportedAt: undefined });
    expect(result.ok && result.package.exportedAt).toBe('');
  });
});

describe('buildPartPackage edge cases', () => {
  it('leaves a deep-frozen project unchanged and returns a mutable copy', () => {
    const project = deepFreeze(makeProject());
    const built = buildPartPackage(project, { kind: 'standee', id: 'standee-std' }, PART_TEST_NOW);
    expect(built.ok && built.package.part).toEqual(project.standees[0]);
    expect(built.ok && Object.isFrozen(built.package.part)).toBe(false);
  });

  it('keeps optional fields and drops unknown ones', () => {
    const project = makeProject();
    (project.counterShapes[1] as unknown as Record<string, unknown>).legacy = 1;
    const built = buildPartPackage(project, { kind: 'counterShape', id: 'blank' }, PART_TEST_NOW);
    expect(built.ok && built.package.part).toEqual({
      id: 'blank',
      name: 'Unnamed counter',
      baseShape: 'hex',
      width: 20,
      length: 20,
      thickness: 2,
      pointyTop: true
    });
  });

  it('keeps a name with surrounding whitespace as it is', () => {
    const project = makeProject();
    project.cardSizes[0].name = '  Standard ';
    const built = buildPartPackage(project, { kind: 'cardSize', id: 'card-std' }, PART_TEST_NOW);
    expect(built.ok && built.package.part.name).toBe('  Standard ');
  });
});

describe('migratePartPackage edge cases', () => {
  it('throws for a version without migration step', () => {
    expect(() => migratePartPackage({ ...validPackage(), formatVersion: 0 })).toThrow();
  });

  it('does not modify a deep-frozen input', () => {
    const raw = deepFreeze(validPackage());
    expect(() => migratePartPackage(raw)).not.toThrow();
  });
});

describe('validatePartPackage duplicate IDs (review)', () => {
  const square = () => validPackage().part as Record<string, unknown>;

  it('rejects duplicate source IDs within one dependency list', () => {
    const result = validatePartPackage({
      ...validPackage(),
      dependencies: {
        counterShapes: [
          { ...square(), id: 'dup' },
          { ...square(), id: 'dup', name: 'Other' }
        ]
      }
    });
    expect(!result.ok && result.error.code).toBe('invalidDependencies');
    expect(!result.ok && result.error.message).toContain('dependencies.counterShapes[1].id');
  });

  it('rejects a dependency with the same ID as the part of the same kind', () => {
    const result = validatePartPackage({
      ...validPackage(),
      dependencies: { counterShapes: [{ ...square(), name: 'Copy' }] }
    });
    expect(!result.ok && result.error.code).toBe('invalidDependencies');
    expect(!result.ok && result.error.message).toContain('dependencies.counterShapes[0].id');
  });

  it('allows the same ID across different kinds', () => {
    const card = { id: 'shape-square', name: 'C', width: 66, length: 91, thickness: 0.5 };
    expect(validatePartPackage({ ...validPackage(), dependencies: { cardSizes: [card] } }).ok).toBe(true);
  });
});

describe('tile packages', () => {
  const tile = { id: 'ti1', name: 'Plate', width: 40, height: 25, thickness: 1.5 };
  const tilePackage = (part: Record<string, unknown>) => ({ ...validPackage(), kind: 'tile', part });

  it('keeps the version at 1 and knows suffix, unnamed name and collection key', () => {
    expect(PART_PACKAGE_VERSION).toBe(1);
    expect(PART_FILE_SUFFIXES.tile).toBe('.tile');
    expect(UNNAMED_PART_NAMES.tile).toBe('Unnamed tile');
    expect(DEFINITION_KINDS).toContain('tile');
    expect(emptyDependencies()).toEqual({ counterShapes: [], cardSizes: [], standees: [], tiles: [] });
  });

  it('accepts a tile with and without holder fields', () => {
    expect(validatePartPackage(tilePackage(tile)).ok).toBe(true);
    const full = { ...tile, angleToFloor: 60, slotClearance: 0.5, barPositionLeft: 10, barPositionRight: 40 };
    expect(validatePartPackage(tilePackage(full)).ok).toBe(true);
  });

  it.each([
    [{ width: 0 }, 'part.width must be greater than 0.'],
    [{ height: -1 }, 'part.height must be greater than 0.'],
    [{ thickness: 0 }, 'part.thickness must be greater than 0.'],
    [{ angleToFloor: 44 }, 'part.angleToFloor must be between 45 and 90.'],
    [{ angleToFloor: 91 }, 'part.angleToFloor must be between 45 and 90.'],
    [{ slotClearance: -1 }, 'part.slotClearance must not be negative.'],
    [{ barPositionLeft: -1 }, 'part.barPositionLeft must be between 0 and 50.'],
    [{ barPositionRight: 51 }, 'part.barPositionRight must be between 0 and 50.']
  ])('rejects %j', (bad, message) => {
    const result = validatePartPackage(tilePackage({ ...tile, ...bad }));
    expect(!result.ok && result.error.code).toBe('invalidPart');
    expect(!result.ok && result.error.message).toBe(message);
  });

  it('drops unknown fields (old standee arrangement, foreign data)', () => {
    const result = validatePartPackage(tilePackage({ ...tile, arrangement: 'oneSided', junk: 1 }));
    expect(result.ok && result.package.part).toEqual(tile);
  });

  it('validates tile dependencies and fills a missing list with []', () => {
    const missing = validatePartPackage({ ...validPackage(), dependencies: {} });
    expect(missing.ok && missing.package.dependencies.tiles).toEqual([]);
    const bad = validatePartPackage({ ...validPackage(), dependencies: { tiles: [{ ...tile, width: 0 }] } });
    expect(!bad.ok && bad.error.code).toBe('invalidDependencies');
    expect(!bad.ok && bad.error.message).toBe('dependencies.tiles[0].width must be greater than 0.');
  });

  it('builds a tile package from a project', () => {
    const project = { ...makeProject(), tiles: [tile] };
    const built = buildPartPackage(project, { kind: 'tile', id: 'ti1' }, PART_TEST_NOW);
    expect(built.ok && built.package.part).toEqual(tile);
    expect(built.ok && built.package.dependencies).toEqual(emptyDependencies());
    const missing = buildPartPackage(project, { kind: 'tile', id: 'nope' }, PART_TEST_NOW);
    expect(!missing.ok && missing.error.code).toBe('notFound');
  });
});

describe('validatePartPackage minimum values (correction B)', () => {
  const project = makeProject();
  const parts = {
    counterShape: project.counterShapes[0],
    cardSize: project.cardSizes[0],
    standee: project.standees[0],
    tile: makeTile()
  };
  const cases: [DefinitionKind, string][] = [
    ['counterShape', 'width'],
    ['counterShape', 'length'],
    ['counterShape', 'thickness'],
    ['cardSize', 'width'],
    ['cardSize', 'thickness'],
    ['standee', 'baseRadius'],
    ['standee', 'baseThickness'],
    ['standee', 'standeeHeight'],
    ['standee', 'standeeWidth'],
    ['standee', 'standeeThickness'],
    ['tile', 'width'],
    ['tile', 'height'],
    ['tile', 'thickness']
  ];

  it('rejects 0, -0 and negative sizes in the part', () => {
    for (const [kind, field] of cases) {
      for (const bad of [0, -0, -1]) {
        const result = validatePartPackage({ ...validPackage(), kind, part: { ...parts[kind], [field]: bad } });
        expect(!result.ok && result.error.code, `${kind}.${field}=${bad}`).toBe('invalidPart');
        expect(!result.ok && result.error.message).toBe(`part.${field} must be greater than 0.`);
      }
    }
  });

  it('allows cornerRadius 0 but not a negative one', () => {
    const square = parts.counterShape;
    expect(validatePartPackage({ ...validPackage(), part: { ...square, cornerRadius: 0 } }).ok).toBe(true);
    expect(validatePartPackage({ ...validPackage(), part: { ...square, cornerRadius: -0 } }).ok).toBe(true);
    const negative = validatePartPackage({ ...validPackage(), part: { ...square, cornerRadius: -0.5 } });
    expect(!negative.ok && negative.error.message).toBe('part.cornerRadius must not be negative.');
  });

  it('detects too small values in dependencies', () => {
    const result = validatePartPackage({
      ...validPackage(),
      dependencies: { cardSizes: [{ ...parts.cardSize, length: 0 }] }
    });
    expect(!result.ok && result.error.code).toBe('invalidDependencies');
    expect(!result.ok && result.error.message).toBe('dependencies.cardSizes[0].length must be greater than 0.');
  });

  it('keeps accepting valid packages of all kinds', () => {
    for (const kind of DEFINITION_KINDS) {
      expect(validatePartPackage({ ...validPackage(), kind, part: parts[kind] }).ok, kind).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// F1.5b: tray packages
// ---------------------------------------------------------------------------

const trayBase = { color: '#336699' };

function makeTrays(): Tray[] {
  return [
    {
      ...trayBase,
      id: 't-counter',
      name: 'Tokens',
      type: 'counter',
      params: {
        counterThickness: 1.8,
        clearance: 0.5,
        wallThickness: 2,
        floorThickness: 2,
        rimHeight: 0,
        cutoutRatio: 0.5,
        cutoutMax: 20,
        trayWidthOverride: 0,
        topLoadedStacks: [['shape-square', 10, 'A']],
        edgeLoadedStacks: [['shape-square', 5, 'Horizontal', 'B']],
        gameContainerWidth: 150,
        gameContainerDepth: 200
      }
    },
    {
      ...trayBase,
      id: 't-draw',
      name: 'Draw',
      type: 'cardDraw',
      params: {
        cardSizeId: 'card-std',
        cardCount: 20,
        wallThickness: 2,
        floorThickness: 2,
        clearance: 1,
        floorSlopeAngle: 10,
        magnetHoleDiameter: 0,
        magnetHoleDepth: 0
      }
    },
    {
      ...trayBase,
      id: 't-divider',
      name: 'Divider',
      type: 'cardDivider',
      params: {
        stacks: [
          { cardSizeId: 'card-std', count: 10 },
          { cardSizeId: 'card-std', count: 5, label: 'X' }
        ],
        orientation: 'vertical',
        stackDirection: 'sideBySide',
        wallThickness: 2,
        floorThickness: 2,
        clearance: 1,
        rimHeight: 2
      }
    },
    {
      ...trayBase,
      id: 't-cup',
      name: 'Cups',
      type: 'cup',
      params: {
        layout: {
          root: {
            type: 'split',
            direction: 'vertical',
            ratio: 0.5,
            first: { type: 'cup', id: 'cup-1' },
            second: { type: 'cup', id: 'cup-2' }
          }
        },
        trayWidth: 60,
        trayDepth: 40,
        cupCavityHeight: null,
        wallThickness: 2,
        floorThickness: 2,
        cornerRadius: 6
      }
    },
    {
      ...trayBase,
      id: 't-well',
      name: 'Wells',
      type: 'cardWell',
      params: {
        layout: { columns: [['cell-a', 'cell-b']] },
        stacks: [{ id: 'stack-1', cellId: 'cell-a', cardSizeId: 'card-std', count: 10, rotation: 0 }],
        trayWidthOverride: null,
        trayDepthOverride: null,
        wallThickness: 2,
        floorThickness: 2,
        clearance: 1,
        rimHeight: 2
      }
    },
    {
      ...trayBase,
      id: 't-standee',
      name: 'Heroes',
      type: 'standee',
      params: {
        standeeId: 'standee-std',
        count: 4,
        wallThickness: 2,
        innerWallThickness: 1.2,
        floorThickness: 2,
        clearance: 0.5,
        rimHeight: 0,
        trayWidthOverride: null,
        trayDepthOverride: null
      }
    }
  ] as Tray[];
}

// First three trays in a box, the rest loose, to cover both places
function makeTrayProject(trays: Tray[] = makeTrays()): Project {
  const project = makeProject();
  project.layers = [
    {
      id: 'layer-1',
      name: 'L',
      boxes: [{ id: 'box-1', name: 'B', trays: trays.slice(0, 3) }],
      looseTrays: trays.slice(3)
    }
  ] as unknown as Project['layers'];
  return project;
}

function builtTray(project: Project, id: string) {
  const built = buildPartPackage(project, { kind: 'tray', id }, PART_TEST_NOW);
  if (!built.ok) throw new Error(`build failed: ${built.error.message}`);
  return built;
}

// Package JSON of a counter tray with a changed field, for validation cases
function trayPackage(mutate: (tray: Record<string, any>) => void, kind = 'tray'): Record<string, unknown> {
  const pkg = JSON.parse(JSON.stringify(builtTray(makeTrayProject(), 't-well').package));
  mutate(pkg.part);
  return { ...pkg, kind };
}

describe('buildPartPackage for trays', () => {
  it('builds a package for each of the 6 tray types that validates to the same package', () => {
    const project = makeTrayProject();
    const copy = structuredClone(project);
    for (const tray of makeTrays()) {
      const built = builtTray(project, tray.id);
      expect(built.package.kind).toBe('tray');
      expect(built.warnings, tray.type).toEqual([]);
      const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
      expect(validated, tray.type).toEqual({ ok: true, package: built.package });
    }
    expect(project).toEqual(copy);
  });

  it('removes the game container size of counter trays and keeps the rest', () => {
    const { package: pkg } = builtTray(makeTrayProject(), 't-counter');
    const params = (pkg.part as Tray).params as unknown as Record<string, unknown>;
    expect(params).not.toHaveProperty('gameContainerWidth');
    expect(params).not.toHaveProperty('gameContainerDepth');
    expect(params.trayWidthOverride).toBe(0);
    expect(params.topLoadedStacks).toEqual([['shape-square', 10, 'A']]);
  });

  it('uses the unnamed replacement for an empty name', () => {
    const trays = makeTrays();
    trays[1].name = '  ';
    const project = makeTrayProject(trays);
    expect(builtTray(project, 't-draw').package.part).toMatchObject({ name: 'Unnamed tray' });
    expect(trays[1].name).toBe('  ');
  });

  it('includes exactly the used definitions, each once', () => {
    const { package: pkg } = builtTray(makeTrayProject(), 't-counter');
    expect(pkg.dependencies.counterShapes.map((d) => d.id)).toEqual(['shape-square']);
    expect(pkg.dependencies.cardSizes).toEqual([]);
    expect(pkg.dependencies.standees).toEqual([]);
    const divider = builtTray(makeTrayProject(), 't-divider').package;
    expect(divider.dependencies.cardSizes.map((d) => d.id)).toEqual(['card-std']);
    expect(builtTray(makeTrayProject(), 't-cup').package.dependencies).toEqual({
      counterShapes: [],
      cardSizes: [],
      standees: [],
      tiles: []
    });
  });

  it('resolves a reference by name to the ID (counter, cardDraw, standee)', () => {
    const trays = makeTrays();
    (trays[0] as any).params.topLoadedStacks = [['Square', 10]];
    (trays[1] as any).params.cardSizeId = 'Standard';
    (trays[5] as any).params.standeeId = 'Hero';
    const project = makeTrayProject(trays);
    const counter = builtTray(project, 't-counter');
    expect((counter.package.part as any).params.topLoadedStacks[0][0]).toBe('shape-square');
    expect(counter.warnings).toEqual([]);
    expect((builtTray(project, 't-draw').package.part as any).params.cardSizeId).toBe('card-std');
    expect((builtTray(project, 't-standee').package.part as any).params.standeeId).toBe('standee-std');
  });

  it('keeps a dead reference raw and reports a warning with its path', () => {
    const trays = makeTrays();
    (trays[2] as any).params.stacks[1].cardSizeId = 'gone';
    (trays[4] as any).params.stacks[0].cellId = 'no-cell';
    const project = makeTrayProject(trays);
    const divider = builtTray(project, 't-divider');
    expect(divider.warnings).toEqual([{ kind: 'cardSize', id: 'gone', path: 'params.stacks[1].cardSizeId' }]);
    expect((divider.package.part as any).params.stacks[1].cardSizeId).toBe('gone');
    expect(builtTray(project, 't-well').warnings).toEqual([
      { kind: 'cell', id: 'no-cell', path: 'params.stacks[0].cellId' }
    ]);
  });

  it('an empty reference stays empty without warning or dependency', () => {
    const trays = makeTrays();
    (trays[1] as any).params.cardSizeId = '';
    const built = builtTray(makeTrayProject(trays), 't-draw');
    expect(built.warnings).toEqual([]);
    expect((built.package.part as any).params.cardSizeId).toBe('');
    expect(built.package.dependencies.cardSizes).toEqual([]);
  });

  it('never throws for malformed trays', () => {
    const trays = makeTrays();
    (trays[0] as any).params.topLoadedStacks = [null, 'x'];
    (trays[2] as any).params = null;
    (trays[4] as any).params.stacks = [null];
    const project = makeTrayProject(trays);
    for (const id of ['t-counter', 't-divider', 't-well']) {
      expect(() => buildPartPackage(project, { kind: 'tray', id }, PART_TEST_NOW)).not.toThrow();
    }
  });
});

describe('validatePartPackage for trays', () => {
  it('accepts a tray package and strips the game container size', () => {
    const pkg = trayPackage(() => {});
    expect(validatePartPackage(pkg).ok).toBe(true);
    const counter = JSON.parse(JSON.stringify(builtTray(makeTrayProject(), 't-counter').package));
    counter.part.params.gameContainerWidth = 99;
    const result = validatePartPackage(counter);
    expect(result.ok && (result.package.part as any).params).not.toHaveProperty('gameContainerWidth');
  });

  it('normalizes a name reference to the ID and does not change the input', () => {
    const counter = JSON.parse(JSON.stringify(builtTray(makeTrayProject(), 't-counter').package));
    counter.part.params.topLoadedStacks[0][0] = 'Square';
    const before = structuredClone(counter);
    const result = validatePartPackage(counter);
    expect(result.ok && (result.package.part as any).params.topLoadedStacks[0][0]).toBe('shape-square');
    expect(counter).toEqual(before);
  });

  it('does not use the name fallback for cardDivider and cardWell', () => {
    const divider = JSON.parse(JSON.stringify(builtTray(makeTrayProject(), 't-divider').package));
    divider.part.params.stacks[0].cardSizeId = 'Standard';
    expect(errorCode(divider)).toBe('missingDefinition');
  });

  it('rejects a missing definition with its path', () => {
    const pkg = JSON.parse(JSON.stringify(builtTray(makeTrayProject(), 't-divider').package));
    pkg.dependencies.cardSizes = [];
    const result = validatePartPackage(pkg);
    expect(!result.ok && result.error.code).toBe('missingDefinition');
    expect(!result.ok && result.error.message).toContain('params.stacks[0].cardSizeId');
  });

  it('accepts empty references', () => {
    expect(validatePartPackage(trayPackage((t) => (t.params.stacks[0].cardSizeId = ''))).ok).toBe(true);
  });

  it('tolerates null number fields (NaN saved as JSON null) but not strings', () => {
    // Round trip through JSON like a saved project: NaN becomes null
    const viaJson = (value: unknown) => JSON.parse(JSON.stringify(value));
    const base = (id: string) => viaJson(builtTray(makeTrayProject(), id).package);
    const counter = base('t-counter');
    counter.part.params.clearance = NaN;
    counter.part.params.topLoadedStacks[0][1] = NaN;
    expect(validatePartPackage(viaJson(counter)).ok).toBe(true);
    const divider = base('t-divider');
    divider.part.params.wallThickness = NaN;
    divider.part.params.stacks[0].count = NaN;
    expect(validatePartPackage(viaJson(divider)).ok).toBe(true);
    const strings = base('t-counter');
    strings.part.params.clearance = 'x';
    expect(validatePartPackage(strings).ok).toBe(false);
  });

  it('checks structure and types of the tray (no value ranges)', () => {
    const cases: [string, (tray: Record<string, any>) => void][] = [
      ['part.id', (t) => (t.id = '')],
      ['part.name', (t) => (t.name = 3)],
      ['part.color', (t) => delete t.color],
      ['part.type', (t) => (t.type = 'card')],
      ['part.rotationOverride', (t) => (t.rotationOverride = 45)],
      ['part.showEmboss', (t) => (t.showEmboss = 'yes')],
      ['part.params', (t) => (t.params = 'x')],
      ['part.params.wallThickness', (t) => (t.params.wallThickness = 'x')],
      ['part.params.trayWidthOverride', (t) => (t.params.trayWidthOverride = 'x')],
      ['part.params.layout.columns', (t) => (t.params.layout = {})],
      ['part.params.layout.columns[0]', (t) => (t.params.layout.columns = [[1]])],
      ['part.params.stacks', (t) => (t.params.stacks = 'x')],
      ['part.params.stacks[0]', (t) => (t.params.stacks = [null])],
      ['part.params.stacks[0].cellId', (t) => (t.params.stacks[0].cellId = 5)],
      ['part.params.stacks[0].cardSizeId', (t) => delete t.params.stacks[0].cardSizeId],
      ['part.params.stacks[0].rotation', (t) => (t.params.stacks[0].rotation = 45)]
    ];
    for (const [path, mutate] of cases) {
      const result = validatePartPackage(trayPackage(mutate));
      expect(result.ok, path).toBe(false);
      if (result.ok) continue;
      expect(result.error.code, path).toBe('invalidPart');
      expect(result.error.message, path).toContain(path);
    }
    // value ranges are not checked (Q6)
    expect(validatePartPackage(trayPackage((t) => (t.params.wallThickness = -1))).ok).toBe(true);
  });

  it('checks the cup tree, counter stacks, and standee/cardDraw references', () => {
    const base = (id: string) => JSON.parse(JSON.stringify(builtTray(makeTrayProject(), id).package));
    const bad = (id: string, mutate: (tray: any) => void) => {
      const pkg = base(id);
      mutate(pkg.part);
      return validatePartPackage(pkg);
    };
    const code = (r: ReturnType<typeof validatePartPackage>) => (r.ok ? 'ok' : r.error.code);
    expect(code(bad('t-cup', (t) => delete t.params.layout.root))).toBe('invalidPart');
    expect(code(bad('t-cup', (t) => (t.params.layout.root.direction = 'diagonal')))).toBe('invalidPart');
    expect(code(bad('t-cup', (t) => (t.params.layout.root.first = { type: 'cup' })))).toBe('invalidPart');
    expect(code(bad('t-cup', (t) => (t.params.cupCavityHeight = 'x')))).toBe('invalidPart');
    expect(code(bad('t-counter', (t) => (t.params.topLoadedStacks = 'x')))).toBe('invalidPart');
    expect(code(bad('t-counter', (t) => (t.params.topLoadedStacks = [null])))).toBe('invalidPart');
    expect(code(bad('t-counter', (t) => (t.params.edgeLoadedStacks = [['shape-square', 'x']])))).toBe('invalidPart');
    expect(code(bad('t-standee', (t) => delete t.params.standeeId))).toBe('invalidPart');
    expect(code(bad('t-draw', (t) => (t.params.cardSizeId = 7)))).toBe('invalidPart');
    // a cup tree nested deeper than 100 levels is rejected instead of overflowing the stack
    expect(
      code(
        bad('t-cup', (t) => {
          let node = t.params.layout.root;
          for (let i = 0; i < 150; i++) {
            node.first = { type: 'split', direction: 'vertical', ratio: 0.5, first: null, second: null };
            node = node.first;
          }
        })
      )
    ).toBe('invalidPart');
  });

  it('rejects a tray part in a layer package', () => {
    expect(errorCode(trayPackage(() => {}, 'layer'))).toBe('invalidPart');
  });
});

describe('standee holder fields (F3e.4)', () => {
  const hero = makeProject().standees[0];
  const check = (fields: Record<string, unknown>) =>
    validatePartPackage({ ...validPackage(), kind: 'standee', part: { ...hero, ...fields } });

  it('specifies the two optional holder fields (no arrangement, no bar positions)', () => {
    const specs = DEFINITION_FIELD_SPECS.standee;
    for (const field of ['angleToFloor', 'slotClearance']) {
      expect(specs[field as keyof typeof specs]?.optional, field).toBe(true);
    }
    for (const field of ['arrangement', 'barPositionLeft', 'barPositionRight']) {
      expect(field in specs, field).toBe(false);
    }
  });

  it('accepts packages without holder fields and valid values', () => {
    expect(check({}).ok).toBe(true);
    for (const angleToFloor of [45, 62.5, 90]) expect(check({ angleToFloor }).ok, String(angleToFloor)).toBe(true);
    expect(check({ slotClearance: 0 }).ok).toBe(true);
  });

  it('keeps the holder fields when picking and validating', () => {
    const fields = { angleToFloor: 60, slotClearance: 0.5 };
    const result = check(fields);
    expect(result.ok && result.package.part).toMatchObject(fields);
  });

  // E6: legacy one-sided fields are not rejected (not even invalid values) and not kept
  it('ignores legacy arrangement / barPosition* fields without an error', () => {
    for (const legacy of [
      { arrangement: 'oneSided', barPositionLeft: 10, barPositionRight: 20 },
      { arrangement: 'sideways', barPositionLeft: -1, barPositionRight: 51 }
    ]) {
      const result = check({ angleToFloor: 60, ...legacy });
      expect(result.ok).toBe(true);
      const part = (result.ok ? result.package.part : {}) as Record<string, unknown>;
      expect(part).toMatchObject({ angleToFloor: 60 });
      for (const key of Object.keys(legacy)) expect(key in part, key).toBe(false);
    }
  });

  it('rejects values outside the ranges with the range message', () => {
    const cases: [string, number, string][] = [
      ['angleToFloor', 44, '45 and 90'],
      ['angleToFloor', 91, '45 and 90']
    ];
    for (const [field, value, bounds] of cases) {
      const result = check({ [field]: value });
      expect(!result.ok && result.error.message, `${field}=${value}`).toBe(`part.${field} must be between ${bounds}.`);
    }
  });

  it('rejects non-numbers and negative clearance', () => {
    const text = check({ angleToFloor: '70' });
    expect(!text.ok && text.error.message).toBe('part.angleToFloor has an invalid value.');
    const nan = check({ slotClearance: Number.NaN });
    expect(!nan.ok && nan.error.message).toBe('part.slotClearance has an invalid value.');
    const negative = check({ slotClearance: -0.1 });
    expect(!negative.ok && negative.error.message).toBe('part.slotClearance must not be negative.');
  });

  it('rejects invalid holder fields in an embedded dependency with its path', () => {
    const result = validatePartPackage({
      ...validPackage(),
      dependencies: { standees: [{ ...hero, angleToFloor: 91 }] }
    });
    expect(!result.ok && result.error.message).toBe('dependencies.standees[0].angleToFloor must be between 45 and 90.');
  });

  it('imports an old package literal (formatVersion 1, no holder fields) unchanged', () => {
    const literal = JSON.parse(
      '{"format":"counterslayer-part","formatVersion":1,"kind":"standee","exportedAt":"2026-11-06T10:00:00.000Z",' +
        '"part":{"id":"s","name":"Old","baseRadius":9,"baseThickness":3,"standeeHeight":40,"standeeWidth":25,"standeeThickness":1.5},' +
        '"dependencies":{"counterShapes":[],"cardSizes":[],"standees":[]}}'
    );
    const result = validatePartPackage(literal);
    expect(result.ok && result.package.part).toEqual(literal.part);
    expect(PART_PACKAGE_VERSION).toBe(1);
  });
});
