import { describe, expect, it } from 'vitest';
import { dropChoiceForOtherTray, resolveShowCounters } from './previewCounters.js';

describe('resolveShowCounters', () => {
  it('auto: on for standee trays, off otherwise', () => {
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
