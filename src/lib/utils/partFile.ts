/**
 * File helpers and user-facing texts for part packages (export download, import preview, toasts).
 * No store or Svelte imports; models/types come in as types only, so unit tests stay light.
 * Only downloadPartPackage touches the DOM.
 */

import { countCells } from '#lib/types/cardWellLayout.js';
import { countCups } from '#lib/types/cupLayout.js';
import type { Box, CardSize, CounterBaseShape, CounterShape, Layer, Standee, Tile, Tray } from '#lib/types/project.js';
import { buildFileName, JSON_FILE_EXTENSION } from '#lib/utils/fileName.js';
import {
  DEFINITION_KINDS,
  getDefinitions,
  hasImportTarget,
  isDefinitionKind,
  isPartPackage,
  PART_FILE_SUFFIXES,
  PART_KIND_LABELS,
  resolvePartName,
  validatePartPackage,
  type DefinitionKind,
  type DefinitionTypeMap,
  type ImportReport,
  type ImportReportEntry,
  type PartKind,
  type PartPackage,
  type PartPackageErrorCode
} from '#lib/utils/partPackage.js';
import type { DeadReference } from '#lib/utils/partReferences.js';
import { resolveStandeeHolder, STANDEE_HOLDER_DEFAULTS } from '#lib/utils/standeeHolder.js';
import { resolveTileHolder, TILE_HOLDER_DEFAULTS } from '#lib/utils/tileHolder.js';

export { PART_KIND_LABELS };

// Shown in the project import error banner when a part package is loaded there
export const PART_PACKAGE_IN_PROJECT_IMPORT_MESSAGE = 'This is a part package – please load it via Import on the part.';

export const PART_FILE_INVALID_JSON_MESSAGE = 'The file is not valid JSON.';
export const PART_FILE_READ_ERROR_MESSAGE = 'The file could not be read.';

export const PART_EXPORT_FAILED_TITLE = 'Export failed';

// Where an imported tray or box ends up (name of the box or layer), for the dialog and toast texts.
// A layer always goes on top of the project and needs no context.
export interface PartImportContext {
  targetKind: 'box' | 'layer';
  targetName: string;
}

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

// Old format unchanged for default holder settings; holder details only when they matter
function formatStandee(s: Standee): string {
  const d = STANDEE_HOLDER_DEFAULTS;
  const holder = resolveStandeeHolder(s);
  const size = `${s.standeeWidth} × ${s.standeeHeight} × ${s.standeeThickness} mm`;
  const tilt = `${holder.angleToFloor}° · clearance ${holder.slotClearance} mm`;
  if (holder.arrangement === 'oneSided') {
    const parts = ['One-sided', `Element ${size}`, tilt];
    if (holder.barPositionLeft !== d.barPositionLeft || holder.barPositionRight !== d.barPositionRight) {
      parts.push(`bars ${holder.barPositionLeft} % / ${holder.barPositionRight} %`);
    }
    return parts.join(' · ');
  }
  const base = `Base r ${s.baseRadius} × ${s.baseThickness} mm · Figure ${size}`;
  return holder.angleToFloor !== d.angleToFloor || holder.slotClearance !== d.slotClearance
    ? `${base} · ${tilt}`
    : base;
}

// Holder details (bar positions) only when they differ from the defaults
function formatTile(t: Tile): string {
  const d = TILE_HOLDER_DEFAULTS;
  const holder = resolveTileHolder(t);
  const parts = [
    `Tile ${t.width} × ${t.height} × ${t.thickness} mm`,
    `${holder.angleToFloor}° · clearance ${holder.slotClearance} mm`
  ];
  if (holder.barPositionLeft !== d.barPositionLeft || holder.barPositionRight !== d.barPositionRight) {
    parts.push(`bars ${holder.barPositionLeft} % / ${holder.barPositionRight} %`);
  }
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
      return formatStandee(definition as Standee);
    }
    case 'tile':
      return formatTile(definition as Tile);
  }
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * One-line summary of a tray (type name as in the "Add tray" popover, then a size figure).
 */
