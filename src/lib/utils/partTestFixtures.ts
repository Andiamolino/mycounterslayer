import defaultProjectJson from '#lib/data/defaultProject.json';
import type { Box, Project, Tray } from '#lib/types/project.js';

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
