import type { Project, Tray } from '#lib/types/project.js';
import {
  describeExportWarnings,
  describeImportReport,
  describePartImportFailure,
  describePartImportPreview,
  formatTrayValues,
  type PartImportContext
} from '#lib/utils/partFile.js';
import { importPartPackage, type PartImportTarget } from '#lib/utils/partImport.js';
import { buildPartPackage, type ImportReport, type PartPackage } from '#lib/utils/partPackage.js';
import { describe, expect, it } from 'vitest';

const GAME_CONTAINER = { gameContainerWidth: 100, gameContainerDepth: 100 };
const BOX_TARGET: PartImportTarget = { kind: 'box', boxId: 'box-t' };
const LAYER_TARGET: PartImportTarget = { kind: 'layer', layerId: 'layer-t' };
const BOX_CONTEXT: PartImportContext = { targetKind: 'box', targetName: 'Main box' };
const LAYER_CONTEXT: PartImportContext = { targetKind: 'layer', targetName: 'Bottom' };

const square = { id: 's1', name: 'Square', baseShape: 'square', width: 15.9, length: 15.9, thickness: 1.8 };
const hexBig = { id: 's2', name: 'Hex big', baseShape: 'hex', width: 25, length: 25, thickness: 1.8 };

function counterTray(stacks: unknown[][] = [['s1', 10, 'A']], edge: unknown[][] = []): Tray {
  return {
    id: 't1',
    name: 'My tokens',
    type: 'counter',
    color: '#336699',
    params: { topLoadedStacks: stacks, edgeLoadedStacks: edge, gameContainerWidth: 1, gameContainerDepth: 1 }
  } as unknown as Tray;
}

function sourceProject(tray: Tray, shapes: object[] = [square]): Project {
  return {
    layers: [{ id: 'ls', name: 'S', boxes: [], looseTrays: [tray] }],
    counterShapes: shapes,
    cardSizes: [],
    standees: []
  } as unknown as Project;
}

function targetProject(shapes: object[] = [], trayNames: string[] = []): Project {
  return {
    layers: [
      {
        id: 'layer-t',
        name: 'Bottom',
        looseTrays: [],
        boxes: [
          {
            id: 'box-t',
            name: 'Main box',
            trays: trayNames.map((name, i) => ({ id: `e${i}`, name, type: 'cup', params: {} }))
          }
        ]
      }
    ],
    counterShapes: shapes,
    cardSizes: [],
    standees: []
  } as unknown as Project;
}

function packageOf(tray: Tray, shapes?: object[]): PartPackage {
  const built = buildPartPackage(sourceProject(tray, shapes), { kind: 'tray', id: tray.id }, new Date(0));
  if (!built.ok) throw new Error(built.error.message);
  return built.package;
}

function dryRun(pkg: PartPackage, project: Project, target: PartImportTarget): ImportReport {
  return importPartPackage(project, pkg, { target, gameContainer: GAME_CONTAINER }).report;
}

describe('formatTrayValues', () => {
  const base = { id: 'x', name: 'X', color: '#000' };
  const cases: [string, object, string][] = [
    [
      'counter',
      { type: 'counter', params: { topLoadedStacks: [[], []], edgeLoadedStacks: [[]] } },
      'Counters · 3 stacks'
    ],
    [
      'counter singular',
      { type: 'counter', params: { topLoadedStacks: [[]], edgeLoadedStacks: [] } },
      'Counters · 1 stack'
    ],
    ['cardDraw', { type: 'cardDraw', params: { cardCount: 50 } }, 'Card draw · 50 cards'],
    ['cardDivider', { type: 'cardDivider', params: { stacks: [{}, {}] } }, 'Card divider · 2 stacks'],
    ['cardWell', { type: 'cardWell', params: { layout: { columns: [['a', 'b'], ['c']] } } }, 'Card well · 3 cells'],
    [
      'cup',
      {
        type: 'cup',
        params: {
          layout: {
            root: {
              type: 'split',
              direction: 'vertical',
              ratio: 0.5,
              first: { type: 'cup', id: 'a' },
              second: { type: 'cup', id: 'b' }
            }
          }
        }
      },
      'Cups · 2 cups'
    ],
    ['standee', { type: 'standee', params: { count: 12 } }, 'Standees · 12 standees']
  ];
  for (const [label, tray, expected] of cases) {
    it(`describes ${label}`, () => {
      expect(formatTrayValues({ ...base, ...tray } as unknown as Tray)).toBe(expected);
    });
  }

  it('tolerates missing params', () => {
    expect(formatTrayValues({ ...base, type: 'cup' } as unknown as Tray)).toBe('Cups · 0 cups');
  });
});

