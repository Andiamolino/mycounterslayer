/**
 * Pure helpers for building download file names from user-facing names.
 * No dependencies, shared by all exports (JSON now, STL/3MF/PDF later).
 */

// Characters that are not allowed in file names on Windows, macOS or Linux
const UNSAFE_FILE_NAME_CHARS = /[/\\:*?"<>|]/g;
const UNSAFE_CHAR_REPLACEMENT = '-';

/**
 * Replace every unsafe character with "-" (one by one) and trim.
 * Example: "A/B" → "A-B", "a:*b" → "a--b".
 */
export function toSafeFileName(name: string): string {
  return name.replace(UNSAFE_FILE_NAME_CHARS, UNSAFE_CHAR_REPLACEMENT).trim();
}

/**
 * Trim and remove a trailing extension (case-insensitive), so "x.JSON" with ".json" → "x".
 * @param extension including the leading dot, e.g. ".json"
 */
export function removeFileExtension(name: string, extension: string): string {
  const trimmedName = name.trim();
  if (extension === '' || !trimmedName.toLowerCase().endsWith(extension.toLowerCase())) {
    return trimmedName;
  }
  return trimmedName.slice(0, -extension.length).trim();
}

/**
 * Build a safe download file name, e.g. ("A/B", ".json") → "A-B.json".
 * A trailing extension already present in name is not duplicated.
 * @param extension including the leading dot, e.g. ".json"
 */
export function buildFileName(name: string, extension: string): string {
  return toSafeFileName(removeFileExtension(name, extension)) + extension;
}
