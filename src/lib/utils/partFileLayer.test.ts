import type { Layer, Project } from '#lib/types/project.js';
import {
  describeExportWarnings,
  describeImportReport,
  describePartImportFailure,
  describePartImportPreview,
  formatLayerValues
} from '#lib/utils/partFile.js';
import { importPartPackage } from '#lib/utils/partImport.js';
import { buildPartPackage, type PartPackage } from '#lib/utils/partPackage.js';
import { PART_TEST_CONTAINER, PART_TEST_NOW, firstLayer, startProject } from '#lib/utils/partTestFixtures.js';
import { describe, expect, it } from 'vitest';

// F1.7c: texts for layer packages

function layerPackage(project: Project, index = 0): PartPackage {
  const built = buildPartPackage(project, { kind: 'layer', id: project.layers[index].id }, PART_TEST_NOW);
  if (!built.ok) throw new Error(built.error.message);
  return built.package;
}

function dryRun(pkg: PartPackage, project: Project, measureLayer?: () => { width: number; depth: number }) {
  return importPartPackage(project, pkg, {
    target: { kind: 'project' },
    gameContainer: PART_TEST_CONTAINER,
    measureLayer
  }).report;
}

describe('formatLayerValues', () => {
  it('names box and loose tray counts and the layout mode', () => {
    const layer = firstLayer(startProject());
    expect(formatLayerValues({ ...layer, manualLayout: undefined })).toBe('Layer · 1 box, 1 loose tray · auto layout');
    const middle = startProject().layers[1];
    expect(formatLayerValues(middle)).toBe('Layer · 0 boxes, 3 loose trays · manual layout');
  });

  it('handles an empty layer and an empty manual layout', () => {
    const layer = firstLayer(startProject());
    const empty = { ...layer, boxes: [], looseTrays: [], manualLayout: { boxes: [], looseTrays: [] } };
    expect(formatLayerValues(empty)).toBe('Layer · 0 boxes, 0 loose trays · auto layout');
  });
});

describe('describePartImportPreview: layer', () => {
  it('renamed layer, box and trays: names, values, uses', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    const preview = describePartImportPreview(pkg, dryRun(pkg, project), 'layer');
    expect(preview.title).toBe('Import layer "Bottom layer"?');
    expect(preview.confirmLabel).toBe('Import');
    expect(preview.values).toBe('Layer · 1 box, 1 loose tray · auto layout');
    expect(preview.details).toContain('Square – already exists');
    expect(preview.warnings).toBeUndefined();
    expect(preview.result).toContain(
      'A layer "Bottom layer" already exists – will be added as "Bottom layer (2)" as the top layer.'
    );
    expect(preview.result).toContain(' Boxes renamed: Counter box → Counter box (2).');
    expect(preview.result).toContain(' Trays renamed: ');
    expect(preview.result).toContain('Counter tray → Counter tray (2)');
    expect(preview.result).toContain('Cup tray → Cup tray (2)');
  });

  it('created: no rename sentences', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    project.layers = [];
    const preview = describePartImportPreview(pkg, dryRun(pkg, project), 'layer');
    expect(preview.result).toBe('"Bottom layer" will be added as the top layer.');
  });

  it('shows the container warning before confirming', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    const preview = describePartImportPreview(
      pkg,
      dryRun(pkg, project, () => ({ width: 300, depth: 300 })),
      'layer'
    );
    expect(preview.warnings).toContain('the game container is 150 × 200 mm. Positions were kept.');
  });

  it('shows dropped layout entries and uses over all trays', () => {
    const project = startProject();
    const pkg = layerPackage(project, 1);
    (pkg.part as Layer).manualLayout!.looseTrays.push({ trayId: 'ghost', x: 0, y: 0, rotation: 0 });
    const preview = describePartImportPreview(pkg, dryRun(pkg, project), 'layer');
    expect(preview.warnings).toContain('1 manual layout entry without a matching box or tray dropped.');
    expect(preview.details).toBeDefined();
  });

  it('shows the wrong-kind title for a layer file in a box section', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    const preview = describePartImportPreview(pkg, dryRun(pkg, project), 'box');
    expect(preview.title).toBe('This file contains a layer, not a box. Import it as layer?');
    expect(preview.confirmLabel).toBe('Import as layer');
  });
});

describe('describeImportReport: layer', () => {
  it('success toast with renamed parts, new definitions and warnings', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    project.counterShapes = [];
    const report = dryRun(pkg, project, () => ({ width: 300, depth: 300 }));
    const toast = describeImportReport(report, pkg, 'layer');
    expect(toast.type).toBe('success');
    expect(toast.title).toBe('Layer imported');
    expect(toast.body).toContain(
      'A layer "Bottom layer" already exists – added as "Bottom layer (2)" as the top layer.'
    );
    expect(toast.body).toContain(' Boxes renamed: Counter box → Counter box (2).');
    expect(toast.body).toContain(' New definitions: ');
    expect(toast.body).toContain('Positions were kept.');
  });

  it('created layer says it was added as the top layer', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    project.layers = [];
    const toast = describeImportReport(dryRun(pkg, project), pkg, 'layer');
    expect(toast.body).toBe('"Bottom layer" was added as the top layer.');
  });

  it('imported as layer from another section; failure title names the layer', () => {
    const project = startProject();
    const pkg = layerPackage(project);
    expect(describeImportReport(dryRun(pkg, project), pkg, 'box').title).toBe('Imported as layer');
    expect(describePartImportFailure('layer', 'x').title).toBe('Layer import failed');
  });
});

describe('describeExportWarnings: layer', () => {
  it('title and layout sentence name box or tray', () => {
    const toast = describeExportWarnings(
      [
        { kind: 'standee', id: 'z', path: 'looseTrays[1].params.standeeId' },
        { kind: 'layoutEntry', id: 'gone', path: 'manualLayout.boxes[0]' }
      ],
      'layer'
    );
    expect(toast.type).toBe('info');
    expect(toast.title).toBe('Layer exported with warnings');
    expect(toast.body).toContain('1 reference points to a missing definition (looseTrays[1].params.standeeId).');
    expect(toast.body).toContain('1 manual layout entry has no matching box or tray and will be dropped on import.');
  });

  it('plural layout entries and invalid IDs', () => {
    const entries = [
      { kind: 'layoutEntry' as const, id: 'a', path: 'manualLayout.boxes[0]' },
      { kind: 'layoutEntry' as const, id: 'b', path: 'manualLayout.looseTrays[0]' }
    ];
    expect(describeExportWarnings(entries, 'layer').body).toBe(
      '2 manual layout entries have no matching box or tray and will be dropped on import.'
    );
    const invalid = describeExportWarnings([{ kind: 'boxId', id: 'a', path: 'boxes[1].id' }], 'layer');
    expect(invalid.body).toBe('1 entry is invalid (boxes[1].id) and will make the import fail.');
  });
});
