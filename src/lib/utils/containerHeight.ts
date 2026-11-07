/**
 * Pure helpers for the optional game container height (globalSettings.gameContainerHeight).
 * No model imports.
 */

// Smallest height the input accepts (mm)
export const MIN_CONTAINER_HEIGHT_INPUT = 1;

/** Returns the value if it is a finite number > 0, otherwise undefined (= no height check). */
export function normalizeContainerHeight(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

// Tolerance for float noise when comparing heights (mm); "equal" counts as ok
export const HEIGHT_EPSILON = 0.01;

export type ContainerHeightStatus = 'unset' | 'ok' | 'lidLift' | 'tooTall';

export interface ContainerHeightCheck {
  status: ContainerHeightStatus;
  totalHeight: number;
  containerHeight?: number;
  /** ok: remaining space (>= 0) */
  free?: number;
  /** lidLift: how far the lid is lifted (raw value, display it with formatMmCeil) */
  liftBy?: number;
  /** tooTall: excess beyond container + lift allowance (raw value, display it with formatMmCeil) */
  overBy?: number;
}

/**
 * Compares the summed layer height with the container height.
 * unset: no container height; ok: fits; lidLift: fits only if the lid lifts (<= lidLiftAllowance); tooTall: does not fit.
 */
export function evaluateContainerHeight(params: {
  totalHeight: number;
  containerHeight?: number;
  lidLiftAllowance?: number;
}): ContainerHeightCheck {
  const { totalHeight } = params;
  const containerHeight = normalizeContainerHeight(params.containerHeight);
  if (containerHeight === undefined) return { status: 'unset', totalHeight };

  const lift =
    typeof params.lidLiftAllowance === 'number' && Number.isFinite(params.lidLiftAllowance) && params.lidLiftAllowance > 0
      ? params.lidLiftAllowance
      : 0;
  const excess = totalHeight - containerHeight;

  if (excess <= HEIGHT_EPSILON) {
    return { status: 'ok', totalHeight, containerHeight, free: Math.max(0, -excess) };
  }
  if (excess <= lift + HEIGHT_EPSILON) {
    return { status: 'lidLift', totalHeight, containerHeight, liftBy: excess };
  }
  return { status: 'tooTall', totalHeight, containerHeight, overBy: excess - lift };
}

// Normal rounding to 0.1 mm, avoids "-0.0"
function toTenths(value: number): number {
  return Math.round(value * 10) / 10 + 0;
}

/** Formats a height in mm with one decimal and a dot, e.g. "28.4 mm" (normal rounding, for sums). */
export function formatMm(value: number): string {
  return `${toTenths(value).toFixed(1)} mm`;
}

/**
 * Like formatMm, but rounds UP to 0.1 mm so that a real excess is never shown as "0.0 mm" (E6 = A).
 * For overBy/liftBy. The small subtraction keeps float noise (0.30000000000000004) from jumping a tenth.
 */
export function formatMmCeil(value: number): string {
  return `${(Math.ceil(value * 10 - 1e-9) / 10 + 0).toFixed(1)} mm`;
}