describe('describePartImportPreview: tray', () => {
  it('creates in a box', () => {
    const pkg = packageOf(counterTray());
    const preview = describePartImportPreview(pkg, dryRun(pkg, targetProject(), BOX_TARGET), 'tray', BOX_CONTEXT);
    expect(preview).toMatchObject({
      title: 'Import tray "My tokens"?',
      confirmLabel: 'Import',
      name: 'My tokens',
      values: 'Counters · 1 stack',
      result: '"My tokens" will be added to box "Main box".'
    });
  });

  it('creates as a loose tray in a layer', () => {
    const pkg = packageOf(counterTray());
    const preview = describePartImportPreview(pkg, dryRun(pkg, targetProject(), LAYER_TARGET), 'tray', LAYER_CONTEXT);
    expect(preview.result).toBe('"My tokens" will be added as a loose tray to layer "Bottom".');
  });

  it('renames in a box and in a layer', () => {
    const pkg = packageOf(counterTray());
    const project = targetProject([], ['My tokens']);
    expect(describePartImportPreview(pkg, dryRun(pkg, project, BOX_TARGET), 'tray', BOX_CONTEXT).result).toBe(
      'A tray "My tokens" already exists – will be added as "My tokens (2)" to box "Main box".'
    );
    expect(describePartImportPreview(pkg, dryRun(pkg, project, LAYER_TARGET), 'tray', LAYER_CONTEXT).result).toBe(
      'A tray "My tokens" already exists – will be added as "My tokens (2)" as a loose tray to layer "Bottom".'
    );
  });

  it('lists dependencies: reused, created, renamed', () => {
    const tray = counterTray([
      ['s1', 10, 'A'],
      ['s2', 5, 'B']
    ]);
    const pkg = packageOf(tray, [square, hexBig]);
    // Square exists with equal values, "Hex big" exists with other values
    const project = targetProject([
      { ...square, id: 'x1' },
      { ...hexBig, id: 'x2', width: 30 }
    ]);
    const preview = describePartImportPreview(pkg, dryRun(pkg, project, BOX_TARGET), 'tray', BOX_CONTEXT);
    expect(preview.details).toBe('Square – already exists; Hex big – will be added as "Hex big (2)"');
    expect(describePartImportPreview(pkg, dryRun(pkg, targetProject(), BOX_TARGET), 'tray', BOX_CONTEXT).details).toBe(
      'Square – will be added; Hex big – will be added'
    );
  });

  it('has no Uses line without dependencies', () => {
    const pkg = packageOf(counterTray([]));
    const preview = describePartImportPreview(pkg, dryRun(pkg, targetProject(), BOX_TARGET), 'tray', BOX_CONTEXT);
    expect(preview.details).toBeUndefined();
  });

  it('keeps the counter wording for a counter file at the tray place (E20)', () => {
    const source = { layers: [], counterShapes: [square], cardSizes: [], standees: [] } as unknown as Project;
    const built = buildPartPackage(source, { kind: 'counterShape', id: 's1' }, new Date(0));
    if (!built.ok) throw new Error('build failed');
    const report: ImportReport = {
      entries: [{ kind: 'counterShape', sourceId: 's1', targetId: 'n', name: 'Square', action: 'created' }],
      warnings: []
    };
    const preview = describePartImportPreview(built.package, report, 'tray', BOX_CONTEXT);
    expect(preview.title).toBe('This file contains a counter, not a tray. Import it as counter?');
    expect(preview.confirmLabel).toBe('Import as counter');
    expect(preview.details).toBeUndefined();
    expect(preview.result).toBe('"Square" will be added.');
  });

  it('keeps the definition wording at the definition place', () => {
    const source = { layers: [], counterShapes: [square], cardSizes: [], standees: [] } as unknown as Project;
    const built = buildPartPackage(source, { kind: 'counterShape', id: 's1' }, new Date(0));
    if (!built.ok) throw new Error('build failed');
    const report: ImportReport = {
      entries: [{ kind: 'counterShape', sourceId: 's1', targetId: 'n', name: 'Square', action: 'created' }],
      warnings: []
    };
    expect(describePartImportPreview(built.package, report, 'counterShape').title).toBe('Import counter "Square"?');
  });
});

