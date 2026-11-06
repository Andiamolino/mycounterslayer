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
  Project,
  Standee,
  Tray
} from '#lib/types/project.js';

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

interface DefinitionFieldSpec {
  type: DefinitionFieldType;
  optional?: boolean;
}

type DefinitionValueKey<K extends DefinitionKind> = Exclude<keyof DefinitionTypeMap[K], 'id' | 'name'>;

// Value fields per definition kind (everything except id and name), with type and optionality
export const DEFINITION_FIELD_SPECS: {
  [K in DefinitionKind]: Record<DefinitionValueKey<K>, DefinitionFieldSpec>;
} = {
  counterShape: {
    baseShape: { type: 'baseShape' },
    width: { type: 'number' },
    length: { type: 'number' },
    thickness: { type: 'number' },
    cornerRadius: { type: 'number', optional: true },
    pointyTop: { type: 'boolean', optional: true }
  },
  cardSize: {
    width: { type: 'number' },
    length: { type: 'number' },
    thickness: { type: 'number' }
  },
  standee: {
    baseRadius: { type: 'number' },
    baseThickness: { type: 'number' },
    standeeHeight: { type: 'number' },
    standeeWidth: { type: 'number' },
    standeeThickness: { type: 'number' }
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
  | 'notFound';

export interface PartPackageError {
  code: PartPackageErrorCode;
  message: string;
}

export type PartPackageResult = { ok: true; package: PartPackage } | { ok: false; error: PartPackageError };

function fail(code: PartPackageErrorCode, message: string): PartPackageResult {
  return { ok: false, error: { code, message } };
}

// Kinds whose export/import is not implemented yet (from F1.5 on)
const UNSUPPORTED_KIND_MESSAGE = (kind: string) => `Parts of kind "${kind}" are not supported yet.`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Build a package for one definition of the project. The project stays unchanged;
 * an empty name becomes the unnamed replacement in the package. Never throws.
 */
export function buildPartPackage(
  project: Project,
  selection: { kind: PartKind; id: string },
  now: Date
): PartPackageResult {
  const { kind, id } = selection;
  if (!isDefinitionKind(kind)) return fail('unsupportedKind', UNSUPPORTED_KIND_MESSAGE(kind));

  const definition = getDefinitions(project, kind).find((item) => item.id === id);
  if (!definition) return fail('notFound', `No ${kind} with ID "${id}" found.`);

  const part = pickDefinitionFields(kind, definition);
  part.name = resolvePartName(kind, part.name ?? '');

  return {
    ok: true,
    package: {
      format: PART_PACKAGE_FORMAT,
      formatVersion: PART_PACKAGE_VERSION,
      kind,
      exportedAt: now.toISOString(),
      part,
      dependencies: { counterShapes: [], cardSizes: [], standees: [] }
    }
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
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
  }
  return null;
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
  if (!isDefinitionKind(kind)) {
    if (kind === 'tray' || kind === 'box' || kind === 'layer') {
      return fail('unsupportedKind', UNSUPPORTED_KIND_MESSAGE(kind));
    }
    return fail('unknownKind', 'The part package has an unknown kind.');
  }

  const partError = checkDefinition(kind, pkg.part, 'part');
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

  return {
    ok: true,
    package: {
      format: PART_PACKAGE_FORMAT,
      formatVersion: PART_PACKAGE_VERSION,
      kind,
      exportedAt: typeof pkg.exportedAt === 'string' ? pkg.exportedAt : '',
      part: pickDefinitionFields(kind, pkg.part as DefinitionTypeMap[typeof kind]),
      dependencies
    }
  };
}
