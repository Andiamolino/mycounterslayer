import { buildFileName } from '#lib/utils/fileName.js';
import { describe, expect, it } from 'vitest';

describe('buildFileName', () => {
  it('replaces unsafe characters and appends the extension', () => {
    expect(buildFileName('A/B', '.json')).toBe('A-B.json');
  });

  it('does not duplicate an existing extension without suffix', () => {
    expect(buildFileName('Notes.JSON', '.json')).toBe('Notes.json');
  });

  it('appends the suffix before the extension', () => {
    expect(buildFileName('A/B', '.zip', '-stls')).toBe('A-B-stls.zip');
  });

  it('falls back to "untitled" for an empty name', () => {
    expect(buildFileName('  ', '.pdf')).toBe('untitled.pdf');
  });
});
