import {
  createStandeeTray,
  getStandeePositions,
  getStandeeRowCounts,
  getStandeeTrayDimensions,
  type StandeeTrayParams
} from '#lib/models/standeeTray.js';
import type { Standee } from '#lib/types/project.js';
import { firstStandeeTray, makeStandee, startProject } from '#lib/utils/partTestFixtures.js';
import jscad from '@jscad/modeling';
import { describe, expect, it } from 'vitest';

// F3e.1: characterisation of the CURRENT standee tray behaviour (defaults of later options must
// stay bit-identical). Expected numbers were taken from a run of the unchanged code.

const { measureBoundingBox, measureVolume } = jscad.measurements;

const SLOT_ANGLE = (20 * Math.PI) / 180;

function standardSetup() {
  const project = startProject();
  const base = (firstStandeeTray(project) as { params: StandeeTrayParams }).params;
  return { standees: project.standees, base };
}

// Plain-number view of a placed standee row
function slim(positions: ReturnType<typeof getStandeePositions>) {
  return positions.map(({ x, y, z, tilt, figureDir }) => ({ x, y, z, tilt, figureDir }));
}

function expectPositions(
  actual: ReturnType<typeof slim>,
  expected: { x: number; y: number; z: number; figureDir: number }[]
) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((e, i) => {
    expect(actual[i].x).toBeCloseTo(e.x, 9);
    expect(actual[i].y).toBeCloseTo(e.y, 9);
    expect(actual[i].z).toBeCloseTo(e.z, 9);
    expect(actual[i].figureDir).toBe(e.figureDir);
    expect(actual[i].tilt).toBeCloseTo(SLOT_ANGLE, 9);
  });
}

describe('standee row distribution (getStandeePositions)', () => {
  it.each([
    [0, 0, 0],
    [1, 1, 0],
    [2, 1, 1],
    [5, 3, 2],
    [7, 4, 3],
    [12, 6, 6]
  ])('count %i -> %i left + %i right', (count, left, right) => {
    const { standees, base } = standardSetup();
    const positions = getStandeePositions({ ...base, count }, standees);
    expect(positions.filter((p) => p.figureDir === 1)).toHaveLength(left);
    expect(positions.filter((p) => p.figureDir === -1)).toHaveLength(right);
    // left wall = small x, right wall = large x
    const mid = getStandeeTrayDimensions({ ...base, count }, standees).width / 2;
    expect(positions.filter((p) => p.x < mid)).toHaveLength(left);
    expect(positions.filter((p) => p.x > mid)).toHaveLength(right);
  });
});

describe('getStandeeTrayDimensions', () => {
  it.each([
    [1, 43.05513679371987],
    [2, 43.05513679371987],
    [5, 81.05513679371987],
    [7, 100.05513679371987],
    [12, 138.05513679371984]
  ])('standard standee, count %i', (count, depth) => {
    const { standees, base } = standardSetup();
    const dims = getStandeeTrayDimensions({ ...base, count }, standees);
    expect(dims.width).toBeCloseTo(59.5, 9);
    expect(dims.depth).toBeCloseTo(depth, 9);
    expect(dims.height).toBeCloseTo(25.5, 9);
  });

  it('count 0 behaves like count 1 (at least one slot of depth)', () => {
    const { standees, base } = standardSetup();
    expect(getStandeeTrayDimensions({ ...base, count: 0 }, standees)).toEqual(
      getStandeeTrayDimensions({ ...base, count: 1 }, standees)
    );
  });

  it('own standee (12/4/60/30/2), count 5', () => {
    const { base } = standardSetup();
    const dims = getStandeeTrayDimensions({ ...base, count: 5, standeeId: 'own' }, [
      makeStandee({ id: 'own', name: 'Own', baseRadius: 12, baseThickness: 4, standeeHeight: 60, standeeWidth: 30 })
    ]);
    expect(dims.width).toBeCloseTo(81.5, 9);
    expect(dims.depth).toBeCloseTo(103.87498796505088, 9);
    expect(dims.height).toBeCloseTo(31, 9);
  });

  it('width/length overrides act as minimum only', () => {
    const { standees, base } = standardSetup();
    const big = getStandeeTrayDimensions(
      { ...base, count: 5, trayWidthOverride: 80, trayDepthOverride: 120 },
      standees
    );
    expect(big.width).toBeCloseTo(80, 9);
    expect(big.depth).toBeCloseTo(120, 9);
    const small = getStandeeTrayDimensions(
      { ...base, count: 5, trayWidthOverride: 10, trayDepthOverride: 10 },
      standees
    );
    expect(small.width).toBeCloseTo(59.5, 9);
    expect(small.depth).toBeCloseTo(81.05513679371987, 9);
  });
});

