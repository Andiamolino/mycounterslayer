import { describe, it, expect } from 'vitest';
import { applyMinClampedInput, parseMinClampedInput } from './numberInput.js';

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
  it('does not accept a decimal comma as number (parseFloat stops at the comma)', () => {
    expect(parseMinClampedInput('2,5', 2, 1.5)).toBe(2);
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
