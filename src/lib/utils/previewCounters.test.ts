import { describe, expect, it } from 'vitest';
import { isSlottedHolderTray } from '#lib/types/project.js';
import type { Tray } from '#lib/types/project.js';
import { dropChoiceForOtherTray, resolveShowCounters } from './previewCounters.js';

describe('resolveShowCounters', () => {
  it('auto: on for trays with a holder preview (standee, tile), off otherwise', () => {
    expect(resolveShowCounters(null, 'a', true)).toBe(true);
    expect(resolveShowCounters(null, 'b', false)).toBe(false);
    expect(resolveShowCounters(null, undefined, false)).toBe(false);
  });

  it('tray-bound choice wins only for its own tray', () => {
    const off = { trayId: 'a', value: false };
    expect(resolveShowCounters(off, 'a', true)).toBe(false);
    expect(resolveShowCounters(off, 'b', true)).toBe(true);
    const on = { trayId: 'c', value: true };
    expect(resolveShowCounters(on, 'c', false)).toBe(true);
    expect(resolveShowCounters(on, 'd', false)).toBe(false);
  });

  it('global choice (trayId null) applies to every tray', () => {
    expect(resolveShowCounters({ trayId: null, value: true }, 'x', false)).toBe(true);
    expect(resolveShowCounters({ trayId: null, value: false }, 'x', true)).toBe(false);
  });
});

describe('resolveShowCounters for tile trays (E7)', () => {
  const tile = { id: 't', type: 'tile', name: 'T', color: '#fff', params: {} } as unknown as Tray;
  const counter = { id: 'c', type: 'counter', name: 'C', color: '#fff', params: {} } as unknown as Tray;

  it('auto: on for a tile tray, off for a counter tray (via isSlottedHolderTray)', () => {
    expect(resolveShowCounters(null, tile.id, isSlottedHolderTray(tile))).toBe(true);
    expect(resolveShowCounters(null, counter.id, isSlottedHolderTray(counter))).toBe(false);
  });

  it('a manual off choice still wins for the tile tray', () => {
    expect(resolveShowCounters({ trayId: tile.id, value: false }, tile.id, isSlottedHolderTray(tile))).toBe(false);
  });
});

describe('dropChoiceForOtherTray', () => {
  it('keeps a tray-bound choice while the same tray stays selected', () => {
    const choice = { trayId: 'a', value: false };
    expect(dropChoiceForOtherTray(choice, 'a')).toBe(choice);
  });

  it('drops a tray-bound choice when another tray (or none) is selected', () => {
    expect(dropChoiceForOtherTray({ trayId: 'a', value: false }, 'b')).toBeNull();
    expect(dropChoiceForOtherTray({ trayId: 'a', value: false }, undefined)).toBeNull();
  });

  it('never drops the global choice (PDF capture, debug URL)', () => {
    const global = { trayId: null, value: true };
    expect(dropChoiceForOtherTray(global, 'x')).toBe(global);
    expect(dropChoiceForOtherTray(global, undefined)).toBe(global);
  });

  it('returning to the first tray means Auto again', () => {
    const afterSwitch = dropChoiceForOtherTray({ trayId: 'a', value: false }, 'b');
    expect(dropChoiceForOtherTray(afterSwitch, 'a')).toBeNull();
    expect(resolveShowCounters(afterSwitch, 'a', true)).toBe(true);
  });

  it('passes null through', () => {
    expect(dropChoiceForOtherTray(null, 'a')).toBeNull();
  });
});
