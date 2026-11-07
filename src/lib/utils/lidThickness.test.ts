import { describe, it, expect } from 'vitest';
import { MIN_LID_THICKNESS_INPUT, parseLidThicknessInput } from './lidThickness.js';
import type { Box, Project } from '#lib/types/project.js';
import { defaultLidParams } from '#lib/models/lid.js';
import { getBoxExteriorDimensions, getLidHeight, getRequiredTrayHeightForBox } from '#lib/models/box.js';
import { calculateLayerHeight, getHeightDefs } from '#lib/models/layer.js';
import { importPartPackage } from '#lib/utils/partImport.js';
import { buildPartPackage, validatePartPackage } from '#lib/utils/partPackage.js';
import { importProjectFromJson, migrateProjectData } from '#lib/utils/storage.js';
import {
  PART_TEST_CONTAINER,
  PART_TEST_NOW,
  firstBox,
  startProject,
  viaFile
} from '#lib/utils/partTestFixtures.js';

// Field value as the panel handler applies it: input text -> parse -> lidParams (spread like the handler)
function applyFieldValue(box: Box, raw: string): void {
  const thickness = parseLidThicknessInput(raw, defaultLidParams.thickness);
  box.lidParams = { ...box.lidParams, thickness };
}

function exteriorHeight(project: Project, box: Box): number {
  return getBoxExteriorDimensions(box, project.cardSizes, project.counterShapes, project.standees).height;
}

describe('parseLidThicknessInput', () => {
  it('returns valid values unchanged', () => {
    expect(parseLidThicknessInput('3', 2)).toBe(3);
    expect(parseLidThicknessInput('2.5', 2)).toBe(2.5);
  });

  it('uses the fallback for empty or invalid text', () => {
    expect(parseLidThicknessInput('', 2)).toBe(2);
    expect(parseLidThicknessInput('abc', 2)).toBe(2);
  });

  it('clamps values below the minimum', () => {
    expect(parseLidThicknessInput('0.5', 2)).toBe(MIN_LID_THICKNESS_INPUT);
    expect(parseLidThicknessInput('-3', 2)).toBe(MIN_LID_THICKNESS_INPUT);
    expect(MIN_LID_THICKNESS_INPUT).toBe(1.5);
  });
});

describe('field value -> lid height -> outer height', () => {
  it('thickness 2 -> 3 raises the box exterior height and getLidHeight by exactly 1 mm', () => {
    const project = startProject();
    const box = firstBox(project);
    applyFieldValue(box, '2');
    const lid2 = getLidHeight(box);
    const height2 = exteriorHeight(project, box);
    applyFieldValue(box, '3');
    expect(box.lidParams?.thickness).toBe(3);
    expect(getLidHeight(box)).toBe(3);
    expect(getLidHeight(box) - lid2).toBe(1);
    expect(exteriorHeight(project, box) - height2).toBeCloseTo(1, 10);
  });

  it('raises the layer height by 1 mm when the box is the tallest element', () => {
    const project = startProject();
    const box = firstBox(project);
    const layer = { ...project.layers[0], boxes: [box], looseTrays: [] };
    applyFieldValue(box, '2');
    const before = calculateLayerHeight(layer, getHeightDefs(project));
    applyFieldValue(box, '3');
    const after = calculateLayerHeight(layer, getHeightDefs(project));
    expect(before).toBeGreaterThan(0);
    expect(after - before).toBeCloseTo(1, 10);
  });

  it('a box raised to a taller layer keeps its outer height; body and trays get lower', () => {
    const project = startProject();
    const box = firstBox(project);
    const layer = project.layers.find((l) => l.boxes.some((b) => b.id === box.id))!;
    const layerHeight = () => calculateLayerHeight(layer, getHeightDefs(project));
    applyFieldValue(box, '2');
    // Start project: the layer height 27 comes from another element, the box (min 24.4) is raised to it
    expect(layerHeight()).toBe(27);
    expect(exteriorHeight(project, box)).toBeLessThan(27);
    const body2 = 27 - getLidHeight(box);
    expect(getRequiredTrayHeightForBox(box, 27)).toBe(23);
    applyFieldValue(box, '3');
    // The minimum total height grows but still fits below the layer: layer and outer height stay 27
    expect(exteriorHeight(project, box)).toBeCloseTo(25.4, 10);
    expect(layerHeight()).toBe(27);
    expect(body2 - (27 - getLidHeight(box))).toBe(1);
    expect(getRequiredTrayHeightForBox(box, 27)).toBe(22);
  });

  it('a value below 1.5 acts as 1.5 (outer height = body + 1.5)', () => {
    const project = startProject();
    const box = firstBox(project);
    applyFieldValue(box, '1.5');
    const height15 = exteriorHeight(project, box);
    applyFieldValue(box, '1');
    expect(box.lidParams?.thickness).toBe(1.5);
    expect(exteriorHeight(project, box)).toBe(height15);
  });

  it('keeps the other lid params when only the thickness changes', () => {
    const box = firstBox(startProject());
    const before = { ...box.lidParams! };
    applyFieldValue(box, '3');
    expect(box.lidParams).toEqual({ ...before, thickness: 3 });
  });

  it('empty field text falls back to the default thickness', () => {
    const box = firstBox(startProject());
    applyFieldValue(box, '');
    expect(box.lidParams?.thickness).toBe(defaultLidParams.thickness);
  });
});

