/* eslint-disable @typescript-eslint/no-explicit-any -- tests mutate foreign-shaped tray data */
import type { Project, Tray } from '#lib/types/project.js';
import {
  collectAllIds,
  importPartPackage,
  renewTrayInnerIds,
  resetBoxAutoLayout,
  type PartImportOptions,
  type PartImportTarget
} from '#lib/utils/partImport.js';
import { buildPartPackage, validatePartPackage, type PartPackage } from '#lib/utils/partPackage.js';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-11-06T10:00:00.000Z');
const GAME_CONTAINER = { gameContainerWidth: 111, gameContainerDepth: 222 };
const BOX_TARGET: PartImportTarget = { kind: 'box', boxId: 'box-t' };
const LAYER_TARGET: PartImportTarget = { kind: 'layer', layerId: 'layer-t' };
const trayBase = { color: '#336699', rotationOverride: 90, showEmboss: false } as const;

const square = { id: 'shape-square', name: 'Square', baseShape: 'square', width: 15.9, length: 15.9, thickness: 1.8 };
const cardStd = { id: 'card-std', name: 'Standard', width: 66, length: 91, thickness: 0.5 };
const hero = {
  id: 'standee-std',
  name: 'Hero',
  baseRadius: 9,
  baseThickness: 3,
  standeeHeight: 40,
  standeeWidth: 25,
  standeeThickness: 1.5
};

