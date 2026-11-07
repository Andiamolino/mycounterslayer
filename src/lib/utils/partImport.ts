/**
 * Pure core logic for importing part packages: value comparison, free names,
 * ID allocation, inserting definitions and inserting trays into a box or layer.
 * Inputs are never mutated.
 * Models and types are imported as types only (no JSCad in unit tests).
 */

import type { CupLayoutNode } from '#lib/types/cupLayout.js';
import type { Box, CardSize, CounterShape, Layer, LidParams, Project, Standee, Tray } from '#lib/types/project.js';
import { formatContainerHeightStatus, type ContainerHeightCheck } from '#lib/utils/containerHeight.js';
import {
  DEFINITION_COLLECTION_KEYS,
  DEFINITION_FIELD_SPECS,
  DEFINITION_KINDS,
  findBox,
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
import { mapTrayReferences } from '#lib/utils/partReferences.js';

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
 * Strip a trailing counter " (n)" (space required) from a trimmed name.
 * Example: "Square (2)" → "Square", "Square(2)" → "Square(2)".
 */
export function getBaseName(name: string): string {
  return name.trim().replace(NAME_COUNTER_SUFFIX, '');
}

/**
 * Return `desired` unchanged if no taken name matches it. Otherwise strip a
 * trailing " (n)" to get the base name and return "<base> (n)" with the
 * smallest free n >= 2. Example: Square, Square (2) taken → "Square (3)".
 */
export function findFreeName(desired: string, takenNames: Iterable<string>): string {
  const taken = new Set<string>();
  for (const name of takenNames) taken.add(normalizeName(name));
  if (!taken.has(normalizeName(desired))) return desired;

  const baseName = getBaseName(desired);
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

// ---------------------------------------------------------------------------
// Inserting definitions
// ---------------------------------------------------------------------------

// Source ID → target ID, separate per kind (source IDs may collide across kinds)
export type DefinitionIdMap = { [K in DefinitionKind]: Map<string, string> };

// Definition maps plus source tray/box/layer ID → target ID
export type PartIdMap = DefinitionIdMap & {
  tray: Map<string, string>;
  box: Map<string, string>;
  layer: Map<string, string>;
};

export interface InsertResult {
  project: Project;
  idMap: PartIdMap;
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
    idMap: {
      counterShape: new Map(),
      cardSize: new Map(),
      standee: new Map(),
      tray: new Map(),
      box: new Map(),
      layer: new Map()
    },
    report: { entries: [], warnings: [] },
    allocateId: createIdAllocator(collectAllIds(copy), random)
  };
}

/**
 * Reuse candidates for an imported name: all definitions whose base name matches the
 * base name of `name` ("X", "X (2)", "X (3)" ...). Exact name matches come first,
 * then the other family members in array order. "Xy" and "X(2)" are not family.
 */
export function findNameFamily<T extends { name: string }>(definitions: T[], name: string): T[] {
  const baseName = getBaseName(name);
  const family = definitions.filter((definition) => namesMatch(getBaseName(definition.name), baseName));
  return [
    ...family.filter((definition) => namesMatch(definition.name, name)),
    ...family.filter((definition) => !namesMatch(definition.name, name))
  ];
}

/**
 * Insert one definition into the state by rule 1 and return its target ID:
 * - a definition of the same kind in the name family (see findNameFamily) with equal
 *   values → reused (exact name first); this replaces rule 3b for reusing
 * - imported name not taken → created with the imported name
 * - imported name taken, no equal values in the family → renamed with the next free "Name (n)"
 * New definitions get a new ID, only known fields, and are appended.
 */
export function insertDefinition<K extends DefinitionKind>(
  state: InsertState,
  kind: K,
  definition: DefinitionTypeMap[K]
): string {
  const targets = getDefinitions(state.project, kind);
  const name = resolvePartName(kind, definition.name ?? '');
  const match = findNameFamily(targets, name).find((target) => areValuesEqual(kind, target, definition));

  let targetId: string;
  if (match) {
    targetId = match.id;
    state.report.entries.push({ kind, sourceId: definition.id, targetId, name: match.name, action: 'reused' });
  } else {
    const finalName = findFreeName(
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
      action: finalName === name ? 'created' : 'renamed'
    });
  }

  state.idMap[kind].set(definition.id, targetId);
  return targetId;
}

