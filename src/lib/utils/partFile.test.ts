import type { CardSize, CounterShape, Project, Standee } from '#lib/types/project.js';
import { insertDefinitions } from '#lib/utils/partImport.js';
import {
  describeImportReport,
  describePartImportFailure,
  describePartImportPreview,
  formatDefinitionValues,
  getPartFileName,
  isPartPackageText,
  parsePartFile,
  PART_PACKAGE_IN_PROJECT_IMPORT_MESSAGE
} from '#lib/utils/partFile.js';
import type { PartDependencies, PartPackage } from '#lib/utils/partPackage.js';
import { buildPartPackage } from '#lib/utils/partPackage.js';
import { describe, expect, it } from 'vitest';

const square: CounterShape = {
  id: 's1',
  name: 'Square',
  baseShape: 'square',
  width: 15.9,
  length: 15.9,
  thickness: 1.3
};
const card: CardSize = { id: 'c1', name: 'Standard', width: 66, length: 91, thickness: 0.5 };
const standee: Standee = {
  id: 'st1',
  name: 'Hero',
  baseRadius: 9,
  baseThickness: 3,
  standeeHeight: 40,
  standeeWidth: 25,
  standeeThickness: 1.5
};

function makeProject(deps: Partial<PartDependencies> = {}): Project {
  return { counterShapes: [], cardSizes: [], standees: [], layers: [], ...deps } as unknown as Project;
}

function makePackage(kind: 'counterShape' | 'cardSize' | 'standee', part: object): PartPackage {
  const key = { counterShape: 'counterShapes', cardSize: 'cardSizes', standee: 'standees' }[kind];
  const source = makeProject({ [key]: [part] });
  const result = buildPartPackage(source, { kind, id: (part as { id: string }).id }, new Date(0));
  if (!result.ok) throw new Error(result.error.message);
  return result.package;
}

const squarePkg = makePackage('counterShape', square);
const cardPkg = makePackage('cardSize', card);

describe('getPartFileName', () => {
  it('uses the kind suffix', () => {
    expect(getPartFileName(squarePkg)).toBe('Square.counter.json');
    expect(getPartFileName(cardPkg)).toBe('Standard.card.json');
    expect(getPartFileName(makePackage('standee', standee))).toBe('Hero.standee.json');
  });

  it('handles empty and unsafe names', () => {
    expect(getPartFileName(makePackage('counterShape', { ...square, name: '' }))).toBe('Unnamed counter.counter.json');
    expect(getPartFileName(makePackage('counterShape', { ...square, name: 'A/B' }))).toBe('A-B.counter.json');
  });
});

describe('parsePartFile', () => {
  it('accepts a valid package', () => {
    const result = parsePartFile(JSON.stringify(squarePkg));
    expect(result.ok).toBe(true);
  });

  it('reports invalid JSON', () => {
    const result = parsePartFile('{nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalidJson');
  });

  it('rejects project files, foreign JSON, newer versions, trays and zero sizes', () => {
    const code = (value: unknown) => {
      const r = parsePartFile(JSON.stringify(value));
      return r.ok ? 'ok' : r.error.code;
    };
    expect(code({ version: 2, layers: [] })).toBe('projectFile');
    expect(code({ hello: 'world' })).toBe('notPartPackage');
    expect(code({ ...squarePkg, formatVersion: 99 })).toBe('newerVersion');
    expect(code({ ...squarePkg, kind: 'tray' })).toBe('unsupportedKind');
    expect(code({ ...squarePkg, part: { ...square, width: 0 } })).toBe('invalidPart');
    expect(code(null)).toBe('notObject');
    expect(code({ ...squarePkg, part: { ...square, thickness: -1 } })).toBe('invalidPart');
  });
});

describe('isPartPackageText', () => {
  it('detects packages only', () => {
    expect(isPartPackageText(JSON.stringify(squarePkg))).toBe(true);
    expect(isPartPackageText(JSON.stringify({ layers: [] }))).toBe(false);
    expect(isPartPackageText('not json')).toBe(false);
    expect(isPartPackageText('null')).toBe(false);
    expect(isPartPackageText('[]')).toBe(false);
    expect(isPartPackageText(JSON.stringify({ version: 2, layers: [], counterShapes: [] }))).toBe(false);
    expect(isPartPackageText('')).toBe(false);
  });

  it('has the approved banner text', () => {
    expect(PART_PACKAGE_IN_PROJECT_IMPORT_MESSAGE).toBe(
      'This is a part package \u2013 please load it via Import on the part.'
    );
  });
});

describe('formatDefinitionValues', () => {
  it('formats counters', () => {
    expect(formatDefinitionValues('counterShape', square)).toBe('Square · 15.9 × 15.9 × 1.3 mm');
    expect(
      formatDefinitionValues('counterShape', { ...square, baseShape: 'hex', pointyTop: true, width: 30, length: 30 })
    ).toBe('Hex · 30 × 30 × 1.3 mm · pointy top');
    expect(formatDefinitionValues('counterShape', { ...square, baseShape: 'hex' })).toBe('Hex · 15.9 × 15.9 × 1.3 mm');
    expect(formatDefinitionValues('counterShape', { ...square, baseShape: 'triangle', cornerRadius: 2 })).toBe(
      'Triangle · 15.9 × 15.9 × 1.3 mm · corner r 2'
    );
    expect(formatDefinitionValues('counterShape', { ...square, baseShape: 'triangle', cornerRadius: 0 })).toBe(
      'Triangle · 15.9 × 15.9 × 1.3 mm'
    );
  });

  it('formats card sizes and standees', () => {
    expect(formatDefinitionValues('cardSize', card)).toBe('66 × 91 × 0.5 mm');
    expect(formatDefinitionValues('standee', standee)).toBe('Base r 9 × 3 mm · Figure 25 × 40 × 1.5 mm');
  });
});

