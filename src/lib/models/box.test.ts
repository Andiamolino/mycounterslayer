import { describe, it, expect } from 'vitest';
import {
  getBoxExteriorDimensions,
  getLidHeight,
  getRequiredTrayHeightForBox,
  calculateMinimumBoxDimensions
} from '#lib/models/box.js';
import { firstBox, startProject } from '#lib/utils/partTestFixtures.js';

// Characterization tests: the expected numbers are the CURRENT behaviour of the code, not a spec.
// They exist so that later height changes (F3.0.x) show up as visible test diffs.
// F3.0.5 (E2, changed on purpose): lid overshoot = lidParams.thickness (was 2 * wall).
// Changed expectations (old -> new): start box getLidHeight 6 -> 2; start box exterior height 28.4 -> 24.4;
// customBoxHeight 40 -> exterior 46 -> 42; "lid height follows wall (wall 2 -> 4)" replaced by the thickness test.

function exterior(box: ReturnType<typeof firstBox>, project = startProject()) {
  return getBoxExteriorDimensions(box, project.cardSizes, project.counterShapes, project.standees);
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
    const { minHeight } = calculateMinimumBoxDimensions(box, project.cardSizes, project.counterShapes, project.standees);
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
