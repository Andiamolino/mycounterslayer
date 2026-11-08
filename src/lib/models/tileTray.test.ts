import {
  createTileTray,
  DEFAULT_TILE_GEOMETRY,
  defaultTileTrayParams,
  getTile,
  getTileAutoSlotWallHeight,
  getTilePositions,
  getTileStandingHeight,
  getTileTrayDimensions,
  type TileTrayParams
} from '#lib/models/tileTray.js';
import type { Tile } from '#lib/types/project.js';
import { countConnectedBodies } from '#lib/utils/geometryTestHelpers.js';
import { makeTile } from '#lib/utils/partTestFixtures.js';
import jscad from '@jscad/modeling';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { measureBoundingBox, measureVolume } = jscad.measurements;

describe('getTile', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  const tiles = [makeTile({ id: 'a', name: 'Alpha' }), makeTile({ id: 'b', name: 'Beta' })];

  it('finds a tile by ID', () => {
    expect(getTile('b', tiles)).toBe(tiles[1]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not match by name', () => {
    expect(getTile('Beta', tiles)).toBe(tiles[0]);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('unknown ID gives the first tile', () => {
    expect(getTile('missing', tiles)).toBe(tiles[0]);
  });

  it('empty list gives the default geometry', () => {
    expect(getTile('x', [])).toBe(DEFAULT_TILE_GEOMETRY);
    expect(DEFAULT_TILE_GEOMETRY).toMatchObject({
      id: 'tile-standard',
      name: 'Standard',
      width: 50,
      height: 50,
      thickness: 2
    });
  });
});

describe('getTileStandingHeight', () => {
  it('is H sin a + t cos a', () => {
    const tile = makeTile({ height: 40, thickness: 1.5 });
    const a = (70 * Math.PI) / 180;
    expect(getTileStandingHeight(tile, a)).toBeCloseTo(40 * Math.sin(a) + 1.5 * Math.cos(a), 9);
  });

  it('upright (90 deg) is H tall, flat (0 deg) is t tall', () => {
    const tile = makeTile({ height: 40, thickness: 1.5 });
    expect(getTileStandingHeight(tile, Math.PI / 2)).toBeCloseTo(40, 9);
    expect(getTileStandingHeight(tile, 0)).toBeCloseTo(1.5, 9);
  });
});

describe('tile layout (copy of the oneSided standee tests)', () => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const W = 40;
  const H = 25;
  const T = 1.5;

  function oneSided(extra: Partial<Tile> = {}, paramsExtra: Partial<TileTrayParams> = {}, count = 5) {
    const own: Tile = makeTile({ id: 'own', name: 'Own', height: H, width: W, thickness: T, ...extra });
    const params: TileTrayParams = { ...defaultTileTrayParams, count, tileId: 'own', ...paramsExtra };
    return { params, tiles: [own], own };
  }
  const dimsOf = (s: ReturnType<typeof oneSided>, targetHeight?: number, spacer?: number) => ({
    ...getTileTrayDimensions(s.params, s.tiles),
    positions: getTilePositions(s.params, s.tiles, targetHeight, spacer)
  });

  // Corners of every element in (y, z) from the placed positions, as the preview draws them
  function corners(p: ReturnType<typeof getTilePositions>[number]) {
    const up = [-Math.sin(p.tilt), Math.cos(p.tilt)]; // along the element height
    const normal = [Math.cos(p.tilt), Math.sin(p.tilt)];
    const out: { x: number; y: number; z: number }[] = [];
    for (const sx of [0, 1])
      for (const su of [-1, 1])
        for (const sv of [-1, 1])
          out.push({
            x: p.x + sx * p.figureLength,
            y: p.y + (su * p.figureWidth * up[0]) / 2 + (sv * p.figureThickness * normal[0]) / 2,
            z: p.z + (su * p.figureWidth * up[1]) / 2 + (sv * p.figureThickness * normal[1]) / 2
          });
    return out;
  }

  it.each([
    [1, 90],
    [5, 90],
    [10, 90],
    [1, 70],
    [5, 70],
    [10, 70],
    [1, 45],
    [5, 45],
    [10, 45]
  ])('count %i at %i degrees: dimensions follow the formulas', (count, angle) => {
    const s = oneSided({ angleToFloor: angle }, {}, count);
    const d = dimsOf(s);
    const sinA = Math.sin(rad(angle));
    const cosA = Math.cos(rad(angle));
    const slot = T + 1;
    const hUp = H * sinA + T * cosA;
    const pitch = (slot + 2) / sinA;
    expect(d.width).toBeCloseTo(2 * 2 + 2 * 0.5 + W, 9);
    expect(d.height).toBeCloseTo(2 + hUp + 2, 9);
    const margins = 2 * (2 + 0.5 + slot / (2 * sinA)) + H * cosA;
    expect(d.depth).toBeCloseTo(margins + (count - 1) * pitch, 9);
    expect(d.positions).toHaveLength(count);
  });

  it('pitch between positions is (slot + 2) / sin(angle)', () => {
    for (const angle of [90, 70, 45]) {
      const { positions } = dimsOf(oneSided({ angleToFloor: angle, slotClearance: 2 }));
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i].y - positions[i - 1].y).toBeCloseTo((T + 2 + 2) / Math.sin(rad(angle)), 9);
      }
    }
  });

  it('positions: no base, flush left edge, tilt, element centre', () => {
    const { positions, width } = dimsOf(oneSided({ angleToFloor: 70 }, {}, 3));
    const hUp = H * Math.sin(rad(70)) + T * Math.cos(rad(70));
    for (const p of positions) {
      expect(p.baseRadius).toBe(0);
      expect(p.baseThickness).toBe(0);
      expect(p.figureDir).toBe(1);
      expect(p.x).toBeCloseTo((width - W) / 2, 9);
      expect(p.figureLength).toBe(W);
      expect(p.figureWidth).toBe(H);
      expect(p.figureThickness).toBe(T);
      expect(p.tilt).toBeCloseTo(rad(20), 12);
      // z = floor + (H/2) sin a + (t/2) cos a
      expect(p.z).toBeCloseTo(2 + (H / 2) * Math.sin(rad(70)) + (T / 2) * Math.cos(rad(70)), 9);
      // lowest corner rests exactly on the floor, highest corner is the standing height
      const zs = corners(p).map((c) => c.z);
      expect(Math.min(...zs)).toBeCloseTo(2, 9);
      expect(Math.max(...zs)).toBeCloseTo(2 + hUp, 9);
    }
  });

  it.each([90, 70, 45])('all element corners lie inside the interior at %i degrees', (angle) => {
    for (const count of [1, 5, 10]) {
      for (const over of [{}, { trayDepthOverride: 200, trayWidthOverride: 120 }]) {
        const s = oneSided({ angleToFloor: angle }, over, count);
        const { width, depth, positions } = dimsOf(s);
        for (const p of positions) {
          for (const c of corners(p)) {
            expect(c.x).toBeGreaterThanOrEqual(2 + 0.5 - 1e-9);
            expect(c.x).toBeLessThanOrEqual(width - 2 - 0.5 + 1e-9);
            expect(c.y).toBeGreaterThanOrEqual(2 + 0.5 - 1e-9);
            expect(c.y).toBeLessThanOrEqual(depth - 2 - 0.5 + 1e-9);
          }
        }
      }
    }
  });

  it('element slot axis equals the preview axis: element centre lies on the slot centre line', () => {
    // Slot centre line meets the floor at slotY and leans toward -Y; the position y must lie on it.
    const s = oneSided({ angleToFloor: 60 }, {}, 2);
    const { positions } = dimsOf(s);
    for (const p of positions) {
      const slotY = p.y + (p.z - 2) * Math.tan(p.tilt);
      expect(slotY).toBeGreaterThan(p.y); // top leans toward the front (-Y)
      expect(positions.some((q) => Math.abs(q.y + (q.z - 2) * Math.tan(q.tilt) - slotY) < 1e-9)).toBe(true);
    }
  });

  it.each([90, 70, 45])('placed elements fit their slots (no overlap with the tray) at %i degrees', (angle) => {
    // The element solid is built from the positions the way the preview draws it (box W x H x t about
    // its centre, rotated by tilt about X). It only touches the tray at its lowest corner on the floor.
    const { cuboid } = jscad.primitives;
    const { rotateX, translate } = jscad.transforms;
    const { intersect } = jscad.booleans;
    const s = oneSided({ angleToFloor: angle }, {}, 3);
    const tray = createTileTray(s.params, s.tiles, 'x', undefined, undefined, false);
    const { positions } = dimsOf(s);
    for (const p of positions) {
      const element = translate(
        [p.x + p.figureLength / 2, p.y, p.z],
        rotateX(p.tilt, cuboid({ size: [p.figureLength, p.figureThickness, p.figureWidth] }))
      );
      const overlap = intersect(tray, element);
      // Only the sliver of the lowest edge below the floor may overlap (<< 1 % of the element)
      expect(overlap.polygons.length === 0 ? 0 : measureVolume(overlap)).toBeLessThan(0.01 * W * H * T);
      // A mirrored lean must collide with the slot walls, proving the check is sensitive
      if (angle < 90) {
        const wrong = translate(
          [p.x + p.figureLength / 2, p.y, p.z],
          rotateX(-p.tilt, cuboid({ size: [p.figureLength, p.figureThickness, p.figureWidth] }))
        );
        expect(measureVolume(intersect(tray, wrong))).toBeGreaterThan(0.02 * W * H * T);
      }
    }
  });

  it('bar height: auto = hUp/3 (min 10), override clamped to [1, hUp] without NaN', () => {
    // The tray box is as tall as hUp + rim in every case, so the bars are compared via volume
    const vol = (extra: Partial<TileTrayParams>) => {
      const s = oneSided({ angleToFloor: 90 }, extra, 2);
      return measureVolume(createTileTray(s.params, s.tiles, 'x', undefined, undefined, false));
    };
    const auto = vol({});
    const sameAsAuto = vol({ slotWallHeight: Math.max(10, H / 3) });
    expect(sameAsAuto).toBeCloseTo(auto, 6);
    expect(vol({ slotWallHeight: 15 })).toBeGreaterThan(auto);
    expect(vol({ slotWallHeight: 1000 })).toBeCloseTo(vol({ slotWallHeight: H }), 6); // clamped to hUp
    expect(vol({ slotWallHeight: 0.2 })).toBeLessThan(auto);
    for (const v of [NaN, -3, 0, Infinity]) expect(Number.isFinite(vol({ slotWallHeight: v }))).toBe(true);
  });

  it('small element: bar height never exceeds the standing height', () => {
    // hUp = 5: auto would be max(10, 1.67) = 10 > hUp, so it is clamped to hUp
    const s = oneSided({ height: 5, angleToFloor: 90, thickness: 0.5 }, {}, 2);
    const full = measureVolume(createTileTray(s.params, s.tiles, 'x', undefined, undefined, false));
    const s2 = oneSided({ height: 5, angleToFloor: 90, thickness: 0.5 }, { slotWallHeight: 5 }, 2);
    expect(measureVolume(createTileTray(s2.params, s2.tiles, 'x', undefined, undefined, false))).toBeCloseTo(full, 6);
  });

  it('length override spreads the slots evenly over the free length (minimum is the auto pitch)', () => {
    const auto = dimsOf(oneSided({ angleToFloor: 70 }, {}, 4));
    const long = dimsOf(oneSided({ angleToFloor: 70 }, { trayDepthOverride: auto.depth + 30 }, 4));
    expect(long.depth).toBeCloseTo(auto.depth + 30, 9);
    const autoPitch = auto.positions[1].y - auto.positions[0].y;
    const longPitch = long.positions[1].y - long.positions[0].y;
    expect(longPitch).toBeCloseTo(autoPitch + 10, 9);
    expect(long.positions[3].y - long.positions[2].y).toBeCloseTo(longPitch, 9);
    expect(long.positions[0].y - auto.positions[0].y).toBeCloseTo(0, 9); // first slot stays at the front margin
    // smaller override is ignored
    expect(dimsOf(oneSided({ angleToFloor: 70 }, { trayDepthOverride: 5 }, 4)).depth).toBeCloseTo(auto.depth, 9);
    // a single element is centred in the free length
    const single = dimsOf(oneSided({ angleToFloor: 70 }, { trayDepthOverride: 100 }, 1));
    const autoSingle = dimsOf(oneSided({ angleToFloor: 70 }, {}, 1));
    expect(single.positions[0].y - autoSingle.positions[0].y).toBeCloseTo((100 - autoSingle.depth) / 2, 9);
  });

  it('width override is a minimum and keeps the element centred', () => {
    const wide = dimsOf(oneSided({}, { trayWidthOverride: 80 }, 2));
    expect(wide.width).toBeCloseTo(80, 9);
    expect(wide.positions[0].x).toBeCloseTo((80 - W) / 2, 9);
    expect(dimsOf(oneSided({}, { trayWidthOverride: 10 }, 2)).width).toBeCloseTo(2 * 2 + 2 * 0.5 + W, 9);
  });

  it('height: targetHeight lifts the floor, spacer adds on top, tray stays the natural size otherwise', () => {
    const s = oneSided({ angleToFloor: 70 }, {}, 3);
    const natural = getTileTrayDimensions(s.params, s.tiles).height;
    const base = getTilePositions(s.params, s.tiles);
    const lifted = getTilePositions(s.params, s.tiles, natural + 10);
    const spaced = getTilePositions(s.params, s.tiles, natural + 10, 3);
    expect(lifted[0].z - base[0].z).toBeCloseTo(10, 9);
    expect(spaced[0].z - base[0].z).toBeCloseTo(13, 9);
    expect(lifted[0].y).toBeCloseTo(base[0].y, 9); // the lift never changes the footprint
    const g = createTileTray(s.params, s.tiles, 'x', natural + 10, 3, false);
    const [min, max] = measureBoundingBox(g);
    expect(max[2] - min[2]).toBeCloseTo(natural + 13, 6);
  });

  it.each([90, 70, 45])('geometry at %i degrees: bounding box equals the dimensions, volume > 0', (angle) => {
    for (const count of [1, 5]) {
      const s = oneSided({ angleToFloor: angle }, {}, count);
      const d = dimsOf(s);
      const g = createTileTray(s.params, s.tiles, 'x', undefined, undefined, false);
      const [min, max] = measureBoundingBox(g);
      expect(max[0] - min[0]).toBeCloseTo(d.width, 6);
      expect(max[1] - min[1]).toBeCloseTo(d.depth, 6);
      expect(max[2] - min[2]).toBeCloseTo(d.height, 6);
      expect(measureVolume(g)).toBeGreaterThan(0);
    }
  });

  it('slots cut the bars but not the floor, and more elements remove more material', () => {
    const vol = (count: number) => {
      const s = oneSided({ angleToFloor: 70 }, {}, count);
      return measureVolume(createTileTray(s.params, s.tiles, 'x', undefined, undefined, false));
    };
    // Same footprint via override, so only the slots differ
    const volSame = (count: number) => {
      const s = oneSided({ angleToFloor: 70 }, { trayDepthOverride: 150 }, count);
      return measureVolume(createTileTray(s.params, s.tiles, 'x', undefined, undefined, false));
    };
    expect(volSame(1)).toBeGreaterThan(volSame(5));
    expect(vol(5)).toBeGreaterThan(0);
    // Floor intact: volume is at least the solid floor + outer walls
    const s = oneSided({}, {}, 5);
    const d = getTileTrayDimensions(s.params, s.tiles);
    expect(volSame(5)).toBeGreaterThan(d.width * 150 * 2 * 0.99);
  });

  it.each([1, 2, 3, 5, 10, 40, 100, 200])('element width %i mm gives finite, positive results', (width) => {
    for (const bars of [
      { barPositionLeft: 0, barPositionRight: 0 },
      { barPositionLeft: 50, barPositionRight: 50 },
      { barPositionLeft: 50, barPositionRight: 0 },
      { barPositionLeft: 25, barPositionRight: 25 }
    ]) {
      const s = oneSided({ width: width, ...bars }, {}, 3);
      const d = dimsOf(s);
      for (const v of [d.width, d.depth, d.height, ...d.positions.flatMap((p) => [p.x, p.y, p.z])]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      const g = createTileTray(s.params, s.tiles, 'x', undefined, undefined, false);
      const [min, max] = measureBoundingBox(g);
      expect(max[0] - min[0]).toBeCloseTo(d.width, 6);
      expect(measureVolume(g)).toBeGreaterThan(0);
    }
  });

  it('element narrower than the bar thickness (W=1, iw=2): finite sizes and bounding box', () => {
    const s = oneSided({ width: 1 }, { innerWallThickness: 2 }, 3);
    const d = getTileTrayDimensions(s.params, s.tiles);
    for (const v of [d.width, d.depth, d.height]) expect(Number.isFinite(v)).toBe(true);
    const g = createTileTray(s.params, s.tiles, 'x', undefined, undefined, false);
    const [min, max] = measureBoundingBox(g);
    expect(max[0] - min[0]).toBeCloseTo(d.width, 6);
    expect(max[1] - min[1]).toBeCloseTo(d.depth, 6);
    expect(measureVolume(g)).toBeGreaterThan(0);
  });

  it('bar positions 0 % and 50 % never change the tray width', () => {
    const width = (bars: Partial<Tile>) => {
      const s = oneSided({ width: 40, ...bars }, { trayDepthOverride: 60 }, 1);
      const g = createTileTray(s.params, s.tiles, 'x', undefined, undefined, false);
      return measureBoundingBox(g)[1][0] - measureBoundingBox(g)[0][0];
    };
    expect(width({ barPositionLeft: 0, barPositionRight: 0 })).toBeCloseTo(2 * 2 + 2 * 0.5 + 40, 6);
    expect(width({ barPositionLeft: 50, barPositionRight: 50 })).toBeCloseTo(2 * 2 + 2 * 0.5 + 40, 6);
  });
});