export function formatTrayValues(tray: Tray): string {
  switch (tray.type) {
    case 'counter': {
      const stacks = (tray.params?.topLoadedStacks?.length ?? 0) + (tray.params?.edgeLoadedStacks?.length ?? 0);
      return `Counters · ${pluralize(stacks, 'stack', 'stacks')}`;
    }
    case 'cardDraw':
      return `Card draw · ${pluralize(tray.params?.cardCount ?? 0, 'card', 'cards')}`;
    case 'cardDivider':
      return `Card divider · ${pluralize(tray.params?.stacks?.length ?? 0, 'stack', 'stacks')}`;
    case 'cardWell': {
      const layout = tray.params?.layout;
      return `Card well · ${pluralize(layout ? countCells(layout) : 0, 'cell', 'cells')}`;
    }
    case 'cup': {
      const layout = tray.params?.layout;
      return `Cups · ${pluralize(layout ? countCups(layout) : 0, 'cup', 'cups')}`;
    }
    case 'standee':
      return `Standees · ${pluralize(tray.params?.count ?? 0, 'standee', 'standees')}`;
    case 'tile':
      return `Tiles · ${pluralize(tray.params?.count ?? 0, 'tile', 'tiles')}`;
  }
}

// Type name of a tray as shown in formatTrayValues (the part before the size figure)
function trayTypeLabel(tray: Tray): string {
  return formatTrayValues(tray).split(' · ')[0];
}

/**
 * One-line summary of a box: tray count with the distinct tray types, then layout mode.
 */
export function formatBoxValues(box: Box): string {
  const trays = Array.isArray(box.trays) ? box.trays : [];
  const types = [...new Set(trays.map(trayTypeLabel))];
  const layout = Array.isArray(box.manualLayout) && box.manualLayout.length > 0 ? 'manual layout' : 'auto layout';
  return [
    `Box · ${pluralize(trays.length, 'tray', 'trays')}${types.length > 0 ? ` (${types.join(', ')})` : ''}`,
    layout
  ].join(' · ');
}

/**
 * One-line summary of a layer: box and loose tray counts, then layout mode.
 */
export function formatLayerValues(layer: Layer): string {
  const boxes = Array.isArray(layer.boxes) ? layer.boxes : [];
  const looseTrays = Array.isArray(layer.looseTrays) ? layer.looseTrays : [];
  const placements = (layer.manualLayout?.boxes?.length ?? 0) + (layer.manualLayout?.looseTrays?.length ?? 0);
  return [
    `Layer · ${pluralize(boxes.length, 'box', 'boxes')}, ${pluralize(looseTrays.length, 'loose tray', 'loose trays')}`,
    placements > 0 ? 'manual layout' : 'auto layout'
  ].join(' · ');
}

