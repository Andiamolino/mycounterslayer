/**
 * Pure edit helpers on a project object (no autosave, no reactivity): the store wraps them.
 * Shared by the slotted-holder definitions (standee, tile) so no list or tray type gets its own copy.
 */
import type { Project, Standee, Tile, Tray } from '#lib/types/project.js';
import { DEFINITION_COLLECTION_KEYS, type DefinitionKind } from '#lib/utils/partPackage.js';
import { collectReferences, mapTrayReferences } from '#lib/utils/partReferences.js';

export function allTraysOf(project: Pick<Project, 'layers'>): Tray[] {
  return project.layers.flatMap((layer) => [...layer.boxes.flatMap((box) => box.trays), ...layer.looseTrays]);
}

/**
 * Removes a definition and re-points the trays that referenced it to the first remaining definition
 * of the same list ('' if the list is empty), so geometry keeps generating. Only the affected trays
 * are touched. Returns false if the ID does not exist.
 */
export function deleteDefinition(project: Project, kind: DefinitionKind, id: string): boolean {
  const definitions: { id: string }[] = project[DEFINITION_COLLECTION_KEYS[kind]];
  const index = definitions.findIndex((d) => d.id === id);
  if (index < 0) return false;
  definitions.splice(index, 1);
  const fallbackId = definitions[0]?.id ?? '';
  for (const tray of allTraysOf(project)) {
    if (!collectReferences(tray).some((ref) => ref.kind === kind && ref.id === id)) continue;
    tray.params = mapTrayReferences(tray, (ref) => (ref.kind === kind && ref.id === id ? fallbackId : ref.id)).params;
  }
  return true;
}

/**
 * Applies updates to a holder definition (standee or tile). Optional holder fields: undefined or
 * invalid = remove the key (= default), valid values are normalized. Returns false if the ID does not exist.
 */
export function updateHolderDefinition<T extends Standee | Tile>(
  definitions: T[],
  id: string,
  updates: Partial<Omit<T, 'id'>>,
  fields: readonly (readonly [keyof T & string, (value: unknown) => unknown])[]
): boolean {
  const definition = definitions.find((d) => d.id === id);
  if (!definition) return false;
  Object.assign(definition, updates);
  for (const [key, normalize] of fields) {
    if (!(key in updates)) continue;
    const value = normalize(definition[key]);
    if (value === undefined) delete definition[key];
    else Object.assign(definition, { [key]: value });
  }
  return true;
}

/** Replaces the params of the tray with this ID if it passes the type guard. Returns false otherwise. */
export function updateTrayParamsWhere<T extends Tray>(
  project: Pick<Project, 'layers'>,
  trayId: string,
  guard: (tray: Tray) => tray is T,
  params: T['params']
): boolean {
  const tray = allTraysOf(project).find((t) => t.id === trayId);
  if (!tray || !guard(tray)) return false;
  tray.params = params;
  return true;
}
