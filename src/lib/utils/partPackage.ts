/**
 * Part package format for the part library (export/import of single parts).
 * Pure types and helpers, no store or UI imports. Models and types are imported
 * as types only, so unit tests do not pull in JSCad.
 */

import type {
  Box,
  CardSize,
  CounterBaseShape,
  CounterShape,
  Layer,
  LidParams,
  Project,
  Standee,
  Tray
} from '#lib/types/project.js';
// Circular with partReferences: each module only calls the other's functions at runtime, never at top level
import {
  allowsNameFallback,
  collectReferences,
  findDeadReferences,
  mapTrayReferences,
  resolveDefinitionId,
  type DeadReference
} from '#lib/utils/partReferences.js';

export const PART_PACKAGE_FORMAT = 'counterslayer-part';
export const PART_PACKAGE_VERSION = 1;

export type PartKind = 'counterShape' | 'cardSize' | 'standee' | 'tray' | 'box' | 'layer';

// Global definitions that trays reference by ID
export type DefinitionKind = 'counterShape' | 'cardSize' | 'standee';

export interface DefinitionTypeMap {
  counterShape: CounterShape;
  cardSize: CardSize;
  standee: Standee;
}

export interface PartTypeMap extends DefinitionTypeMap {
  tray: Tray;
  box: Box;
  layer: Layer;
}

// Same keys as the matching arrays in Project, so a Project can be used as PartDependencies
export interface PartDependencies {
  counterShapes: CounterShape[];
  cardSizes: CardSize[];
  standees: Standee[];
}

export interface PartPackage<K extends PartKind = PartKind> {
  format: typeof PART_PACKAGE_FORMAT;
  formatVersion: number;
  kind: K;
  exportedAt: string; // ISO time, info only
  part: PartTypeMap[K]; // Part with its source IDs
  dependencies: PartDependencies;
}

// File name suffix per kind, used as buildFileName(name, '.json', suffix)
export const PART_FILE_SUFFIXES: Record<PartKind, string> = {
  counterShape: '.counter',
  cardSize: '.card',
  standee: '.standee',
  tray: '.tray',
  box: '.box',
  layer: '.layer'
};

// Replacement name per kind when a part has an empty name
export const UNNAMED_PART_NAMES: Record<PartKind, string> = {
  counterShape: 'Unnamed counter',
  cardSize: 'Unnamed card size',
  standee: 'Unnamed standee',
  tray: 'Unnamed tray',
  box: 'Unnamed box',
  layer: 'Unnamed layer'
};

// Array key in Project / PartDependencies per definition kind
export const DEFINITION_COLLECTION_KEYS: { [K in DefinitionKind]: keyof PartDependencies } = {
  counterShape: 'counterShapes',
  cardSize: 'cardSizes',
  standee: 'standees'
};

export const DEFINITION_KINDS: DefinitionKind[] = ['counterShape', 'cardSize', 'standee'];

export type ImportAction = 'created' | 'reused' | 'renamed';

export interface ImportReportEntry {
  kind: PartKind;
  sourceId: string;
  targetId: string;
  name: string;
  action: ImportAction;
}

export interface ImportReport {
  entries: ImportReportEntry[];
  warnings: string[];
}

/**
 * Get the definition array of a kind from a project or package dependencies.
 * Returns the original array (no copy); a missing array yields [].
 */
export function getDefinitions<K extends DefinitionKind>(source: PartDependencies, kind: K): DefinitionTypeMap[K][] {
  const list = source[DEFINITION_COLLECTION_KEYS[kind]] as DefinitionTypeMap[K][] | undefined;
  return list ?? [];
}

/**
 * Detect a part package by its `format` field only (no validation).
 */
export function isPartPackage(raw: unknown): boolean {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).format === PART_PACKAGE_FORMAT
  );
}

// ---------------------------------------------------------------------------
// Definition fields
// ---------------------------------------------------------------------------

// Runtime list of CounterBaseShape values (types/project.ts)
export const COUNTER_BASE_SHAPES: readonly CounterBaseShape[] = ['rectangle', 'square', 'circle', 'hex', 'triangle'];

type DefinitionFieldType = 'number' | 'boolean' | 'baseShape';

// Lower bound for number fields: 'positive' = > 0, 'nonNegative' = >= 0 (-0 counts as 0)
type DefinitionFieldMin = 'positive' | 'nonNegative';

interface DefinitionFieldSpec {
  type: DefinitionFieldType;
  optional?: boolean;
  min?: DefinitionFieldMin;
}

const FIELD_MIN_MESSAGES: Record<DefinitionFieldMin, string> = {
  positive: 'must be greater than 0',
  nonNegative: 'must not be negative'
};

