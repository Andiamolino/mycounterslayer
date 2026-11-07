import { describe, it, expect } from 'vitest';
import {
  applyMinClampedInput,
  commitDecimalInput,
  commitOptionalDecimalInput,
  parseDecimalInput,
  parseMinClampedInput,
} from './numberInput.js';

describe('parseMinClampedInput', () => {
  it('keeps values at or above min', () => {
    expect(parseMinClampedInput('3', 2, 1.5)).toBe(3);
    expect(parseMinClampedInput('1.5', 2, 1.5)).toBe(1.5);
  });
  it('clamps values below min', () => {
    expect(parseMinClampedInput('1', 2, 1.5)).toBe(1.5);
    expect(parseMinClampedInput('-4', 2, 1.5)).toBe(1.5);
  });
  it('gives the fallback for empty or invalid text', () => {
    expect(parseMinClampedInput('', 2, 1.5)).toBe(2);
    expect(parseMinClampedInput('abc', 2, 1.5)).toBe(2);
    expect(parseMinClampedInput('NaN', 2, 1.5)).toBe(2);
  });
  it('accepts a decimal comma', () => {
    expect(parseMinClampedInput('2,5', 2, 1.5)).toBe(2.5);
    expect(parseMinClampedInput('1,2', 2, 1.5)).toBe(1.5);
  });
});

describe('applyMinClampedInput', () => {
  const fieldWith = (value: string) => ({ value }) as HTMLInputElement;

  it('writes the clamped value back and returns it', () => {
    const input = fieldWith('1');
    expect(applyMinClampedInput(input, 2, 1.5)).toBe(1.5);
    expect(input.value).toBe('1.5');
  });
  it('writes the fallback back for empty or invalid text', () => {
    const input = fieldWith('');
    expect(applyMinClampedInput(input, 4, 1.5)).toBe(4);
    expect(input.value).toBe('4');
  });
  it('keeps a valid value', () => {
    const input = fieldWith('3');
    expect(applyMinClampedInput(input, 2, 1.5)).toBe(3);
    expect(input.value).toBe('3');
  });
});

const fieldWith = (value: string) => ({ value }) as HTMLInputElement;

describe('parseDecimalInput', () => {
  it('accepts comma and point, with surrounding spaces', () => {
    expect(parseDecimalInput('2,5')).toBe(2.5);
    expect(parseDecimalInput('2.5')).toBe(2.5);
    expect(parseDecimalInput(' 2,5 ')).toBe(2.5);
  });
  it('accepts integers and negative numbers', () => {
    expect(parseDecimalInput('2')).toBe(2);
    expect(parseDecimalInput('-1')).toBe(-1);
  });
  it('gives null for empty or invalid text', () => {
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('2,5,1')).toBeNull();
    expect(parseDecimalInput('1e3')).toBeNull();
    expect(parseDecimalInput('2.5.1')).toBeNull();
  });
});

describe('commitDecimalInput', () => {
  it('parses a comma and writes the value with a point', () => {
    const input = fieldWith('2,5');
    expect(commitDecimalInput(input, 1)).toBe(2.5);
    expect(input.value).toBe('2.5');
  });
  it('clamps to min and max', () => {
    const low = fieldWith('0');
    expect(commitDecimalInput(low, 5, { min: 1, max: 10 })).toBe(1);
    expect(low.value).toBe('1');
    const high = fieldWith('99');
    expect(commitDecimalInput(high, 5, { min: 1, max: 10 })).toBe(10);
    expect(high.value).toBe('10');
  });
  it('rounds with int', () => {
    const input = fieldWith('3,6');
    expect(commitDecimalInput(input, 1, { int: true })).toBe(4);
    expect(input.value).toBe('4');
  });
  it('resets to the current value for empty or invalid text', () => {
    const input = fieldWith('abc');
    expect(commitDecimalInput(input, 7)).toBe(7);
    expect(input.value).toBe('7');
    const empty = fieldWith('');
    expect(commitDecimalInput(empty, 7)).toBe(7);
    expect(empty.value).toBe('7');
  });
});

describe('commitOptionalDecimalInput', () => {
  it('gives null for empty text and clears the field', () => {
    const input = fieldWith('  ');
    expect(commitOptionalDecimalInput(input, 5)).toBeNull();
    expect(input.value).toBe('');
  });
  it('parses and clamps like commitDecimalInput', () => {
    const input = fieldWith('0,5');
    expect(commitOptionalDecimalInput(input, null, { min: 1 })).toBe(1);
    expect(input.value).toBe('1');
  });
  it('keeps current for invalid text and resets the field', () => {
    const input = fieldWith('abc');
    expect(commitOptionalDecimalInput(input, 5)).toBe(5);
    expect(input.value).toBe('5');
    const auto = fieldWith('abc');
    expect(commitOptionalDecimalInput(auto, null)).toBeNull();
    expect(auto.value).toBe('');
  });
});
