/**
 * Pure logic for references from trays to global definitions (counter shapes,
 * card sizes, standees): visiting, resolving and dead-reference detection.
 * Inputs are never mutated. Models and types are imported as types only.
 */

import type { Tray } from '#lib/types/project.js';
// Circular with partPackage: only function calls at runtime, no top-level use of the imports
import { getDefinitions, isPlainObject, type DefinitionKind, type PartDependencies } from '#lib/utils/partPackage.js';

export interface DefinitionReference {
  kind: DefinitionKind;
  id: string;
  path: string; // e.g. "params.topLoadedStacks[1][0]"
}

// 'cell' = card well stack without a cell; 'layoutEntry' = box manual layout entry that is dropped on import
// (orphan/duplicate); 'layoutForm' = manual layout entry with a wrong form and 'trayId' = tray ID used twice
// in a box and 'boxId' = box ID used twice in a layer: all three make the import fail
export interface DeadReference {
  kind: DefinitionKind | 'cell' | 'layoutEntry' | 'layoutForm' | 'trayId' | 'boxId';
  id: string;
  path: string;
}

/**
 * Visit every definition reference of a tray and return a copy in which each
 * reference ID is replaced by `fn(ref)`. The original stays unchanged.
 * Cup trays have no references. Missing arrays are tolerated.
 * The copy is a JSON round trip (works on reactive proxies, like the file content).
 */
export function mapTrayReferences(tray: Tray, fn: (ref: DefinitionReference) => string): Tray {
  const copy = JSON.parse(JSON.stringify(tray)) as Tray;
  // Foreign data may be malformed: skip anything that is not the expected shape instead of throwing
  const params: unknown = copy.params;
  if (!isPlainObject(params)) return copy;
  switch (copy.type) {
    case 'counter':
      for (const key of ['topLoadedStacks', 'edgeLoadedStacks'] as const) {
        const stacks: unknown = copy.params[key];
        if (!Array.isArray(stacks)) continue;
        stacks.forEach((stack: unknown, i) => {
          if (!Array.isArray(stack)) return;
          stack[0] = fn({ kind: 'counterShape', id: stack[0], path: `params.${key}[${i}][0]` });
        });
      }
      break;
    case 'cardDraw':
      copy.params.cardSizeId = fn({ kind: 'cardSize', id: copy.params.cardSizeId, path: 'params.cardSizeId' });
      break;
    case 'cardDivider':
    case 'cardWell': {
      const stacks: unknown = copy.params.stacks;
      if (!Array.isArray(stacks)) break;
      stacks.forEach((stack: unknown, i) => {
        if (!isPlainObject(stack)) return;
        stack.cardSizeId = fn({
          kind: 'cardSize',
          id: stack.cardSizeId as string,
          path: `params.stacks[${i}].cardSizeId`
        });
      });
      break;
    }
    case 'standee':
      copy.params.standeeId = fn({ kind: 'standee', id: copy.params.standeeId, path: 'params.standeeId' });
      break;
    case 'cup':
      break;
  }
  return copy;
}

/**
 * List all references from a tray to global definitions, with their path in the tray.
 * Cup trays have no references.
 */
export function collectReferences(tray: Tray): DefinitionReference[] {
  const refs: DefinitionReference[] = [];
  mapTrayReferences(tray, (ref) => {
    refs.push(ref);
    return ref.id;
  });
  return refs;
}

/**
 * Resolve a reference to a definition ID: '' stays '' (empty reference is fine),
 * an ID match wins, otherwise an exact name match (case-sensitive, like the
 * generators) gives that definition's ID. Returns null for a dead reference.
 * `allowName` = false for trays that only resolve by ID.
 */
export function resolveDefinitionId(
  definitions: PartDependencies,
  kind: DefinitionKind,
  ref: string,
  allowName = true
): string | null {
  if (ref === '') return '';
  const list = getDefinitions(definitions, kind);
  const byId = list.find((definition) => definition.id === ref);
  if (byId) return byId.id;
  if (!allowName) return null;
  return list.find((definition) => definition.name === ref)?.id ?? null;
}

// Tray types whose generators also fall back to the definition name (cardDivider/cardWell: ID only)
const NAME_FALLBACK_TRAY_TYPES: ReadonlySet<Tray['type']> = new Set(['counter', 'cardDraw', 'standee']);

/**
 * True if references of this tray type may also be resolved by definition name
 * (the `allowName` argument of resolveDefinitionId).
 */
export function allowsNameFallback(trayType: Tray['type']): boolean {
  return NAME_FALLBACK_TRAY_TYPES.has(trayType);
}

/**
 * Find references that point to nothing: definitions missing in `definitions`
 * (empty references are not dead; name fallback only where the generator has it),
 * and card well stacks whose cellId is not a cell in the layout (kind 'cell').
 */
export function findDeadReferences(tray: Tray, definitions: PartDependencies): DeadReference[] {
  const allowName = allowsNameFallback(tray.type);
  const dead: DeadReference[] = collectReferences(tray).filter(
    (ref) => resolveDefinitionId(definitions, ref.kind, ref.id, allowName) === null
  );

  if (tray.type === 'cardWell' && isPlainObject(tray.params)) {
    const columns: unknown = tray.params.layout?.columns;
    const cellIds = new Set(Array.isArray(columns) ? columns.flat() : []);
    const stacks: unknown = tray.params.stacks;
    if (Array.isArray(stacks)) {
      stacks.forEach((stack: unknown, i) => {
        if (isPlainObject(stack) && !cellIds.has(stack.cellId)) {
          dead.push({ kind: 'cell', id: stack.cellId as string, path: `params.stacks[${i}].cellId` });
        }
      });
    }
  }
  return dead;
}
