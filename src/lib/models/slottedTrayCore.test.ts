import jscad from '@jscad/modeling';
import { describe, expect, it } from 'vitest';
import {
  applySizeOverride,
  buildSlottedWall,
  createOpenTrayBox,
  holderElementStacks,
  type HolderElementPosition,
  resolveSlottedTrayHeights
} from './slottedTrayCore.js';

const { measureBoundingBox, measureVolume } = jscad.measurements;

describe('applySizeOverride', () => {
  it('null keeps the automatic size', () => {
    expect(applySizeOverride(40, null)).toBe(40);
  });
  it('a smaller override is ignored', () => {
    expect(applySizeOverride(40, 30)).toBe(40);
  });
  it('a larger override wins', () => {
    expect(applySizeOverride(40, 55)).toBe(55);
  });
});

describe('resolveSlottedTrayHeights', () => {
  const base = { floorThickness: 2, rimHeight: 3, contentTopZ: 20 };

  it('without target or spacer: natural height, no lift', () => {
    expect(resolveSlottedTrayHeights(base)).toEqual({
      trayHeight: 23,
      lift: 0,
      floorRefZ: 2,
      innerWallTopZ: 23,
      naturalTrayHeight: 23
    });
  });

  it('a target below the natural height is ignored', () => {
    expect(resolveSlottedTrayHeights({ ...base, targetHeight: 10 }).trayHeight).toBe(23);
  });

  it('a taller target raises the floor by the lift', () => {
    expect(resolveSlottedTrayHeights({ ...base, targetHeight: 30 })).toEqual({
      trayHeight: 30,
      lift: 7,
      floorRefZ: 9,
      innerWallTopZ: 30,
      naturalTrayHeight: 23
    });
  });

  it('a floor spacer adds on top of the height and lifts the floor', () => {
    expect(resolveSlottedTrayHeights({ ...base, floorSpacerHeight: 4 })).toEqual({
      trayHeight: 27,
      lift: 4,
      floorRefZ: 6,
      innerWallTopZ: 27,
      naturalTrayHeight: 23
    });
  });

  it('target and spacer combine (spacer after the target)', () => {
    const h = resolveSlottedTrayHeights({ ...base, targetHeight: 30, floorSpacerHeight: 4 });
    expect(h.trayHeight).toBe(34);
    expect(h.lift).toBe(11);
    expect(h.floorRefZ).toBe(13);
  });
});

describe('createOpenTrayBox / buildSlottedWall', () => {
  it('open box has the outer size and a cavity', () => {
    const box = createOpenTrayBox(30, 40, 20, 2, 2);
    const [min, max] = measureBoundingBox(box);
    expect(max[0] - min[0]).toBeCloseTo(30);
    expect(max[1] - min[1]).toBeCloseTo(40);
    expect(max[2] - min[2]).toBeCloseTo(20);
    expect(measureVolume(box)).toBeLessThan(30 * 40 * 20);
  });

  it('slots remove volume from the wall', () => {
    const wallParams = { innerWallThickness: 2, trayDepth: 40, wallThickness: 2, floorRefZ: 2, wallHeight: 15 };
    const slotParams = { pivotZ: 5, tilt: 0.3, slotWidth: 2, slotBottomZ: -2, slotTopZ: 18 };
    const plain = buildSlottedWall(10, [], wallParams, slotParams);
    const slotted = buildSlottedWall(10, [15, 25], wallParams, slotParams);
    expect(measureVolume(slotted)).toBeLessThan(measureVolume(plain));
  });
});

describe('holderElementStacks', () => {
  const placed: HolderElementPosition = {
    x: 1,
    y: 2,
    z: 3,
    figureDir: -1,
    tilt: 0.2,
    baseRadius: 0,
    baseThickness: 0,
    figureWidth: 25,
    figureLength: 40,
    figureThickness: 1.5
  };

  it('maps each placed element to one holder preview stack with the given label', () => {
    const stacks = holderElementStacks([placed, { ...placed, y: 9 }], 'Tile');
    expect(stacks).toHaveLength(2);
    expect(stacks[0]).toMatchObject({
      customShapeName: 'Tile',
      isHolderElement: true,
      x: 1,
      y: 2,
      z: 3,
      width: 25,
      length: 40,
      thickness: 1.5,
      count: 1,
      holderBaseRadius: 0,
      holderBaseThickness: 0,
      holderFigureDir: -1,
      holderTilt: 0.2
    });
    expect(stacks[1].y).toBe(9);
  });

  it('empty input gives no stacks', () => {
    expect(holderElementStacks([], 'Standee')).toEqual([]);
  });
});