function isAboveMin(min: DefinitionFieldMin, value: number): boolean {
  return min === 'positive' ? value > 0 : value >= 0;
}

type DefinitionValueKey<K extends DefinitionKind> = Exclude<keyof DefinitionTypeMap[K], 'id' | 'name'>;

// Value fields per definition kind (everything except id and name), with type and optionality
export const DEFINITION_FIELD_SPECS: {
  [K in DefinitionKind]: Record<DefinitionValueKey<K>, DefinitionFieldSpec>;
} = {
  counterShape: {
    baseShape: { type: 'baseShape' },
    width: { type: 'number', min: 'positive' },
    length: { type: 'number', min: 'positive' },
    thickness: { type: 'number', min: 'positive' },
    cornerRadius: { type: 'number', optional: true, min: 'nonNegative' },
    pointyTop: { type: 'boolean', optional: true }
  },
  cardSize: {
    width: { type: 'number', min: 'positive' },
    length: { type: 'number', min: 'positive' },
    thickness: { type: 'number', min: 'positive' }
  },
  standee: {
    // baseRadius 0 would put the figure axis on the floor (no base disc), see standeeTray.ts computeLayout
    baseRadius: { type: 'number', min: 'positive' },
    baseThickness: { type: 'number', min: 'positive' },
    standeeHeight: { type: 'number', min: 'positive' },
    standeeWidth: { type: 'number', min: 'positive' },
    standeeThickness: { type: 'number', min: 'positive' }
  }
};

export function isDefinitionKind(kind: unknown): kind is DefinitionKind {
  return DEFINITION_KINDS.includes(kind as DefinitionKind);
}

/**
 * Copy only the known fields of a definition (id, name, value fields); undefined fields are left out.
 * All fields are primitives, so the result is a deep copy.
 */
export function pickDefinitionFields<K extends DefinitionKind>(
  kind: K,
  definition: DefinitionTypeMap[K]
): DefinitionTypeMap[K] {
  const source = definition as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const field of ['id', 'name', ...Object.keys(DEFINITION_FIELD_SPECS[kind])]) {
    if (source[field] !== undefined) result[field] = source[field];
  }
  return result as unknown as DefinitionTypeMap[K];
}

/**
 * Replace an empty or whitespace-only name with the unnamed replacement of the kind.
 */
export function resolvePartName(kind: PartKind, name: string): string {
  return name.trim() === '' ? UNNAMED_PART_NAMES[kind] : name;
}

// ---------------------------------------------------------------------------
// Results and errors
// ---------------------------------------------------------------------------

export type PartPackageErrorCode =
  | 'notObject'
  | 'invalidData'
  | 'projectFile'
  | 'notPartPackage'
  | 'invalidVersion'
  | 'newerVersion'
  | 'unknownKind'
  | 'unsupportedKind'
  | 'invalidPart'
  | 'invalidDependencies'
  | 'missingDefinition'
  | 'notFound';

export interface PartPackageError {
  code: PartPackageErrorCode;
  message: string;
}

export type PartPackageResult = { ok: true; package: PartPackage } | { ok: false; error: PartPackageError };

// Result of buildPartPackage: dead references of a tray are reported as warnings (empty for definitions)
export type BuildPartPackageResult =
  { ok: true; package: PartPackage; warnings: DeadReference[] } | { ok: false; error: PartPackageError };

function fail(code: PartPackageErrorCode, message: string): { ok: false; error: PartPackageError } {
  return { ok: false, error: { code, message } };
}

export const PART_KIND_LABELS: Record<PartKind, string> = {
  counterShape: 'counter',
  cardSize: 'card size',
  standee: 'standee',
  tray: 'tray',
  box: 'box',
  layer: 'layer'
};

// Kinds whose export/import is not implemented yet (layer only)
const UNSUPPORTED_KIND_MESSAGE = (kind: string) => `Parts of kind "${kind}" are not supported yet.`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Find a tray by ID in all layers (loose trays and trays in boxes).
 */
function findTray(project: Project, id: string): Tray | undefined {
  for (const layer of project.layers ?? []) {
    const loose = (layer?.looseTrays ?? []).find((tray) => tray?.id === id);
    if (loose) return loose;
    for (const box of layer?.boxes ?? []) {
      const inBox = (box?.trays ?? []).find((tray) => tray?.id === id);
      if (inBox) return inBox;
    }
  }
  return undefined;
}

/**
 * Remove the game container size from a counter tray copy: it comes from the
 * target project on import, not from the package.
 */
