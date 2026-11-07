import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FLOOR_THICKNESS_INPUT,
  MIN_FLOOR_THICKNESS_INPUT,
  clampFloorInput,
  parseFloorThicknessInput
} from './floorThickness.js';

describe('parseFloorThicknessInput', () => {
  it('uses 1.5 as minimum and 2 as default fallback', () => {
    expect(MIN_FLOOR_THICKNESS_INPUT).toBe(1.5);
    expect(parseFloorThicknessInput('1')).toBe(1.5);
    expect(parseFloorThicknessInput('0')).toBe(1.5);
    expect(parseFloorThicknessInput('')).toBe(DEFAULT_FLOOR_THICKNESS_INPUT);
    expect(parseFloorThicknessInput('x')).toBe(2);
    expect(parseFloorThicknessInput('1.5')).toBe(1.5);
    expect(parseFloorThicknessInput('2.5')).toBe(2.5);
  });
});

describe('clampFloorInput', () => {
  const fieldWith = (value: string) => ({ value }) as HTMLInputElement;

  it('writes the clamped value back and returns it', () => {
    const input = fieldWith('1');
    expect(clampFloorInput(input)).toBe(1.5);
    expect(input.value).toBe('1.5');
  });
  it('empty or invalid text keeps the passed current value (e.g. card draw default 4)', () => {
    const input = fieldWith('');
    expect(clampFloorInput(input, 4)).toBe(4);
    expect(input.value).toBe('4');
    expect(clampFloorInput(fieldWith('abc'), 3)).toBe(3);
  });
  it('a current value below the minimum is kept as is when the field is empty', () => {
    expect(clampFloorInput(fieldWith(''), 1)).toBe(1);
  });
  it('uses the default if the current value is NaN or undefined', () => {
    expect(clampFloorInput(fieldWith(''), NaN)).toBe(DEFAULT_FLOOR_THICKNESS_INPUT);
    expect(clampFloorInput(fieldWith(''), undefined)).toBe(DEFAULT_FLOOR_THICKNESS_INPUT);
  });
});