function formatPartValues(pkg: PartPackage): string {
  if (isDefinitionKind(pkg.kind)) {
    return formatDefinitionValues(pkg.kind, pkg.part as DefinitionTypeMap[typeof pkg.kind]);
  }
  if (pkg.kind === 'tray') return formatTrayValues(pkg.part as Tray);
  if (pkg.kind === 'box') return formatBoxValues(pkg.part as Box);
  return formatLayerValues(pkg.part as Layer);
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
  details?: string; // "Uses" line: dependencies of a tray or box; missing when there are none
  warnings?: string; // "Warnings" line: sentences of the dry run; missing when there are none
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

type PlacedKind = 'tray' | 'box' | 'layer';

// Tray / box / layer wording: where it goes; they are never reused, only renamed.
// A tray goes to a box or loose to a layer, a box is always added to a layer,
// a layer always becomes the top layer of the project.
function describePlacedOutcome(
  kind: PlacedKind,
  action: ImportReportEntry['action'],
  name: string,
  entryName: string,
  context: PartImportContext | undefined,
  past: boolean
): string {
  const layerPlace = ` to layer "${context?.targetName}"`;
  const place =
    kind === 'layer'
      ? ' as the top layer'
      : !context
        ? ''
        : kind === 'box'
          ? layerPlace
          : context.targetKind === 'box'
            ? ` to box "${context.targetName}"`
            : ` as a loose tray${layerPlace}`;
  if (action === 'renamed') {
    return past
      ? `A ${kind} "${name}" already exists – added as "${entryName}"${place}.`
      : `A ${kind} "${name}" already exists – will be added as "${entryName}"${place}.`;
  }
  return past ? `"${name}" was added${place}.` : `"${name}" will be added${place}.`;
}

// "A → A (2), ..." for the parts of one kind that got a new name, in report order.
// Source names are queued per ID because tray IDs may repeat across boxes of a layer.
function listRenamed(report: ImportReport, kind: 'box' | 'tray', sources: { id: string; name: string }[]): string[] {
  const queues = new Map<string, string[]>();
  for (const source of sources) {
    queues.set(source.id, [...(queues.get(source.id) ?? []), resolvePartName(kind, source.name)]);
  }
  const renamed: string[] = [];
  for (const entry of report.entries) {
    if (entry.kind !== kind) continue;
    const sourceName = queues.get(entry.sourceId)?.shift();
    if (entry.action === 'renamed' && sourceName !== undefined) renamed.push(`${sourceName} → ${entry.name}`);
  }
  return renamed;
}

// " Boxes renamed: ... Trays renamed: ..." for the contained parts of a box or layer that got a
// new name; empty if none. A box package only has trays, a layer also boxes and loose trays.
function describeRenamedParts(pkg: PartPackage, report: ImportReport): string {
  const boxes = pkg.kind === 'layer' ? ((pkg.part as Layer).boxes ?? []) : [];
  const trays =
    pkg.kind === 'layer'
      ? [...boxes.flatMap((box) => box.trays ?? []), ...((pkg.part as Layer).looseTrays ?? [])]
      : ((pkg.part as Box).trays ?? []);
  const text = (label: string, names: string[]) => (names.length > 0 ? ` ${label} renamed: ${names.join(', ')}.` : '');
  return text('Boxes', listRenamed(report, 'box', boxes)) + text('Trays', listRenamed(report, 'tray', trays));
}

// Main sentence of the dialog result and the toast body, for every kind
function describeMainOutcome(
  pkg: PartPackage,
  report: ImportReport,
  action: ImportReportEntry['action'],
  name: string,
  entryName: string,
  context: PartImportContext | undefined,
  past: boolean
): string {
  if (pkg.kind === 'tray') return describePlacedOutcome('tray', action, name, entryName, context, past);
  if (pkg.kind === 'box' || pkg.kind === 'layer') {
    return describePlacedOutcome(pkg.kind, action, name, entryName, context, past) + describeRenamedParts(pkg, report);
  }
  return describeEntryOutcome(action, name, entryName, past);
}

// Definitions the tray package brings along, in the order of the dependency arrays
function listDependencyEntries(pkg: PartPackage, report: ImportReport) {
  const items: { name: string; entry: ImportReportEntry }[] = [];
  for (const kind of DEFINITION_KINDS) {
    for (const definition of getDefinitions(pkg.dependencies, kind)) {
      const entry = report.entries.find((e) => e.kind === kind && e.sourceId === definition.id);
      if (entry) items.push({ name: resolvePartName(kind, definition.name), entry });
    }
  }
  return items;
}

function describeDependencies(pkg: PartPackage, report: ImportReport): string | undefined {
  const parts = listDependencyEntries(pkg, report).map(({ name, entry }) => {
    if (entry.action === 'reused') return `${entry.name} – already exists`;
    if (entry.action === 'renamed') return `${name} – will be added as "${entry.name}"`;
    return `${name} – will be added`;
  });
  return parts.length > 0 ? parts.join('; ') : undefined;
}

/**
 * Texts for the confirmation dialog. `report` comes from a dry run (previewPartImport).
 * `expectedKind` is the kind of the section where the file was chosen; `context` names the
 * target of a tray import.
 */
export function describePartImportPreview(
  pkg: PartPackage,
  report: ImportReport,
  expectedKind: PartKind,
  context?: PartImportContext
): PartImportPreview {
  const label = PART_KIND_LABELS[pkg.kind];
  const name = resolvePartName(pkg.kind, pkg.part.name);
  const entry = findMainEntry(report, pkg);
  const matches = pkg.kind === expectedKind;
  const hasParts = hasImportTarget(pkg.kind);
  const result = entry ? describeMainOutcome(pkg, report, entry.action, name, entry.name, context, false) : '';

  return {
    title: matches
      ? `Import ${label} "${name}"?`
      : `This file contains a ${label}, not a ${PART_KIND_LABELS[expectedKind]}. Import it as ${label}?`,
    confirmLabel: matches ? 'Import' : `Import as ${label}`,
    name,
    values: formatPartValues(pkg),
    ...(hasParts ? { details: describeDependencies(pkg, report) } : {}),
    ...(report.warnings.length > 0 ? { warnings: report.warnings.join(' ') } : {}),
    result
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
  expectedKind: PartKind,
  context?: PartImportContext
): PartToastText {
  const label = PART_KIND_LABELS[pkg.kind];
  const name = resolvePartName(pkg.kind, pkg.part.name);
  const entry = findMainEntry(report, pkg);
  const action = entry?.action ?? 'created';
  const hasParts = hasImportTarget(pkg.kind);
  let body = describeMainOutcome(pkg, report, action, name, entry?.name ?? name, context, true);
  if (hasParts) {
    const added = listDependencyEntries(pkg, report)
      .filter(({ entry: e }) => e.action !== 'reused')
      .map(({ entry: e }) => e.name);
    if (added.length > 0) body += ` New definitions: ${added.join(', ')}.`;
  }
  if (report.warnings.length > 0) body += ' ' + report.warnings.join(' ');

  if (action === 'reused') return { type: 'info', title: `${capitalize(label)} already exists`, body };
  return {
    type: 'success',
    title: pkg.kind === expectedKind ? `${capitalize(label)} imported` : `Imported as ${label}`,
    body
  };
}

/**
 * Error toast for a failed import. `message` empty/missing falls back to a generic text.
 */
export function describePartImportFailure(expectedKind: PartKind, message?: string): PartToastText {
  return {
    type: 'danger',
    title: `${capitalize(PART_KIND_LABELS[expectedKind])} import failed`,
    body: message || 'The part could not be imported.'
  };
}

/**
 * Info toast after exporting a tray, box or layer with dead references (the file is still written).
 * Missing definitions make the import fail; card well stacks without a cell and manual layout
 * entries without a usable tray are just dropped; invalid layout entries and repeated tray IDs make
 * the import fail.
 */
export function describeExportWarnings(
  warnings: DeadReference[],
  kind: 'tray' | 'box' | 'layer' = 'tray'
): PartToastText {
  const dropKinds = ['cell', 'layoutEntry', 'layoutForm', 'trayId', 'boxId'];
  const missing = warnings.filter((w) => !dropKinds.includes(w.kind));
  const invalid = warnings.filter((w) => w.kind === 'layoutForm' || w.kind === 'trayId' || w.kind === 'boxId');
  const orphanStacks = warnings.filter((w) => w.kind === 'cell').length;
  const layoutEntries = warnings.filter((w) => w.kind === 'layoutEntry').length;
  const sentences: string[] = [];
  if (missing.length > 0) {
    const paths = missing.map((w) => w.path).join(', ');
    sentences.push(
      missing.length === 1
        ? `1 reference points to a missing definition (${paths}). Importing this file will fail until it is fixed.`
        : `${missing.length} references point to missing definitions (${paths}). Importing this file will fail until it is fixed.`
    );
  }
  if (invalid.length > 0) {
    const paths = invalid.map((w) => w.path).join(', ');
    sentences.push(
      `${pluralize(invalid.length, 'entry is', 'entries are')} invalid (${paths}) and will make the import fail.`
    );
  }
  if (orphanStacks > 0) {
    sentences.push(
      `${pluralize(orphanStacks, 'card well stack has', 'card well stacks have')} no cell and will be dropped on import.`
    );
  }
  if (layoutEntries > 0) {
    sentences.push(
      `${pluralize(layoutEntries, 'manual layout entry has', 'manual layout entries have')} no matching ${kind === 'layer' ? 'box or tray' : 'tray'} and will be dropped on import.`
    );
  }
  return {
    type: 'info',
    title: `${capitalize(PART_KIND_LABELS[kind])} exported with warnings`,
    body: sentences.join(' ')
  };
}
