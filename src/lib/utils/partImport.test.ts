import type { CardSize, CounterShape, Project, Standee, Tray } from '#lib/types/project.js';
import {
  areValuesEqual,
  canonicalize,
  collectAllIds,
  collectReferences,
  createIdAllocator,
  findDeadReferences,
  findFreeName,
  namesMatch
} from '#lib/utils/partImport.js';
import type { PartDependencies } from '#lib/utils/partPackage.js';
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

const cardDrawTray: Tray = {
  ...base,
  id: 't-draw',
  type: 'cardDraw',
  params: {
    cardSizeId: 'cs1',
    cardCount: 50,
    wallThickness: 4,
    floorThickness: 4,
    clearance: 1.5,
    floorSlopeAngle: 5,
    magnetHoleDiameter: 6,
    magnetHoleDepth: 3
  }
};

const cardDividerTray: Tray = {
  ...base,
  id: 't-divider',
  type: 'cardDivider',
  params: {
    stacks: [
      { cardSizeId: 'cs1', count: 30 },
      { cardSizeId: 'cs2', count: 30 }
    ],
    orientation: 'horizontal',
    stackDirection: 'frontToBack',
    wallThickness: 2,
    floorThickness: 2,
    clearance: 1.5,
    rimHeight: 3
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

const standeeTray: Tray = {
  ...base,
  id: 't-standee',
  type: 'standee',
  params: {
    standeeId: 'st1',
    count: 12,
    wallThickness: 2,
    innerWallThickness: 2,
    floorThickness: 2,
    clearance: 0.5,
    rimHeight: 2,
    trayWidthOverride: null,
    trayDepthOverride: null
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

describe('collectReferences', () => {
  it('finds counter shape references with paths', () => {
    expect(collectReferences(counterTray)).toEqual([
      { kind: 'counterShape', id: 's1', path: 'params.topLoadedStacks[0][0]' },
      { kind: 'counterShape', id: 's2', path: 'params.topLoadedStacks[1][0]' },
      { kind: 'counterShape', id: 's3', path: 'params.edgeLoadedStacks[0][0]' }
    ]);
  });

  it('finds card size references', () => {
    expect(collectReferences(cardDrawTray)).toEqual([{ kind: 'cardSize', id: 'cs1', path: 'params.cardSizeId' }]);
    expect(collectReferences(cardDividerTray)).toEqual([
      { kind: 'cardSize', id: 'cs1', path: 'params.stacks[0].cardSizeId' },
      { kind: 'cardSize', id: 'cs2', path: 'params.stacks[1].cardSizeId' }
    ]);
    expect(collectReferences(cardWellTray).map((r) => r.path)).toEqual([
      'params.stacks[0].cardSizeId',
      'params.stacks[1].cardSizeId'
    ]);
  });

  it('finds standee references and none for cup trays', () => {
    expect(collectReferences(standeeTray)).toEqual([{ kind: 'standee', id: 'st1', path: 'params.standeeId' }]);
    expect(collectReferences(cupTray)).toEqual([]);
  });
});

describe('findDeadReferences', () => {
  const definitions: PartDependencies = { counterShapes: [square], cardSizes: [cardSize], standees: [standee] };

  it('reports missing definitions', () => {
    expect(findDeadReferences(counterTray, definitions)).toEqual([
      { kind: 'counterShape', id: 's2', path: 'params.topLoadedStacks[1][0]' },
      { kind: 'counterShape', id: 's3', path: 'params.edgeLoadedStacks[0][0]' }
    ]);
    expect(findDeadReferences(cardDividerTray, definitions)).toEqual([
      { kind: 'cardSize', id: 'cs2', path: 'params.stacks[1].cardSizeId' }
    ]);
  });

  it('reports card well stacks without a matching cell', () => {
    expect(findDeadReferences(cardWellTray, definitions)).toEqual([
      { kind: 'cell', id: 'cell-x', path: 'params.stacks[1].cellId' }
    ]);
  });

  it('returns an empty list when everything resolves', () => {
    expect(findDeadReferences(cardDrawTray, definitions)).toEqual([]);
    expect(findDeadReferences(standeeTray, definitions)).toEqual([]);
    expect(findDeadReferences(cupTray, definitions)).toEqual([]);
  });
});
