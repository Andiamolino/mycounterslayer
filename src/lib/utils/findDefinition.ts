/**
 * Looks up a definition (standee, tile, ...) by ID with the shared fallback chain:
 * ID -> (optional) name -> first entry -> given fallback. Falling back warns on the console.
 */
export function findDefinition<T extends { id: string; name: string }>(
  list: T[],
  id: string,
  options: {
    label: string; // singular, capitalised, used in the warnings (e.g. "Standee")
    nameFallback: boolean; // also match the name against the given id (old files referenced by name)
    fallback: T; // used when the list is empty
  }
): T {
  const { label, nameFallback, fallback } = options;
  const byId = list.find((d) => d.id === id);
  if (byId) return byId;

  if (nameFallback) {
    const byName = list.find((d) => d.name === id);
    if (byName) {
      console.warn(`${label} ID "${id}" not found, matched by name instead`);
      return byName;
    }
  }

  if (list.length > 0) {
    console.warn(
      `${label} "${id}" not found by ID${nameFallback ? ' or name' : ''}, using first available ${label.toLowerCase()}`
    );
    return list[0];
  }

  return fallback;
}