describe('describeImportReport: tray', () => {
  it('success in a box, no new definitions when reused', () => {
    const pkg = packageOf(counterTray());
    const project = targetProject([{ ...square, id: 'x1' }]);
    const toast = describeImportReport(dryRun(pkg, project, BOX_TARGET), pkg, 'tray', BOX_CONTEXT);
    expect(toast).toEqual({
      type: 'success',
      title: 'Tray imported',
      body: '"My tokens" was added to box "Main box".'
    });
  });

  it('renamed in a layer with new definitions', () => {
    const pkg = packageOf(
      counterTray([
        ['s1', 10, 'A'],
        ['s2', 5, 'B']
      ]),
      [square, hexBig]
    );
    const project = targetProject([{ ...square, id: 'x1', width: 99 }], ['My tokens']);
    // Loose names are checked project-wide, so the box tray blocks the name
    const toast = describeImportReport(dryRun(pkg, project, LAYER_TARGET), pkg, 'tray', LAYER_CONTEXT);
    expect(toast.title).toBe('Tray imported');
    expect(toast.body).toBe(
      'A tray "My tokens" already exists – added as "My tokens (2)" as a loose tray to layer "Bottom". ' +
        'New definitions: Square (2), Hex big.'
    );
  });

  it('appends warnings', () => {
    const pkg = packageOf(counterTray());
    const report = dryRun(pkg, targetProject(), BOX_TARGET);
    report.warnings.push('One stack was dropped.');
    expect(describeImportReport(report, pkg, 'tray', BOX_CONTEXT).body).toContain(' One stack was dropped.');
  });

  it('says "Imported as counter" for a counter file at the tray place', () => {
    const source = { layers: [], counterShapes: [square], cardSizes: [], standees: [] } as unknown as Project;
    const built = buildPartPackage(source, { kind: 'counterShape', id: 's1' }, new Date(0));
    if (!built.ok) throw new Error('build failed');
    const report: ImportReport = {
      entries: [{ kind: 'counterShape', sourceId: 's1', targetId: 'n', name: 'Square', action: 'created' }],
      warnings: []
    };
    expect(describeImportReport(report, built.package, 'tray', BOX_CONTEXT).title).toBe('Imported as counter');
  });
});

describe('describePartImportFailure / describeExportWarnings', () => {
  it('names the tray', () => {
    expect(describePartImportFailure('tray', 'Boom.')).toEqual({
      type: 'danger',
      title: 'Tray import failed',
      body: 'Boom.'
    });
    expect(describePartImportFailure('tray').body).toBe('The part could not be imported.');
  });

  it('export warning singular', () => {
    expect(describeExportWarnings([{ kind: 'standee', id: 'z', path: 'params.standeeId' }])).toEqual({
      type: 'info',
      title: 'Tray exported with warnings',
      body: '1 reference points to a missing definition (params.standeeId). Importing this file will fail until it is fixed.'
    });
  });

  it('export warning plural and orphan stacks', () => {
    const body = describeExportWarnings([
      { kind: 'counterShape', id: 'a', path: 'params.topLoadedStacks[0][0]' },
      { kind: 'cardSize', id: 'b', path: 'params.cardSizeId' },
      { kind: 'cell', id: 'c', path: 'params.stacks[0].cellId' }
    ]).body;
    expect(body).toContain(
      '2 references point to missing definitions (params.topLoadedStacks[0][0], params.cardSizeId).'
    );
    expect(body).toContain('1 card well stack has no cell and will be dropped on import.');
  });

  it('export warning with only orphan stacks does not claim a failing import', () => {
    const body = describeExportWarnings([{ kind: 'cell', id: 'c', path: 'p' }]).body;
    expect(body).not.toContain('will fail');
  });
});
