/**
 * Pure core logic for importing part packages: value comparison, free names,
 * ID allocation and reference analysis. Inputs are never mutated.
 * Models and types are imported as types only (no JSCad in unit tests).
 */

import type { CupLayoutNode } from '#lib/types/cupLayout.js';
import type { CardSize, CounterShape, Project, Standee, Tray } from '#lib/types/project.js';
import {
  DEFINITION_COLLECTION_KEYS,
  DEFINITION_FIELD_SPECS,
  DEFINITION_KINDS,
  getDefinitions,
  isDefinitionKind,
  pickDefinitionFields,
  resolvePartName,
  type DefinitionKind,
  type DefinitionTypeMap,
  type ImportReport,
  type PartDependencies,
  type PartPackage
} from '#lib/utils/partPackage.js';

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

/**
 * Normalize a JSON-like value for comparison:
 * - object keys sorted, fields with `undefined` removed (missing == undefined)
 * - arrays keep their order; trailing `null`/`undefined` are cut off (optional tuple slots)
 * - `undefined` inside an array becomes `null` (same as after a JSON round trip)
 * - otherwise `null` stays a value of its own
 */
export function canonicalize(value: unknown): CanonicalValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value as CanonicalValue;

  if (Array.isArray(value)) {
    let end = value.length;
    while (end > 0 && (value[end - 1] === null || value[end - 1] === undefined)) end--;
    return value.slice(0, end).map((item) => canonicalize(item) ?? null);
  }

  // Null prototype: an own "__proto__" key from JSON.parse stays a plain key
  const result = Object.create(null) as { [key: string]: CanonicalValue };
  for (const key of Object.keys(value).sort()) {
    const item = canonicalize((value as Record<string, unknown>)[key]);
    if (item !== undefined) result[key] = item;
  }
  return result;
}

// Compared value fields per definition kind (id and name are always excluded)
export const DEFINITION_VALUE_FIELDS: { [K in DefinitionKind]: (keyof DefinitionTypeMap[K])[] } = {
  counterShape: Object.keys(DEFINITION_FIELD_SPECS.counterShape) as (keyof CounterShape)[],
  cardSize: Object.keys(DEFINITION_FIELD_SPECS.cardSize) as (keyof CardSize)[],
  standee: Object.keys(DEFINITION_FIELD_SPECS.standee) as (keyof Standee)[]
};

// UI defaults filled in for missing fields, only for comparison (stored data stays unchanged)
export const DEFINITION_COMPARE_DEFAULTS: { [K in DefinitionKind]: Partial<DefinitionTypeMap[K]> } = {
  counterShape: { cornerRadius: 1.5, pointyTop: false },
  cardSize: {},
  standee: {}
};

function canonicalEquals(a: CanonicalValue | undefined, b: CanonicalValue | undefined): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => canonicalEquals(item, b[i]));
  }
  const objA = a as { [key: string]: CanonicalValue };
  const objB = b as { [key: string]: CanonicalValue };
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  return (
    keysA.length === keysB.length &&
    keysA.every((key) => Object.hasOwn(objB, key) && canonicalEquals(objA[key], objB[key]))
  );
}

function pickValueFields<K extends DefinitionKind>(kind: K, definition: DefinitionTypeMap[K]): Record<string, unknown> {
  const defaults = DEFINITION_COMPARE_DEFAULTS[kind] as Record<string, unknown>;
  const source = definition as unknown as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const field of DEFINITION_VALUE_FIELDS[kind] as string[]) {
    picked[field] = source[field] === undefined ? defaults[field] : source[field];
  }
  return picked;
}

/**
 * Compare two definitions by their value fields only (id and name ignored).
 * Numbers are compared exactly; null is not 0.
 */