function stripGameContainer(tray: Tray): void {
  if (tray.type !== 'counter' || typeof tray.params !== 'object' || tray.params === null) return;
  const params = tray.params as Partial<typeof tray.params>;
  delete params.gameContainerWidth;
  delete params.gameContainerDepth;
}

/**
 * Build the part of a tray: copy without game container size, references resolved
 * to IDs (dead ones keep their raw value and are returned as warnings with paths
 * relative to the tray). The source stays unchanged.
 */
function buildTrayPart(project: Project, source: Tray): { part: Tray; warnings: DeadReference[] } {
  const allowName = allowsNameFallback(source.type);
  const warnings = findDeadReferences(source, project);
  // mapTrayReferences returns the one deep copy; the source stays unchanged
  const part = mapTrayReferences(source, (ref) => resolveDefinitionId(project, ref.kind, ref.id, allowName) ?? ref.id);
  stripGameContainer(part);
  part.name = resolvePartName('tray', typeof part.name === 'string' ? part.name : '');
  return { part, warnings };
}

/**
 * Dependencies of built tray parts = exactly the definitions they use
 * (each once, project order).
 */
function collectDependencies(project: Project, parts: Tray[]): PartDependencies {
  const usedIds: Record<DefinitionKind, Set<string>> = {
    counterShape: new Set(),
    cardSize: new Set(),
    standee: new Set()
  };
  for (const part of parts) {
    for (const ref of collectReferences(part)) {
      // '' is an empty reference, not a definition
      if (ref.id !== '' && resolveDefinitionId(project, ref.kind, ref.id, false) !== null)
        usedIds[ref.kind].add(ref.id);
    }
  }
  const dependencies: PartDependencies = { counterShapes: [], cardSizes: [], standees: [] };
  for (const kind of DEFINITION_KINDS) {
    const seen = new Set<string>();
    for (const definition of getDefinitions(project, kind)) {
      if (!usedIds[kind].has(definition.id) || seen.has(definition.id)) continue;
      seen.add(definition.id);
      (dependencies[DEFINITION_COLLECTION_KEYS[kind]] as unknown[]).push(pickDefinitionFields(kind, definition));
    }
  }
  return dependencies;
}

function packageOf<K extends PartKind>(kind: K, part: PartTypeMap[K], dependencies: PartDependencies, now: Date) {
  return {
    format: PART_PACKAGE_FORMAT,
    formatVersion: PART_PACKAGE_VERSION,
    kind,
    exportedAt: now.toISOString(),
    part,
    dependencies
  } as PartPackage;
}

/**
 * Build a package for a tray (see buildTrayPart, collectDependencies).
 */
function buildTrayPackage(project: Project, id: string, now: Date): BuildPartPackageResult {
  const source = findTray(project, id);
  if (!source) return fail('notFound', `No tray with ID "${id}" found.`);
  const { part, warnings } = buildTrayPart(project, source);
  return { ok: true, package: packageOf('tray', part, collectDependencies(project, [part]), now), warnings };
}

/**
 * Find a box by ID in all layers.
 */
export function findBox(project: Project, id: string): Box | undefined {
  for (const layer of project.layers ?? []) {
    const box = (layer?.boxes ?? []).find((item) => item?.id === id);
    if (box) return box;
  }
  return undefined;
}

const MANUAL_ROTATIONS: readonly number[] = [0, 90, 180, 270];

// Form of one manual layout entry (shared by export findings and the package check)
function checkManualEntry(entry: unknown, path: string): string | null {
  if (!isPlainObject(entry)) return `${path} must be an object.`;
  if (!isString(entry.trayId)) return `${path}.trayId must be a string.`;
  if (!isFiniteNumber(entry.x)) return `${path}.x has an invalid value.`;
  if (!isFiniteNumber(entry.y)) return `${path}.y has an invalid value.`;
  if (!MANUAL_ROTATIONS.includes(entry.rotation as number)) return `${path}.rotation has an invalid value.`;
  return null;
}

/**
 * Manual layout entries that cannot be imported as they are: wrong form (kind 'layoutForm',
 * makes the import fail), no tray with that ID in the box (orphan) or an ID that an earlier
 * entry already has (duplicate, both kind 'layoutEntry', dropped on import). Reported as
 * warnings on export; the entries stay in the package.
 */
function findManualLayoutIssues(box: Box, trayIds: Set<string>): DeadReference[] {
  const issues: DeadReference[] = [];
  const seen = new Set<string>();
  const layout: unknown = box.manualLayout;
  if (!Array.isArray(layout)) return issues;
  layout.forEach((entry: unknown, i) => {
    const path = `manualLayout[${i}]`;
    const id = isPlainObject(entry) && isString(entry.trayId) ? entry.trayId : '';
    if (checkManualEntry(entry, path) !== null) {
      issues.push({ kind: 'layoutForm', id, path });
    } else if (!trayIds.has(id) || seen.has(id)) {
      issues.push({ kind: 'layoutEntry', id, path });
    }
    seen.add(id);
  });
  return issues;
}