describe('tile tray bars: one connected body', () => {
  const build = (tile: Partial<Tile>, params: Partial<TileTrayParams> = {}) => {
    const t = makeTile({ id: 'own', name: 'Own', width: 40, height: 25, thickness: 1.5, ...tile });
    const p: TileTrayParams = { ...defaultTileTrayParams, count: 3, tileId: 'own', ...params };
    return createTileTray(p, [t], 'x', undefined, undefined, false);
  };
  const cases = [
    { label: 'separate bars', tile: { barPositionLeft: 10, barPositionRight: 10 }, params: {} },
    { label: 'touching bars', tile: { barPositionLeft: 50, barPositionRight: 50 }, params: {} },
    {
      label: 'overlapping bars (thick wall)',
      tile: { barPositionLeft: 50, barPositionRight: 50 },
      params: { innerWallThickness: 30 }
    },
    { label: 'bars wider than the tile', tile: { width: 1 }, params: { innerWallThickness: 6 } }
  ];

  it.each(cases)('$label: a single connected body', ({ tile, params }) => {
    const g = build(tile, params);
    expect(countConnectedBodies(g)).toBe(1);
    expect(measureVolume(g)).toBeGreaterThan(0);
  });

  it('touching bars neither lose nor double-count volume (equals separate bars)', () => {
    // Bars never overlap by clamping; touching ones must weigh the same as separated ones.
    const p = { innerWallThickness: 10 };
    const separate = measureVolume(build({ barPositionLeft: 5, barPositionRight: 5 }, p));
    const touching = measureVolume(build({ barPositionLeft: 50, barPositionRight: 50 }, p));
    expect(touching).toBeCloseTo(separate, 3);
  });
});
