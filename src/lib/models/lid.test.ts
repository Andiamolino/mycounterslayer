import jscad from '@jscad/modeling';
import { describe, it, expect } from 'vitest';
import { createCounterTray } from '#lib/models/counterTray.js';
import {
  calculateMinimumBoxDimensions,
  getBoxExteriorDimensions,
  getLidHeight,
  resolveTrayHeightInBox
} from '#lib/models/box.js';
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

// F3.0.6 acceptance (measurement B): customBoxHeight > minHeight, layer raised by a taller loose item.
// Tray top (floor + tray height + spacer) must not exceed the real box interior, and
// body + getLidHeight must equal the layer height (modelled = real bounding box, tolerance 0.01).
// Before (spacer = custom - min): tray top stuck out by 5 mm; body grew by 2 * wall - wall (31.4 instead of 27.4,
// fixed by F3.0.5).
describe('tray in layer-adjusted box with custom height (F3.0.6)', () => {
  it.each([
    ['taller loose item (layer 40)', 40, 5],
    ['no loose item (layer = box)', undefined, 5]
  ])('%s', (_label, looseLayerHeight, extra) => {
    const project = startProject();
    const box = firstBox(project);
    const { cardSizes, counterShapes, standees } = project;
    const { minHeight } = calculateMinimumBoxDimensions(box, cardSizes, counterShapes, standees);
    box.customBoxHeight = minHeight + extra;
    const boxExt = getBoxExteriorDimensions(box, cardSizes, counterShapes, standees).height;
    const layerHeight = Math.max(boxExt, looseLayerHeight ?? 0);

    const body = zSize(createBoxWithLidGrooves(box, cardSizes, counterShapes, layerHeight, standees)!);
    const interior = body.max - box.floorThickness;
    expect(body.max + getLidHeight(box)).toBeCloseTo(layerHeight, 2);
    if (!looseLayerHeight) expect(body.max).toBeCloseTo(minHeight + extra, 2);

    const { targetHeight, spacer } = resolveTrayHeightInBox(box, layerHeight, cardSizes, counterShapes, standees);
    const tray = box.trays[0] as unknown as { params: Parameters<typeof createCounterTray>[0]; name: string };
    const trayTop = zSize(createCounterTray(tray.params, counterShapes, tray.name, targetHeight, spacer, false)).max;
    expect(trayTop).toBeLessThanOrEqual(interior + 0.01);
    expect(trayTop).toBeCloseTo(interior, 2);
  });
});
