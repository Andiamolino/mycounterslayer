/**
 * Part package format for the part library (export/import of single parts).
 * Pure types and helpers, no store or UI imports. Models and types are imported
 * as types only, so unit tests do not pull in JSCad.
 */

import type { Box, CardSize, CounterShape, Layer, Standee, Tray } from '#lib/types/project.js';

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