/**
 * Insert all package dependencies (counter shapes, card sizes, standees) once and
 * fill `state.idMap`. Shared by every part kind.
 */
export function insertPackageDefinitions(state: InsertState, dependencies: PartDependencies): void {
  for (const kind of DEFINITION_KINDS) {
    for (const definition of getDefinitions(dependencies, kind)) {
      insertDefinition(state, kind, definition);
    }
  }
}

/**
 * Insert all dependencies (counter shapes, card sizes, standees), then the part
 * itself if it is a definition. Works on a deep copy; the inputs stay unchanged.
 * Throws if no free ID can be allocated (see createIdAllocator).
 */
export function insertDefinitions(project: Project, pkg: PartPackage, random?: () => string): InsertResult {
  const state = createInsertState(project, random);
  insertPackageDefinitions(state, pkg.dependencies);
  if (isDefinitionKind(pkg.kind)) {
    insertDefinition(state, pkg.kind, pkg.part as DefinitionTypeMap[typeof pkg.kind]);
  }
  return { project: state.project, idMap: state.idMap, report: state.report };
}

// ---------------------------------------------------------------------------
// Inserting trays
// ---------------------------------------------------------------------------

// Same field names as getGlobalSettings() in the project store
export interface GameContainerSize {
  gameContainerWidth: number;
  gameContainerDepth: number;
}

// 'project': a layer is appended to the project (E-a); only layer packages accept it
export type PartImportTarget =
  { kind: 'box'; boxId: string } | { kind: 'layer'; layerId: string } | { kind: 'project' };

export interface PartImportOptions {
  target?: PartImportTarget; // required for trays, ignored for definitions
  gameContainer: GameContainerSize; // size of the target project, never taken from the package
  lidDefaults?: LidParams; // fills lid fields missing in a box package (store passes defaultLidParams)
  // Exterior size of a box (JSCad stays in the store); without it no size warning is made
  measureBox?: (box: Box, project: Project) => { width: number; depth: number };
  // Total size of a layer's content in the target (JSCad stays in the store); without it no container warning is made
  measureLayer?: (layer: Layer, project: Project, container: GameContainerSize) => { width: number; depth: number };
  // Height rating of a project (summed layer heights vs. container height); called for layer imports
  // with the project that already contains the new layer. Without it no height warning is made.
  checkContainerHeight?: (project: Project) => ContainerHeightCheck;
}

export interface InsertTrayOptions {
  gameContainer: GameContainerSize;
  takenTrayNames: Iterable<string>; // names the new tray must not duplicate (project-wide, decision Q1)
}

export interface RenewedTrayIds {
  tray: Tray;
  droppedStacks: number; // card well stacks removed because their cell does not exist
}

function renewCupIds(node: CupLayoutNode, idFor: (sourceId: string) => string): CupLayoutNode {
  if (node.type === 'cup') return { ...node, id: idFor(node.id) };
  return { ...node, first: renewCupIds(node.first, idFor), second: renewCupIds(node.second, idFor) };
}

/**
 * Give a tray copy new IDs for everything inside it: cup IDs, card well cells and
 * stacks. One new ID per source ID, so duplicate source IDs stay duplicates and
 * links stay right (Q7a). Card well stacks get a new ID (also when they had none)
 * and their cellId is rewritten; stacks whose cell does not exist are dropped (Q7b).
 * The tray ID itself is not touched. The input stays unchanged.
 */
