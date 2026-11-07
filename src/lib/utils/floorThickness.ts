/**
 * Helpers for the "Floor" inputs of boxes and trays (same minimum everywhere).
 * Only used on user input; loading, migration and import leave stored values untouched.
 */
import { applyMinClampedInput, parseMinClampedInput } from './numberInput.js';

// Smallest floor thickness the inputs accept
export const MIN_FLOOR_THICKNESS_INPUT = 1.5;

// Existing default floor thickness, used when the input is empty or invalid
export const DEFAULT_FLOOR_THICKNESS_INPUT = 2.0;

export function parseFloorThicknessInput(raw: string, fallback: number = DEFAULT_FLOOR_THICKNESS_INPUT): number {
  return parseMinClampedInput(raw, fallback, MIN_FLOOR_THICKNESS_INPUT);
}

/**
 * Reads a floor input and writes the clamped value back into the field.
 * Empty or invalid text keeps the current value (fallback); if that is not a finite number either,
 * the default applies.
 */
export function clampFloorInput(input: HTMLInputElement, fallback: number = DEFAULT_FLOOR_THICKNESS_INPUT): number {
  const safeFallback = Number.isFinite(fallback) ? fallback : DEFAULT_FLOOR_THICKNESS_INPUT;
  return applyMinClampedInput(input, safeFallback, MIN_FLOOR_THICKNESS_INPUT);
}