describe('preview and report texts', () => {
  const empty = makeProject();
  const withSquare = makeProject({ counterShapes: [{ ...square, id: 'x1' }] });
  const withOtherSquare = makeProject({ counterShapes: [{ ...square, id: 'x1', thickness: 2 }] });

  const run = (project: Project, pkg: PartPackage) => insertDefinitions(project, pkg).report;

  it('previews a new part with a matching kind', () => {
    const preview = describePartImportPreview(squarePkg, run(empty, squarePkg), 'counterShape');
    expect(preview).toEqual({
      title: 'Import counter "Square"?',
      confirmLabel: 'Import',
      name: 'Square',
      values: 'Square · 15.9 × 15.9 × 1.3 mm',
      result: '"Square" will be added.'
    });
  });

  it('previews reuse and rename', () => {
    expect(describePartImportPreview(squarePkg, run(withSquare, squarePkg), 'counterShape').result).toBe(
      '"Square" already exists – nothing will be added.'
    );
    expect(describePartImportPreview(squarePkg, run(withOtherSquare, squarePkg), 'counterShape').result).toBe(
      'A different "Square" already exists – will be added as "Square (2)".'
    );
  });

  it('uses the wrong-kind dialog texts', () => {
    const preview = describePartImportPreview(cardPkg, run(empty, cardPkg), 'counterShape');
    expect(preview.title).toBe('This file contains a card size, not a counter. Import it as card size?');
    expect(preview.confirmLabel).toBe('Import as card size');
    expect(preview.result).toBe('"Standard" will be added.');
  });

  it('wrong-kind preview names renamed and reused outcomes', () => {
    const wrongTitle = 'This file contains a card size, not a counter. Import it as card size?';
    const otherCard = makeProject({ cardSizes: [{ ...card, id: 'z', width: 70 }] });
    const sameCard = makeProject({ cardSizes: [{ ...card, id: 'z' }] });
    expect(describePartImportPreview(cardPkg, run(otherCard, cardPkg), 'counterShape')).toMatchObject({
      title: wrongTitle,
      confirmLabel: 'Import as card size',
      result: 'A different "Standard" already exists \u2013 will be added as "Standard (2)".'
    });
    expect(describePartImportPreview(cardPkg, run(sameCard, cardPkg), 'counterShape')).toMatchObject({
      title: wrongTitle,
      confirmLabel: 'Import as card size',
      result: '"Standard" already exists \u2013 nothing will be added.'
    });
  });

  it('uses the matching titles for card sizes and standees', () => {
    expect(describePartImportPreview(cardPkg, run(empty, cardPkg), 'cardSize').title).toBe('Import card size "Standard"?');
    const standeePkg = makePackage('standee', standee);
    const preview = describePartImportPreview(standeePkg, run(empty, standeePkg), 'standee');
    expect(preview.title).toBe('Import standee "Hero"?');
    expect(preview.confirmLabel).toBe('Import');
  });

  it('describes toasts for matching kind', () => {
    expect(describeImportReport(run(empty, squarePkg), squarePkg, 'counterShape')).toEqual({
      type: 'success',
      title: 'Counter imported',
      body: '"Square" was added.'
    });
    expect(describeImportReport(run(withOtherSquare, squarePkg), squarePkg, 'counterShape')).toEqual({
      type: 'success',
      title: 'Counter imported',
      body: 'A different "Square" already exists – added as "Square (2)".'
    });
    expect(describeImportReport(run(withSquare, squarePkg), squarePkg, 'counterShape')).toEqual({
      type: 'info',
      title: 'Counter already exists',
      body: '"Square" with the same values is already there – nothing was added.'
    });
  });

  it('describes toasts for the wrong kind', () => {
    const otherCard = makeProject({ cardSizes: [{ ...card, id: 'z', width: 70 }] });
    expect(describeImportReport(run(empty, cardPkg), cardPkg, 'counterShape')).toMatchObject({
      title: 'Imported as card size',
      body: '"Standard" was added.'
    });
    expect(describeImportReport(run(otherCard, cardPkg), cardPkg, 'counterShape')).toMatchObject({
      title: 'Imported as card size',
      body: 'A different "Standard" already exists – added as "Standard (2)".'
    });
    const sameCard = makeProject({ cardSizes: [{ ...card, id: 'z' }] });
    expect(describeImportReport(run(sameCard, cardPkg), cardPkg, 'counterShape')).toEqual({
      type: 'info',
      title: 'Card size already exists',
      body: '"Standard" with the same values is already there \u2013 nothing was added.'
    });
  });

  it('appends warnings', () => {
    const report = { ...run(empty, squarePkg), warnings: ['Careful.'] };
    expect(describeImportReport(report, squarePkg, 'counterShape').body).toBe('"Square" was added. Careful.');
  });

  it('dry run twice gives the same result and leaves the input unchanged', () => {
    const before = JSON.stringify(withOtherSquare);
    const a = run(withOtherSquare, squarePkg);
    const b = run(withOtherSquare, squarePkg);
    expect(a.entries.map((e) => [e.action, e.name])).toEqual(b.entries.map((e) => [e.action, e.name]));
    expect(JSON.stringify(withOtherSquare)).toBe(before);
  });
});

describe('describePartImportFailure', () => {
  it('names the section kind and falls back to a generic text', () => {
    expect(describePartImportFailure('cardSize', 'Boom.')).toEqual({
      type: 'danger',
      title: 'Card size import failed',
      body: 'Boom.'
    });
    expect(describePartImportFailure('standee').body).toBe('The part could not be imported.');
  });
});
