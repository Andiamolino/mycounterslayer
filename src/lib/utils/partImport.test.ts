import type { CardSize, CounterShape, Project, Standee, Tray } from '#lib/types/project.js';
import {
  areValuesEqual,
  canonicalize,
  collectAllIds,
  createIdAllocator,
  findFreeName,
  insertDefinitions,
  namesMatch
} from '#lib/utils/partImport.js';
import type { PartDependencies, PartPackage } from '#lib/utils/partPackage.js';
import {
  buildPartPackage,
  PART_PACKAGE_FORMAT,
  PART_PACKAGE_VERSION,
  validatePartPackage
} from '#lib/utils/partPackage.js';
import { describe, expect, it } from 'vitest';

const square: CounterShape = {
  id: 's1',
  name: 'Square',
  baseShape: 'square',
  width: 15.9,
  length: 15.9,
  thickness: 1.8
};
const cardSize: CardSize = { id: 'cs1', name: 'Standard', width: 66, length: 91, thickness: 0.5 };
const standee: Standee = {
  id: 'st1',
  name: 'Hero',
  baseRadius: 9,
  baseThickness: 3,
  standeeHeight: 40,
  standeeWidth: 25,
  standeeThickness: 1.5
};

const base = { name: 'T', color: '#000' };

const counterTray: Tray = {
  ...base,
  id: 't-counter',
  type: 'counter',
  params: {
    counterThickness: 1.3,
    clearance: 0.3,
    wallThickness: 2,
    floorThickness: 2,
    rimHeight: 2,
    cutoutRatio: 0.35,
    cutoutMax: 12,
    trayWidthOverride: 0,
    topLoadedStacks: [
      ['s1', 12],
      ['s2', 10, 'Hex']
    ],
    edgeLoadedStacks: [['s3', 10, 'lengthwise']],
    gameContainerWidth: 100,
    gameContainerDepth: 100
  }
};

const cardWellTray: Tray = {
  ...base,
  id: 't-well',
  type: 'cardWell',
  params: {
    layout: { columns: [['cell-a', 'cell-b'], ['cell-c']] },
    stacks: [
      { id: 'stack-1', cellId: 'cell-a', cardSizeId: 'cs1', count: 10, rotation: 0 },
      { id: 'stack-2', cellId: 'cell-x', cardSizeId: 'cs1', count: 10, rotation: 90 }
    ],
    trayWidthOverride: null,
    trayDepthOverride: null,
    wallThickness: 2,
    floorThickness: 2,
    clearance: 1,
    rimHeight: 3
  }
};

const cupTray: Tray = {
  ...base,
  id: 't-cup',
  type: 'cup',
  params: {
    layout: {
      root: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.5,
        first: { type: 'cup', id: 'cup-1' },
        second: {
          type: 'split',
          direction: 'horizontal',
          ratio: 0.5,
          first: { type: 'cup', id: 'cup-2' },
          second: { type: 'cup', id: 'cup-3' }
        }
      }
    },
    trayWidth: 100,
    trayDepth: 100,
    cupCavityHeight: null,
    wallThickness: 2,
    floorThickness: 2,
    cornerRadius: 6
  }
};

