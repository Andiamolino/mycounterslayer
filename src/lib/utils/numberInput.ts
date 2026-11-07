/**
 * Pure helpers for numeric text inputs (decimal comma and decimal point both accepted).
 * Shared by all number fields so parsing and clamping exist once.
 */

export interface DecimalInputOptions {
  min?: number;
  max?: number;
  /** Round to an integer (Math.round) after parsing, before clamping to min/max. */
  int?: boolean;
}

// Optional sign, digits with at most one separator (. or ,); no exponent
const DECIMAL_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/**
 * Parses text with a decimal comma or point ("2,5", "2.5", " 2,5 ") to a number.
 * Returns null for empty or invalid text (letters, exponent, two separators).
 */
export function parseDecimalInput(raw: string): number | null {
  const text = raw.trim();
  if (!DECIMAL_PATTERN.test(text)) return null;
  const value = parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function applyOptions(value: number, opts: DecimalInputOptions): number {
  let result = opts.int ? Math.round(value) : value;
  if (opts.min !== undefined) result = Math.max(result, opts.min);
  if (opts.max !== undefined) result = Math.min(result, opts.max);
  return result;
}

/**
 * Reads a number field: parses, rounds (int) and clamps (min/max), writes the result back into the
 * field (dot notation, shown even if the stored value does not change) and returns it.
 * Empty or invalid text resets the field to `current` and returns `current`.
 */
export function commitDecimalInput(input: HTMLInputElement, current: number, opts: DecimalInputOptions = {}): number {
  const parsed = parseDecimalInput(input.value);
  const result = parsed === null ? current : applyOptions(parsed, opts);
  input.value = String(result);
  return result;
}

/**
 * Like commitDecimalInput, but empty text means "auto" (null) and clears the field.
 * Invalid text keeps `current` and resets the field to it.
 */
export function commitOptionalDecimalInput(
  input: HTMLInputElement,
  current: number | null,
  opts: DecimalInputOptions = {}
): number | null {
  if (input.value.trim() === '') {
    input.value = '';
    return null;
  }
  const parsed = parseDecimalInput(input.value);
  const result = parsed === null ? current : applyOptions(parsed, opts);
  input.value = result === null ? '' : String(result);
  return result;
}

/**
 * Converts raw input text to a number: invalid or empty text gives the fallback,
 * values below min are clamped to min.
 */
export function parseMinClampedInput(raw: string, fallback: number, min: number): number {
  const value = parseDecimalInput(raw);
  return value === null ? fallback : applyOptions(value, { min });
}

/**
 * Reads a number input, clamps it to min, writes the result back into the field (so it is shown
 * even if the stored value does not change) and returns it.
 */
export function applyMinClampedInput(input: HTMLInputElement, fallback: number, min: number): number {
  return commitDecimalInput(input, fallback, { min });
}
