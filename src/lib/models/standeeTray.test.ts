import jscad from '@jscad/modeling';
import { describe, it, expect } from 'vitest';
import {
  createStandeeTray,
  getStandeePositions,
  getStandeeTrayDimensions,
  type StandeeTrayParams
} from '#lib/models/standeeTray.js';
import type { Standee } from '#lib/types/project.js';
import { firstStandeeTray, startProject } from '#lib/utils/partTestFixtures.js';

// F3e.1: characterisation of the CURRENT standee tray behaviour (defaults of later options must
// stay bit-identical). Expected numbers were taken from a run of the unchanged code.

const { measureBoundingBox, measureVolume } = jscad.measurements;

const SLOT_ANGLE = (20 * Math.PI) / 180;

function standee(
  baseRadius: number,
  baseThickness: number,
  standeeHeight: number,
  standeeWidth: number,
  standeeThickness: number
): Standee {
  return { id: 'own', name: 'Own', baseRadius, baseThickness, standeeHeight, standeeWidth, standeeThickness };
}

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
    const dims = getStandeeTrayDimensions({ ...base, count: 5, standeeId: 'own' }, [standee(12, 4, 60, 30, 2)]);
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
    expectPositions(positions, auto.map((a) => ({ ...a, z: 11 })));
  });

  it('with targetHeight and floor spacer: only z lifts', () => {
    const { standees, base } = standardSetup();
    const positions = slim(getStandeePositions({ ...base, count: 5 }, standees, 40, 3));
    expectPositions(positions, auto.map((a) => ({ ...a, z: 28.5 })));
  });

  it('targetHeight below natural height changes nothing', () => {
    const { standees, base } = standardSetup();
    const positions = slim(getStandeePositions({ ...base, count: 5 }, standees, 10));
    expectPositions(positions, auto.map((a) => ({ ...a, z: 11 })));
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
