import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { subtract, union } = jscad.booleans;
const { translate, scale, mirrorY } = jscad.transforms;
const { vectorText } = jscad.text;
const { path2 } = jscad.geometries;
const { expand } = jscad.expansions;
const { extrudeLinear } = jscad.extrusions;

/**
 * Engraves the tray name (upper case, centred, scaled down to fit) into the bottom of the tray.
 * An empty or whitespace-only name returns the tray unchanged.
 */
export function embossTrayName(
  tray: Geom3,
  trayName: string | undefined,
  trayWidth: number,
  trayDepth: number,
  wallThickness: number
): Geom3 {
  if (!trayName || trayName.trim().length === 0) return tray;

  const textDepth = 0.6;
  const strokeWidth = 1.2;
  const textHeightParam = 6;
  const margin = wallThickness * 2;

  const textSegments = vectorText({ height: textHeightParam, align: 'center' }, trayName.trim().toUpperCase());
  if (textSegments.length === 0) return tray;

  const textShapes: ReturnType<typeof extrudeLinear>[] = [];
  for (const segment of textSegments) {
    if (segment.length >= 2) {
      const pathObj = path2.fromPoints({ closed: false }, segment);
      const expanded = expand({ delta: strokeWidth / 2, corners: 'round', segments: 32 }, pathObj);
      const extruded = extrudeLinear({ height: textDepth + 0.1 }, expanded);
      textShapes.push(extruded);
    }
  }
  if (textShapes.length === 0) return tray;

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  for (const segment of textSegments) {
    for (const point of segment) {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  const textWidthCalc = maxX - minX + strokeWidth;
  const textHeightY = maxY - minY + strokeWidth;

  const availableWidth = trayWidth - margin * 2;
  const availableDepth = trayDepth - margin * 2;
  const scaleX = Math.min(1, availableWidth / textWidthCalc);
  const scaleY = Math.min(1, availableDepth / textHeightY);
  const textScale = Math.min(scaleX, scaleY);

  const centerX = trayWidth / 2;
  const centerY = trayDepth / 2;
  const textCenterX = (minX + maxX) / 2;
  const textCenterY = (minY + maxY) / 2;

  let combinedText = union(...textShapes);
  combinedText = mirrorY(combinedText);

  const positionedText = translate(
    [centerX - textCenterX * textScale, centerY + textCenterY * textScale, -0.1],
    scale([textScale, textScale, 1], combinedText)
  );
  return subtract(tray, positionedText);
}
