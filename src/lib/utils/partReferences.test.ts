import type { CardSize, CounterShape, Project, Standee, Tile, Tray } from '#lib/types/project.js';
import type { PartDependencies } from '#lib/utils/partPackage.js';
import {
  allowsNameFallback,
  collectReferences,
  countTraysReferencing,
  findDeadReferences,
  mapTrayReferences,
  resolveDefinitionId
} from '#lib/utils/partReferences.js';
import { firstLayer, startProject } from '#lib/utils/partTestFixtures.js';
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

const plate: Tile = { id: 'ti1', name: 'Plate', width: 40, height: 25, thickness: 1.5 };

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

const tileTray = {
  ...base,
  id: 't-tile',
  type: 'tile',
  params: { tileId: 'ti1', count: 4 }
} as unknown as Tray;

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
    trayDepthOverride: null,
    slotWallHeight: null
  }
};

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

  it('finds the tile reference', () => {
    expect(collectReferences(tileTray)).toEqual([{ kind: 'tile', id: 'ti1', path: 'params.tileId' }]);
  });

  it('finds standee references and none for cup trays', () => {
    expect(collectReferences(standeeTray)).toEqual([{ kind: 'standee', id: 'st1', path: 'params.standeeId' }]);
    expect(collectReferences(cupTray)).toEqual([]);
  });
});