export function renewTrayInnerIds(tray: Tray, allocateId: () => string): RenewedTrayIds {
  const copy = JSON.parse(JSON.stringify(tray)) as Tray;
  const renewed = new Map<string, string>();
  const idFor = (sourceId: string): string => {
    let id = renewed.get(sourceId);
    if (id === undefined) {
      id = allocateId();
      renewed.set(sourceId, id);
    }
    return id;
  };
  let droppedStacks = 0;

  if (copy.type === 'cup') {
    const root = copy.params?.layout?.root;
    if (root) copy.params.layout.root = renewCupIds(root, idFor);
  } else if (copy.type === 'cardWell' && copy.params) {
    const columns = copy.params.layout?.columns;
    if (Array.isArray(columns)) {
      copy.params.layout.columns = columns.map((column) => column.map((cellId) => idFor(cellId)));
    }
    // Cells are renewed first, so every valid stack cellId is already in the map
    const cellIds = new Set(renewed.keys());
    const stacks = Array.isArray(copy.params.stacks) ? copy.params.stacks : [];
    copy.params.stacks = stacks
      .filter((stack) => {
        const keep = cellIds.has(stack.cellId);
        if (!keep) droppedStacks++;
        return keep;
      })
      .map((stack) => ({ ...stack, id: allocateId(), cellId: renewed.get(stack.cellId) as string }));
  }
  return { tray: copy, droppedStacks };
}

/**
 * Reset the automatic box layout like the store's addTray does: manual positions and
 * custom size are dropped so the auto layout takes over (customBoxHeight stays).
 */
export function resetBoxAutoLayout(box: Box): void {
  box.manualLayout = undefined;
  box.customWidth = undefined;
  box.customDepth = undefined;
}

/**
 * Insert a tray from a package into `container` (trays of a box or loose trays of a
 * layer) and return its new ID. Package references are IDs (see validatePartPackage)
 * and are rewritten through `state.idMap`, so the dependencies must be inserted
 * first (insertPackageDefinitions). New IDs for the tray and everything inside,
 * game container size from `options`, name counted up against `takenTrayNames`.
 * Throws if a reference has no target definition. Does not reset the box layout.
 */
export function insertTray(state: InsertState, tray: Tray, container: Tray[], options: InsertTrayOptions): string {
  const referenced = mapTrayReferences(tray, (ref) => {
    if (ref.id === '') return '';
    const targetId = state.idMap[ref.kind].get(ref.id);
    if (targetId === undefined) throw new Error(`Missing ${ref.kind} "${ref.id}" for ${ref.path}.`);
    return targetId;
  });
  const { tray: copy, droppedStacks } = renewTrayInnerIds(referenced, state.allocateId);

  const takenNames = [...options.takenTrayNames];
  const desiredName = resolvePartName('tray', typeof copy.name === 'string' ? copy.name : '');
  const finalName = findFreeName(desiredName, takenNames);
  const targetId = state.allocateId();
  copy.id = targetId;
  copy.name = finalName;
  if (copy.type === 'counter') {
    copy.params.gameContainerWidth = options.gameContainer.gameContainerWidth;
    copy.params.gameContainerDepth = options.gameContainer.gameContainerDepth;
  }

  container.push(copy);
  state.idMap.tray.set(tray.id, targetId);
  state.report.entries.push({
    kind: 'tray',
    sourceId: tray.id,
    targetId,
    name: finalName,
    action: finalName === desiredName ? 'created' : 'renamed'
  });
  if (droppedStacks > 0) {
    const text = droppedStacks === 1 ? 'card well stack without a cell was' : 'card well stacks without a cell were';
    state.report.warnings.push(`"${finalName}": ${droppedStacks} ${text} dropped.`);
  }
  return targetId;
}

interface LayoutDropCounts {
  orphans: number;
  duplicates: number;
}

// Rewrites manualLayout entries to the new IDs; keeps the first entry per source ID, drops
// entries without a target (orphans) and repeated ones (duplicates)
function rewriteLayoutEntries<T extends object>(
  entries: T[] | undefined,
  idKey: keyof T,
  idMap: Map<string, string>
): { kept: T[]; orphans: number; duplicates: number } {
  const seen = new Set<string>();
  const kept: T[] = [];
  let orphans = 0;
  let duplicates = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    const sourceId = entry[idKey] as string;
    const newId = idMap.get(sourceId);
    if (newId === undefined) orphans++;
    else if (seen.has(sourceId)) duplicates++;
    else {
      seen.add(sourceId);
      kept.push({ ...entry, [idKey]: newId });
    }
  }
  return { kept, orphans, duplicates };
}

