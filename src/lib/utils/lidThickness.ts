/**
 * Pure helper for the "Lid thickness" input of a box.
 * No dependencies; the fallback is passed in so the single default stays in defaultLidParams.
 */

// Smallest thickness the input accepts (getLidHeight keeps its own, lower safety limit)
export const MIN_LID_THICKNESS_INPUT = 1.5;

/**
 * Converts the raw input text to a lid thickness in mm.
 * Invalid or empty text gives the fallback, values below the minimum are clamped.
 */
export function parseLidThicknessInput(raw: string, fallback: number): number {
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(value, MIN_LID_THICKNESS_INPUT);
}
