import jscad from '@jscad/modeling';
import type { Geom3 } from '@jscad/modeling/src/geometries/types';

const { toPolygons } = jscad.geometries.geom3;

/**
 * Number of separate bodies in a solid: polygons are connected when they share a vertex. Two
 * overlapping bodies that were not merged by a boolean union would show up as extra components
 * only if they do not touch at a vertex, so this is a lower bound for "not unioned" - it reliably
 * detects fully separate bodies, which is what a slicer reports as disconnected.
 */
export function countConnectedBodies(geometry: Geom3, precision = 1e-4): number {
  const polygons = toPolygons(geometry);
  const parent = polygons.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const firstPolygonAt = new Map<string, number>();
  const key = (v: number[]) => v.map((c) => Math.round(c / precision)).join(',');
  polygons.forEach((poly, i) => {
    for (const v of poly.vertices) {
      const k = key(v);
      const other = firstPolygonAt.get(k);
      if (other === undefined) firstPolygonAt.set(k, i);
      else parent[find(i)] = find(other);
    }
  });
  return new Set(polygons.map((_, i) => find(i))).size;
}