// Texts as in the plan (h3): "<n> manual layout entr(y/ies) without a matching ... / duplicate ... dropped."
function pushDroppedLayoutWarnings(
  state: InsertState,
  partName: string,
  counts: LayoutDropCounts,
  nounAfter: string
): void {
  const push = (count: number, before: string, after: string): void => {
    if (count > 0) {
      const noun = count === 1 ? 'manual layout entry' : 'manual layout entries';
      state.report.warnings.push(`"${partName}": ${count} ${before}${noun}${after} dropped.`);
    }
  };
  push(counts.orphans, '', nounAfter);
  push(counts.duplicates, 'duplicate ', '');
}

export interface InsertBoxOptions extends PartImportOptions {
  takenBoxNames: Iterable<string>; // names the new box must not duplicate (project-wide, decision E-e)
}

/**
 * Insert a box from a package into `layer.boxes` and return its new ID. Dependencies
 * must be inserted first. Every tray goes through insertTray (names counted up per
 * tray, S1); manualLayout entries are rewritten to the new tray IDs of this box, entries
 * without a matching tray or with a repeated tray are dropped with a warning (E-g).
 * Layout and custom size stay as exported (S2, E-h); the layer layout is not reset (E-o).
 * Throws if a reference has no target definition.
 */
export function insertBox(state: InsertState, box: Box, layer: Layer, options: InsertBoxOptions): string {
  const copy = JSON.parse(JSON.stringify(box)) as Box;
  const trays: Tray[] = [];
  const sourceToTarget = new Map<string, string>();
  const insertedNames: string[] = [];
  for (const source of Array.isArray(box.trays) ? box.trays : []) {
    insertTray(state, source, trays, {
      gameContainer: options.gameContainer,
      takenTrayNames: [...collectTrayNames(state.project), ...insertedNames]
    });
    const inserted = trays[trays.length - 1];
    insertedNames.push(inserted.name);
    if (!sourceToTarget.has(source.id)) sourceToTarget.set(source.id, inserted.id);
  }
  copy.trays = trays;
  // Editors store NaN, which JSON turns into null: counts as "not set" (box.ts stays as it is)
  for (const field of ['customWidth', 'customDepth', 'customBoxHeight'] as const) {
    if (copy[field] === null || Number.isNaN(copy[field])) copy[field] = undefined;
  }

  let counts: LayoutDropCounts = { orphans: 0, duplicates: 0 };
  if (Array.isArray(copy.manualLayout)) {
    const { kept, orphans, duplicates } = rewriteLayoutEntries(copy.manualLayout, 'trayId', sourceToTarget);
    copy.manualLayout = kept;
    counts = { orphans, duplicates };
  }

  const desiredName = resolvePartName('box', typeof copy.name === 'string' ? copy.name : '');
  const finalName = findFreeName(desiredName, options.takenBoxNames);
  const targetId = state.allocateId();
  copy.id = targetId;
  copy.name = finalName;
  copy.lidParams = { ...options.lidDefaults, ...copy.lidParams } as LidParams;

  layer.boxes.push(copy);
  state.idMap.box.set(box.id, targetId);
  state.report.entries.push({
    kind: 'box',
    sourceId: box.id,
    targetId,
    name: finalName,
    action: finalName === desiredName ? 'created' : 'renamed'
  });

  pushDroppedLayoutWarnings(state, finalName, counts, ' without a matching tray');

  const { measureBox, gameContainer: container } = options;
  if (measureBox) {
    const { width, depth } = measureBox(copy, state.project);
    const W = container.gameContainerWidth;
    const D = container.gameContainerDepth;
    // The packer may rotate a box by 90 degrees, so a rotated fit counts as fitting
    const fits = (width <= W && depth <= D) || (depth <= W && width <= D);
    if (!fits) {
      state.report.warnings.push(
        `"${finalName}" (${width.toFixed(1)} × ${depth.toFixed(1)} mm) is larger than the game container (${W} × ${D} mm).`
      );
    }
  }
  return targetId;
}