/**
 * Build a package for a box: JSON copy with all box fields, every tray built like a
 * single tray (warnings with the path prefix `trays[i].`), dependencies of all trays
 * together (each once). Manual layout entries are copied as they are.
 */
function buildBoxPackage(project: Project, id: string, now: Date): BuildPartPackageResult {
  const source = findBox(project, id);
  if (!source) return fail('notFound', `No box with ID "${id}" found.`);

  const warnings: DeadReference[] = [];
  const trays: Tray[] = [];
  // Index of the source array, so the warning path matches trays[i] in the file
  (source.trays ?? []).forEach((tray, i) => {
    if (!isPlainObject(tray)) return;
    const built = buildTrayPart(project, tray as unknown as Tray);
    trays.push(built.part);
    warnings.push(...built.warnings.map((w) => ({ ...w, path: `trays[${i}].${w.path}` })));
  });

  const part = JSON.parse(JSON.stringify({ ...source, trays: [] })) as Box;
  part.trays = trays;
  part.name = resolvePartName('box', typeof part.name === 'string' ? part.name : '');
  // A repeated tray ID makes the package check fail (the manual layout refers to the IDs)
  const seenTrayIds = new Set<string>();
  trays.forEach((tray, i) => {
    if (seenTrayIds.has(tray.id)) warnings.push({ kind: 'trayId', id: tray.id, path: `trays[${i}].id` });
    seenTrayIds.add(tray.id);
  });
  warnings.push(...findManualLayoutIssues(part, new Set(trays.map((tray) => tray.id))));

  return { ok: true, package: packageOf('box', part, collectDependencies(project, trays), now), warnings };
}

/**
 * Build a package for one part of the project (definition, tray or box). The project stays
 * unchanged; an empty name becomes the unnamed replacement in the package. Never throws.
 */
