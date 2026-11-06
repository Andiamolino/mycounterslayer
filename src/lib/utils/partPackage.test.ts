import type { Project } from '#lib/types/project.js';
import type { DefinitionKind, PartDependencies } from '#lib/utils/partPackage.js';
import {
  buildPartPackage,
  DEFINITION_KINDS,
  getDefinitions,
  isPartPackage,
  migratePartPackage,
  PART_FILE_SUFFIXES,
  PART_PACKAGE_FORMAT,
  PART_PACKAGE_VERSION,
  UNNAMED_PART_NAMES,
  validatePartPackage
} from '#lib/utils/partPackage.js';
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
    const built = buildPartPackage(project, { kind: 'standee', id: 'standee-std' }, NOW);
    expect(built.ok && built.package.part).toEqual(project.standees[0]);
    expect(built.ok && Object.isFrozen(built.package.part)).toBe(false);
  });

  it('keeps optional fields and drops unknown ones', () => {
    const project = makeProject();
    (project.counterShapes[1] as unknown as Record<string, unknown>).legacy = 1;
    const built = buildPartPackage(project, { kind: 'counterShape', id: 'blank' }, NOW);
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
    const built = buildPartPackage(project, { kind: 'cardSize', id: 'card-std' }, NOW);
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

describe('validatePartPackage minimum values (correction B)', () => {
  const project = makeProject();
  const parts = {
    counterShape: project.counterShapes[0],
    cardSize: project.cardSizes[0],
    standee: project.standees[0]
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
    ['standee', 'standeeThickness']
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
