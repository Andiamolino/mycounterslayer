/* eslint-disable @typescript-eslint/no-explicit-any -- tests feed foreign-shaped data */
import type { Layer, Project } from '#lib/types/project.js';
import {
  collectAllIds,
  importPartPackage,
  type GameContainerSize,
  type PartImportOptions
} from '#lib/utils/partImport.js';
import { buildPartPackage, hasImportTarget, validatePartPackage } from '#lib/utils/partPackage.js';
import {
  PART_TEST_CONTAINER,
  PART_TEST_NOW,
  errorOf,
  firstLayer,
  startProject,
  viaFile
} from '#lib/utils/partTestFixtures.js';
import { describe, expect, it } from 'vitest';

// F1.7a: build and check layer packages

function buildLayer(project: Project, id: string) {
  const built = buildPartPackage(project, { kind: 'layer', id }, PART_TEST_NOW);
  if (!built.ok) throw new Error(built.error.message);
  return built;
}

const bottomLayer = (project: Project) => firstLayer(project); // 1 box with 2 trays + 1 loose cup tray
const middleLayer = (project: Project) => project.layers[1]; // 3 loose trays, manual layout
const topLayer = (project: Project) => project.layers[2]; // card well + standee, manual layout

function layerPackage(mutate: (layer: Record<string, any>, pkg: Record<string, any>) => void = () => {}) {
  const project = startProject();
  const pkg = viaFile(buildLayer(project, middleLayer(project).id).package);
  mutate(pkg.part, pkg);
  return pkg;
}

function pairs(warnings: { kind: string; path: string }[]) {
  return warnings.map((w) => [w.kind, w.path]);
}

