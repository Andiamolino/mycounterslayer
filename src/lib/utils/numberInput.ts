/**
 * Pure helper for numeric inputs with a lower bound.
 * Shared by the thickness fields so the clamp rule exists once.
 */

/**
 * Converts raw input text to a number: invalid or empty text gives the fallback,
 * values below min are clamped to min.
 */
export function parseMinClampedInput(raw: string, fallback: number, min: number): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(value, min);
}

/**
 * Reads a number input, clamps it to min, writes the result back into the field (so it is shown
 * even if the stored value does not change) and returns it.
 */
export function applyMinClampedInput(input: HTMLInputElement, fallback: number, min: number): number {
  const value = parseMinClampedInput(input.value, fallback, min);
  input.value = String(value);
  return value;
}
