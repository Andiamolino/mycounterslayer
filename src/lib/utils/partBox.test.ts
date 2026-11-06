/* eslint-disable @typescript-eslint/no-explicit-any -- tests feed foreign-shaped data */
import type { Box, Project, Tray } from '#lib/types/project.js';
import {
  collectAllIds,
  importPartPackage,
  type PartImportOptions,
  type PartImportTarget
} from '#lib/utils/partImport.js';
import { buildPartPackage, validatePartPackage, type PartPackage } from '#lib/utils/partPackage.js';
import { allTrays, firstBox, startProject } from '#lib/utils/partTestFixtures.js';
import { describe, expect, it } from 'vitest';

// F1.6a: build and check box packages
const NOW = new Date('2026-11-06T10:00:00.000Z');

// Start project with all six tray types inside the first box
function projectWithAllTrays(): Project {
  const project = startProject();
  const trays = allTrays(project);
  project.layers.forEach((layer) => (layer.looseTrays = []));
  firstBox(project).trays = trays;
  return project;
}

function buildBox(project: Project, id = firstBox(project).id) {
  const built = buildPartPackage(project, { kind: 'box', id }, NOW);
  if (!built.ok) throw new Error(built.error.message);
  return built;
}

// JSON text round trip, like a file
function viaFile(pkg: unknown): any {
  return JSON.parse(JSON.stringify(pkg));
}

function boxPackage(mutate: (box: Record<string, any>, pkg: Record<string, any>) => void = () => {}) {
  const pkg = viaFile(buildBox(startProject()).package);
  mutate(pkg.part, pkg);
  return pkg;
}

function errorOf(raw: unknown) {
  const result = validatePartPackage(raw);
  return result.ok ? null : result.error;
}

