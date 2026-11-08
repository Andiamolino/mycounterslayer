import { afterEach, describe, expect, it, vi } from 'vitest';
import { findDefinition } from './findDefinition.js';

interface Def {
  id: string;
  name: string;
}

const list: Def[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' }
];
const fallback: Def = { id: 'default', name: 'Default' };
const options = (nameFallback: boolean) => ({ label: 'Thing', nameFallback, fallback });

afterEach(() => vi.restoreAllMocks());

describe('findDefinition', () => {
  it('finds by ID without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(findDefinition(list, 'b', options(true))).toBe(list[1]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('matches by name only with nameFallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(findDefinition(list, 'Beta', options(true))).toBe(list[1]);
    expect(warn).toHaveBeenCalledWith('Thing ID "Beta" not found, matched by name instead');
    expect(findDefinition(list, 'Beta', options(false))).toBe(list[0]);
  });

  it('unknown ID gives the first entry and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(findDefinition(list, 'x', options(true))).toBe(list[0]);
    expect(warn).toHaveBeenCalledWith('Thing "x" not found by ID or name, using first available thing');
    expect(findDefinition(list, 'x', options(false))).toBe(list[0]);
    expect(warn).toHaveBeenLastCalledWith('Thing "x" not found by ID, using first available thing');
  });

  it('empty list gives the fallback without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(findDefinition([], 'x', options(true))).toBe(fallback);
    expect(warn).not.toHaveBeenCalled();
  });
});