/**
 * Insert a layer from a package as a new layer at the end of `state.project.layers` and
 * return its new ID. Dependencies must be inserted first. The empty layer is appended
 * first so the boxes and trays inserted afterwards see the names already used (S1); every
 * box goes through insertBox, every loose tray through insertTray. The layer manualLayout
 * is rewritten to the new IDs of this layer, orphan and repeated entries are dropped with
 * a warning, a missing list becomes [] (E-g). Positions are kept; with `measureLayer` a
 * layer larger than the game container only gives a warning (E-d).
 * Throws if a reference has no target definition.
 */
export function insertLayer(state: InsertState, layer: Layer, options: PartImportOptions): string {
  const source = JSON.parse(JSON.stringify(layer)) as Layer;
  const desiredName = resolvePartName('layer', typeof source.name === 'string' ? source.name : '');
  const finalName = findFreeName(
    desiredName,
    state.project.layers.map((l) => l.name)
  );
  const targetId = state.allocateId();
  const copy: Layer = { ...source, id: targetId, name: finalName, boxes: [], looseTrays: [] };
  state.project.layers.push(copy);
  state.idMap.layer.set(layer.id, targetId);
  state.report.entries.push({
    kind: 'layer',
    sourceId: layer.id,
    targetId,
    name: finalName,
    action: finalName === desiredName ? 'created' : 'renamed'
  });

  const boxIds = new Map<string, string>();
  for (const box of Array.isArray(layer.boxes) ? layer.boxes : []) {
    const id = insertBox(state, box, copy, {
      ...options,
      takenBoxNames: collectBoxNames(state.project)
    });
    if (!boxIds.has(box.id)) boxIds.set(box.id, id);
  }
  const trayIds = new Map<string, string>();
  for (const tray of Array.isArray(layer.looseTrays) ? layer.looseTrays : []) {
    const id = insertTray(state, tray, copy.looseTrays, {
      gameContainer: options.gameContainer,
      takenTrayNames: collectTrayNames(state.project)
    });
    if (!trayIds.has(tray.id)) trayIds.set(tray.id, id);
  }

  if (source.manualLayout) {
    const boxes = rewriteLayoutEntries(source.manualLayout.boxes, 'boxId', boxIds);
    const looseTrays = rewriteLayoutEntries(source.manualLayout.looseTrays, 'trayId', trayIds);
    copy.manualLayout = { boxes: boxes.kept, looseTrays: looseTrays.kept };
    pushDroppedLayoutWarnings(
      state,
      finalName,
      {
        orphans: boxes.orphans + looseTrays.orphans,
        duplicates: boxes.duplicates + looseTrays.duplicates
      },
      ' without a matching box or tray'
    );
  }

  const { measureLayer, gameContainer: container } = options;
  if (measureLayer) {
    const { width, depth } = measureLayer(copy, state.project, container);
    const W = container.gameContainerWidth;
    const D = container.gameContainerDepth;
    if (width > W || depth > D) {
      state.report.warnings.push(
        `"${finalName}" needs ${width.toFixed(1)} × ${depth.toFixed(1)} mm, the game container is ${W} × ${D} mm. Positions were kept.`
      );
    }
  }

  // The new layer is already part of state.project, so the check must not add it again
  if (options.checkContainerHeight) {
    const check = options.checkContainerHeight(state.project);
    if (check.status === 'tooTall' || check.status === 'lidLift') {
      state.report.warnings.push(`"${finalName}" was added. ${formatContainerHeightStatus(check, 'full')}`);
    }
  }
  return targetId;
}