describe('buildPartPackage for boxes', () => {
  it('builds the start project box with all box fields and both trays', () => {
    const project = startProject();
    const source = firstBox(project);
    const { package: pkg, warnings } = buildBox(project);
    const part = pkg.part as Box;
    expect(pkg.kind).toBe('box');
    expect(warnings).toEqual([]);
    expect(part.id).toBe(source.id);
    expect(part.name).toBe('Counter box');
    expect(part.trays.map((tray) => tray.id)).toEqual(source.trays.map((tray) => tray.id));
    for (const field of ['tolerance', 'wallThickness', 'floorThickness', 'fillSolidEmpty', 'lidParams'] as const) {
      expect(part[field]).toEqual(source[field]);
    }
  });

  it('removes the game container size of counter trays', () => {
    const { package: pkg } = buildBox(startProject());
    for (const tray of (pkg.part as Box).trays) {
      expect(tray.params).not.toHaveProperty('gameContainerWidth');
      expect(tray.params).not.toHaveProperty('gameContainerDepth');
    }
  });

  it('takes exactly the used definitions, each once', () => {
    const project = startProject();
    const { package: pkg } = buildBox(project);
    const used = new Set<string>();
    for (const tray of (pkg.part as Box).trays) {
      for (const stack of [
        ...((tray.params as any).topLoadedStacks ?? []),
        ...((tray.params as any).edgeLoadedStacks ?? [])
      ]) {
        used.add(stack[0]);
      }
    }
    const ids = pkg.dependencies.counterShapes.map((shape) => shape.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(used);
    expect(ids.length).toBeGreaterThan(0);
    expect(pkg.dependencies.cardSizes).toEqual([]);
    expect(pkg.dependencies.standees).toEqual([]);
  });

  it('puts a definition used by two trays into the dependencies once', () => {
    const project = startProject();
    const box = firstBox(project);
    box.trays.forEach((tray) => {
      (tray.params as any).topLoadedStacks = [['shape-square', 3]];
      (tray.params as any).edgeLoadedStacks = [];
    });
    const ids = buildBox(project).package.dependencies.counterShapes.map((shape) => shape.id);
    expect(ids).toEqual(['shape-square']);
  });

  it('leaves the project unchanged', () => {
    const project = startProject();
    const before = JSON.stringify(project);
    buildBox(project);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('replaces an empty name with the unnamed replacement', () => {
    const project = startProject();
    firstBox(project).name = '  ';
    expect(buildBox(project).package.part.name).toBe('Unnamed box');
  });

  it('keeps unknown extra box fields and the manual layout', () => {
    const project = startProject();
    const box = firstBox(project);
    box.bottomHoneycombEnabled = true;
    box.customWidth = 120;
    box.manualLayout = box.trays.map((tray, i) => ({ trayId: tray.id, x: i * 5, y: 2, rotation: 90 }));
    const part = buildBox(project).package.part as Box;
    expect(part.bottomHoneycombEnabled).toBe(true);
    expect(part.customWidth).toBe(120);
    expect(part.manualLayout).toEqual(box.manualLayout);
  });

  it('builds a box with all six tray types and gets the same package back from the validator', () => {
    const project = projectWithAllTrays();
    const built = buildBox(project);
    expect(new Set((built.package.part as Box).trays.map((tray) => tray.type)).size).toBe(6);
    expect(built.warnings).toEqual([]);
    const validated = validatePartPackage(viaFile(built.package));
    expect(validated.ok && validated.package).toEqual(viaFile(built.package));
  });

  it('roundtrips the start project box', () => {
    const built = buildBox(startProject());
    const validated = validatePartPackage(viaFile(built.package));
    expect(validated.ok && validated.package).toEqual(viaFile(built.package));
  });

  it('builds a box without trays', () => {
    const project = startProject();
    firstBox(project).trays = [];
    const built = buildBox(project);
    expect((built.package.part as Box).trays).toEqual([]);
    expect(validatePartPackage(viaFile(built.package)).ok).toBe(true);
  });

  it('reports a dead reference with the tray index in the path', () => {
    const project = startProject();
    (firstBox(project).trays[1].params as any).topLoadedStacks = [['gone', 2]];
    const { warnings, package: pkg } = buildBox(project);
    expect(warnings).toEqual([{ kind: 'counterShape', id: 'gone', path: 'trays[1].params.topLoadedStacks[0][0]' }]);
    // the file is still written: the raw value stays
    expect(((pkg.part as Box).trays[1].params as any).topLoadedStacks[0][0]).toBe('gone');
  });

  it('reports orphan, duplicate and malformed manual layout entries and keeps them', () => {
    const project = startProject();
    const box = firstBox(project);
    const [a, b] = box.trays.map((tray) => tray.id);
    box.manualLayout = [
      { trayId: a, x: 0, y: 0, rotation: 0 },
      { trayId: 'ghost', x: 1, y: 1, rotation: 0 },
      { trayId: a, x: 2, y: 2, rotation: 0 },
      { trayId: b, x: 'no', y: 0, rotation: 0 } as any
    ];
    const { warnings, package: pkg } = buildBox(project);
    expect(warnings.map((w) => [w.kind, w.path])).toEqual([
      ['layoutEntry', 'manualLayout[1]'],
      ['layoutEntry', 'manualLayout[2]'],
      ['layoutForm', 'manualLayout[3]']
    ]);
    expect((pkg.part as Box).manualLayout).toHaveLength(4);
  });

  it('warns about a repeated tray ID and keeps the source index in the path', () => {
    const project = startProject();
    const box = firstBox(project);
    box.trays[1].id = box.trays[0].id;
    const { warnings } = buildBox(project);
    expect(warnings.map((w) => [w.kind, w.path])).toEqual([['trayId', 'trays[1].id']]);
  });

  it('keeps the source index in warning paths when a tray entry is not an object', () => {
    const project = startProject();
    const box = firstBox(project);
    const trays = box.trays;
    box.trays = [null as any, ...trays];
    (trays[0].params as any).standeeId = 'gone';
    trays[0].type = 'standee' as any;
    const { warnings } = buildBox(project);
    for (const w of warnings) expect(w.path.startsWith('trays[1].')).toBe(true);
  });

  it('returns errors instead of throwing', () => {
    const project = startProject();
    const missing = buildPartPackage(project, { kind: 'box', id: 'nope' }, NOW);
    expect(!missing.ok && missing.error.code).toBe('notFound');
    const layer = buildPartPackage(project, { kind: 'layer', id: project.layers[0].id }, NOW);
    expect(!layer.ok && layer.error.code).toBe('unsupportedKind');
    // broken data: null tray, missing arrays
    (firstBox(project).trays as any[]).push(null);
    expect(buildPartPackage(project, { kind: 'box', id: firstBox(project).id }, NOW).ok).toBe(true);
    delete (firstBox(project) as any).trays;
    expect(buildPartPackage(project, { kind: 'box', id: firstBox(project).id }, NOW).ok).toBe(true);
    expect(buildPartPackage({ layers: null } as any, { kind: 'box', id: 'x' }, NOW).ok).toBe(false);
  });
});

describe('validatePartPackage for boxes', () => {
  it('accepts a built package and does not change the input', () => {
    const raw = boxPackage();
    const before = JSON.stringify(raw);
    expect(validatePartPackage(raw).ok).toBe(true);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('accepts optional fields missing and partial lid params', () => {
    const raw = boxPackage((box) => {
      delete box.fillSolidEmpty;
      delete box.manualLayout;
      box.lidParams = { thickness: 2.5 };
    });
    expect(validatePartPackage(raw).ok).toBe(true);
  });

  it('accepts a box without trays and orphan layout entries (dropped on import)', () => {
    const raw = boxPackage((box) => {
      box.trays = [];
      box.manualLayout = [{ trayId: 'ghost', x: 0, y: 0, rotation: 270 }];
    });
    const result = validatePartPackage(raw);
    expect(result.ok && (result.package.part as Box).manualLayout).toHaveLength(1);
  });

  it('resolves tray references by name like a single tray and removes the game container size', () => {
    const raw = boxPackage((box, pkg) => {
      box.trays[0].params.topLoadedStacks = [['Square', 1]];
      box.trays[0].params.edgeLoadedStacks = [];
      box.trays[1].params.topLoadedStacks = [];
      box.trays[1].params.edgeLoadedStacks = [];
      pkg.dependencies.counterShapes = [
        { id: 'dep-1', name: 'Square', baseShape: 'square', width: 10, length: 10, thickness: 2 }
      ];
      box.trays[0].params.gameContainerWidth = 150;
    });
    const result = validatePartPackage(raw);
    expect(result.ok).toBe(true);
    const tray = result.ok ? (result.package.part as Box).trays[0] : null;
    expect((tray?.params as any).topLoadedStacks[0][0]).toBe('dep-1');
    expect(tray?.params).not.toHaveProperty('gameContainerWidth');
  });

  it('rejects a missing definition with the box wording and the tray path', () => {
    const raw = boxPackage((box, pkg) => {
      box.trays[0].params.topLoadedStacks = [];
      box.trays[0].params.edgeLoadedStacks = [];
      box.trays[1].params.topLoadedStacks = [['unknown-shape', 1]];
      pkg.dependencies.counterShapes = [];
    });
    const error = errorOf(raw);
    expect(error?.code).toBe('missingDefinition');
    expect(error?.message).toContain('The box refers to a counter');
    expect(error?.message).toContain('part.trays[1].params.topLoadedStacks[0][0]');
  });

  it('keeps the tray wording for a single tray', () => {
    const pkg = viaFile(
      buildPartPackage(startProject(), { kind: 'tray', id: firstBox(startProject()).trays[0].id }, NOW) as any
    );
    pkg.package.part.params.topLoadedStacks = [['unknown-shape', 1]];
    pkg.package.dependencies.counterShapes = [];
    expect(errorOf(pkg.package)?.message).toContain('The tray refers to a counter');
  });

  it('rejects duplicate tray IDs', () => {
    const raw = boxPackage((box) => (box.trays[1].id = box.trays[0].id));
    const error = errorOf(raw);
    expect(error?.code).toBe('invalidPart');
    expect(error?.message).toBe(`part.trays[1].id "${raw.part.trays[0].id}" is used more than once.`);
  });

  it.each([
    ['part is not an object', (box: any, pkg: any) => (pkg.part = 5), 'part must be an object.'],
    ['empty id', (box: any) => (box.id = ' '), 'part.id'],
    ['name not a string', (box: any) => (box.name = 3), 'part.name'],
    ['tolerance missing', (box: any) => delete box.tolerance, 'part.tolerance'],
    ['wallThickness NaN as string', (box: any) => (box.wallThickness = '2'), 'part.wallThickness'],
    ['floorThickness infinite', (box: any) => (box.floorThickness = Infinity), 'part.floorThickness'],
    ['customWidth string', (box: any) => (box.customWidth = 'x'), 'part.customWidth'],
    ['fillSolidEmpty not boolean', (box: any) => (box.fillSolidEmpty = 1), 'part.fillSolidEmpty'],
    ['lidParams missing', (box: any) => delete box.lidParams, 'part.lidParams must be an object.'],
    ['lidParams number field wrong', (box: any) => (box.lidParams.thickness = 'thick'), 'part.lidParams.thickness'],
    ['lidParams boolean field wrong', (box: any) => (box.lidParams.snapEnabled = 'yes'), 'part.lidParams.snapEnabled'],
    ['trays not an array', (box: any) => (box.trays = {}), 'part.trays must be an array.'],
    ['broken tray', (box: any) => (box.trays[1].type = 'rocket'), 'part.trays[1].type'],
    ['manualLayout not an array', (box: any) => (box.manualLayout = 'x'), 'part.manualLayout must be an array.'],
    ['manualLayout entry not an object', (box: any) => (box.manualLayout = [1]), 'part.manualLayout[0]'],
    [
      'manualLayout x invalid',
      (box: any) => (box.manualLayout = [{ trayId: 'a', x: null, y: 0, rotation: 0 }]),
      'part.manualLayout[0].x'
    ],
    [
      'manualLayout rotation invalid',
      (box: any) => (box.manualLayout = [{ trayId: 'a', x: 0, y: 0, rotation: 45 }]),
      'part.manualLayout[0].rotation'
    ],
    [
      'manualLayout trayId missing',
      (box: any) => (box.manualLayout = [{ x: 0, y: 0, rotation: 0 }]),
      'part.manualLayout[0].trayId'
    ]
  ])('rejects: %s', (_label, mutate, text) => {
    const error = errorOf(boxPackage(mutate as any));
    expect(error?.code).toBe('invalidPart');
    expect(error?.message).toContain(text);
  });

  it('still rejects layer packages', () => {
    expect(errorOf({ ...boxPackage(), kind: 'layer' })?.code).toBe('unsupportedKind');
  });
});

// F1.6b: insert box packages
const GAME_CONTAINER = { gameContainerWidth: 150, gameContainerDepth: 200 };

function layerTarget(project: Project): PartImportTarget {
  return { kind: 'layer', layerId: project.layers[0].id };
}

function importOptions(project: Project, extra: Partial<PartImportOptions> = {}): PartImportOptions {
  return { target: layerTarget(project), gameContainer: GAME_CONTAINER, ...extra };
}

// Box package after a file round trip and validation, like a real import
function validBoxPackage(project: Project, mutate: (pkg: any) => void = () => {}): PartPackage {
  const pkg = viaFile(buildBox(project).package);
  mutate(pkg);
  const result = validatePartPackage(pkg);
  if (!result.ok) throw new Error(result.error.message);
  return result.package;
}

function seq(prefix = 'n'): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

// Start project box with a manual layout (second tray rotated)
function projectWithManualLayout(): Project {
  const project = startProject();
  const box = firstBox(project);
  box.manualLayout = box.trays.map((tray, i) => ({ trayId: tray.id, x: 3 + i, y: 4 + i, rotation: i ? 90 : 0 }));
  box.customWidth = 120;
  box.customDepth = 90;
  box.customBoxHeight = 30;
  return project;
}

function newBox(result: { project: Project; insertedId?: string }): Box {
  const box = result.project.layers.flatMap((layer) => layer.boxes).find((b) => b.id === result.insertedId);
  if (!box) throw new Error('inserted box not found');
  return box;
}

describe('importPartPackage for boxes', () => {
  it('round trips the start project box with counted-up names and no source ID left', () => {
    const project = startProject();
    const source = firstBox(project);
    const sourceIds = collectAllIds(project);
    const result = importPartPackage(project, validBoxPackage(project), importOptions(project), seq());
    const box = newBox(result);

    expect(box.name).toBe('Counter box (2)');
    expect(box.trays.map((t) => t.name)).toEqual(source.trays.map((t) => `${t.name} (2)`));
    expect(result.project.layers[0].boxes).toHaveLength(project.layers[0].boxes.length + 1);
    expect(box.id).not.toBe(source.id);
    for (const id of [box.id, ...box.trays.map((t) => t.id)]) expect(sourceIds.has(id)).toBe(false);
    expect(result.idMap.box.get(source.id)).toBe(box.id);
    expect(result.report.entries.find((e) => e.kind === 'box')).toMatchObject({ action: 'renamed', targetId: box.id });
    // definitions are reused, none duplicated
    expect(result.project.counterShapes).toEqual(project.counterShapes);
    const all = [...collectAllIds(result.project)];
    expect(all.length).toBe(new Set(all).size);
    expect(result.project.layers[0].manualLayout).toEqual(project.layers[0].manualLayout);
  });

  it('keeps the name when no box has it and counts up tray names per tray', () => {
    const project = projectWithAllTrays();
    const pkg = validBoxPackage(project, (p) => {
      p.part.name = 'Fresh';
      p.part.trays[1].name = p.part.trays[0].name;
    });
    const box = newBox(importPartPackage(project, pkg, importOptions(project), seq()));
    expect(box.name).toBe('Fresh');
    const names = box.trays.map((t) => t.name);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
  });

  it('rewrites manualLayout to the new tray IDs and keeps values, order and size', () => {
    const project = projectWithManualLayout();
    const source = firstBox(project);
    const result = importPartPackage(project, validBoxPackage(project), importOptions(project), seq());
    const box = newBox(result);
    expect(box.manualLayout).toHaveLength(2);
    box.manualLayout!.forEach((entry, i) => {
      expect(entry).toMatchObject({ x: source.manualLayout![i].x, y: source.manualLayout![i].y });
      expect(entry.rotation).toBe(source.manualLayout![i].rotation);
      expect(entry.trayId).toBe(box.trays[i].id);
      expect(source.trays.map((t) => t.id)).not.toContain(entry.trayId);
    });
    expect([box.customWidth, box.customDepth, box.customBoxHeight]).toEqual([120, 90, 30]);
  });

  it('drops orphaned and duplicate manualLayout entries with a warning', () => {
    const project = projectWithManualLayout();
    const pkg = validBoxPackage(project, (p) => {
      const first = p.part.manualLayout[0];
      p.part.manualLayout.push({ trayId: 'ghost', x: 1, y: 1, rotation: 0 }, { ...first, x: 9 });
    });
    const result = importPartPackage(project, pkg, importOptions(project), seq());
    expect(newBox(result).manualLayout).toHaveLength(2);
    expect(result.report.warnings).toEqual([
      '"Counter box (2)": 1 manual layout entry without a matching tray dropped.',
      '"Counter box (2)": 1 duplicate manual layout entry dropped.'
    ]);
  });

  it('keeps an empty or missing manualLayout as it is', () => {
    const project = startProject();
    const empty = validBoxPackage(project, (p) => (p.part.manualLayout = []));
    expect(newBox(importPartPackage(project, empty, importOptions(project), seq())).manualLayout).toEqual([]);
    const missing = validBoxPackage(project, (p) => delete p.part.manualLayout);
    expect(newBox(importPartPackage(project, missing, importOptions(project), seq())).manualLayout).toBeUndefined();
  });

  it('fills missing lid fields from the defaults of the options', () => {
    const project = startProject();
    const pkg = validBoxPackage(project, (p) => (p.part.lidParams = { thickness: 5 }));
    const lidDefaults = { ...firstBox(project).lidParams, thickness: 2, railHeight: 7 };
    const box = newBox(importPartPackage(project, pkg, importOptions(project, { lidDefaults }), seq()));
    expect(box.lidParams.thickness).toBe(5);
    expect(box.lidParams.railHeight).toBe(7);
  });

  it('warns about a box larger than the game container only when it does not fit, also rotated', () => {
    const project = startProject();
    const pkg = validBoxPackage(project);
    const run = (width: number, depth: number) =>
      importPartPackage(project, pkg, importOptions(project, { measureBox: () => ({ width, depth }) }), seq());
    expect(run(100, 150).report.warnings).toEqual([]);
    expect(run(190, 140).report.warnings).toEqual([]); // fits only rotated
    const tooBig = run(300, 90);
    expect(tooBig.report.warnings).toEqual([
      '"Counter box (2)" (300.0 × 90.0 mm) is larger than the game container (150 × 200 mm).'
    ]);
    expect(newBox(tooBig)).toBeDefined(); // warning only, the box is still added
    expect(importPartPackage(project, pkg, importOptions(project), seq()).report.warnings).toEqual([]);
  });

  it('turns null custom sizes into undefined', () => {
    const project = startProject();
    const pkg = validBoxPackage(project, (p) => {
      p.part.customWidth = null;
      p.part.customDepth = null;
      p.part.customBoxHeight = 30;
    });
    const box = newBox(importPartPackage(project, pkg, importOptions(project), seq()));
    expect([box.customWidth, box.customDepth, box.customBoxHeight]).toEqual([undefined, undefined, 30]);
  });

  it('rounds the sizes in the size warning to one decimal', () => {
    const project = startProject();
    const pkg = validBoxPackage(project);
    const result = importPartPackage(
      project,
      pkg,
      importOptions(project, { measureBox: () => ({ width: 300.123456, depth: 90 }) }),
      seq()
    );
    expect(result.report.warnings).toEqual([
      '"Counter box (2)" (300.1 × 90.0 mm) is larger than the game container (150 × 200 mm).'
    ]);
  });

  it('imports the same box twice with separate IDs', () => {
    const project = startProject();
    const pkg = validBoxPackage(project);
    const first = importPartPackage(project, pkg, importOptions(project), seq('a'));
    const second = importPartPackage(first.project, pkg, importOptions(first.project), seq('b'));
    expect(newBox(second).name).toBe('Counter box (3)');
    const all = [...collectAllIds(second.project)];
    expect(all.length).toBe(new Set(all).size);
  });

  it('uses the layer of the target box for a box target', () => {
    const project = startProject();
    const pkg = validBoxPackage(project);
    const target: PartImportTarget = { kind: 'box', boxId: firstBox(project).id };
    const result = importPartPackage(project, pkg, importOptions(project, { target }), seq());
    expect(result.project.layers[0].boxes.map((b) => b.id)).toContain(result.insertedId);
  });

  it('puts a tray package at a layer target into the loose trays', () => {
    const project = startProject();
    const trayId = firstBox(project).trays[0].id;
    const built = buildPartPackage(project, { kind: 'tray', id: trayId }, NOW);
    if (!built.ok) throw new Error(built.error.message);
    const result = importPartPackage(project, built.package, importOptions(project), seq());
    expect(result.project.layers[0].looseTrays.map((t) => t.id)).toContain(result.insertedId);
  });

  it('throws if the target layer or box is gone and changes nothing', () => {
    const project = startProject();
    const pkg = validBoxPackage(project);
    const before = JSON.stringify(project);
    const pkgBefore = JSON.stringify(pkg);
    expect(() =>
      importPartPackage(project, pkg, importOptions(project, { target: { kind: 'layer', layerId: 'nope' } }))
    ).toThrow('The target layer no longer exists.');
    expect(() =>
      importPartPackage(project, pkg, importOptions(project, { target: { kind: 'box', boxId: 'nope' } }))
    ).toThrow('The target box no longer exists.');
    expect(JSON.stringify(project)).toBe(before);
    expect(JSON.stringify(pkg)).toBe(pkgBefore);
  });

  it('throws with a hint if there is no target', () => {
    const project = startProject();
    expect(() => importPartPackage(project, validBoxPackage(project), { gameContainer: GAME_CONTAINER })).toThrow(
      'Boxes are imported via "Add box" in the navigation.'
    );
  });

  it('throws on a missing definition and leaves the project unchanged', () => {
    const project = startProject();
    const pkg = validBoxPackage(project);
    pkg.dependencies.counterShapes = [];
    const before = JSON.stringify(project);
    expect(() => importPartPackage(project, pkg, importOptions(project), seq())).toThrow('Missing counterShape');
    expect(JSON.stringify(project)).toBe(before);
  });
});