export function buildPartPackage(
  project: Project,
  selection: { kind: PartKind; id: string },
  now: Date
): BuildPartPackageResult {
  const { kind, id } = selection;
  if (kind === 'tray') return buildTrayPackage(project, id, now);
  if (kind === 'box') return buildBoxPackage(project, id, now);
  if (!isDefinitionKind(kind)) return fail('unsupportedKind', UNSUPPORTED_KIND_MESSAGE(kind));

  const definition = getDefinitions(project, kind).find((item) => item.id === id);
  if (!definition) return fail('notFound', `No ${kind} with ID "${id}" found.`);

  const part = pickDefinitionFields(kind, definition);
  part.name = resolvePartName(kind, part.name ?? '');

  return {
    ok: true,
    package: packageOf(kind, part, { counterShapes: [], cardSizes: [], standees: [] }, now),
    warnings: []
  };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

type RawPackage = Record<string, unknown>;

// Migration steps: key = version the step migrates from (n → n + 1). Empty for v1.
const PART_PACKAGE_MIGRATIONS: Record<number, (pkg: RawPackage) => RawPackage> = {};

/**
 * Migrate a raw package of an older format version to PART_PACKAGE_VERSION.
 * Returns a deep copy; the input stays unchanged. Throws if a step is missing.
 */
export function migratePartPackage(pkg: RawPackage): RawPackage {
  let current = structuredClone(pkg);
  let version = current.formatVersion as number;
  while (version < PART_PACKAGE_VERSION) {
    const step = PART_PACKAGE_MIGRATIONS[version];
    if (!step) throw new Error(`No migration for part package version ${version}`);
    current = step(current);
    version += 1;
    current.formatVersion = version;
  }
  return current;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldValid(type: DefinitionFieldType, value: unknown): boolean {
  switch (type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'baseShape':
      return COUNTER_BASE_SHAPES.includes(value as CounterBaseShape);
  }
}

/**
 * Check one definition; returns the error message (with field path) or null.
 */
function checkDefinition(kind: DefinitionKind, raw: unknown, path: string): string | null {
  if (!isPlainObject(raw)) return `${path} must be an object.`;
  if (typeof raw.id !== 'string' || raw.id.trim() === '') return `${path}.id must be a non-empty string.`;
  if (typeof raw.name !== 'string') return `${path}.name must be a string.`;

  const specs = DEFINITION_FIELD_SPECS[kind] as Record<string, DefinitionFieldSpec>;
  for (const [field, spec] of Object.entries(specs)) {
    const value = raw[field];
    if (value === undefined && spec.optional) continue;
    if (!isFieldValid(spec.type, value)) return `${path}.${field} has an invalid value.`;
    if (spec.min && !isAboveMin(spec.min, value as number)) {
      return `${path}.${field} ${FIELD_MIN_MESSAGES[spec.min]}.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tray check (structure and types only, no value ranges)
// ---------------------------------------------------------------------------

type TrayType = Tray['type'];
type ParamKey<T extends TrayType> = keyof Extract<Tray, { type: T }>['params'] & string;

interface TrayNumberFields<T extends TrayType> {
  numbers: readonly ParamKey<T>[]; // finite number
  nullable: readonly ParamKey<T>[]; // finite number or null
}

// Numeric params per tray type; missing fields are tolerated (like the project import)
const TRAY_NUMBER_FIELDS: { [T in TrayType]: TrayNumberFields<T> } = {
  counter: {
    numbers: [
      'counterThickness',
      'clearance',
      'wallThickness',
      'floorThickness',
      'rimHeight',
      'cutoutRatio',
      'cutoutMax',
      'trayWidthOverride'
    ],
    nullable: []
  },
  cardDraw: {
    numbers: [
      'cardCount',
      'wallThickness',
      'floorThickness',
      'clearance',
      'floorSlopeAngle',
      'magnetHoleDiameter',
      'magnetHoleDepth'
    ],
    nullable: []
  },
  cardDivider: { numbers: ['wallThickness', 'floorThickness', 'clearance', 'rimHeight'], nullable: [] },
  cup: {
    numbers: ['trayWidth', 'trayDepth', 'wallThickness', 'floorThickness', 'cornerRadius'],
    nullable: ['cupCavityHeight']
  },
  cardWell: {
    numbers: ['wallThickness', 'floorThickness', 'clearance', 'rimHeight'],
    nullable: ['trayWidthOverride', 'trayDepthOverride']
  },
  standee: {
    numbers: ['count', 'wallThickness', 'innerWallThickness', 'floorThickness', 'clearance', 'rimHeight'],
    nullable: ['trayWidthOverride', 'trayDepthOverride']
  }
};

const TRAY_TYPES = Object.keys(TRAY_NUMBER_FIELDS) as TrayType[];

// Guards against stack overflow on absurdly deep foreign cup trees
const MAX_CUP_TREE_DEPTH = 100;

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

// Editors store NaN, which JSON turns into null: structure only, so null counts like a missing value
function isFiniteNumberOrNull(value: unknown): boolean {
  return value === null || isFiniteNumber(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function checkCupNode(node: unknown, path: string, depth: number): string | null {
  if (depth > MAX_CUP_TREE_DEPTH) return `${path} is nested too deeply.`;
  if (!isPlainObject(node)) return `${path} must be an object.`;
  if (node.type === 'cup') return isString(node.id) ? null : `${path}.id must be a string.`;
  if (node.type !== 'split') return `${path}.type must be "cup" or "split".`;
  if (node.direction !== 'horizontal' && node.direction !== 'vertical') {
    return `${path}.direction has an invalid value.`;
  }
  if (!isFiniteNumberOrNull(node.ratio)) return `${path}.ratio has an invalid value.`;
  return checkCupNode(node.first, `${path}.first`, depth + 1) ?? checkCupNode(node.second, `${path}.second`, depth + 1);
}

// Shared by cardDivider and cardWell stacks: cardSizeId string, count number
function checkCardStack(stack: unknown, path: string): string | null {
  if (!isPlainObject(stack)) return `${path} must be an object.`;
  if (!isString(stack.cardSizeId)) return `${path}.cardSizeId must be a string.`;
  if (stack.count !== undefined && !isFiniteNumberOrNull(stack.count)) return `${path}.count has an invalid value.`;
  return null;
}

function checkList(list: unknown, path: string, checkItem: (item: unknown, itemPath: string) => string | null) {
  if (list === undefined) return null; // missing lists are tolerated
  if (!Array.isArray(list)) return `${path} must be an array.`;
  for (let i = 0; i < list.length; i++) {
    const error = checkItem(list[i], `${path}[${i}]`);
    if (error) return error;
  }
  return null;
}

// [counterShapeId, count, ...optional strings]
function checkCounterStack(stack: unknown, path: string): string | null {
  if (!Array.isArray(stack)) return `${path} must be an array.`;
  if (!isString(stack[0])) return `${path}[0] must be a string.`;
  if (!isFiniteNumberOrNull(stack[1])) return `${path}[1] has an invalid value.`;
  for (let i = 2; i < stack.length; i++) {
    if (stack[i] !== undefined && stack[i] !== null && !isString(stack[i])) return `${path}[${i}] must be a string.`;
  }
  return null;
}

/**
 * Check the type-specific part of a tray's params; returns the error message or null.
 */
function checkTrayParams(type: TrayType, params: Record<string, unknown>, path: string): string | null {
  switch (type) {
    case 'counter':
      return (
        checkList(params.topLoadedStacks, `${path}.topLoadedStacks`, checkCounterStack) ??
        checkList(params.edgeLoadedStacks, `${path}.edgeLoadedStacks`, checkCounterStack)
      );
    case 'cardDraw':
      return isString(params.cardSizeId) ? null : `${path}.cardSizeId must be a string.`;
    case 'standee':
      return isString(params.standeeId) ? null : `${path}.standeeId must be a string.`;
    case 'cardDivider': {
      if (
        params.orientation !== undefined &&
        params.orientation !== 'vertical' &&
        params.orientation !== 'horizontal'
      ) {
        return `${path}.orientation has an invalid value.`;
      }
      if (
        params.stackDirection !== undefined &&
        params.stackDirection !== 'sideBySide' &&
        params.stackDirection !== 'frontToBack'
      ) {
        return `${path}.stackDirection has an invalid value.`;
      }
      return checkList(params.stacks, `${path}.stacks`, (stack, stackPath) => {
        const error = checkCardStack(stack, stackPath);
        if (error) return error;
        const label = (stack as Record<string, unknown>).label;
        return label === undefined || isString(label) ? null : `${stackPath}.label must be a string.`;
      });
    }
    case 'cardWell': {
      const layout = params.layout;
      if (!isPlainObject(layout) || !Array.isArray(layout.columns)) return `${path}.layout.columns must be an array.`;
      for (let i = 0; i < layout.columns.length; i++) {
        const column = layout.columns[i];
        if (!Array.isArray(column) || !column.every(isString)) {
          return `${path}.layout.columns[${i}] must be an array of strings.`;
        }
      }
      return checkList(params.stacks, `${path}.stacks`, (stack, stackPath) => {
        const error = checkCardStack(stack, stackPath);
        if (error) return error;
        const record = stack as Record<string, unknown>;
        if (!isString(record.cellId)) return `${stackPath}.cellId must be a string.`;
        // Stack IDs may be missing in old data (a new one is made on import)
        if (record.id !== undefined && !isString(record.id)) return `${stackPath}.id must be a string.`;
        if (record.rotation !== undefined && record.rotation !== 0 && record.rotation !== 90) {
          return `${stackPath}.rotation has an invalid value.`;
        }
        return null;
      });
    }
    case 'cup': {
      const layout = params.layout;
      if (!isPlainObject(layout)) return `${path}.layout must be an object.`;
      return checkCupNode(layout.root, `${path}.layout.root`, 0);
    }
  }
}

/**
 * Check a tray of a package: known type, id/name/color, params object, references,
 * layout trees and numeric fields in the right form. No value ranges. Returns the error
 * message (with field path) or null.
 */
function checkTray(raw: unknown, path: string): string | null {
  if (!isPlainObject(raw)) return `${path} must be an object.`;
  if (typeof raw.id !== 'string' || raw.id.trim() === '') return `${path}.id must be a non-empty string.`;
  if (!isString(raw.name)) return `${path}.name must be a string.`;
  if (!isString(raw.color)) return `${path}.color must be a string.`;
  const type = raw.type as TrayType;
  if (!TRAY_TYPES.includes(type)) return `${path}.type has an invalid value.`;
  const { rotationOverride, showEmboss, showStackLabels } = raw;
  if (
    rotationOverride !== undefined &&
    rotationOverride !== 'auto' &&
    rotationOverride !== 0 &&
    rotationOverride !== 90
  ) {
    return `${path}.rotationOverride has an invalid value.`;
  }
  if (showEmboss !== undefined && typeof showEmboss !== 'boolean') return `${path}.showEmboss has an invalid value.`;
  if (showStackLabels !== undefined && typeof showStackLabels !== 'boolean') {
    return `${path}.showStackLabels has an invalid value.`;
  }

  const params = raw.params;
  if (!isPlainObject(params)) return `${path}.params must be an object.`;
  const fields = TRAY_NUMBER_FIELDS[type];
  for (const field of [...fields.numbers, ...fields.nullable]) {
    if (params[field] !== undefined && !isFiniteNumberOrNull(params[field])) {
      return `${path}.params.${field} has an invalid value.`;
    }
  }
  return checkTrayParams(type, params, `${path}.params`);
}

// ---------------------------------------------------------------------------
// Box check (structure and types only, no value ranges)
// ---------------------------------------------------------------------------

// Every LidParams field with its type; Record<keyof LidParams, ...> keeps it in sync with the type
const LID_FIELD_TYPES: Record<keyof LidParams, 'number' | 'boolean'> = {
  thickness: 'number',
  railHeight: 'number',
  railWidth: 'number',
  railInset: 'number',
  ledgeHeight: 'number',
  fingerNotchRadius: 'number',
  fingerNotchDepth: 'number',
  snapEnabled: 'boolean',
  snapBumpHeight: 'number',
  snapBumpWidth: 'number',
  railEngagement: 'number',
  rampLockEnabled: 'boolean',
  rampHeight: 'number',
  rampLengthIn: 'number',
  rampLengthOut: 'number',
  showName: 'boolean',
  honeycombEnabled: 'boolean',
  honeycombHexSize: 'number',
  honeycombWallThickness: 'number',
  honeycombBorderOffset: 'number'
};

/**
 * Check the lid params object: present fields must have the right type; missing
 * fields are fine (the importer fills them from the defaults).
 */
function checkLidParams(raw: unknown, path: string): string | null {
  if (!isPlainObject(raw)) return `${path} must be an object.`;
  for (const [field, type] of Object.entries(LID_FIELD_TYPES)) {
    const value = raw[field];
    if (value === undefined) continue;
    if (type === 'number' ? !isFiniteNumber(value) : typeof value !== 'boolean') {
      return `${path}.${field} has an invalid value.`;
    }
  }
  return null;
}

/**
 * Check a box of a package: box fields, lid params, every tray like a single tray,
 * unique tray IDs (the manual layout refers to them) and the form of the manual layout
 * entries. No value ranges. Returns the error message (with field path) or null.
 */
function checkBox(raw: unknown, path: string): string | null {
  if (!isPlainObject(raw)) return `${path} must be an object.`;
  if (typeof raw.id !== 'string' || raw.id.trim() === '') return `${path}.id must be a non-empty string.`;
  if (!isString(raw.name)) return `${path}.name must be a string.`;
  for (const field of ['tolerance', 'wallThickness', 'floorThickness']) {
    if (!isFiniteNumber(raw[field])) return `${path}.${field} has an invalid value.`;
  }
  // Editors store NaN, which JSON turns into null: counts like a missing value
  for (const field of ['customWidth', 'customDepth', 'customBoxHeight']) {
    if (raw[field] !== undefined && !isFiniteNumberOrNull(raw[field])) return `${path}.${field} has an invalid value.`;
  }
  for (const field of ['fillSolidEmpty', 'bottomHoneycombEnabled']) {
    if (raw[field] !== undefined && typeof raw[field] !== 'boolean') return `${path}.${field} has an invalid value.`;
  }
  const lidError = checkLidParams(raw.lidParams, `${path}.lidParams`);
  if (lidError) return lidError;

  if (!Array.isArray(raw.trays)) return `${path}.trays must be an array.`;
  const trayIds = new Set<string>();
  for (let i = 0; i < raw.trays.length; i++) {
    const trayPath = `${path}.trays[${i}]`;
    const error = checkTray(raw.trays[i], trayPath);
    if (error) return error;
    const trayId = (raw.trays[i] as { id: string }).id;
    if (trayIds.has(trayId)) return `${trayPath}.id "${trayId}" is used more than once.`;
    trayIds.add(trayId);
  }

  if (raw.manualLayout === undefined) return null;
  if (!Array.isArray(raw.manualLayout)) return `${path}.manualLayout must be an array.`;
  for (let i = 0; i < raw.manualLayout.length; i++) {
    const error = checkManualEntry(raw.manualLayout[i], `${path}.manualLayout[${i}]`);
    if (error) return error;
  }
  return null;
}

/**
 * Normalize a checked tray part: copy without game container size, references
 * resolved to IDs in `dependencies` (name fallback only where the generator has it).
 * Returns the error path of the first reference without a definition instead.
 */
function normalizeTrayPart(
  raw: Tray,
  dependencies: PartDependencies
): { ok: true; tray: Tray } | { ok: false; path: string; id: string; kind: DefinitionKind } {
  const allowName = allowsNameFallback(raw.type);
  const missing: { path: string; id: string; kind: DefinitionKind }[] = []; // only the first one is reported
  const tray = mapTrayReferences(raw, (ref) => {
    const resolved = resolveDefinitionId(dependencies, ref.kind, ref.id, allowName);
    if (resolved === null) {
      if (missing.length === 0) missing.push({ path: ref.path, id: ref.id, kind: ref.kind });
      return ref.id;
    }
    return resolved;
  });
  if (missing.length > 0) return { ok: false, ...missing[0] };
  stripGameContainer(tray);
  return { ok: true, tray };
}

/**
 * Validate an unknown value (e.g. parsed JSON) as a part package. Older versions are
 * migrated. Returns a normalized deep copy; the input stays unchanged. Never throws.
 */
export function validatePartPackage(raw: unknown): PartPackageResult {
  if (!isPlainObject(raw)) return fail('notObject', 'The file does not contain a JSON object.');

  if (raw.format === undefined && (Array.isArray(raw.layers) || Array.isArray(raw.boxes))) {
    return fail('projectFile', 'This is a project file – please load it via Import project JSON.');
  }
  if (raw.format !== PART_PACKAGE_FORMAT) return fail('notPartPackage', 'This file is not a part package.');

  const version = raw.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return fail('invalidVersion', 'The part package has an invalid format version.');
  }
  if (version > PART_PACKAGE_VERSION) {
    return fail('newerVersion', 'The part package was made with a newer version of the app.');
  }

  // Cloning fails for values JSON cannot contain (functions, symbols ...)
  let clone: RawPackage;
  try {
    clone = structuredClone(raw);
  } catch {
    return fail('invalidData', 'The part package contains values that are not valid JSON data.');
  }

  let pkg: RawPackage;
  try {
    pkg = migratePartPackage(clone);
  } catch {
    return fail('invalidVersion', 'The part package version cannot be migrated.');
  }

  const kind = pkg.kind;
  if (!isDefinitionKind(kind) && kind !== 'tray' && kind !== 'box') {
    if (kind === 'layer') return fail('unsupportedKind', UNSUPPORTED_KIND_MESSAGE(kind));
    return fail('unknownKind', 'The part package has an unknown kind.');
  }

  const partError =
    kind === 'tray'
      ? checkTray(pkg.part, 'part')
      : kind === 'box'
        ? checkBox(pkg.part, 'part')
        : checkDefinition(kind, pkg.part, 'part');
  if (partError) return fail('invalidPart', partError);

  const dependencies: PartDependencies = { counterShapes: [], cardSizes: [], standees: [] };
  if (pkg.dependencies !== undefined) {
    if (!isPlainObject(pkg.dependencies)) {
      return fail('invalidDependencies', 'dependencies must be an object.');
    }
    for (const depKind of DEFINITION_KINDS) {
      const key = DEFINITION_COLLECTION_KEYS[depKind];
      const list = pkg.dependencies[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) return fail('invalidDependencies', `dependencies.${key} must be an array.`);
      // Source IDs must be unique per kind, otherwise references would be ambiguous
      const seenIds = new Set<string>();
      if (depKind === kind) seenIds.add((pkg.part as { id: string }).id);
      for (let i = 0; i < list.length; i++) {
        const path = `dependencies.${key}[${i}]`;
        const depError = checkDefinition(depKind, list[i], path);
        if (depError) return fail('invalidDependencies', depError);
        const depId = (list[i] as { id: string }).id;
        if (seenIds.has(depId)) {
          return fail('invalidDependencies', `${path}.id "${depId}" is used more than once.`);
        }
        seenIds.add(depId);
      }
      (dependencies[key] as unknown[]) = list.map((item) => pickDefinitionFields(depKind, item));
    }
  }

  let part: PartTypeMap[PartKind];
  if (kind === 'tray' || kind === 'box') {
    // A box is normalized tray by tray; the first missing definition aborts the whole package
    const source = pkg.part as Tray | Box;
    const trays = kind === 'box' ? (source as Box).trays : [source as Tray];
    const normalizedTrays: Tray[] = [];
    for (let i = 0; i < trays.length; i++) {
      const normalized = normalizeTrayPart(trays[i], dependencies);
      if (!normalized.ok) {
        const trayPath = kind === 'box' ? `trays[${i}].${normalized.path}` : normalized.path;
        return fail(
          'missingDefinition',
          `The ${PART_KIND_LABELS[kind]} refers to a ${PART_KIND_LABELS[normalized.kind]} that is not in the file (part.${trayPath}: "${normalized.id}"). Nothing was imported.`
        );
      }
      normalizedTrays.push(normalized.tray);
    }
    part = kind === 'box' ? { ...(source as Box), trays: normalizedTrays } : normalizedTrays[0];
  } else {
    part = pickDefinitionFields(kind, pkg.part as DefinitionTypeMap[typeof kind]);
  }

  return {
    ok: true,
    package: {
      format: PART_PACKAGE_FORMAT,
      formatVersion: PART_PACKAGE_VERSION,
      kind,
      exportedAt: typeof pkg.exportedAt === 'string' ? pkg.exportedAt : '',
      part,
      dependencies
    }
  };
}