describe('standee positions, count 5 standard standee', () => {
  const leftX = 3.5;
  const auto = [
    { x: leftX, y: 16.777568396859934, figureDir: 1 },
    { x: leftX, y: 35.777568396859934, figureDir: 1 },
    { x: leftX, y: 54.777568396859934, figureDir: 1 },
    { x: 56, y: 26.277568396859934, figureDir: -1 },
    { x: 56, y: 45.277568396859934, figureDir: -1 }
  ];

  it('auto size', () => {
    const { standees, base } = standardSetup();
    const positions = slim(getStandeePositions({ ...base, count: 5 }, standees));
    expectPositions(
      positions,
      auto.map((a) => ({ ...a, z: 11 }))
    );
  });

  it('with targetHeight and floor spacer: only z lifts', () => {
    const { standees, base } = standardSetup();
    const positions = slim(getStandeePositions({ ...base, count: 5 }, standees, 40, 3));
    expectPositions(
      positions,
      auto.map((a) => ({ ...a, z: 28.5 }))
    );
  });

  it('targetHeight below natural height changes nothing', () => {
    const { standees, base } = standardSetup();
    const positions = slim(getStandeePositions({ ...base, count: 5 }, standees, 10));
    expectPositions(
      positions,
      auto.map((a) => ({ ...a, z: 11 }))
    );
  });

  it('with width/length override: row centred, right row follows the right wall', () => {
    const { standees, base } = standardSetup();
    const positions = slim(
      getStandeePositions({ ...base, count: 5, trayWidthOverride: 80, trayDepthOverride: 120 }, standees)
    );
    expectPositions(positions, [
      { x: leftX, y: 36.25, z: 11, figureDir: 1 },
      { x: leftX, y: 55.25, z: 11, figureDir: 1 },
      { x: leftX, y: 74.25, z: 11, figureDir: 1 },
      { x: 76.5, y: 45.75, z: 11, figureDir: -1 },
      { x: 76.5, y: 64.75, z: 11, figureDir: -1 }
    ]);
  });
});

describe('createStandeeTray geometry (count 5, standard standee)', () => {
  it('bounding box and volume with targetHeight, no emboss', () => {
    const { standees, base } = standardSetup();
    const geom = createStandeeTray({ ...base, count: 5 }, standees, 'x', 40, undefined, false);
    const [min, max] = measureBoundingBox(geom);
    expect(min[0]).toBeCloseTo(0, 6);
    expect(min[1]).toBeCloseTo(0, 6);
    expect(min[2]).toBeCloseTo(0, 6);
    expect(max[0]).toBeCloseTo(59.5, 6);
    expect(max[1]).toBeCloseTo(81.05513679371987, 6);
    expect(max[2]).toBeCloseTo(40, 6);
    expect(measureVolume(geom)).toBeCloseTo(99030.0418231242, 3);
  });
});

describe('getStandeeRowCounts', () => {
  it.each([
    [0, [0, 0], [0]],
    [1, [1, 0], [1]],
    [2, [1, 1], [2]],
    [5, [3, 2], [5]],
    [7, [4, 3], [7]],
    [NaN, [0, 0], [0]],
    [Infinity, [0, 0], [0]],
    [-3, [0, 0], [0]],
    [4.9, [2, 2], [4]]
  ])('count %s', (count, alternating, oneSided) => {
    expect(getStandeeRowCounts(count, 'alternating')).toEqual(alternating);
    expect(getStandeeRowCounts(count, 'oneSided')).toEqual(oneSided);
  });
});