export function areValuesEqual<K extends DefinitionKind>(
  kind: K,
  a: DefinitionTypeMap[K],
  b: DefinitionTypeMap[K]
): boolean {
  return canonicalEquals(canonicalize(pickValueFields(kind, a)), canonicalize(pickValueFields(kind, b)));
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Name comparison: trimmed and case-insensitive. "Square (2)" does not match "Square".
 */
export function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

// Counter suffix " (n)"; a space is required, so "Square(2)" stays a base name
const NAME_COUNTER_SUFFIX = /\s+\((\d+)\)$/;
const FIRST_NAME_COUNTER = 2;

/**
 * Return `desired` unchanged if no taken name matches it. Otherwise strip a
 * trailing " (n)" to get the base name and return "<base> (n)" with the
 * smallest free n >= 2. Example: Square, Square (2) taken → "Square (3)".
 */
export function findFreeName(desired: string, takenNames: Iterable<string>): string {
  const taken = new Set<string>();
  for (const name of takenNames) taken.add(normalizeName(name));
  if (!taken.has(normalizeName(desired))) return desired;

  const baseName = desired.trim().replace(NAME_COUNTER_SUFFIX, '');
  for (let n = FIRST_NAME_COUNTER; ; n++) {
    const candidate = `${baseName} (${n})`;
    if (!taken.has(normalizeName(candidate))) return candidate;
  }
}

function collectCupIds(node: CupLayoutNode | undefined, ids: Set<string>): void {
  if (!node) return;
  if (node.type === 'cup') {
    ids.add(node.id);
    return;
  }
  collectCupIds(node.first, ids);
  collectCupIds(node.second, ids);
}

function collectTrayIds(tray: Tray, ids: Set<string>): void {
  ids.add(tray.id);
  if (tray.type === 'cup') {
    collectCupIds(tray.params?.layout?.root, ids);
  } else if (tray.type === 'cardWell') {
    for (const column of tray.params?.layout?.columns ?? []) {
      for (const cellId of column) ids.add(cellId);
    }
    for (const stack of tray.params?.stacks ?? []) {
      ids.add(stack.id);
      ids.add(stack.cellId);
    }
  }
}

/**
 * Collect every ID used in a project: layers, boxes, trays (loose and in boxes),
 * counter shapes, card sizes, standees, cup IDs, card well cells and stacks.
 */
export function collectAllIds(project: Project): Set<string> {
  const ids = new Set<string>();
  for (const layer of project.layers ?? []) {
    ids.add(layer.id);
    for (const tray of layer.looseTrays ?? []) collectTrayIds(tray, ids);
    for (const box of layer.boxes ?? []) {
      ids.add(box.id);
      for (const tray of box.trays ?? []) collectTrayIds(tray, ids);
    }
  }
  for (const kind of DEFINITION_KINDS) {
    for (const definition of getDefinitions(project, kind)) ids.add(definition.id);
  }
  return ids;
}

// Same style as the existing generators (7 base-36 characters)
function defaultRandomId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export const ID_ALLOCATOR_MAX_ATTEMPTS = 1000;

/**
 * Create an ID allocator that never returns an ID from `taken` or one it has
 * already returned. `taken` is copied, not modified. Throws after
 * ID_ALLOCATOR_MAX_ATTEMPTS collisions in a row.
 */
export function createIdAllocator(taken: Set<string>, random: () => string = defaultRandomId): () => string {
  const used = new Set(taken);
  return () => {
    for (let attempt = 0; attempt < ID_ALLOCATOR_MAX_ATTEMPTS; attempt++) {
      const id = random();
      if (id && !used.has(id)) {
        used.add(id);
        return id;
      }
    }
    throw new Error(`Could not allocate a free ID after ${ID_ALLOCATOR_MAX_ATTEMPTS} attempts`);
  };
}

export interface DefinitionReference {
  kind: DefinitionKind;
  id: string;
  path: string; // e.g. "params.topLoadedStacks[1][0]"
}

export interface DeadReference {
  kind: DefinitionKind | 'cell';
  id: string;
  path: string;
}

/**
 * List all references from a tray to global definitions, with their path in the tray.
 * Cup trays have no references.
 */
export function collectReferences(tray: Tray): DefinitionReference[] {
  const refs: DefinitionReference[] = [];
  switch (tray.type) {
    case 'counter':
      (tray.params.topLoadedStacks ?? []).forEach((stack, i) =>
        refs.push({ kind: 'counterShape', id: stack[0], path: `params.topLoadedStacks[${i}][0]` })
      );
      (tray.params.edgeLoadedStacks ?? []).forEach((stack, i) =>
        refs.push({ kind: 'counterShape', id: stack[0], path: `params.edgeLoadedStacks[${i}][0]` })
      );
      break;
    case 'cardDraw':
      refs.push({ kind: 'cardSize', id: tray.params.cardSizeId, path: 'params.cardSizeId' });
      break;
    case 'cardDivider':
    case 'cardWell':
      (tray.params.stacks ?? []).forEach((stack, i) =>
        refs.push({ kind: 'cardSize', id: stack.cardSizeId, path: `params.stacks[${i}].cardSizeId` })
      );
      break;
    case 'standee':
      refs.push({ kind: 'standee', id: tray.params.standeeId, path: 'params.standeeId' });
      break;
    case 'cup':
      break;
  }
  return refs;
}

/**
 * Find references that point to nothing: definitions missing in `definitions`,
 * and card well stacks whose cellId is not a cell in the layout (kind 'cell').
 */
export function findDeadReferences(tray: Tray, definitions: PartDependencies): DeadReference[] {
  const dead: DeadReference[] = collectReferences(tray).filter(
    (ref) => !getDefinitions(definitions, ref.kind).some((definition) => definition.id === ref.id)
  );

  if (tray.type === 'cardWell') {
    const cellIds = new Set((tray.params.layout?.columns ?? []).flat());
    (tray.params.stacks ?? []).forEach((stack, i) => {
      if (!cellIds.has(stack.cellId)) {
        dead.push({ kind: 'cell', id: stack.cellId, path: `params.stacks[${i}].cellId` });
      }
    });
  }
  return dead;
}

// ---------------------------------------------------------------------------
// Inserting definitions
// ---------------------------------------------------------------------------

// Source ID → target ID, separate per kind (source IDs may collide across kinds)
export type DefinitionIdMap = { [K in DefinitionKind]: Map<string, string> };

export interface InsertResult {
  project: Project;
  idMap: DefinitionIdMap;
  report: ImportReport;
}

// Working state of one import; `project` is a private deep copy that is extended in place
export interface InsertState extends InsertResult {
  allocateId: () => string;
}

/**
 * Start an import on a deep copy of `project`. The original stays unchanged.
 * Used by insertDefinitions and later by tray/box/layer imports.
 * The returned allocateId throws if no free ID can be allocated.
 */
export function createInsertState(project: Project, random?: () => string): InsertState {
  const copy = structuredClone(project);
  for (const kind of DEFINITION_KINDS) {
    const key = DEFINITION_COLLECTION_KEYS[kind];
    if (!Array.isArray(copy[key])) (copy[key] as unknown[]) = [];
  }
  return {
    project: copy,
    idMap: { counterShape: new Map(), cardSize: new Map(), standee: new Map() },
    report: { entries: [], warnings: [] },
    allocateId: createIdAllocator(collectAllIds(copy), random)
  };
}

/**
 * Insert one definition into the state by rule 1 and return its target ID:
 * - a definition of the same kind with matching name and equal values → reused
 * - no definition with matching name → created with the imported name
 * - matching name but other values → renamed with the next free "Name (n)"
 * New definitions get a new ID, only known fields, and are appended.
 */
export function insertDefinition<K extends DefinitionKind>(
  state: InsertState,
  kind: K,
  definition: DefinitionTypeMap[K]
): string {
  const targets = getDefinitions(state.project, kind);
  const name = resolvePartName(kind, definition.name ?? '');
  const candidates = targets.filter((target) => namesMatch(target.name, name));
  const match = candidates.find((target) => areValuesEqual(kind, target, definition));

  let targetId: string;
  if (match) {
    targetId = match.id;
    state.report.entries.push({ kind, sourceId: definition.id, targetId, name: match.name, action: 'reused' });
  } else {
    const finalName =
      candidates.length === 0
        ? name
        : findFreeName(
            name,
            targets.map((target) => target.name)
          );
    targetId = state.allocateId();
    targets.push({ ...pickDefinitionFields(kind, definition), id: targetId, name: finalName });
    state.report.entries.push({
      kind,
      sourceId: definition.id,
      targetId,
      name: finalName,
      action: candidates.length === 0 ? 'created' : 'renamed'
    });
  }

  state.idMap[kind].set(definition.id, targetId);
  return targetId;
}

/**
 * Insert all dependencies (counter shapes, card sizes, standees), then the part
 * itself if it is a definition. Works on a deep copy; the inputs stay unchanged.
 * Throws if no free ID can be allocated (see createIdAllocator).
 */
export function insertDefinitions(project: Project, pkg: PartPackage, random?: () => string): InsertResult {
  const state = createInsertState(project, random);
  for (const kind of DEFINITION_KINDS) {
    for (const definition of getDefinitions(pkg.dependencies, kind)) {
      insertDefinition(state, kind, definition);
    }
  }
  if (isDefinitionKind(pkg.kind)) {
    insertDefinition(state, pkg.kind, pkg.part as DefinitionTypeMap[typeof pkg.kind]);
  }
  return { project: state.project, idMap: state.idMap, report: state.report };
}
