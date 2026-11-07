import { describe, it, expect } from 'vitest';
import { getBoxExteriorDimensions, getLidHeight, calculateMinimumBoxDimensions } from '#lib/models/box.js';
import { firstBox, startProject } from '#lib/utils/partTestFixtures.js';

// Characterization tests: the expected numbers are the CURRENT behaviour of the code, not a spec.
// They exist so that later height changes (F3.0.x) show up as visible test diffs.

function exterior(box: ReturnType<typeof firstBox>, project = startProject()) {
  return getBoxExteriorDimensions(box, project.cardSizes, project.counterShapes, project.standees);
}

describe('getBoxExteriorDimensions (characterization)', () => {
  it('returns all zeros for an empty box', () => {
    const box = firstBox(startProject());
    box.trays = [];
    expect(exterior(box)).toEqual({ width: 0, depth: 0, height: 0 });
  });

  it('start box (wall 3): height = minHeight + 2 * wall', () => {
    const project = startProject();
    const box = firstBox(project);
    const { minHeight } = calculateMinimumBoxDimensions(box, project.cardSizes, project.counterShapes, project.standees);
    expect(box.wallThickness).toBe(3);
    expect(getLidHeight(box)).toBe(6);
    expect(exterior(box, project).height).toBeCloseTo(minHeight + 6, 6);
    // Concrete value of the start project
    expect(exterior(box, project).height).toBeCloseTo(28.4, 6);
  });

  it('customBoxHeight replaces minHeight, the lid height is still added', () => {
    const box = firstBox(startProject());
    box.customBoxHeight = 40;
    expect(exterior(box).height).toBe(46);
  });

  it('customWidth and customDepth override the minimum footprint', () => {
    const box = firstBox(startProject());
    box.customWidth = 160;
    box.customDepth = 120;
    const dims = exterior(box);
    expect(dims.width).toBe(160);
    expect(dims.depth).toBe(120);
  });

  it('lid height follows the wall thickness (2 * wall)', () => {
    const box = firstBox(startProject());
    box.wallThickness = 2;
    expect(getLidHeight(box)).toBe(4);
  });
});