export interface PartImportResult extends InsertResult {
  insertedId?: string; // ID of the inserted tray, box or layer
}

const IMPORT_VIA_HINTS = {
  tray: 'Trays are imported via "Add tray" or "Add loose tray" in the navigation.',
  box: 'Boxes are imported via "Add box" in the navigation.',
  layer: 'Layers are imported via "Add layer" in the navigation.'
} as const;

function collectTrayNames(project: Project): string[] {
  const names: string[] = [];
  for (const layer of project.layers ?? []) {
    for (const tray of layer.looseTrays ?? []) names.push(tray.name);
    for (const box of layer.boxes ?? []) {
      for (const tray of box.trays ?? []) names.push(tray.name);
    }
  }
  return names;
}

function collectBoxNames(project: Project): string[] {
  return (project.layers ?? []).flatMap((layer) => (layer.boxes ?? []).map((box) => box.name));
}

/**
 * Import entry point for all part kinds supported so far. Works on a deep copy; the
 * inputs stay unchanged and every error is thrown before a result exists.
 * - definitions: as insertDefinitions (target ignored)
 * - tray: needs `options.target` (box → trays of the box, layout reset; layer →
 *   loose trays, layout untouched like addLooseTray)
 * - box: needs a target; a layer receives the box, a box target means the layer of
 *   that box (E-b). Layout of box and layer stays untouched.
 * - layer: needs the target `{ kind: 'project' }` (any other target is ignored); the layer is
 *   appended as a new layer, boxes and trays go through insertBox / insertTray
 */
export function importPartPackage(
  project: Project,
  pkg: PartPackage,
  options: PartImportOptions,
  random?: () => string
): PartImportResult {
  if (isDefinitionKind(pkg.kind)) return insertDefinitions(project, pkg, random);

  const { target } = options;
  if (!target) {
    throw new Error(IMPORT_VIA_HINTS[pkg.kind]);
  }

  const state = createInsertState(project, random);

  if (pkg.kind === 'layer') {
    insertPackageDefinitions(state, pkg.dependencies);
    const insertedId = insertLayer(state, pkg.part as Layer, options);
    return { project: state.project, idMap: state.idMap, report: state.report, insertedId };
  }
  // Trays and boxes need a box or layer target; 'project' is only for layers
  if (target.kind === 'project') throw new Error(IMPORT_VIA_HINTS[pkg.kind]);

  if (pkg.kind === 'box') {
    let layer: Layer | undefined;
    if (target.kind === 'box') {
      layer = state.project.layers.find((candidate) => (candidate.boxes ?? []).some((b) => b.id === target.boxId));
      if (!layer) throw new Error('The target box no longer exists.');
    } else {
      layer = state.project.layers.find((candidate) => candidate.id === target.layerId);
      if (!layer) throw new Error('The target layer no longer exists.');
    }
    if (!Array.isArray(layer.boxes)) layer.boxes = [];
    insertPackageDefinitions(state, pkg.dependencies);
    const insertedId = insertBox(state, pkg.part as Box, layer, {
      ...options,
      takenBoxNames: state.project.layers.flatMap((l: Layer) => (l.boxes ?? []).map((b) => b.name))
    });
    return { project: state.project, idMap: state.idMap, report: state.report, insertedId };
  }

  let container: Tray[];
  let box: Box | undefined;
  if (target.kind === 'box') {
    box = findBox(state.project, target.boxId);
    if (!box) throw new Error('The target box no longer exists.');
    container = box.trays;
  } else {
    const layer = state.project.layers.find((candidate) => candidate.id === target.layerId);
    if (!layer) throw new Error('The target layer no longer exists.');
    container = layer.looseTrays;
  }

  insertPackageDefinitions(state, pkg.dependencies);
  const insertedId = insertTray(state, pkg.part as Tray, container, {
    gameContainer: options.gameContainer,
    takenTrayNames: collectTrayNames(state.project)
  });
  if (box) resetBoxAutoLayout(box);
  return { project: state.project, idMap: state.idMap, report: state.report, insertedId };
}
