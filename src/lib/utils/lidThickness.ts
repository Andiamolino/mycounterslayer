/**
 * Pure helper for the "Lid thickness" input of a box.
 * No dependencies; the fallback is passed in so the single default stays in defaultLidParams.
 */

import { applyMinClampedInput, parseMinClampedInput } from './numberInput.js';

// Smallest thickness the input accepts (getLidHeight keeps its own, lower safety limit)
export const MIN_LID_THICKNESS_INPUT = 1.5;

/**
 * Converts the raw input text to a lid thickness in mm.
 * Invalid or empty text gives the fallback, values below the minimum are clamped.
 */
export function parseLidThicknessInput(raw: string, fallback: number): number {
  return parseMinClampedInput(raw, fallback, MIN_LID_THICKNESS_INPUT);
}

/** Reads the lid thickness field, writes the clamped value back into it and returns it. */
export function clampLidThicknessInput(input: HTMLInputElement, fallback: number): number {
  return applyMinClampedInput(input, fallback, MIN_LID_THICKNESS_INPUT);
}
