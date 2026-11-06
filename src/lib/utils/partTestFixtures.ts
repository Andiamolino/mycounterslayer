import defaultProjectJson from '#lib/data/defaultProject.json';
import type { Box, Layer, Project, Tray } from '#lib/types/project.js';
import { validatePartPackage } from '#lib/utils/partPackage.js';

// Shared fixtures for the part unit tests: a fresh deep copy of the real start project

export function startProject(): Project {
  return JSON.parse(JSON.stringify(defaultProjectJson)) as Project;
}

export function allTrays(project: Project): Tray[] {
  return project.layers.flatMap((layer) => [...layer.looseTrays, ...layer.boxes.flatMap((box) => box.trays)]);
}

export function firstBox(project: Project): Box {
  return project.layers.flatMap((layer) => layer.boxes)[0];
}

export function firstLayer(project: Project): Layer {
  return project.layers[0];
}

// Fixed export time so built packages are reproducible
export const PART_TEST_NOW = new Date('2026-11-06T10:00:00.000Z');

// Game container used by the box and layer import tests
export const PART_TEST_CONTAINER = { gameContainerWidth: 150, gameContainerDepth: 200 };

// JSON text round trip, like a file
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests feed foreign-shaped data
export function viaFile(pkg: unknown): any {
  return JSON.parse(JSON.stringify(pkg));
}

// Validation error of a raw package, or null if it is valid
export function errorOf(raw: unknown) {
  const result = validatePartPackage(raw);
  return result.ok ? null : result.error;
}
