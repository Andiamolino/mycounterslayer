import jscad from '@jscad/modeling';
import { describe, it, expect } from 'vitest';
import { getBoxExteriorDimensions } from '#lib/models/box.js';
import { createBoxWithLidGrooves, createLid } from '#lib/models/lid.js';
import { firstBox, startProject } from '#lib/utils/partTestFixtures.js';

// F3.0.5 acceptance: modelled height (getBoxExteriorDimensions / layer target) = real assembled
// bounding-box height. Assembled = body + lid slid in with its rim (= wall) dipping into the body,
// so lid bottom = body top - wall and lid top = body top - wall + lidHeight (plate + rim).
// Formulas: lid = thickness + wall (plate + rim); overshoot = thickness = getLidHeight.

const { measureBoundingBox } = jscad.measurements;

function zSize(geom: Parameters<typeof measureBoundingBox>[0]) {
  const [min, max] = measureBoundingBox(geom);
  return { min: min[2], max: max[2], size: max[2] - min[2] };
}

function assembledHeight(wall: number, thickness: number, target?: number) {
  const project = startProject();
  const box = firstBox(project);
  box.wallThickness = wall;
  box.lidParams = { ...box.lidParams!, thickness };
  const { cardSizes, counterShapes, standees } = project;
  const body = zSize(createBoxWithLidGrooves(box, cardSizes, counterShapes, target, standees)!);
  const lid = zSize(createLid(box, cardSizes, counterShapes, standees)!);
  const modelled = getBoxExteriorDimensions(box, cardSizes, counterShapes, standees).height;
  const lidTop = body.max - wall + lid.size;
  return { modelled, assembled: lidTop - body.min, lid: lid.size };
}

describe('assembled height = modelled height (real geometry)', () => {
  it.each([
    [3, 2],
    [3, 3],
    [2, 2],
    [2, 3]
  ])('wall %i, thickness %i, no target', (wall, thickness) => {
    const r = assembledHeight(wall, thickness);
    expect(r.lid).toBeCloseTo(wall + thickness, 2);
    expect(r.assembled).toBeCloseTo(r.modelled, 2);
  });

  it.each([
    [3, 2],
    [3, 3],
    [2, 2],
    [2, 3]
  ])('wall %i, thickness %i, target 38.4 (layer height)', (wall, thickness) => {
    const r = assembledHeight(wall, thickness, 38.4);
    expect(r.assembled).toBeCloseTo(38.4, 2);
  });
});