describe('thickness 3 survives storage and F1 box export / import', () => {
  function projectWithThickness(thickness: number): Project {
    const project = startProject();
    const box = firstBox(project);
    box.lidParams = { ...box.lidParams!, thickness };
    return project;
  }

  it('migrateProjectData keeps thickness 3 and fills missing lid fields from the defaults', () => {
    const project = projectWithThickness(3);
    const kept = migrateProjectData(viaFile(project));
    expect(firstBox(kept).lidParams?.thickness).toBe(3);

    const partial = viaFile(project);
    partial.layers[0].boxes[0].lidParams = { thickness: 3 };
    const migrated = firstBox(migrateProjectData(partial));
    expect(migrated.lidParams).toEqual({ ...defaultLidParams, thickness: 3 });
  });

  it('a box without lidParams gets the default thickness', () => {
    const raw = viaFile(startProject());
    delete raw.layers[0].boxes[0].lidParams;
    expect(firstBox(migrateProjectData(raw)).lidParams?.thickness).toBe(defaultLidParams.thickness);
  });

  it('importProjectFromJson (JSON text) keeps thickness 3', () => {
    const project = projectWithThickness(3);
    expect(firstBox(importProjectFromJson(JSON.stringify(project))).lidParams?.thickness).toBe(3);
  });

  it('box package export contains thickness 3 and import into a project restores it', () => {
    const project = projectWithThickness(3);
    const built = buildPartPackage(project, { kind: 'box', id: firstBox(project).id }, PART_TEST_NOW);
    if (!built.ok) throw new Error(built.error.message);
    expect((built.package.part as Box).lidParams?.thickness).toBe(3);

    const validated = validatePartPackage(viaFile(built.package));
    if (!validated.ok) throw new Error(validated.error.message);
    // Target project has other lid defaults: the package value must win
    let n = 0;
    const result = importPartPackage(
      startProject(),
      validated.package,
      {
        target: { kind: 'layer', layerId: startProject().layers[0].id },
        gameContainer: PART_TEST_CONTAINER,
        lidDefaults: { ...defaultLidParams }
      },
      () => `n${++n}`
    );
    const imported = result.project.layers.flatMap((l) => l.boxes).find((b) => b.id === result.insertedId);
    expect(imported?.lidParams?.thickness).toBe(3);
    expect(getLidHeight(imported!)).toBe(3);
  });
});
