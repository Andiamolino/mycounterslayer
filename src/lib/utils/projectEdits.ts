/**
 * Pure edit helpers on a project object (no autosave, no reactivity): the store wraps them.
 * Shared by the slotted-holder definitions (standee, tile) so no list or tray type gets its own copy.
 */
import type { Project, Standee, Tile, Tray } from '#lib/types/project.js';
import { isStandeeTray, isTileTray } from '#lib/types/project.js';

export type HolderDefinitionKind = 'standee' | 'tile';

// Per definition kind: its project list and how a tray of that kind points at it.
const HOLDER_DEFINITIONS = {
  standee: {
    list: (project: Project): { id: string }[] => project.standees,
    repoint: (tray: Tray, id: string, fallbackId: string) => {
      if (isStandeeTray(tray) && tray.params.standeeId === id) tray.params.standeeId = fallbackId;
    }
  },
  tile: {
    list: (project: Project): { id: string }[] => project.tiles,
    repoint: (tray: Tray, id: string, fallbackId: string) => {
      if (isTileTray(tray) && tray.params.tileId === id) tray.params.tileId = fallbackId;
    }
  }
} satisfies Record<HolderDefinitionKind, unknown>;

export function allTraysOf(project: Pick<Project, 'layers'>): Tray[] {
  return project.layers.flatMap((layer) => [...layer.boxes.flatMap((box) => box.trays), ...layer.looseTrays]);
}

/**
 * Removes a definition and re-points the trays of the same kind that referenced it to the first
 * remaining definition of the same list ('' if the list is empty), so geometry keeps generating.
 * Returns false if the ID does not exist.
 */
export function deleteDefinition(project: Project, kind: HolderDefinitionKind, id: string): boolean {
  const { list, repoint } = HOLDER_DEFINITIONS[kind];
  const definitions = list(project);
  const index = definitions.findIndex((d) => d.id === id);
  if (index < 0) return false;
  definitions.splice(index, 1);
  const fallbackId = definitions[0]?.id ?? '';
  for (const tray of allTraysOf(project)) repoint(tray, id, fallbackId);
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