describe('buildPartPackage for layers', () => {
  it('builds the bottom layer with box, its trays and the loose tray', () => {
    const project = startProject();
    const source = bottomLayer(project);
    const before = JSON.stringify(project);
    const { package: pkg, warnings } = buildLayer(project, source.id);
    const part = pkg.part as Layer;
    expect(pkg.kind).toBe('layer');
    expect(warnings).toEqual([]);
    expect(part.id).toBe(source.id);
    expect(part.name).toBe('Bottom layer');
    expect(part.boxes.map((box) => box.id)).toEqual(source.boxes.map((box) => box.id));
    expect(part.boxes[0].trays).toHaveLength(2);
    expect(part.looseTrays.map((tray) => tray.name)).toEqual(['Cup tray']);
    expect(JSON.stringify(project)).toBe(before);
    expect(part).not.toBe(source);
  });

  it('keeps the layer manual layout and unknown extra fields', () => {
    const project = startProject();
    const source = middleLayer(project);
    (source as any).extra = { a: 1 };
    const part = buildLayer(project, source.id).package.part as Layer;
    expect(part.manualLayout).toEqual(source.manualLayout);
    expect((part as any).extra).toEqual({ a: 1 });
  });

  it('has no game container size in any tray and only used definitions', () => {
    const project = startProject();
    const pkg = buildLayer(project, bottomLayer(project).id).package;
    const part = pkg.part as Layer;
    for (const tray of [...part.boxes.flatMap((box) => box.trays), ...part.looseTrays]) {
      expect(JSON.stringify(tray)).not.toContain('gameContainer');
    }
    // Counter trays use counter shapes, nothing else is used
    expect(pkg.dependencies.counterShapes.length).toBeGreaterThan(0);
    expect(pkg.dependencies.cardSizes).toEqual([]);
    expect(pkg.dependencies.standees).toEqual([]);
  });

  it('lists a definition used by a box tray and a loose tray once', () => {
    const project = startProject();
    const layer = bottomLayer(project);
    const boxTray = layer.boxes[0].trays[0] as any;
    const shapeId = boxTray.params.topLoadedStacks[0][0];
    // Make the loose cup tray a counter tray that uses the same shape
    layer.looseTrays[0] = { ...JSON.parse(JSON.stringify(boxTray)), id: 'loose-counter', name: 'Loose' };
    const deps = buildLayer(project, layer.id).package.dependencies;
    expect(deps.counterShapes.filter((shape) => shape.id === shapeId)).toHaveLength(1);
  });

  it('collects dependencies over all trays of the top layer', () => {
    const project = startProject();
    const { package: pkg } = buildLayer(project, topLayer(project).id);
    expect(pkg.dependencies.cardSizes.length).toBeGreaterThan(0);
    expect(pkg.dependencies.standees.length).toBeGreaterThan(0);
  });

  it('allows an empty layer', () => {
    const project = startProject();
    const empty = { id: 'empty', name: 'Empty', boxes: [], looseTrays: [] };
    project.layers.push(empty);
    const { package: pkg, warnings } = buildLayer(project, 'empty');
    expect(warnings).toEqual([]);
    expect(validatePartPackage(viaFile(pkg)).ok).toBe(true);
  });

  it('replaces an empty name', () => {
    const project = startProject();
    bottomLayer(project).name = '  ';
    expect((buildLayer(project, bottomLayer(project).id).package.part as Layer).name).toBe('Unnamed layer');
  });

  it('warns about dead references with paths relative to the file', () => {
    const project = startProject();
    const layer = middleLayer(project);
    (layer.looseTrays[0] as any).params.cardSizeId = 'gone';
    const bottom = bottomLayer(project);
    (bottom.boxes[0].trays[0] as any).params.topLoadedStacks[0][0] = 'gone-shape';
    const w1 = buildLayer(project, layer.id).warnings;
    expect(pairs(w1)).toEqual([['cardSize', 'looseTrays[0].params.cardSizeId']]);
    const w2 = buildLayer(project, bottom.id).warnings;
    expect(pairs(w2)).toEqual([['counterShape', 'boxes[0].trays[0].params.topLoadedStacks[0][0]']]);
  });

  it('reports repeated box IDs and loose tray IDs', () => {
    const project = startProject();
    const layer = bottomLayer(project);
    layer.boxes.push(JSON.parse(JSON.stringify(layer.boxes[0])));
    layer.looseTrays.push(JSON.parse(JSON.stringify(layer.looseTrays[0])));
    const { warnings } = buildLayer(project, layer.id);
    expect(pairs(warnings)).toEqual([
      ['boxId', 'boxes[1].id'],
      ['trayId', 'looseTrays[1].id']
    ]);
  });

  it('allows the same tray ID in different boxes', () => {
    const project = startProject();
    const layer = bottomLayer(project);
    layer.boxes.push({ ...JSON.parse(JSON.stringify(layer.boxes[0])), id: 'other-box' });
    const { package: pkg, warnings } = buildLayer(project, layer.id);
    expect(warnings).toEqual([]);
    expect(validatePartPackage(viaFile(pkg)).ok).toBe(true);
  });

  it('reports orphan, duplicate and malformed layer layout entries', () => {
    const project = startProject();
    const layer = middleLayer(project);
    const [a, b] = layer.looseTrays.map((tray) => tray.id);
    layer.manualLayout = {
      boxes: [{ boxId: 'ghost-box', x: 0, y: 0, rotation: 0 }],
      looseTrays: [
        { trayId: a, x: 0, y: 0, rotation: 0 },
        { trayId: 'ghost', x: 1, y: 1, rotation: 0 },
        { trayId: a, x: 2, y: 2, rotation: 0 },
        { trayId: b, x: 'no', y: 0, rotation: 0 } as any
      ]
    };
    const { warnings } = buildLayer(project, layer.id);
    expect(pairs(warnings)).toEqual([
      ['layoutEntry', 'manualLayout.boxes[0]'],
      ['layoutEntry', 'manualLayout.looseTrays[1]'],
      ['layoutEntry', 'manualLayout.looseTrays[2]'],
      ['layoutForm', 'manualLayout.looseTrays[3]']
    ]);
  });

  it('reports a malformed layout object and lists', () => {
    const project = startProject();
    const layer = middleLayer(project);
    (layer as any).manualLayout = 'x';
    expect(pairs(buildLayer(project, layer.id).warnings)).toEqual([['layoutForm', 'manualLayout']]);
    (layer as any).manualLayout = { boxes: {}, looseTrays: [] };
    expect(pairs(buildLayer(project, layer.id).warnings)).toEqual([['layoutForm', 'manualLayout.boxes']]);
  });

  it('never throws on broken data', () => {
    const project = startProject();
    const layer = bottomLayer(project) as any;
    layer.boxes.push(null);
    layer.looseTrays = undefined;
    expect(buildPartPackage(project, { kind: 'layer', id: layer.id }, PART_TEST_NOW).ok).toBe(true);
  });

  it('returns notFound for an unknown ID', () => {
    const result = buildPartPackage(startProject(), { kind: 'layer', id: 'nope' }, PART_TEST_NOW);
    expect(!result.ok && result.error.code).toBe('notFound');
  });
});