function makeTrays(): Tray[] {
  return [
    {
      ...trayBase,
      id: 't-counter',
      name: 'Counter tray',
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
      showStackLabels: false,
      params: {
        stacks: [{ cardSizeId: 'card-std', count: 10 }],
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
        layout: { columns: [['cell-a', 'cell-b'], ['cell-c']] },
        stacks: [
          { id: 'stack-1', cellId: 'cell-a', cardSizeId: 'card-std', count: 10, rotation: 0 },
          { id: 'stack-2', cellId: 'cell-c', cardSizeId: 'card-std', count: 5, rotation: 90 }
        ],
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

function emptyProject(): Project {
  return {
    name: 'P',
    layers: [],
    counterShapes: [],
    cardSizes: [],
    standees: [],
    selectedLayerId: null,
    selectedBoxId: null,
    selectedTrayId: null
  } as unknown as Project;
}

// Source: all trays loose in one layer, definitions present
function makeSource(trays: Tray[] = makeTrays()): Project {
  return {
    ...emptyProject(),
    counterShapes: [square],
    cardSizes: [cardStd],
    standees: [hero],
    layers: [{ id: 'layer-s', name: 'S', boxes: [], looseTrays: trays }]
  } as unknown as Project;
}

// Target: a layer with a manual layout, a box with manual layout and a custom height, one existing tray
function makeTarget(): Project {
  return {
    ...emptyProject(),
    layers: [
      {
        id: 'layer-t',
        name: 'T',
        manualLayout: { boxes: [], looseTrays: [{ trayId: 'old', x: 1, y: 2 }] },
        looseTrays: [],
        boxes: [
          {
            id: 'box-t',
            name: 'Box',
            customWidth: 80,
            customDepth: 90,
            customBoxHeight: 30,
            manualLayout: { trays: [] },
            trays: [{ ...trayBase, id: 'existing', name: 'Existing', type: 'cup', params: {} }]
          }
        ]
      }
    ]
  } as unknown as Project;
}

function packageOf(source: Project, trayId: string): PartPackage {
  const built = buildPartPackage(source, { kind: 'tray', id: trayId }, NOW);
  if (!built.ok) throw new Error(built.error.message);
  // File round trip, like a real import
  const validated = validatePartPackage(JSON.parse(JSON.stringify(built.package)));
  if (!validated.ok) throw new Error(validated.error.message);
  return validated.package;
}

function options(target: PartImportTarget = BOX_TARGET): PartImportOptions {
  return { target, gameContainer: GAME_CONTAINER };
}

function seqRandom(prefix = 'n'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function insertedTray(result: { project: Project; insertedId?: string }): Tray {
  const layer = result.project.layers[0];
  const all = [...layer.looseTrays, ...layer.boxes.flatMap((box) => box.trays)];
  const tray = all.find((candidate) => candidate.id === result.insertedId);
  if (!tray) throw new Error('inserted tray not found');
  return tray;
}

describe('importPartPackage: trays of all types', () => {
  const trayIds = ['t-counter', 't-draw', 't-divider', 't-cup', 't-well', 't-standee'];

  for (const target of [BOX_TARGET, LAYER_TARGET]) {
    it(`imports every tray type (${target.kind}) with new IDs and values kept`, () => {
      const source = makeSource();
      for (const trayId of trayIds) {
        const pkg = packageOf(source, trayId);
        const sourceTray = pkg.part as Tray;
        const result = importPartPackage(makeTarget(), pkg, options(target), seqRandom());
        const tray = insertedTray(result);

        expect(tray.id).not.toBe(sourceTray.id);
        expect(tray.type).toBe(sourceTray.type);
        expect(tray.name).toBe(sourceTray.name);
        expect(tray.color).toBe('#336699');
        expect(tray.rotationOverride).toBe(90);
        expect(tray.showEmboss).toBe(false);
        expect(result.report.entries.find((e) => e.kind === 'tray')).toMatchObject({
          sourceId: sourceTray.id,
          targetId: tray.id,
          action: 'created'
        });
        expect(result.idMap.tray.get(sourceTray.id)).toBe(tray.id);

        // Placed in the right container
        const layer = result.project.layers[0];
        const inBox = layer.boxes[0].trays.some((t) => t.id === tray.id);
        expect(inBox).toBe(target.kind === 'box');
        expect(layer.looseTrays.some((t) => t.id === tray.id)).toBe(target.kind === 'layer');
      }
    });
  }

  it('keeps values, takes the game container from the options and the counter shape from the target', () => {
    const pkg = packageOf(makeSource(), 't-counter');
    const result = importPartPackage(makeTarget(), pkg, options(), seqRandom());
    const tray = insertedTray(result) as any;
    expect(tray.params.gameContainerWidth).toBe(111);
    expect(tray.params.gameContainerDepth).toBe(222);
    expect(tray.params.counterThickness).toBe(1.8);
    expect(tray.params.trayWidthOverride).toBe(0);
    const shapeId = result.project.counterShapes[0].id;
    expect(shapeId).not.toBe('shape-square');
    expect(tray.params.topLoadedStacks[0][0]).toBe(shapeId);
    expect(tray.params.edgeLoadedStacks[0][0]).toBe(shapeId);
    expect(tray.params.topLoadedStacks[0].slice(1)).toEqual([10, 'A']);
  });

  it('keeps showStackLabels of a card divider and rewrites its card size references', () => {
    const result = importPartPackage(makeTarget(), packageOf(makeSource(), 't-divider'), options(), seqRandom());
    const tray = insertedTray(result) as any;
    expect(tray.showStackLabels).toBe(false);
    expect(tray.params.stacks[0].cardSizeId).toBe(result.project.cardSizes[0].id);
  });

  it('rewrites card draw and standee references', () => {
    const draw = importPartPackage(makeTarget(), packageOf(makeSource(), 't-draw'), options(), seqRandom());
    expect((insertedTray(draw) as any).params.cardSizeId).toBe(draw.project.cardSizes[0].id);
    const standee = importPartPackage(makeTarget(), packageOf(makeSource(), 't-standee'), options(), seqRandom());
    expect((insertedTray(standee) as any).params.standeeId).toBe(standee.project.standees[0].id);
  });

  it('keeps an empty reference empty', () => {
    const trays = makeTrays();
    (trays[1] as any).params.cardSizeId = '';
    const result = importPartPackage(makeTarget(), packageOf(makeSource(trays), 't-draw'), options(), seqRandom());
    expect((insertedTray(result) as any).params.cardSizeId).toBe('');
    expect(result.project.cardSizes).toEqual([]);
  });
});

describe('importPartPackage: definitions of a tray', () => {
  it('reuses equal definitions and renames different ones', () => {
    const target = makeTarget();
    target.counterShapes = [{ ...square, id: 'mine' }] as any;
    target.cardSizes = [{ ...cardStd, id: 'mine-card', width: 70 }] as any;

    const counter = importPartPackage(target, packageOf(makeSource(), 't-counter'), options(), seqRandom());
    expect(counter.project.counterShapes).toHaveLength(1);
    expect((insertedTray(counter) as any).params.topLoadedStacks[0][0]).toBe('mine');
    expect(counter.report.entries.find((e) => e.kind === 'counterShape')?.action).toBe('reused');

    const draw = importPartPackage(target, packageOf(makeSource(), 't-draw'), options(), seqRandom());
    expect(draw.project.cardSizes.map((c) => c.name)).toEqual(['Standard', 'Standard (2)']);
    const added = draw.project.cardSizes[1];
    expect((insertedTray(draw) as any).params.cardSizeId).toBe(added.id);
    expect(draw.report.entries.find((e) => e.kind === 'cardSize')?.action).toBe('renamed');
  });

  it('inserts each shared definition once', () => {
    const result = importPartPackage(makeTarget(), packageOf(makeSource(), 't-counter'), options(), seqRandom());
    expect(result.project.counterShapes).toHaveLength(1);
  });
});

describe('importPartPackage: tray name', () => {
  it('counts the name up against all tray names in the project (Q1)', () => {
    const target = makeTarget();
    (target.layers[0].boxes[0].trays[0] as any).name = 'Counter tray';
    // "(2)" taken by a loose tray of another layer
    target.layers.push({
      id: 'layer-2',
      name: 'L2',
      boxes: [],
      looseTrays: [{ ...(makeTrays()[0] as any), id: 'x2', name: 'Counter tray (2)' }]
    });
    const pkg = packageOf(makeSource(), 't-counter');

    const first = importPartPackage(target, pkg, options(), seqRandom());
    expect(insertedTray(first).name).toBe('Counter tray (3)');
    expect(first.report.entries.find((e) => e.kind === 'tray')?.action).toBe('renamed');

    // Importing again into the result continues counting
    const second = importPartPackage(first.project, pkg, options(), seqRandom('m'));
    expect(insertedTray(second).name).toBe('Counter tray (4)');
  });

  it('replaces an empty name', () => {
    const trays = makeTrays();
    trays[0].name = '  ';
    const result = importPartPackage(makeTarget(), packageOf(makeSource(trays), 't-counter'), options(), seqRandom());
    expect(insertedTray(result).name).toBe('Unnamed tray');
  });
});

describe('importPartPackage: inner IDs', () => {
  it('imports a cup tray twice with separate cup IDs, different from the source', () => {
    const pkg = packageOf(makeSource(), 't-cup');
    const first = importPartPackage(makeTarget(), pkg, options(), seqRandom());
    const second = importPartPackage(first.project, pkg, options(), seqRandom('m'));
    const cupIds = (tray: Tray): string[] => {
      const root = (tray as any).params.layout.root;
      return [root.first.id, root.second.id];
    };
    const a = cupIds(insertedTray(first));
    const b = cupIds(insertedTray(second));
    expect(new Set([...a, ...b, 'cup-1', 'cup-2']).size).toBe(6);
    expect((insertedTray(first) as any).params.layout.root.ratio).toBe(0.5);
    expect((insertedTray(first) as any).params.cupCavityHeight).toBeNull();
  });

  it('renews card well cells and stacks and links stacks to the new cells', () => {
    const result = importPartPackage(makeTarget(), packageOf(makeSource(), 't-well'), options(), seqRandom());
    const params = (insertedTray(result) as any).params;
    const cells: string[] = params.layout.columns.flat();
    expect(cells).toHaveLength(3);
    expect(cells.some((id) => id.startsWith('cell-'))).toBe(false);
    expect(params.layout.columns.map((c: string[]) => c.length)).toEqual([2, 1]);
    expect(params.stacks.map((s: any) => s.cellId)).toEqual([cells[0], cells[2]]);
    expect(params.stacks.every((s: any) => !s.id.startsWith('stack-'))).toBe(true);
    expect(params.stacks[1].rotation).toBe(90);
    expect(params.stacks[0].cardSizeId).toBe(result.project.cardSizes[0].id);
    expect(result.report.warnings).toEqual([]);
  });

  it('drops card well stacks without a cell and reports them (Q7b)', () => {
    const trays = makeTrays();
    (trays[4] as any).params.stacks.push({
      id: 'orphan',
      cellId: 'gone',
      cardSizeId: 'card-std',
      count: 1,
      rotation: 0
    });
    const result = importPartPackage(makeTarget(), packageOf(makeSource(trays), 't-well'), options(), seqRandom());
    const params = (insertedTray(result) as any).params;
    expect(params.stacks).toHaveLength(2);
    expect(result.report.warnings).toHaveLength(1);
    expect(result.report.warnings[0]).toContain('1 card well stack without a cell was dropped');
    expect(result.report.warnings[0]).toContain('Wells');
  });

  it('gives a stack without an ID a new one (S6)', () => {
    const trays = makeTrays();
    delete (trays[4] as any).params.stacks[0].id;
    const result = importPartPackage(makeTarget(), packageOf(makeSource(trays), 't-well'), options(), seqRandom());
    const stack = (insertedTray(result) as any).params.stacks[0];
    expect(typeof stack.id).toBe('string');
    expect(stack.id).not.toBe('');
  });

  it('maps duplicate source IDs inside a tray to one new ID each (Q7a)', () => {
    const trays = makeTrays();
    (trays[3] as any).params.layout.root.second.id = 'cup-1';
    const result = importPartPackage(makeTarget(), packageOf(makeSource(trays), 't-cup'), options(), seqRandom());
    const root = (insertedTray(result) as any).params.layout.root;
    expect(root.first.id).toBe(root.second.id);
    expect(root.first.id).not.toBe('cup-1');
  });

  it('leaves no source ID in the result except those of reused definitions', () => {
    const source = makeSource();
    const sourceIds = ['t-well', 'cell-a', 'cell-b', 'cell-c', 'stack-1', 'stack-2'];
    const result = importPartPackage(makeTarget(), packageOf(source, 't-well'), options(), seqRandom());
    const ids = collectAllIds(result.project);
    for (const id of sourceIds) expect(ids.has(id)).toBe(false);
    // Definitions were created, so their source IDs are gone as well
    expect(ids.has('card-std')).toBe(false);
  });

  it('renewTrayInnerIds does not change its input', () => {
    const tray = makeTrays()[4];
    const before = JSON.stringify(tray);
    const renewed = renewTrayInnerIds(tray, seqRandom());
    expect(JSON.stringify(tray)).toBe(before);
    expect(renewed.droppedStacks).toBe(0);
    expect(renewed.tray.id).toBe(tray.id);
  });
});

describe('importPartPackage: layout of the target', () => {
  it('resets the auto layout of a box but keeps customBoxHeight', () => {
    const result = importPartPackage(makeTarget(), packageOf(makeSource(), 't-cup'), options(BOX_TARGET), seqRandom());
    const box = result.project.layers[0].boxes[0];
    expect(box.manualLayout).toBeUndefined();
    expect(box.customWidth).toBeUndefined();
    expect(box.customDepth).toBeUndefined();
    expect(box.customBoxHeight).toBe(30);
    expect(box.trays.map((t) => t.name)).toEqual(['Existing', 'Cups']);
  });

  it('leaves the manual layout of the layer alone for a loose tray', () => {
    const result = importPartPackage(
      makeTarget(),
      packageOf(makeSource(), 't-cup'),
      options(LAYER_TARGET),
      seqRandom()
    );
    const layer = result.project.layers[0];
    expect(layer.manualLayout).toEqual({ boxes: [], looseTrays: [{ trayId: 'old', x: 1, y: 2 }] });
    expect(layer.boxes[0].customWidth).toBe(80);
  });

  it('resetBoxAutoLayout clears exactly the three fields', () => {
    const box: any = { id: 'b', customWidth: 1, customDepth: 2, customBoxHeight: 3, manualLayout: { trays: [] } };
    resetBoxAutoLayout(box);
    expect(box).toMatchObject({ customBoxHeight: 3 });
    expect(Object.values(box).filter((v) => v === undefined)).toHaveLength(3);
  });
});

describe('importPartPackage: errors and purity', () => {
  it('throws without a target for a tray', () => {
    const pkg = packageOf(makeSource(), 't-cup');
    expect(() => importPartPackage(makeTarget(), pkg, { gameContainer: GAME_CONTAINER })).toThrow(
      'Trays are imported via "Add tray" or "Add loose tray" in the navigation.'
    );
  });

  it('throws if the target box or layer no longer exists and changes nothing', () => {
    const target = makeTarget();
    const pkg = packageOf(makeSource(), 't-counter');
    const targetBefore = JSON.stringify(target);
    const pkgBefore = JSON.stringify(pkg);
    expect(() => importPartPackage(target, pkg, options({ kind: 'box', boxId: 'nope' }))).toThrow(
      'The target box no longer exists.'
    );
    expect(() => importPartPackage(target, pkg, options({ kind: 'layer', layerId: 'nope' }))).toThrow(
      'The target layer no longer exists.'
    );
    expect(JSON.stringify(target)).toBe(targetBefore);
    expect(JSON.stringify(pkg)).toBe(pkgBefore);
  });

  it('throws for box and layer packages', () => {
    const pkg = { ...packageOf(makeSource(), 't-cup'), kind: 'box' } as PartPackage;
    expect(() => importPartPackage(makeTarget(), pkg, options())).toThrow('not supported yet');
  });

  it('throws if a reference has no definition in the package', () => {
    const pkg = packageOf(makeSource(), 't-draw');
    pkg.dependencies.cardSizes = [];
    expect(() => importPartPackage(makeTarget(), pkg, options())).toThrow('Missing cardSize');
  });

  it('leaves target project and package unchanged on success', () => {
    const target = makeTarget();
    const pkg = packageOf(makeSource(), 't-well');
    const targetBefore = JSON.stringify(target);
    const pkgBefore = JSON.stringify(pkg);
    importPartPackage(target, pkg, options(), seqRandom());
    expect(JSON.stringify(target)).toBe(targetBefore);
    expect(JSON.stringify(pkg)).toBe(pkgBefore);
  });

  it('avoids forced ID collisions through the random source', () => {
    const target = makeTarget();
    // 'existing' is taken; the generator returns it first, then free IDs
    const ids = ['existing', 'existing', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
    let i = 0;
    const result = importPartPackage(target, packageOf(makeSource(), 't-cup'), options(), () => ids[i++]);
    const all = [...collectAllIds(result.project)];
    expect(all).toHaveLength(new Set(all).size);
    expect(insertedTray(result).id).not.toBe('existing');
  });

  it('still imports definitions like before (target ignored)', () => {
    const built = buildPartPackage(makeSource(), { kind: 'counterShape', id: 'shape-square' }, NOW);
    if (!built.ok) throw new Error('build failed');
    const result = importPartPackage(makeTarget(), built.package, { gameContainer: GAME_CONTAINER }, seqRandom());
    expect(result.insertedId).toBeUndefined();
    expect(result.project.counterShapes.map((s) => s.name)).toEqual(['Square']);
  });
});
