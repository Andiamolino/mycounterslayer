import { describe, it, expect } from 'vitest';
import { getTileTrayDimensions, defaultTileTrayParams } from '#lib/models/tileTray.js';
import type { TileTray } from '#lib/types/project.js';
import {
  getBoxExteriorDimensions,
  getLidHeight,
  getNaturalMaxTrayHeight,
  MIN_LID_PLATE_THICKNESS,
  getRequiredTrayHeightForBox,
  resolveTrayHeightInBox,
  calculateMinimumBoxDimensions,
  getTrayDimensionsForTray
} from '#lib/models/box.js';
import { calculateLayerHeight, getHeightDefs } from '#lib/models/layer.js';
import { firstBox, firstLayer, firstStandeeTray, startProject } from '#lib/utils/partTestFixtures.js';

// Characterization tests: the expected numbers are the CURRENT behaviour of the code, not a spec.
// They exist so that later height changes (F3.0.x) show up as visible test diffs.
// F3.0.5 (E2, changed on purpose): lid overshoot = lidParams.thickness (was 2 * wall).
// Changed expectations (old -> new): start box getLidHeight 6 -> 2; start box exterior height 28.4 -> 24.4;
// customBoxHeight 40 -> exterior 46 -> 42; "lid height follows wall (wall 2 -> 4)" replaced by the thickness test.

function exterior(box: ReturnType<typeof firstBox>, project = startProject()) {
  return getBoxExteriorDimensions(box, project.cardSizes, project.counterShapes, project.standees, project.tiles);
}

describe('getBoxExteriorDimensions (characterization)', () => {
  it('returns all zeros for an empty box', () => {
    const box = firstBox(startProject());
    box.trays = [];
    expect(exterior(box)).toEqual({ width: 0, depth: 0, height: 0 });
  });

  it('start box (wall 3, thickness 2): height = minHeight + thickness', () => {
    const project = startProject();
    const box = firstBox(project);
    const { minHeight } = calculateMinimumBoxDimensions(box, project.cardSizes, project.counterShapes, project.standees, project.tiles);
    expect(box.wallThickness).toBe(3);
    expect(getLidHeight(box)).toBe(2);
    expect(exterior(box, project).height).toBeCloseTo(minHeight + 2, 6);
    // Concrete value of the start project
    expect(exterior(box, project).height).toBeCloseTo(24.4, 6);
  });

  it('customBoxHeight replaces minHeight, the lid height is still added', () => {
    const box = firstBox(startProject());
    box.customBoxHeight = 40;
    expect(exterior(box).height).toBe(42);
  });

  it('customWidth and customDepth override the minimum footprint', () => {
    const box = firstBox(startProject());
    box.customWidth = 160;
    box.customDepth = 120;
    const dims = exterior(box);
    expect(dims.width).toBe(160);
    expect(dims.depth).toBe(120);
  });

  it.each([
    [2, 2],
    [2, 3],
    [3, 2],
    [3, 3]
  ])('wall %i, thickness %i: getLidHeight = thickness (independent of wall)', (wall, thickness) => {
    const box = firstBox(startProject());
    box.wallThickness = wall;
    box.lidParams = { ...box.lidParams!, thickness };
    expect(getLidHeight(box)).toBe(thickness);
  });

  it.each([0, -1, NaN, undefined, '3' as unknown as number])('getLidHeight invalid thickness %s -> default 2', (t) => {
    const box = firstBox(startProject());
    box.lidParams = { ...box.lidParams!, thickness: t as number };
    expect(getLidHeight(box)).toBe(2);
  });

  it('getLidHeight clamps thin plates to MIN_LID_PLATE_THICKNESS', () => {
    const box = firstBox(startProject());
    box.lidParams = { ...box.lidParams!, thickness: 0.1 };
    expect(getLidHeight(box)).toBe(MIN_LID_PLATE_THICKNESS);
    expect(MIN_LID_PLATE_THICKNESS).toBe(0.4);
  });

  it('getLidHeight falls back to 2 without lidParams', () => {
    const box = firstBox(startProject());
    (box as { lidParams?: unknown }).lidParams = undefined;
    expect(getLidHeight(box)).toBe(2);
  });
});

describe('getRequiredTrayHeightForBox', () => {
  it('= layer height - lid overshoot - floor, never negative', () => {
    const box = firstBox(startProject());
    box.lidParams = { ...box.lidParams!, thickness: 3 };
    box.floorThickness = 2;
    expect(getRequiredTrayHeightForBox(box, 30)).toBe(25);
    expect(getRequiredTrayHeightForBox(box, 1)).toBe(0);
  });
});

// F3.0.6 (E3 option B): spacer = 0 as soon as the box is layer-adjusted.
// Changed expectations (old -> new), layer-adjusted + customBoxHeight > minHeight: spacer (custom - min) -> 0,
// tray top stuck out of the box interior by the spacer -> tray top = interior height (see lid.test.ts).
// Unchanged: without layer adjustment the spacer still fills custom - min.
describe('resolveTrayHeightInBox with a one-sided standee tray', () => {
  it('natural tray height follows the standing height; a layer target lifts it', () => {
    const project = startProject();
    project.standees.forEach((s) => (s.arrangement = 'oneSided'));
    const box = { ...firstBox(project), trays: [firstStandeeTray(project)] };
    const args = [project.cardSizes, project.counterShapes, project.standees, project.tiles] as const;
    const natural = getNaturalMaxTrayHeight(box, ...args);
    expect(natural).toBeGreaterThan(25.5); // alternating start standee: 25.5
    const r = resolveTrayHeightInBox(box, natural + 8, ...args);
    expect(r.targetHeight).toBeDefined();
    expect(r.targetHeight!).toBeGreaterThan(0);
    expect(r.trayHeight).toBeGreaterThanOrEqual(natural);
    expect(r.spacer).toBe(0);
  });
});