describe('findDeadReferences', () => {
  const definitions: PartDependencies = {
    counterShapes: [square],
    cardSizes: [cardSize],
    standees: [standee],
    tiles: []
  };

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

describe('tile references', () => {
  const definitions: PartDependencies = {
    counterShapes: [],
    cardSizes: [],
    standees: [],
    tiles: [plate]
  };

  it('resolves by ID and counts the tray', () => {
    expect(findDeadReferences(tileTray, definitions)).toEqual([]);
    const project = { layers: [{ boxes: [], looseTrays: [tileTray] }] } as unknown as Project;
    expect(countTraysReferencing(project, 'tile', 'ti1')).toBe(1);
    expect(countTraysReferencing(project, 'standee', 'ti1')).toBe(0);
  });

  it('has no name fallback: the name of a tile is a dead reference', () => {
    expect(allowsNameFallback('tile')).toBe(false);
    const byName = { ...tileTray, params: { ...(tileTray as { params: object }).params, tileId: 'Plate' } } as Tray;
    expect(findDeadReferences(byName, definitions)).toEqual([{ kind: 'tile', id: 'Plate', path: 'params.tileId' }]);
  });

  it('rewrites the reference without touching the source', () => {
    const copy = mapTrayReferences(tileTray, (ref) => `x-${ref.id}`);
    expect((copy.params as { tileId: string }).tileId).toBe('x-ti1');
    expect((tileTray.params as { tileId: string }).tileId).toBe('ti1');
  });
});

describe('mapTrayReferences', () => {
  const allTrays = [counterTray, cardDrawTray, cardDividerTray, cardWellTray, standeeTray, cupTray];

  it('visits the same references as collectReferences, for all 6 types', () => {
    for (const tray of allTrays) {
      const visited: string[] = [];
      mapTrayReferences(tray, (ref) => {
        visited.push(`${ref.kind}:${ref.id}@${ref.path}`);
        return ref.id;
      });
      expect(visited).toEqual(collectReferences(tray).map((ref) => `${ref.kind}:${ref.id}@${ref.path}`));
    }
  });

  it('replaces IDs in a copy and leaves the original unchanged', () => {
    const before = JSON.stringify(allTrays);
    const mapped = allTrays.map((tray) => mapTrayReferences(tray, (ref) => `new-${ref.id}`));
    expect(JSON.stringify(allTrays)).toBe(before);
    expect(collectReferences(mapped[0]).map((ref) => ref.id)).toEqual(['new-s1', 'new-s2', 'new-s3']);
    expect(collectReferences(mapped[1])[0].id).toBe('new-cs1');
    expect(collectReferences(mapped[2]).map((ref) => ref.id)).toEqual(['new-cs1', 'new-cs2']);
    expect(collectReferences(mapped[4])[0].id).toBe('new-st1');
    expect(mapped[5]).toEqual(cupTray);
    // other tuple slots stay
    expect((mapped[0] as typeof counterTray).params.topLoadedStacks[1]).toEqual(['new-s2', 10, 'Hex']);
  });

  it('tolerates missing arrays', () => {
    const broken = { ...counterTray, params: { ...counterTray.params, topLoadedStacks: undefined } } as unknown as Tray;
    expect(collectReferences(broken).map((ref) => ref.id)).toEqual(['s3']);
  });
});

describe('malformed foreign data', () => {
  const definitions: PartDependencies = {
    counterShapes: [square],
    cardSizes: [cardSize],
    standees: [standee],
    tiles: []
  };
  const withParams = (tray: Tray, params: object) =>
    ({ ...tray, params: { ...(tray as { params: object }).params, ...params } }) as unknown as Tray;

  it('does not throw for non-array entries and non-array lists', () => {
    const trays = [
      withParams(counterTray, { topLoadedStacks: [null, 'x', 5, ['s1', 1]], edgeLoadedStacks: 'nope' }),
      withParams(cardDividerTray, { stacks: [null, 'x', { cardSizeId: 'cs1' }] }),
      withParams(cardWellTray, { stacks: [null, 7], layout: { columns: 'x' } }),
      withParams(cardWellTray, { stacks: 'nope', layout: null }),
      { ...cardDrawTray, params: null } as unknown as Tray
    ];
    for (const tray of trays) {
      expect(() => mapTrayReferences(tray, (ref) => ref.id)).not.toThrow();
      expect(() => collectReferences(tray)).not.toThrow();
      expect(() => findDeadReferences(tray, definitions)).not.toThrow();
    }
    expect(collectReferences(trays[0]).map((ref) => ref.path)).toEqual(['params.topLoadedStacks[3][0]']);
  });

  it('tolerates stacks: undefined for cardDivider and cardWell', () => {
    for (const tray of [cardDividerTray, cardWellTray]) {
      const noStacks = withParams(tray, { stacks: undefined });
      expect(collectReferences(noStacks)).toEqual([]);
      expect(findDeadReferences(noStacks, definitions)).toEqual([]);
    }
  });
});

describe('resolveDefinitionId', () => {
  const defs: PartDependencies = {
    counterShapes: [
      { ...square, id: 'a', name: 'Square' },
      { ...square, id: 'Square', name: 'Other' }
    ],
    cardSizes: [cardSize],
    standees: [],
    tiles: []
  };

  it('resolves by id, by exact name, empty and dead', () => {
    expect(resolveDefinitionId(defs, 'cardSize', 'cs1')).toBe('cs1');
    expect(resolveDefinitionId(defs, 'cardSize', 'Standard')).toBe('cs1');
    expect(resolveDefinitionId(defs, 'cardSize', '')).toBe('');
    expect(resolveDefinitionId(defs, 'cardSize', 'nope')).toBeNull();
    expect(resolveDefinitionId(defs, 'standee', 'st1')).toBeNull();
  });

  it('name match is case-sensitive', () => {
    expect(resolveDefinitionId(defs, 'cardSize', 'standard')).toBeNull();
  });

  it('id wins over name on conflict', () => {
    expect(resolveDefinitionId(defs, 'counterShape', 'Square')).toBe('Square');
  });

  it('ignores names when allowName is false', () => {
    expect(resolveDefinitionId(defs, 'cardSize', 'Standard', false)).toBeNull();
    expect(resolveDefinitionId(defs, 'cardSize', 'cs1', false)).toBe('cs1');
  });
});

describe('findDeadReferences (F1.5 semantics)', () => {
  const definitions: PartDependencies = {
    counterShapes: [square],
    cardSizes: [cardSize],
    standees: [standee],
    tiles: []
  };

  it('empty references are not dead', () => {
    const empty = {
      ...cardDrawTray,
      params: { ...(cardDrawTray as { params: object }).params, cardSizeId: '' }
    } as Tray;
    expect(findDeadReferences(empty, definitions)).toEqual([]);
  });

  it('a name match is not dead for cardDraw, but is dead for cardDivider', () => {
    const byName = {
      ...cardDrawTray,
      params: { ...(cardDrawTray as { params: object }).params, cardSizeId: 'Standard' }
    } as Tray;
    expect(findDeadReferences(byName, definitions)).toEqual([]);
    const divider = {
      ...cardDividerTray,
      params: { ...(cardDividerTray as { params: object }).params, stacks: [{ cardSizeId: 'Standard', count: 1 }] }
    } as Tray;
    expect(findDeadReferences(divider, definitions)).toEqual([
      { kind: 'cardSize', id: 'Standard', path: 'params.stacks[0].cardSizeId' }
    ]);
  });
});

describe('countTraysReferencing', () => {
  function projectWith(boxTrays: Tray[], looseTrays: Tray[]) {
    const project = startProject();
    for (const layer of project.layers) {
      layer.boxes = [];
      layer.looseTrays = [];
    }
    const layer = firstLayer(project);
    layer.boxes = [{ ...startProject().layers.flatMap((l) => l.boxes)[0], trays: boxTrays }];
    layer.looseTrays = looseTrays;
    return project;
  }

  it('counts box trays and loose trays of the given kind and ID', () => {
    const project = projectWith([standeeTray, { ...standeeTray, id: 't-standee-2' }], [standeeTray]);
    expect(countTraysReferencing(project, 'standee', 'st1')).toBe(3);
  });

  it('ignores other IDs and other kinds', () => {
    const project = projectWith([standeeTray, cardDrawTray], [counterTray]);
    expect(countTraysReferencing(project, 'standee', 'other')).toBe(0);
    // 'cs1' is a card size ID, not a standee ID
    expect(countTraysReferencing(project, 'standee', 'cs1')).toBe(0);
    expect(countTraysReferencing(project, 'cardSize', 'cs1')).toBe(1);
  });

  it('counts a tray once even if it refers to the definition several times', () => {
    const project = projectWith([cardDividerTray], []);
    expect(countTraysReferencing(project, 'cardSize', 'cs1')).toBe(1);
  });
});
