import { countConnectedBodies } from '#lib/utils/geometryTestHelpers.js';
import jscad from '@jscad/modeling';
import { describe, expect, it } from 'vitest';

const { cuboid } = jscad.primitives;
const { translate } = jscad.transforms;
const { union } = jscad.booleans;

describe('countConnectedBodies', () => {
  it('counts separate bodies and one merged body', () => {
    const a = cuboid({ size: [2, 2, 2] });
    const far = translate([10, 0, 0], cuboid({ size: [2, 2, 2] }));
    const near = translate([1, 0, 0], cuboid({ size: [2, 2, 2] }));
    expect(countConnectedBodies(union(a, far))).toBe(2);
    expect(countConnectedBodies(union(a, near))).toBe(1);
  });
});