describe('canonicalize', () => {
  it('treats undefined fields as missing', () => {
    expect(canonicalize({ a: 1, b: undefined })).toEqual(canonicalize({ a: 1 }));
    expect(Object.keys(canonicalize({ a: 1, b: undefined }) as object)).toEqual(['a']);
  });

  it('cuts trailing null/undefined in tuples but keeps inner ones', () => {
    expect(canonicalize(['s1', 12, null])).toEqual(['s1', 12]);
    expect(canonicalize(['s1', 12, undefined, null])).toEqual(['s1', 12]);
    expect(canonicalize(['s1', 12, null, 'x'])).toEqual(['s1', 12, null, 'x']);
  });

  it('keeps null as its own value and sorts keys', () => {
    expect(canonicalize({ a: null })).toEqual({ a: null });
    expect(JSON.stringify(canonicalize({ b: 1, a: { d: 2, c: 3 } }))).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('does not modify its input', () => {
    const input = { b: [1, null], a: undefined };
    const copy = structuredClone(input);
    canonicalize(input);
    expect(input).toEqual(copy);
    expect('a' in input).toBe(true);
  });
});

describe('areValuesEqual', () => {
  it('ignores id, name and key order', () => {
    const other = {
      thickness: 1.8,
      length: 15.9,
      width: 15.9,
      baseShape: 'square',
      name: 'X',
      id: 'zz'
    } as CounterShape;
    expect(areValuesEqual('counterShape', square, other)).toBe(true);
  });

  it('compares numbers exactly', () => {
    expect(areValuesEqual('counterShape', square, { ...square, thickness: 1.3 })).toBe(false);
  });

  it('fills cornerRadius 1.5 and pointyTop false only for the comparison', () => {
    expect(areValuesEqual('counterShape', square, { ...square, cornerRadius: 1.5 })).toBe(true);
    expect(areValuesEqual('counterShape', square, { ...square, cornerRadius: 2 })).toBe(false);
    expect(areValuesEqual('counterShape', square, { ...square, pointyTop: false })).toBe(true);
    expect(areValuesEqual('counterShape', square, { ...square, pointyTop: true })).toBe(false);
    expect('cornerRadius' in square).toBe(false);
  });

  it('treats null as different from 0', () => {
    const a = { ...cardSize, thickness: 0 };
    const b = { ...cardSize, thickness: null as unknown as number };
    expect(areValuesEqual('cardSize', a, b)).toBe(false);
  });

  it('compares card sizes and standees by their value fields', () => {
    expect(areValuesEqual('cardSize', cardSize, { ...cardSize, id: 'x', name: 'Y' })).toBe(true);
    expect(areValuesEqual('cardSize', cardSize, { ...cardSize, width: 63 })).toBe(false);
    expect(areValuesEqual('standee', standee, { ...standee, id: 'x' })).toBe(true);
    expect(areValuesEqual('standee', standee, { ...standee, standeeHeight: 41 })).toBe(false);
  });
});

describe('namesMatch', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(namesMatch('  square ', 'Square')).toBe(true);
  });

  it('does not match a counted name with its base name', () => {
    expect(namesMatch('Square (2)', 'Square')).toBe(false);
  });
});

describe('findFreeName', () => {
  it('keeps a free name unchanged', () => {
    expect(findFreeName('Square', ['Hex'])).toBe('Square');
    expect(findFreeName('Square', ['Square (2)'])).toBe('Square');
  });

  it('counts up from the base name', () => {
    expect(findFreeName('Square', ['Square'])).toBe('Square (2)');
    expect(findFreeName('Square', ['Square', 'Square (2)'])).toBe('Square (3)');
    expect(findFreeName('Square (2)', ['Square', 'Square (2)'])).toBe('Square (3)');
  });

  it('fills the smallest gap', () => {
    expect(findFreeName('Square', ['Square', 'Square (3)'])).toBe('Square (2)');
  });

  it('compares case-insensitive and trimmed', () => {
    expect(findFreeName('square', [' SQUARE ', 'Square (2)'])).toBe('square (3)');
  });
});