describe('resolveTrayHeightInBox', () => {
  const naturalArgs = () => {
    const project = startProject();
    return [project.cardSizes, project.counterShapes, project.standees, project.tiles] as const;
  };
  function setup(custom: boolean) {
    const project = startProject();
    const box = firstBox(project);
    const { minHeight } = calculateMinimumBoxDimensions(box, project.cardSizes, project.counterShapes, project.standees, project.tiles);
    if (custom) box.customBoxHeight = minHeight + 5;
    const resolve = (layerHeight?: number) =>
      resolveTrayHeightInBox(box, layerHeight, project.cardSizes, project.counterShapes, project.standees, project.tiles);
    return { box, resolve };
  }

  it('no custom, no layer adjustment: no target, spacer 0', () => {
    const { box } = setup(false);
    const natural = getNaturalMaxTrayHeight(box, ...naturalArgs());
    expect(setup(false).resolve(undefined)).toEqual({ targetHeight: undefined, trayHeight: natural, spacer: 0 });
    expect(setup(false).resolve(0)).toEqual({ targetHeight: undefined, trayHeight: natural, spacer: 0 });
  });

  it('custom, no layer adjustment: spacer = custom - min (unchanged)', () => {
    const { resolve } = setup(true);
    const r = resolve(undefined);
    expect(r.targetHeight).toBeUndefined();
    expect(r.spacer).toBeCloseTo(5, 6);
  });

  it('no custom, layer adjustment: target from layer height, spacer 0', () => {
    const { box, resolve } = setup(false);
    const target = getRequiredTrayHeightForBox(box, 40);
    expect(resolve(40)).toEqual({ targetHeight: target, trayHeight: Math.max(target, getNaturalMaxTrayHeight(box, ...naturalArgs())), spacer: 0 });
  });

  it('layer adjustment below natural height: trayHeight = natural max', () => {
    const { box, resolve } = setup(false);
    const natural = getNaturalMaxTrayHeight(box, ...naturalArgs());
    const r = resolve(1);
    expect(r.targetHeight).toBe(0);
    expect(r.trayHeight).toBe(natural);
  });

  it('custom, layer adjustment: target from layer height, spacer 0 (was custom - min)', () => {
    const { box, resolve } = setup(true);
    expect(resolve(40).targetHeight).toBe(getRequiredTrayHeightForBox(box, 40));
    expect(resolve(40).spacer).toBe(0);
  });
});

// F3.0.14: tray height shown in the layer editor subtracts floor and lid
describe('resolveTrayHeightInBox: layer content dimensions (F3.0.14)', () => {
  it('start project: layer height 27 -> tray height 23 (floor 2, lid 2)', () => {
    const project = startProject();
    const box = firstBox(project);
    const options = getHeightDefs(project);
    const layerHeight = calculateLayerHeight(firstLayer(project), options);
    expect(layerHeight).toBe(27);
    const { trayHeight } = resolveTrayHeightInBox(
      box,
      layerHeight,
      options.cardSizes,
      options.counterShapes,
      options.standees,
      options.tiles
    );
    expect(box.floorThickness).toBe(2);
    expect(trayHeight).toBe(23);
  });
});

describe('tile tray in a box', () => {
  function tileTray(project: ReturnType<typeof startProject>): TileTray {
    return { id: 'tt', type: 'tile', name: 'Tiles', color: '#fff', params: { ...defaultTileTrayParams, tileId: project.tiles[0].id } };
  }

  it('tray dimensions come from getTileTrayDimensions with the project tiles', () => {
    const project = startProject();
    const tray = tileTray(project);
    const dims = getTrayDimensionsForTray(tray, project.cardSizes, project.counterShapes, project.standees, project.tiles);
    expect(dims).toMatchObject(getTileTrayDimensions(tray.params, project.tiles));
  });

  it('a wider tile makes the tray larger (tiles list is used, not a fallback)', () => {
    const project = startProject();
    const tray = tileTray(project);
    const small = getTrayDimensionsForTray(tray, [], [], [], project.tiles);
    const wide = getTrayDimensionsForTray(tray, [], [], [], [{ ...project.tiles[0], width: project.tiles[0].width + 30 }]);
    expect(wide.width).toBeGreaterThan(small.width);
  });

  it('the natural box tray height follows the tile tray', () => {
    const project = startProject();
    const tray = tileTray(project);
    const box = { ...firstBox(project), trays: [tray] };
    const natural = getNaturalMaxTrayHeight(box, project.cardSizes, project.counterShapes, project.standees, project.tiles);
    expect(natural).toBeCloseTo(getTileTrayDimensions(tray.params, project.tiles).height, 6);
  });
});
