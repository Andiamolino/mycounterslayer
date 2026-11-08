import { describe, expect, it } from 'vitest';
import {
  normalizeAngleToFloor,
  normalizeBarPosition,
  normalizeSlotClearance,
  resolveBarCenters,
  resolveBarLayout
} from './holderSettings.js';

describe('normalizers', () => {
  it.each([
    [70, 70],
    [45, 45],
    [90, 90],
    [30, 45],
    [100, 90],
    ['70', undefined],
    [NaN, undefined],
    [Infinity, undefined],
    [-1, 45],
    [null, undefined]
  ])('angleToFloor %s -> %s', (input, expected) => {
    expect(normalizeAngleToFloor(input)).toBe(expected);
  });

  it.each([
    [1, 1],
    [0, 0],
    [2.5, 2.5],
    [-1, undefined],
    ['1', undefined],
    [NaN, undefined],
    [null, undefined]
  ])('slotClearance %s -> %s', (input, expected) => {
    expect(normalizeSlotClearance(input)).toBe(expected);
  });

  it.each([
    [25, 25],
    [0, 0],
    [50, 50],
    [-5, 0],
    [60, 50],
    ['25', undefined],
    [NaN, undefined],
    [null, undefined]
  ])('barPosition %s -> %s', (input, expected) => {
    expect(normalizeBarPosition(input)).toBe(expected);
  });
});

describe('resolveBarCenters', () => {
  const holder = (barPositionLeft: number, barPositionRight: number) => ({ barPositionLeft, barPositionRight });

  it('default 25 % / 25 % on W=100: centres 25 and 75', () => {
    expect(resolveBarCenters(100, 2, holder(25, 25))).toEqual({ left: 25, right: 75 });
  });

  it('0 %: bar centres move in so the bars do not protrude', () => {
    expect(resolveBarCenters(100, 2, holder(0, 0))).toEqual({ left: 1, right: 99 });
  });

  it('50 % / 50 %: flush in the middle, gap 0', () => {
    expect(resolveBarCenters(100, 2, holder(50, 50))).toEqual({ left: 49, right: 51 });
  });

  it('W=1 mm: no NaN, not negative, inside [0, W]', () => {
    for (const [l, r] of [
      [25, 25],
      [0, 0],
      [50, 50]
    ]) {
      const { left, right } = resolveBarCenters(1, 2, holder(l, r));
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(1);
      expect(right).toBeGreaterThanOrEqual(left);
    }
  });

  it('resolveBarLayout reports gap and limited', () => {
    expect(resolveBarLayout(100, 2, holder(25, 25))).toEqual({ left: 25, right: 75, gap: 48, limited: false });
    expect(resolveBarLayout(100, 2, holder(0, 0))).toEqual({ left: 1, right: 99, gap: 96, limited: true });
    expect(resolveBarLayout(100, 2, holder(50, 50))).toEqual({ left: 49, right: 51, gap: 0, limited: true });
    expect(resolveBarLayout(1, 2, holder(25, 25)).gap).toBe(0);
  });

  it('W < 2*iw: bars flush in the middle', () => {
    expect(resolveBarCenters(3, 2, holder(25, 25))).toEqual({ left: 0.5, right: 2.5 });
  });

  it.each([
    [NaN, 2],
    [0, 2],
    [-5, 2],
    [100, NaN]
  ])('degenerate input W=%s iw=%s is finite', (w, iw) => {
    const { left, right } = resolveBarCenters(w, iw, holder(25, 25));
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(right)).toBe(true);
    expect(left).toBeGreaterThanOrEqual(0);
  });
});