describe('validatePartPackage for layers', () => {
  it('builds and checks to the same package for every start layer', () => {
    const project = startProject();
    for (const layer of project.layers) {
      const built = buildLayer(project, layer.id).package;
      const checked = validatePartPackage(viaFile(built));
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.package).toEqual(built);
    }
  });

  it('does not change the input', () => {
    const raw = layerPackage();
    const copy = structuredClone(raw);
    validatePartPackage(raw);
    expect(raw).toEqual(copy);
  });

  it('knows an import target for layers', () => {
    expect(hasImportTarget('layer')).toBe(true);
  });

  it.each([
    ['not an object', (pkg: any) => (pkg.part = 5), 'part must be an object'],
    ['id missing', (l: any) => delete l.id, 'part.id'],
    ['name not a string', (l: any) => (l.name = 3), 'part.name'],
    ['boxes missing', (l: any) => delete l.boxes, 'part.boxes must be an array'],
    ['looseTrays not an array', (l: any) => (l.looseTrays = {}), 'part.looseTrays must be an array'],
    ['broken loose tray', (l: any) => (l.looseTrays[0].color = 1), 'part.looseTrays[0].color'],
    ['manualLayout not an object', (l: any) => (l.manualLayout = []), 'part.manualLayout must be an object'],
    [
      'manualLayout list not an array',
      (l: any) => (l.manualLayout.boxes = 1),
      'part.manualLayout.boxes must be an array'
    ],
    [
      'layout entry without number',
      (l: any) => (l.manualLayout.looseTrays[0].x = null),
      'part.manualLayout.looseTrays[0].x'
    ],
    [
      'layout entry rotation',
      (l: any) => (l.manualLayout.looseTrays[1].rotation = 45),
      'part.manualLayout.looseTrays[1].rotation'
    ],
    [
      'box layout entry without boxId',
      (l: any) => (l.manualLayout.boxes = [{ trayId: 'a', x: 0, y: 0, rotation: 0 }]),
      'part.manualLayout.boxes[0].boxId'
    ]
  ])('rejects %s', (name, mutate, text) => {
    const raw = layerPackage((layer, pkg) => (name === 'not an object' ? mutate(pkg) : mutate(layer)));
    const error = errorOf(raw);
    expect(error?.code).toBe('invalidPart');
    expect(error?.message).toContain(text);
  });

  it('checks boxes like single boxes with the layer path', () => {
    const project = startProject();
    const pkg = viaFile(buildLayer(project, bottomLayer(project).id).package);
    pkg.part.boxes[0].tolerance = 'x';
    const error = errorOf(pkg);
    expect(error?.code).toBe('invalidPart');
    expect(error?.message).toContain('part.boxes[0].tolerance');
  });

  it('rejects repeated box IDs and repeated loose tray IDs', () => {
    const project = startProject();
    const base = () => viaFile(buildLayer(project, bottomLayer(project).id).package);
    const dupBox = base();
    dupBox.part.boxes.push(structuredClone(dupBox.part.boxes[0]));
    expect(errorOf(dupBox)?.message).toContain('part.boxes[1].id');
    const dupTray = base();
    dupTray.part.looseTrays.push(structuredClone(dupTray.part.looseTrays[0]));
    expect(errorOf(dupTray)?.message).toContain('part.looseTrays[1].id');
  });

  it('accepts orphan layout entries and a missing layout or list', () => {
    expect(
      errorOf(layerPackage((l) => l.manualLayout.looseTrays.push({ trayId: 'ghost', x: 0, y: 0, rotation: 0 })))
    ).toBeNull();
    expect(errorOf(layerPackage((l) => delete l.manualLayout))).toBeNull();
    expect(errorOf(layerPackage((l) => delete l.manualLayout.boxes))).toBeNull();
  });

  it('fails with the path of a missing definition in a box tray', () => {
    const project = startProject();
    const pkg = viaFile(buildLayer(project, bottomLayer(project).id).package);
    pkg.dependencies.counterShapes = [];
    const error = errorOf(pkg);
    expect(error?.code).toBe('missingDefinition');
    expect(error?.message).toContain('part.boxes[0].trays[0].params.topLoadedStacks[0][0]');
  });

  it('fails with the path of a missing definition in a loose tray', () => {
    const project = startProject();
    const pkg = viaFile(buildLayer(project, middleLayer(project).id).package);
    pkg.dependencies.cardSizes = [];
    const error = errorOf(pkg);
    expect(error?.code).toBe('missingDefinition');
    expect(error?.message).toMatch(/part\.looseTrays\[\d\]\.params\./);
  });

  it('accepts an empty layer', () => {
    expect(errorOf(layerPackage((l) => ((l.boxes = []), (l.looseTrays = []), delete l.manualLayout)))).toBeNull();
  });
});