describe('holder settings in the alternating layout', () => {
  const depthWith = (extra: Partial<Standee>, count = 5) => {
    const { standees, base } = standardSetup();
    const modified = standees.map((s) => ({ ...s, ...extra }));
    const params = { ...base, count };
    return {
      dims: getStandeeTrayDimensions(params, modified),
      positions: getStandeePositions(params, modified),
      geom: createStandeeTray(params, modified, 'x', undefined, undefined, false)
    };
  };

  it('angle 90 has no sweep (shorter), 45 sweeps more (longer) than 70', () => {
    const d70 = depthWith({ angleToFloor: 70 }).dims.depth;
    expect(depthWith({ angleToFloor: 90 }).dims.depth).toBeLessThan(d70);
    expect(depthWith({ angleToFloor: 45 }).dims.depth).toBeGreaterThan(d70);
  });

  it('positions carry the resolved tilt', () => {
    expect(depthWith({ angleToFloor: 90 }).positions.every((p) => p.tilt === 0)).toBe(true);
    const t45 = depthWith({ angleToFloor: 45 }).positions;
    expect(t45.every((p) => Math.abs(p.tilt - Math.PI / 4) < 1e-12)).toBe(true);
  });

  it.each([
    [0, 70],
    [2, 70],
    [1, 90],
    [1, 45],
    [0, 45],
    [2, 90]
  ])('slotClearance %s, angle %s gives finite, plausible dimensions', (slotClearance, angleToFloor) => {
    const { dims, positions, geom } = depthWith({ slotClearance, angleToFloor });
    for (const v of [dims.width, dims.depth, dims.height]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(positions).toHaveLength(5);
    expect(positions.every((p) => Number.isFinite(p.y) && p.y > 0 && p.y < dims.depth)).toBe(true);
    const [min, max] = measureBoundingBox(geom);
    expect(max[1] - min[1]).toBeCloseTo(dims.depth, 6);
    expect(measureVolume(geom)).toBeGreaterThan(0);
  });

  it.each([NaN, Infinity, -4])('count %s never yields NaN depth', (count) => {
    const { standees, base } = standardSetup();
    const dims = getStandeeTrayDimensions({ ...base, count }, standees);
    expect(Number.isFinite(dims.depth)).toBe(true);
    expect(getStandeePositions({ ...base, count }, standees)).toHaveLength(0);
  });
});

// F3e.6: oneSided mode (cards/tiles without a base, one row, leaning in two slotted bars)
describe('oneSided layout', () => {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const W = 40;
  const H = 25;
  const T = 1.5;

  function oneSided(extra: Partial<Standee> = {}, paramsExtra: Partial<StandeeTrayParams> = {}, count = 5) {
    const { base } = standardSetup();
    const own: Standee = {
      ...makeStandee({
        id: 'own',
        name: 'Own',
        baseRadius: 9,
        baseThickness: 3,
        standeeHeight: H,
        standeeWidth: W,
        standeeThickness: T
      }),
      arrangement: 'oneSided',
      ...extra
    };
    const params: StandeeTrayParams = { ...base, count, standeeId: 'own', ...paramsExtra };
    return { params, standees: [own], own };
  }
  const dimsOf = (s: ReturnType<typeof oneSided>, targetHeight?: number, spacer?: number) => ({
    ...getStandeeTrayDimensions(s.params, s.standees),
    positions: getStandeePositions(s.params, s.standees, targetHeight, spacer)
  });

  // Corners of every element in (y, z) from the placed positions, as the preview draws them
  function corners(p: ReturnType<typeof getStandeePositions>[number]) {
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
    const tray = createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false);
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
    const vol = (extra: Partial<StandeeTrayParams>) => {
      const s = oneSided({ angleToFloor: 90 }, extra, 2);
      return measureVolume(createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false));
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
    const s = oneSided({ standeeHeight: 5, angleToFloor: 90, standeeThickness: 0.5 }, {}, 2);
    const full = measureVolume(createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false));
    const s2 = oneSided({ standeeHeight: 5, angleToFloor: 90, standeeThickness: 0.5 }, { slotWallHeight: 5 }, 2);
    expect(measureVolume(createStandeeTray(s2.params, s2.standees, 'x', undefined, undefined, false))).toBeCloseTo(
      full,
      6
    );
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
    const natural = getStandeeTrayDimensions(s.params, s.standees).height;
    const base = getStandeePositions(s.params, s.standees);
    const lifted = getStandeePositions(s.params, s.standees, natural + 10);
    const spaced = getStandeePositions(s.params, s.standees, natural + 10, 3);
    expect(lifted[0].z - base[0].z).toBeCloseTo(10, 9);
    expect(spaced[0].z - base[0].z).toBeCloseTo(13, 9);
    expect(lifted[0].y).toBeCloseTo(base[0].y, 9); // the lift never changes the footprint
    const g = createStandeeTray(s.params, s.standees, 'x', natural + 10, 3, false);
    const [min, max] = measureBoundingBox(g);
    expect(max[2] - min[2]).toBeCloseTo(natural + 13, 6);
  });

  it.each([90, 70, 45])('geometry at %i degrees: bounding box equals the dimensions, volume > 0', (angle) => {
    for (const count of [1, 5]) {
      const s = oneSided({ angleToFloor: angle }, {}, count);
      const d = dimsOf(s);
      const g = createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false);
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
      return measureVolume(createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false));
    };
    // Same footprint via override, so only the slots differ
    const volSame = (count: number) => {
      const s = oneSided({ angleToFloor: 70 }, { trayDepthOverride: 150 }, count);
      return measureVolume(createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false));
    };
    expect(volSame(1)).toBeGreaterThan(volSame(5));
    expect(vol(5)).toBeGreaterThan(0);
    // Floor intact: volume is at least the solid floor + outer walls
    const s = oneSided({}, {}, 5);
    const d = getStandeeTrayDimensions(s.params, s.standees);
    expect(volSame(5)).toBeGreaterThan(d.width * 150 * 2 * 0.99);
  });

  it.each([1, 2, 3, 5, 10, 40, 100, 200])('element width %i mm gives finite, positive results', (width) => {
    for (const bars of [
      { barPositionLeft: 0, barPositionRight: 0 },
      { barPositionLeft: 50, barPositionRight: 50 },
      { barPositionLeft: 50, barPositionRight: 0 },
      { barPositionLeft: 25, barPositionRight: 25 }
    ]) {
      const s = oneSided({ standeeWidth: width, ...bars }, {}, 3);
      const d = dimsOf(s);
      for (const v of [d.width, d.depth, d.height, ...d.positions.flatMap((p) => [p.x, p.y, p.z])]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      const g = createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false);
      const [min, max] = measureBoundingBox(g);
      expect(max[0] - min[0]).toBeCloseTo(d.width, 6);
      expect(measureVolume(g)).toBeGreaterThan(0);
    }
  });

  it('element narrower than the bar thickness (W=1, iw=2): finite sizes and bounding box', () => {
    const s = oneSided({ standeeWidth: 1 }, { innerWallThickness: 2 }, 3);
    const d = getStandeeTrayDimensions(s.params, s.standees);
    for (const v of [d.width, d.depth, d.height]) expect(Number.isFinite(v)).toBe(true);
    const g = createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false);
    const [min, max] = measureBoundingBox(g);
    expect(max[0] - min[0]).toBeCloseTo(d.width, 6);
    expect(max[1] - min[1]).toBeCloseTo(d.depth, 6);
    expect(measureVolume(g)).toBeGreaterThan(0);
  });

  it('bar positions 0 % and 50 % never change the tray width', () => {
    const width = (bars: Partial<Standee>) => {
      const s = oneSided({ standeeWidth: 40, ...bars }, { trayDepthOverride: 60 }, 1);
      const g = createStandeeTray(s.params, s.standees, 'x', undefined, undefined, false);
      return measureBoundingBox(g)[1][0] - measureBoundingBox(g)[0][0];
    };
    expect(width({ barPositionLeft: 0, barPositionRight: 0 })).toBeCloseTo(2 * 2 + 2 * 0.5 + 40, 6);
    expect(width({ barPositionLeft: 50, barPositionRight: 50 })).toBeCloseTo(2 * 2 + 2 * 0.5 + 40, 6);
  });

  it('alternating is unchanged by the oneSided fields', () => {
    const { standees, base } = standardSetup();
    const modified = standees.map((s) => ({ ...s, arrangement: 'alternating' as const, barPositionLeft: 10 }));
    expect(getStandeeTrayDimensions({ ...base, count: 5 }, modified)).toEqual(
      getStandeeTrayDimensions({ ...base, count: 5 }, standees)
    );
  });
});
