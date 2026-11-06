/**
 * File helpers and user-facing texts for part packages (export download, import preview, toasts).
 * No store or Svelte imports; models/types come in as types only, so unit tests stay light.
 * Only downloadPartPackage touches the DOM.
 */

import type { CardSize, CounterBaseShape, CounterShape, Standee } from '#lib/types/project.js';
import { buildFileName, JSON_FILE_EXTENSION } from '#lib/utils/fileName.js';
import {
  isPartPackage,
  PART_FILE_SUFFIXES,
  resolvePartName,
  validatePartPackage,
  type DefinitionKind,
  type DefinitionTypeMap,
  type ImportReport,
  type ImportReportEntry,
  type PartPackage,
  type PartPackageErrorCode
} from '#lib/utils/partPackage.js';

// Shown in the project import error banner when a part package is loaded there
export const PART_PACKAGE_IN_PROJECT_IMPORT_MESSAGE = 'This is a part package – please load it via Import on the part.';

export const PART_FILE_INVALID_JSON_MESSAGE = 'The file is not valid JSON.';
export const PART_FILE_READ_ERROR_MESSAGE = 'The file could not be read.';

export const PART_EXPORT_FAILED_TITLE = 'Export failed';

export const PART_KIND_LABELS: Record<DefinitionKind, string> = {
  counterShape: 'counter',
  cardSize: 'card size',
  standee: 'standee'
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const BASE_SHAPE_LABELS: Record<CounterBaseShape, string> = {
  rectangle: 'Rectangle',
  square: 'Square',
  circle: 'Circle',
  hex: 'Hex',
  triangle: 'Triangle'
};

// ---------------------------------------------------------------------------
// Parsing and file name
// ---------------------------------------------------------------------------

export type PartFileErrorCode = PartPackageErrorCode | 'invalidJson';

export type PartFileResult =
  { ok: true; package: PartPackage } | { ok: false; error: { code: PartFileErrorCode; message: string } };

/**
 * Parse the text of a part file: JSON first, then validation. Never throws.
 */
export function parsePartFile(text: string): PartFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'invalidJson', message: PART_FILE_INVALID_JSON_MESSAGE } };
  }
  return validatePartPackage(raw);
}

/**
 * True if the text is JSON that claims to be a part package (format field only, no validation).
 */
export function isPartPackageText(text: string): boolean {
  try {
    return isPartPackage(JSON.parse(text));
  } catch {
    return false;
  }
}

export function getPartFileName(pkg: PartPackage): string {
  return buildFileName(pkg.part.name, JSON_FILE_EXTENSION, PART_FILE_SUFFIXES[pkg.kind]);
}

/**
 * Download a package as a JSON file (browser only).
 */
export function downloadPartPackage(pkg: PartPackage): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getPartFileName(pkg);
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function formatCounter(counter: CounterShape): string {
  const parts = [
    BASE_SHAPE_LABELS[counter.baseShape] ?? counter.baseShape,
    `${counter.width} × ${counter.length} × ${counter.thickness} mm`
  ];
  if (counter.baseShape === 'hex' && counter.pointyTop) parts.push('pointy top');
  if (counter.baseShape === 'triangle' && counter.cornerRadius) parts.push(`corner r ${counter.cornerRadius}`);
  return parts.join(' · ');
}

/**
 * One-line summary of the value fields of a definition (numbers as stored, not rounded).
 */
export function formatDefinitionValues<K extends DefinitionKind>(kind: K, definition: DefinitionTypeMap[K]): string {
  switch (kind) {
    case 'counterShape':
      return formatCounter(definition as CounterShape);
    case 'cardSize': {
      const card = definition as CardSize;
      return `${card.width} × ${card.length} × ${card.thickness} mm`;
    }
    case 'standee': {
      const s = definition as Standee;
      return (
        `Base r ${s.baseRadius} × ${s.baseThickness} mm · ` +
        `Figure ${s.standeeWidth} × ${s.standeeHeight} × ${s.standeeThickness} mm`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Preview and report texts
// ---------------------------------------------------------------------------

/** Entry of the report that belongs to the imported part itself (dependencies are ignored). */
export function findMainEntry(report: ImportReport, pkg: PartPackage): ImportReportEntry | undefined {
  return report.entries.find((entry) => entry.kind === pkg.kind && entry.sourceId === pkg.part.id);
}

export interface PartImportPreview {
  title: string;
  confirmLabel: string;
  name: string;
  values: string;
  result: string;
}

function describeEntryOutcome(action: ImportReportEntry['action'], name: string, entryName: string, past: boolean) {
  switch (action) {
    case 'created':
      return past ? `"${name}" was added.` : `"${name}" will be added.`;
    case 'renamed':
      return past
        ? `A different "${name}" already exists – added as "${entryName}".`
        : `A different "${name}" already exists – will be added as "${entryName}".`;
    case 'reused':
      return past
        ? `"${entryName}" with the same values is already there – nothing was added.`
        : `"${entryName}" already exists – nothing will be added.`;
  }
}

/**
 * Texts for the confirmation dialog. `report` comes from a dry run (previewPartImport).
 * `expectedKind` is the kind of the section where the file was chosen.
 */
export function describePartImportPreview(
  pkg: PartPackage,
  report: ImportReport,
  expectedKind: DefinitionKind
): PartImportPreview {
  const kind = pkg.kind as DefinitionKind;
  const label = PART_KIND_LABELS[kind];
  const name = resolvePartName(pkg.kind, pkg.part.name);
  const entry = findMainEntry(report, pkg);
  const matches = kind === expectedKind;

  return {
    title: matches
      ? `Import ${label} "${name}"?`
      : `This file contains a ${label}, not a ${PART_KIND_LABELS[expectedKind]}. Import it as ${label}?`,
    confirmLabel: matches ? 'Import' : `Import as ${label}`,
    name,
    values: formatDefinitionValues(kind, pkg.part as DefinitionTypeMap[typeof kind]),
    result: entry ? describeEntryOutcome(entry.action, name, entry.name, false) : ''
  };
}

export interface PartToastText {
  type: 'success' | 'info' | 'danger';
  title: string;
  body: string;
}

/**
 * Toast after a confirmed import. Reused parts add nothing, so they never say "Imported as".
 */
export function describeImportReport(
  report: ImportReport,
  pkg: PartPackage,
  expectedKind: DefinitionKind
): PartToastText {
  const kind = pkg.kind as DefinitionKind;
  const label = PART_KIND_LABELS[kind];
  const name = resolvePartName(pkg.kind, pkg.part.name);
  const entry = findMainEntry(report, pkg);
  const action = entry?.action ?? 'created';
  const warnings = report.warnings.length > 0 ? ' ' + report.warnings.join(' ') : '';
  const body = describeEntryOutcome(action, name, entry?.name ?? name, true) + warnings;

  if (action === 'reused') return { type: 'info', title: `${capitalize(label)} already exists`, body };
  return {
    type: 'success',
    title: kind === expectedKind ? `${capitalize(label)} imported` : `Imported as ${label}`,
    body
  };
}

/**
 * Error toast for a failed import. `message` empty/missing falls back to a generic text.
 */
export function describePartImportFailure(expectedKind: DefinitionKind, message?: string): PartToastText {
  return {
    type: 'danger',
    title: `${capitalize(PART_KIND_LABELS[expectedKind])} import failed`,
    body: message || 'The part could not be imported.'
  };
}