// F1.7b: insert layers

function importOptions(extra: Partial<PartImportOptions> = {}): PartImportOptions {
  return { target: { kind: 'project' }, gameContainer: PART_TEST_CONTAINER, ...extra };
}

function importLayerOf(source: Project, layerId: string, target: Project = startProject(), extra = {}) {
  const pkg = viaFile(buildLayer(source, layerId).package);
  const checked = validatePartPackage(pkg);
  if (!checked.ok) throw new Error(checked.error.message);
  const result = importPartPackage(target, checked.package, importOptions(extra));
  const layer = result.project.layers.find((l) => l.id === result.insertedId) as Layer;
  return { result, layer, pkg: checked.package };
}

function layerIds(layer: Layer): string[] {
  return [...collectAllIds({ layers: [layer], counterShapes: [], cardSizes: [], standees: [] } as any)];
}

describe('importPartPackage for layers', () => {
  it('round trips the start project layers with counted-up names at the end', () => {
    const project = startProject();
    const before = JSON.stringify(project);
    const { result, layer } = importLayerOf(project, bottomLayer(project).id, project);
    expect(JSON.stringify(project)).toBe(before);
    expect(result.project.layers).toHaveLength(project.layers.length + 1);
    expect(result.project.layers[result.project.layers.length - 1]).toBe(layer);
    expect(result.project.layers.slice(0, -1)).toEqual(project.layers);
    expect(layer.name).toBe('Bottom layer (2)');
    expect(layer.boxes.map((b) => b.name)).toEqual(['Counter box (2)']);
    expect(layer.boxes[0].trays.map((t) => t.name)).toEqual(
      ['Counter tray (2)', 'Counter tray (3)']
        .slice(0, 2)
        .map((n, i) => bottomLayer(project).boxes[0].trays[i].name + ' (2)')
    );
    expect(layer.looseTrays.map((t) => t.name)).toEqual(['Cup tray (2)']);
    expect(result.report.entries.find((e) => e.kind === 'layer')).toMatchObject({
      name: 'Bottom layer (2)',
      action: 'renamed'
    });
    expect(result.idMap.layer.get(bottomLayer(project).id)).toBe(layer.id);
  });

  it('keeps no source ID except reused definitions', () => {
    const project = startProject();
    const source = middleLayer(project);
    const sourceIds = layerIds(source);
    const { layer } = importLayerOf(project, source.id, project);
    const newIds = new Set(layerIds(layer));
    for (const id of sourceIds) expect(newIds.has(id)).toBe(false);
  });

  it('imports into an empty-named project layer list with the original name', () => {
    const project = startProject();
    const target = startProject();
    target.layers = [];
    const { layer } = importLayerOf(project, bottomLayer(project).id, target);
    expect(layer.name).toBe('Bottom layer');
    expect(layer.boxes[0].name).toBe('Counter box');
  });

  it('counts up equal box names inside the package', () => {
    const project = startProject();
    const layer = bottomLayer(project);
    layer.boxes.push({ ...JSON.parse(JSON.stringify(layer.boxes[0])), id: 'box-2' });
    const target = startProject();
    target.layers = [];
    const { layer: inserted } = importLayerOf(project, layer.id, target);
    expect(inserted.boxes.map((b) => b.name)).toEqual(['Counter box', 'Counter box (2)']);
    const names = inserted.boxes.flatMap((b) => b.trays.map((t) => t.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it('rewrites the layer manual layout to the new IDs and keeps positions', () => {
    const project = startProject();
    const source = middleLayer(project);
    const boxLayer = bottomLayer(project);
    boxLayer.manualLayout = {
      boxes: [{ boxId: boxLayer.boxes[0].id, x: 5, y: 6, rotation: 90 }],
      looseTrays: [{ trayId: boxLayer.looseTrays[0].id, x: 7, y: 8, rotation: 180 }]
    };
    const { layer } = importLayerOf(project, boxLayer.id, project);
    expect(layer.manualLayout).toEqual({
      boxes: [{ boxId: layer.boxes[0].id, x: 5, y: 6, rotation: 90 }],
      looseTrays: [{ trayId: layer.looseTrays[0].id, x: 7, y: 8, rotation: 180 }]
    });
    const { layer: middle } = importLayerOf(project, source.id, project);
    expect(middle.manualLayout?.looseTrays.map(({ x, y, rotation }) => ({ x, y, rotation }))).toEqual(
      (source.manualLayout?.looseTrays ?? []).map(({ x, y, rotation }) => ({ x, y, rotation }))
    );
    const ids = new Set(middle.looseTrays.map((t) => t.id));
    for (const entry of middle.manualLayout?.looseTrays ?? []) expect(ids.has(entry.trayId)).toBe(true);
  });

  it('drops orphan and repeated layout entries with a warning', () => {
    const project = startProject();
    const source = middleLayer(project);
    const a = source.looseTrays[0].id;
    source.manualLayout = {
      boxes: [{ boxId: 'ghost', x: 0, y: 0, rotation: 0 }],
      looseTrays: [
        { trayId: a, x: 1, y: 1, rotation: 0 },
        { trayId: 'ghost', x: 2, y: 2, rotation: 0 },
        { trayId: a, x: 3, y: 3, rotation: 0 }
      ]
    };
    const { layer, result } = importLayerOf(project, source.id, project);
    expect(layer.manualLayout?.boxes).toEqual([]);
    expect(layer.manualLayout?.looseTrays).toHaveLength(1);
    expect(layer.manualLayout?.looseTrays[0]).toMatchObject({ x: 1, y: 1 });
    expect(result.report.warnings).toEqual([
      `"${layer.name}": 2 manual layout entries without a matching box or tray dropped.`,
      `"${layer.name}": 1 duplicate manual layout entry dropped.`
    ]);
  });

  it('adds a missing list to the layout and leaves a missing layout alone', () => {
    const project = startProject();
    const source = middleLayer(project);
    delete (source.manualLayout as any).boxes;
    const { layer } = importLayerOf(project, source.id, project);
    expect(layer.manualLayout?.boxes).toEqual([]);
    expect(layer.manualLayout?.looseTrays).toHaveLength(source.looseTrays.length);

    delete source.manualLayout;
    const { layer: auto } = importLayerOf(project, source.id, project);
    expect(auto.manualLayout).toBeUndefined();
  });

  it('keeps the box layout of each box (box logic unchanged)', () => {
    const project = startProject();
    const source = bottomLayer(project);
    const box = source.boxes[0];
    box.manualLayout = [{ trayId: box.trays[0].id, x: 3, y: 4, rotation: 0 } as any];
    const { layer } = importLayerOf(project, source.id, project);
    expect(layer.boxes[0].manualLayout).toEqual([{ trayId: layer.boxes[0].trays[0].id, x: 3, y: 4, rotation: 0 }]);
  });

  it('imports an empty layer', () => {
    const project = startProject();
    project.layers.push({ id: 'empty', name: 'Empty', boxes: [], looseTrays: [] });
    const { layer, result } = importLayerOf(project, 'empty', project);
    expect(layer).toMatchObject({ name: 'Empty (2)', boxes: [], looseTrays: [] });
    expect(result.report.warnings).toEqual([]);
  });

  it('warns about a layer larger than the game container only when measureLayer is given', () => {
    const project = startProject();
    const id = bottomLayer(project).id;
    const big = importLayerOf(project, id, project, { measureLayer: () => ({ width: 300, depth: 100 }) });
    expect(big.result.report.warnings).toEqual([
      `"${big.layer.name}" needs 300.0 × 100.0 mm, the game container is 150 × 200 mm. Positions were kept.`
    ]);
    const fits = importLayerOf(project, id, project, { measureLayer: () => ({ width: 150, depth: 200 }) });
    expect(fits.result.report.warnings).toEqual([]);
    expect(importLayerOf(project, id, project).result.report.warnings).toEqual([]);
  });

  it('passes the target container to measureLayer', () => {
    const project = startProject();
    let seen: unknown;
    importLayerOf(project, bottomLayer(project).id, project, {
      measureLayer: (_layer: Layer, _project: Project, container: GameContainerSize) => {
        seen = container;
        return { width: 1, depth: 1 };
      }
    });
    expect(seen).toEqual(PART_TEST_CONTAINER);
  });

  it('keeps the box size warning per box', () => {
    const project = startProject();
    const { result } = importLayerOf(project, bottomLayer(project).id, project, {
      measureBox: () => ({ width: 500, depth: 500 })
    });
    expect(result.report.warnings.some((w) => w.includes('is larger than the game container'))).toBe(true);
  });

  it('gives two imports of the same layer separate IDs and names', () => {
    const project = startProject();
    const first = importLayerOf(project, bottomLayer(project).id, project);
    const second = importLayerOf(project, bottomLayer(project).id, first.result.project);
    expect(second.layer.name).toBe('Bottom layer (3)');
    const a = new Set(layerIds(first.layer));
    for (const id of layerIds(second.layer)) expect(a.has(id)).toBe(false);
  });

  it('applies the game container to counter trays and leaves the input package unchanged', () => {
    const project = startProject();
    const pkg = viaFile(buildLayer(project, bottomLayer(project).id).package);
    const before = JSON.stringify(pkg);
    const result = importPartPackage(
      startProject(),
      pkg,
      importOptions({ gameContainer: { gameContainerWidth: 99, gameContainerDepth: 88 } })
    );
    expect(JSON.stringify(pkg)).toBe(before);
    const layer = result.project.layers[result.project.layers.length - 1];
    const counter = layer.boxes[0].trays.find((t) => t.type === 'counter') as any;
    expect(counter.params).toMatchObject({ gameContainerWidth: 99, gameContainerDepth: 88 });
  });

  it('throws for a missing definition and leaves the project unchanged', () => {
    const project = startProject();
    const pkg = viaFile(buildLayer(project, bottomLayer(project).id).package);
    pkg.dependencies.counterShapes = [];
    const target = startProject();
    const before = JSON.stringify(target);
    expect(() => importPartPackage(target, pkg, importOptions())).toThrow('Missing counterShape');
    expect(JSON.stringify(target)).toBe(before);
  });

  it('needs a target and ignores a box or layer target', () => {
    const project = startProject();
    const pkg = viaFile(buildLayer(project, bottomLayer(project).id).package);
    expect(() => importPartPackage(startProject(), pkg, { gameContainer: PART_TEST_CONTAINER })).toThrow(
      'Layers are imported via "Add layer" in the navigation.'
    );
    const target = startProject();
    const result = importPartPackage(
      target,
      pkg,
      importOptions({ target: { kind: 'layer', layerId: target.layers[1].id } })
    );
    expect(result.project.layers).toHaveLength(target.layers.length + 1);
  });

  it('rejects tray and box packages with the project target', () => {
    const project = startProject();
    const box = viaFile(
      buildPartPackage(project, { kind: 'box', id: bottomLayer(project).boxes[0].id }, PART_TEST_NOW).ok
        ? (buildPartPackage(project, { kind: 'box', id: bottomLayer(project).boxes[0].id }, PART_TEST_NOW) as any)
            .package
        : null
    );
    expect(() => importPartPackage(startProject(), box, importOptions())).toThrow(
      'Boxes are imported via "Add box" in the navigation.'
    );
    const tray = viaFile(
      (buildPartPackage(project, { kind: 'tray', id: bottomLayer(project).looseTrays[0].id }, PART_TEST_NOW) as any)
        .package
    );
    expect(() => importPartPackage(startProject(), tray, importOptions())).toThrow('Trays are imported via');
  });
});
