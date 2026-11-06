/**
 * Pure helpers for building download file names from user-facing names.
 * No dependencies, shared by all exports (JSON now, STL/3MF/PDF later).
 */

// Characters that are not allowed in file names on Windows, macOS or Linux
const UNSAFE_FILE_NAME_CHARS = /[/\\:*?"<>|]/g;
const UNSAFE_CHAR_REPLACEMENT = '-';

export const JSON_FILE_EXTENSION = '.json';
export const ZIP_FILE_EXTENSION = '.zip';
export const THREEMF_FILE_EXTENSION = '.3mf';
export const PDF_FILE_EXTENSION = '.pdf';

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

// Used when nothing is left of the name, so the file never starts with a bare dot
const FALLBACK_FILE_BASE_NAME = 'untitled';

/**
 * Build a safe download file name, e.g. ("A/B", ".json") → "A-B.json".
 * Without suffix, a trailing extension already present in name is not duplicated.
 * With suffix, the name is kept as it is ("Notes.pdf", ".pdf", "-reference" → "Notes.pdf-reference.pdf"),
 * and the suffix is appended after sanitizing: ("A/B", ".zip", "-stls") → "A-B-stls.zip".
 * @param extension including the leading dot, e.g. ".json"
 */
export function buildFileName(name: string, extension: string, suffix = ''): string {
  const baseName = suffix === '' ? removeFileExtension(name, extension) : name;
  const safeBaseName = toSafeFileName(baseName) || FALLBACK_FILE_BASE_NAME;
  return safeBaseName + suffix + extension;
}