describe('collectAllIds', () => {
  it('collects layers, boxes, trays, definitions, cups, cells and stacks', () => {
    const project: Project = {
      name: 'P',
      layers: [
        {
          id: 'layer-1',
          name: 'L',
          boxes: [
            {
              id: 'box-1',
              name: 'B',
              trays: [counterTray, cardWellTray],
              tolerance: 0.5,
              wallThickness: 2,
              floorThickness: 2,
              lidParams: {} as Project['layers'][number]['boxes'][number]['lidParams']
            }
          ],
          looseTrays: [cupTray]
        }
      ],
      counterShapes: [square],
      cardSizes: [cardSize],
      standees: [standee],
      selectedLayerId: null,
      selectedBoxId: null,
      selectedTrayId: null
    };
    const copy = structuredClone(project);
    const ids = collectAllIds(project);
    for (const id of [
      'layer-1',
      'box-1',
      't-counter',
      't-well',
      't-cup',
      's1',
      'cs1',
      'st1',
      'cup-1',
      'cup-2',
      'cup-3',
      'cell-a',
      'cell-b',
      'cell-c',
      'stack-1',
      'stack-2'
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    expect(project).toEqual(copy);
  });
});

describe('createIdAllocator', () => {
  it('skips taken IDs and never returns the same ID twice', () => {
    const sequence = ['a', 'b', 'x', 'x', 'y'];
    const taken = new Set(['a', 'b']);
    const next = createIdAllocator(taken, () => sequence.shift() ?? 'z');
    expect(next()).toBe('x');
    expect(next()).toBe('y');
    expect(taken).toEqual(new Set(['a', 'b']));
  });

  it('throws after permanent collisions', () => {
    const next = createIdAllocator(new Set(['a']), () => 'a');
    expect(() => next()).toThrow();
  });

  it('generates IDs by default', () => {
    const next = createIdAllocator(new Set());
    const id = next();
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(next()).not.toBe(id);
  });
});

// ---------------------------------------------------------------------------
// F1.3: insertDefinitions
// ---------------------------------------------------------------------------

function targetProject(): Project {
  return {
    name: 'Target',
    layers: [],
    counterShapes: [
      { id: 'shape-square', name: 'Square', baseShape: 'square', width: 15.9, length: 15.9, thickness: 1.8 }
    ],
    cardSizes: [{ id: 'card-std', name: 'Standard', width: 66, length: 91, thickness: 0.5 }],
    standees: [],
    selectedLayerId: null,
    selectedBoxId: null,
    selectedTrayId: null
  };
}

function counterPackage(part: CounterShape, dependencies?: Partial<PartDependencies>): PartPackage {
  return {
    format: PART_PACKAGE_FORMAT,
    formatVersion: PART_PACKAGE_VERSION,
    kind: 'counterShape',
    exportedAt: '2026-11-06T10:00:00.000Z',
    part,
    dependencies: { counterShapes: [], cardSizes: [], standees: [], ...dependencies }
  };
}

const square13: CounterShape = {
  id: 'shape-square',
  name: 'Square',
  baseShape: 'square',
  width: 15.9,
  length: 15.9,
  thickness: 1.3
};

// Deterministic IDs for tests
function sequenceRandom(ids: string[]): () => string {
  let i = 0;
  return () => ids[i++] ?? `gen-${i}`;
}

describe('insertDefinitions', () => {
  it('creates a new definition when no name matches', () => {
    const project = targetProject();
    const hex: CounterShape = { id: 'h1', name: 'Hex', baseShape: 'hex', width: 20, length: 20, thickness: 2 };
    const result = insertDefinitions(project, counterPackage(hex), sequenceRandom(['new-1']));
    expect(result.project.counterShapes).toHaveLength(2);
    expect(result.project.counterShapes[1]).toEqual({ ...hex, id: 'new-1' });
    expect(result.report).toEqual({
      entries: [{ kind: 'counterShape', sourceId: 'h1', targetId: 'new-1', name: 'Hex', action: 'created' }],
      warnings: []
    });
    expect(result.idMap.counterShape.get('h1')).toBe('new-1');
  });

  it('reuses an existing definition with the same name and values', () => {
    const project = targetProject();
    const same = { ...project.counterShapes[0], id: 'other-id' };
    const result = insertDefinitions(project, counterPackage(same));
    expect(result.project.counterShapes).toHaveLength(1);
    expect(result.report.entries[0]).toMatchObject({
      action: 'reused',
      targetId: 'shape-square',
      sourceId: 'other-id'
    });
    expect(result.idMap.counterShape.get('other-id')).toBe('shape-square');
  });

  it('renames when the name matches but values differ (shape-square 1.8 vs 1.3 → "Square (2)")', () => {
    const project = targetProject();
    const result = insertDefinitions(project, counterPackage(square13));
    const added = result.project.counterShapes[1];
    expect(added.name).toBe('Square (2)');
    expect(added.thickness).toBe(1.3);
    expect(added.id).not.toBe('shape-square');
    expect(result.report.entries[0]).toMatchObject({ action: 'renamed', name: 'Square (2)', targetId: added.id });
    expect(result.idMap.counterShape.get('shape-square')).toBe(added.id);
  });

  it('second import of the same package reuses "Square (2)" from the name family, no "Square (3)"', () => {
    const first = insertDefinitions(targetProject(), counterPackage(square13));
    const second = insertDefinitions(first.project, counterPackage(square13));
    expect(second.project.counterShapes.map((s) => s.name)).toEqual(['Square', 'Square (2)']);
    expect(second.report.entries[0]).toMatchObject({
      action: 'reused',
      name: 'Square (2)',
      targetId: first.project.counterShapes[1].id
    });
  });

  it('matches names case-insensitive and reuses with equal values', () => {
    const project = targetProject();
    const result = insertDefinitions(
      project,
      counterPackage({ ...project.counterShapes[0], name: ' square ', id: 'x' })
    );
    expect(result.project.counterShapes).toHaveLength(1);
    expect(result.report.entries[0]).toMatchObject({ action: 'reused', name: 'Square' });
  });

  it('uses the first same-named definition with equal values', () => {
    const project = targetProject();
    project.counterShapes.push({ ...square13, id: 'second-square' });
    const result = insertDefinitions(project, counterPackage(square13));
    expect(result.project.counterShapes).toHaveLength(2);
    expect(result.report.entries[0]).toMatchObject({ action: 'reused', targetId: 'second-square' });
  });

  it('replaces an empty name with "Unnamed counter"', () => {
    const result = insertDefinitions(targetProject(), counterPackage({ ...square13, name: '  ' }));
    expect(result.project.counterShapes[1].name).toBe('Unnamed counter');
    expect(result.report.entries[0]).toMatchObject({ action: 'created', name: 'Unnamed counter' });
  });

  it('allocates a new ID when the random ID collides with an existing one', () => {
    const hex: CounterShape = { id: 'h1', name: 'Hex', baseShape: 'hex', width: 20, length: 20, thickness: 2 };
    const result = insertDefinitions(
      targetProject(),
      counterPackage(hex),
      sequenceRandom(['shape-square', 'card-std', 'free'])
    );
    expect(result.project.counterShapes[1].id).toBe('free');
  });

  it('renames the second of two same-named dependencies with different values', () => {
    const a: CounterShape = { id: 'a', name: 'Token', baseShape: 'circle', width: 10, length: 10, thickness: 2 };
    const b: CounterShape = { ...a, id: 'b', width: 12, length: 12 };
    const pkg = counterPackage(square13, { counterShapes: [a, b] });
    const result = insertDefinitions(targetProject(), pkg);
    expect(result.project.counterShapes.map((s) => s.name)).toEqual(['Square', 'Token', 'Token (2)', 'Square (2)']);
    expect(result.report.entries.map((e) => e.action)).toEqual(['created', 'renamed', 'renamed']);
  });

  it('inserts dependencies of every kind before the part, with separate ID maps', () => {
    const card: CardSize = { id: 'same', name: 'Mini', width: 41, length: 63, thickness: 0.5 };
    const hero: Standee = { ...standee, id: 'same' };
    const pkg = counterPackage(square13, { cardSizes: [card], standees: [hero] });
    const result = insertDefinitions(targetProject(), pkg);
    expect(result.report.entries.map((e) => e.kind)).toEqual(['cardSize', 'standee', 'counterShape']);
    expect(result.idMap.cardSize.get('same')).toBe(result.project.cardSizes[1].id);
    expect(result.idMap.standee.get('same')).toBe(result.project.standees[0].id);
    expect(result.idMap.cardSize.get('same')).not.toBe(result.idMap.standee.get('same'));
  });

  it('drops unknown fields and undefined values of new definitions', () => {
    const part = { ...square13, name: 'Odd', cornerRadius: undefined, extra: 1 } as CounterShape;
    const result = insertDefinitions(targetProject(), counterPackage(part));
    const added = result.project.counterShapes[1];
    expect(added).not.toHaveProperty('extra');
    expect('cornerRadius' in added).toBe(false);
  });

  it('leaves project and package unchanged', () => {
    const project = targetProject();
    const pkg = counterPackage(square13, { counterShapes: [{ ...square13, id: 'dep', name: 'Dep' }] });
    const projectCopy = structuredClone(project);
    const pkgCopy = structuredClone(pkg);
    const result = insertDefinitions(project, pkg);
    expect(project).toEqual(projectCopy);
    expect(pkg).toEqual(pkgCopy);
    expect(result.project).not.toBe(project);
  });

  it('round trip: build from project A, insert into project B keeps name and values', () => {
    const projectA = targetProject();
    projectA.counterShapes.push({
      id: 'triangle-a',
      name: 'Triangle',
      baseShape: 'triangle',
      width: 18,
      length: 16,
      thickness: 2,
      cornerRadius: 2
    });
    const built = buildPartPackage(projectA, { kind: 'counterShape', id: 'triangle-a' }, new Date());
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const projectB = targetProject();
    const result = insertDefinitions(projectB, validated.package);
    const inserted = result.project.counterShapes.find((s) => s.name === 'Triangle');
    const { id: _sourceId, ...values } = projectA.counterShapes[1];
    expect(inserted).toMatchObject(values);
    expect(inserted?.id).not.toBe('triangle-a');
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

function definitionPackage<K extends 'cardSize' | 'standee'>(
  kind: K,
  part: K extends 'cardSize' ? CardSize : Standee
): PartPackage {
  return { ...counterPackage(square13), kind, part };
}

describe('findFreeName edge cases', () => {
  it('strips counters 0 and 1 and starts at 2', () => {
    expect(findFreeName('Square (0)', ['Square (0)'])).toBe('Square (2)');
    expect(findFreeName('Square (1)', ['Square (1)'])).toBe('Square (2)');
    expect(findFreeName('Square (1)', ['Square (1)', 'Square (2)'])).toBe('Square (3)');
  });

  it('strips the counter only with a leading space (plan 3a: " (n)")', () => {
    expect(findFreeName('Square(2)', ['Square(2)'])).toBe('Square(2) (2)');
    expect(findFreeName('Square(2)', ['Square(2)', 'Square(2) (2)'])).toBe('Square(2) (3)');
  });

  it('trims the desired name before counting', () => {
    expect(findFreeName('  Square  ', ['Square'])).toBe('Square (2)');
    expect(findFreeName(' Square (2) ', ['square', 'SQUARE (2)'])).toBe('Square (3)');
  });

  it('keeps a free name exactly as given, including whitespace', () => {
    expect(findFreeName('  Hex ', ['Square'])).toBe('  Hex ');
  });

  it('does not strip a number that is not a trailing counter', () => {
    expect(findFreeName('Square (2) big', ['Square (2) big'])).toBe('Square (2) big (2)');
    expect(findFreeName('Square 2', ['Square 2'])).toBe('Square 2 (2)');
  });

  it('works with an empty taken list and an iterable', () => {
    expect(findFreeName('Square', [])).toBe('Square');
    expect(findFreeName('Square', new Set(['Square']))).toBe('Square (2)');
  });
});

describe('areValuesEqual edge cases', () => {
  it('compares floats exactly (rule 8)', () => {
    expect(areValuesEqual('cardSize', { ...cardSize, thickness: 0.1 + 0.2 }, { ...cardSize, thickness: 0.3 })).toBe(
      false
    );
  });

  it('fills defaults on both sides', () => {
    expect(areValuesEqual('counterShape', { ...square, cornerRadius: 1.5 }, { ...square, pointyTop: false })).toBe(
      true
    );
  });

  it('does not fill defaults for card sizes and standees', () => {
    const missing = { ...cardSize, thickness: undefined as unknown as number };
    expect(areValuesEqual('cardSize', cardSize, missing)).toBe(false);
  });

  it('ignores unknown extra fields', () => {
    expect(areValuesEqual('standee', standee, { ...standee, extra: 1 } as Standee)).toBe(true);
  });
});

describe('createIdAllocator edge cases', () => {
  it('skips empty IDs from the random function', () => {
    const next = createIdAllocator(new Set(), sequenceRandom(['', 'ok']));
    expect(next()).toBe('ok');
  });
});

describe('collectAllIds edge cases', () => {
  it('handles a project without optional arrays', () => {
    const ids = collectAllIds({ name: 'P', layers: [{ id: 'l' }] } as unknown as Project);
    expect([...ids]).toEqual(['l']);
  });
});

describe('insertDefinitions edge cases', () => {
  it('reuses, renames and creates card sizes', () => {
    const project = targetProject();
    const same = insertDefinitions(project, definitionPackage('cardSize', { ...cardSize, id: 'x', name: 'standard' }));
    expect(same.project.cardSizes).toHaveLength(1);
    expect(same.report.entries[0]).toMatchObject({ kind: 'cardSize', action: 'reused', targetId: 'card-std' });

    const other = insertDefinitions(
      project,
      definitionPackage('cardSize', { ...cardSize, name: 'Standard', width: 63 })
    );
    expect(other.project.cardSizes.map((c) => c.name)).toEqual(['Standard', 'Standard (2)']);
    expect(other.report.entries[0].action).toBe('renamed');

    const created = insertDefinitions(project, definitionPackage('cardSize', { ...cardSize, name: 'Mini' }));
    expect(created.report.entries[0].action).toBe('created');
  });

  it('creates a standee in a project without standees and reuses it on the second import', () => {
    const project = targetProject();
    delete (project as Partial<Project>).standees;
    const first = insertDefinitions(project, definitionPackage('standee', standee), sequenceRandom(['new-st']));
    expect(first.project.standees).toEqual([{ ...standee, id: 'new-st' }]);
    expect('standees' in project).toBe(false);

    const second = insertDefinitions(first.project, definitionPackage('standee', standee));
    expect(second.project.standees).toHaveLength(1);
    expect(second.report.entries[0]).toMatchObject({ action: 'reused', targetId: 'new-st' });
  });

  it('a second import of a new counter adds nothing (F1.4 acceptance on logic level)', () => {
    const hex: CounterShape = { id: 'h1', name: 'Hex', baseShape: 'hex', width: 20, length: 20, thickness: 2 };
    const first = insertDefinitions(targetProject(), counterPackage(hex));
    const second = insertDefinitions(first.project, counterPackage(hex));
    expect(second.project.counterShapes).toEqual(first.project.counterShapes);
    expect(second.report.entries[0].action).toBe('reused');
  });

  it('reuses when the target lacks cornerRadius and the import has the default 1.5 (rule 9)', () => {
    const result = insertDefinitions(
      targetProject(),
      counterPackage({ ...targetProject().counterShapes[0], cornerRadius: 1.5, pointyTop: false })
    );
    expect(result.project.counterShapes).toHaveLength(1);
    expect(result.project.counterShapes[0]).not.toHaveProperty('cornerRadius');
  });

  it('stores a created name as imported (untrimmed) but counts renamed names from the trimmed base', () => {
    const created = insertDefinitions(targetProject(), counterPackage({ ...square13, name: '  Hex ' }));
    expect(created.project.counterShapes[1].name).toBe('  Hex ');
    const renamed = insertDefinitions(targetProject(), counterPackage({ ...square13, name: ' Square ' }));
    expect(renamed.project.counterShapes[1].name).toBe('Square (2)');
  });

  it('counts up "Unnamed counter" when that name is taken with other values (4a)', () => {
    const project = targetProject();
    project.counterShapes.push({ ...square, id: 'u', name: 'Unnamed counter' });
    const result = insertDefinitions(project, counterPackage({ ...square13, name: '' }));
    expect(result.project.counterShapes[2].name).toBe('Unnamed counter (2)');
  });

  it('skips a same-named definition with other values and reuses a later equal one (4b)', () => {
    const project = targetProject();
    project.counterShapes.push({ ...square13, id: 'eq-1', name: 'SQUARE' }, { ...square13, id: 'eq-2' });
    const result = insertDefinitions(project, counterPackage(square13));
    expect(result.report.entries[0]).toMatchObject({ action: 'reused', targetId: 'eq-1', name: 'SQUARE' });
  });

  it('works with deep-frozen project and package', () => {
    const project = deepFreeze(targetProject());
    const pkg = deepFreeze(counterPackage(square13, { cardSizes: [{ ...cardSize, id: 'c', name: 'Mini' }] }));
    const projectCopy = structuredClone(project);
    const pkgCopy = structuredClone(pkg);
    const result = insertDefinitions(project, pkg);
    expect(project).toEqual(projectCopy);
    expect(pkg).toEqual(pkgCopy);
    expect(result.project.counterShapes).toHaveLength(2);
    expect(result.project.counterShapes[1]).not.toBe(pkg.part);
  });

  it('gives new definitions IDs that are unique across the whole project', () => {
    const project = targetProject();
    project.layers = [{ id: 'taken-layer', name: 'L', boxes: [], looseTrays: [] }] as unknown as Project['layers'];
    const result = insertDefinitions(
      project,
      counterPackage({ ...square13, name: 'New' }),
      sequenceRandom(['taken-layer', 'fresh'])
    );
    expect(result.project.counterShapes[1].id).toBe('fresh');
  });
});

describe('canonicalize prototype safety (review)', () => {
  it('keeps an own "__proto__" key from JSON.parse as a plain key', () => {
    const parsed = JSON.parse('{"__proto__": {"x":1}, "a":1}');
    const result = canonicalize(parsed) as Record<string, unknown>;
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.keys(result)).toEqual(['__proto__', 'a']);
    expect((result as { x?: unknown }).x).toBeUndefined();
    expect(JSON.stringify(result)).toBe('{"__proto__":{"x":1},"a":1}');
  });
});

describe('name family reuse (correction A)', () => {
  const square18 = targetProject().counterShapes[0];

  it('imported name "Square (2)" finds an equal "Square"', () => {
    const result = insertDefinitions(targetProject(), counterPackage({ ...square18, id: 'x', name: 'Square (2)' }));
    expect(result.project.counterShapes).toHaveLength(1);
    expect(result.report.entries[0]).toMatchObject({ action: 'reused', targetId: 'shape-square', name: 'Square' });
  });

  it('prefers the exact name over another family member when both are equal', () => {
    const project = targetProject();
    project.counterShapes.unshift({ ...square13, id: 'family', name: 'Square (2)' });
    project.counterShapes.push({ ...square13, id: 'exact', name: 'Square (3)' });
    const result = insertDefinitions(project, counterPackage({ ...square13, name: 'Square (3)' }));
    expect(result.report.entries[0]).toMatchObject({ action: 'reused', targetId: 'exact' });
  });

  it('uses family members in array order after the exact name', () => {
    const project = targetProject();
    project.counterShapes.push(
      { ...square13, id: 'f3', name: 'Square (3)' },
      { ...square13, id: 'f2', name: 'Square (2)' }
    );
    const result = insertDefinitions(project, counterPackage(square13));
    expect(result.report.entries[0]).toMatchObject({ action: 'reused', targetId: 'f3' });
  });

  it('counts up to the next free number when no family member is equal', () => {
    const project = targetProject();
    project.counterShapes.push({ ...square18, id: 'f2', name: 'Square (2)', thickness: 2.5 });
    const result = insertDefinitions(project, counterPackage(square13));
    expect(result.project.counterShapes.map((s) => s.name)).toEqual(['Square', 'Square (2)', 'Square (3)']);
    expect(result.report.entries[0].action).toBe('renamed');
  });

  it('does not treat "Square(2)" or "Squarey" as family', () => {
    const project = targetProject();
    project.counterShapes = [
      { ...square13, id: 'nospace', name: 'Square(2)' },
      { ...square13, id: 'longer', name: 'Squarey' }
    ];
    const result = insertDefinitions(project, counterPackage(square13));
    expect(result.report.entries[0]).toMatchObject({ action: 'created', name: 'Square' });
    expect(result.project.counterShapes).toHaveLength(3);
  });
});
