import type { Box, Project } from '#lib/types/project.js';
import {
  describeExportWarnings,
  describeImportReport,
  describePartImportFailure,
  describePartImportPreview,
  formatBoxValues,
  type PartImportContext
} from '#lib/utils/partFile.js';
import { importPartPackage } from '#lib/utils/partImport.js';
import { buildPartPackage, type PartPackage } from '#lib/utils/partPackage.js';
import { firstBox, startProject } from '#lib/utils/partTestFixtures.js';
import { describe, expect, it } from 'vitest';

// F1.6c: texts for box packages
const NOW = new Date('2026-11-06T10:00:00.000Z');
const LAYER_CONTEXT: PartImportContext = { targetKind: 'layer', targetName: 'Bottom layer' };

function boxPackage(project: Project): PartPackage {
  const box = firstBox(project);
  const built = buildPartPackage(project, { kind: 'box', id: box.id }, NOW);
  if (!built.ok) throw new Error(built.error.message);
  return built.package;
}

function dryRun(pkg: PartPackage, project: Project, measureBox?: () => { width: number; depth: number }) {
  return importPartPackage(project, pkg, {
    target: { kind: 'layer', layerId: project.layers[0].id },
    gameContainer: { gameContainerWidth: 150, gameContainerDepth: 200 },
    measureBox
  }).report;
}

describe('formatBoxValues', () => {
  it('names tray count, distinct types and layout mode', () => {
    const box = boxPackage(startProject()).part as Box;
    expect(formatBoxValues({ ...box, manualLayout: undefined })).toBe('Box · 2 trays (Counters) · auto layout');
    const manual = [{ trayId: box.trays[0].id, x: 0, y: 0, rotation: 0 as const }];
    expect(formatBoxValues({ ...box, manualLayout: manual })).toContain(' · manual layout');
  });

  it('handles a box without trays and an empty manual layout', () => {
    const box = boxPackage(startProject()).part as Box;
    expect(formatBoxValues({ ...box, trays: [], manualLayout: [] })).toBe('Box · 0 trays · auto layout');
  });
});

describe('describePartImportPreview: box', () => {
  it('created: values, uses, target layer, no warnings', () => {
    const project = startProject();
    project.layers[0].boxes = [];
    const pkg = boxPackage(startProject());
    const preview = describePartImportPreview(pkg, dryRun(pkg, project), 'box', LAYER_CONTEXT);
    expect(preview.title).toBe('Import box "Counter box"?');
    expect(preview.values).toContain('Box · 2 trays');
    expect(preview.details).toContain('Square – already exists');
    expect(preview.warnings).toBeUndefined();
    expect(preview.result).toBe('"Counter box" will be added to layer "Bottom layer".');
  });

  it('renamed box and trays; size warning shown before confirming', () => {
    const project = startProject();
    const pkg = boxPackage(startProject());
    const preview = describePartImportPreview(
      pkg,
      dryRun(pkg, project, () => ({ width: 300, depth: 300 })),
      'box',
      LAYER_CONTEXT
    );
    expect(preview.result).toContain(
      'A box "Counter box" already exists – will be added as "Counter box (2)" to layer "Bottom layer".'
    );
    expect(preview.result).toContain(' Trays renamed: Counter tray → Counter tray (2)');
    expect(preview.warnings).toContain('is larger than the game container');
  });

  it('shows the wrong-kind title for a box file in a tray section', () => {
    const project = startProject();
    const pkg = boxPackage(project);
    const preview = describePartImportPreview(pkg, dryRun(pkg, project), 'tray', LAYER_CONTEXT);
    expect(preview.title).toBe('This file contains a box, not a tray. Import it as box?');
    expect(preview.confirmLabel).toBe('Import as box');
  });
});

describe('describeImportReport: box', () => {
  it('success toast with warnings', () => {
    const project = startProject();
    const pkg = boxPackage(project);
    const report = dryRun(pkg, project, () => ({ width: 300, depth: 300 }));
    const toast = describeImportReport(report, pkg, 'box', LAYER_CONTEXT);
    expect(toast.type).toBe('success');
    expect(toast.title).toBe('Box imported');
    expect(toast.body).toContain(
      'A box "Counter box" already exists – added as "Counter box (2)" to layer "Bottom layer".'
    );
    expect(toast.body).toContain(' Trays renamed: Counter tray → Counter tray (2)');
    expect(toast.body).toContain('is larger than the game container');
  });

  it('failure title names the box', () => {
    expect(describePartImportFailure('box', 'x').title).toBe('Box import failed');
  });
});

describe('describeExportWarnings: box', () => {
  it('title per kind, layout entries counted separately from missing definitions', () => {
    const toast = describeExportWarnings(
      [
        { kind: 'standee', id: 'z', path: 'trays[1].params.standeeId' },
        { kind: 'layoutEntry', id: 'gone', path: 'manualLayout[0]' }
      ],
      'box'
    );
    expect(toast.title).toBe('Box exported with warnings');
    expect(toast.body).toContain('1 reference points to a missing definition (trays[1].params.standeeId).');
    expect(toast.body).toContain('1 manual layout entry has no matching tray and will be dropped on import.');
    expect(toast.body).not.toContain('2 references');
  });

  it('invalid layout entries and repeated tray IDs make the import fail', () => {
    const toast = describeExportWarnings(
      [
        { kind: 'layoutForm', id: '', path: 'manualLayout[0]' },
        { kind: 'trayId', id: 'a', path: 'trays[1].id' }
      ],
      'box'
    );
    expect(toast.body).toBe('2 entries are invalid (manualLayout[0], trays[1].id) and will make the import fail.');
  });

  it('plural layout entries', () => {
    const toast = describeExportWarnings(
      [
        { kind: 'layoutEntry', id: 'a', path: 'manualLayout[0]' },
        { kind: 'layoutEntry', id: 'b', path: 'manualLayout[1]' }
      ],
      'box'
    );
    expect(toast.body).toBe('2 manual layout entries have no matching tray and will be dropped on import.');
  });
});
