import { describe, it, expect } from 'vitest';
import { calculateLayerHeight, calculateTotalLayerHeight, getHeightDefs, getLayerElements, getLayoutDefs } from '#lib/models/layer.js';
import type { Layer, Project } from '#lib/types/project.js';
import { firstBox, firstStandeeTray, startProject } from '#lib/utils/partTestFixtures.js';

// Characterization tests: the expected numbers are the CURRENT behaviour of the code, not a spec.
// They exist so that later height changes (F3.0.x) show up as visible test diffs.
// F3.0.5 (E2, changed on purpose): lid overshoot = thickness 2 (was 2 * wall = 6). Old -> new:
// box exterior 28.4 -> 24.4; "boxes only" 28.4 -> 24.4; "mixed, box taller" 28.4 -> 27 (box 24.4 now loses to cup tray 27);
// "customBoxHeight 10 + lid" 16 -> 12 (layer still 27); "customBoxHeight 40" layer 46 -> 42.
// Start project: bottom layer = Counter box (24.4 incl. lid) + Cup tray (27);
// middle layer = card trays (38.08 / 27 / 52); top layer = card well (20) + standee tray (25.5).

function heightOf(layer: Layer, project: Project) {
  return calculateLayerHeight(layer, getHeightDefs(project));
}

describe('calculateLayerHeight (characterization)', () => {
  it('is 0 for an empty layer', () => {
    const project = startProject();
    const layer: Layer = { ...project.layers[0], boxes: [], looseTrays: [] };
    expect(heightOf(layer, project)).toBe(0);
  });

  it('is 0 for a layer whose only box has no trays', () => {
    const project = startProject();
    const box = firstBox(project);
    box.trays = [];
    expect(heightOf({ ...project.layers[0], boxes: [box], looseTrays: [] }, project)).toBe(0);
  });

  it('boxes only: exterior height of the box incl. lid', () => {
    const project = startProject();
    const layer: Layer = { ...project.layers[0], looseTrays: [] };
    expect(heightOf(layer, project)).toBeCloseTo(24.4, 6);
  });

  it('loose trays only: tallest tray height', () => {
    const project = startProject();
    const layer = project.layers[1];
    expect(layer.boxes).toHaveLength(0);
    expect(heightOf(layer, project)).toBe(52);
  });

  it('mixed: loose tray taller than the box wins (27 vs 24.4)', () => {
    const project = startProject();
    expect(heightOf(project.layers[0], project)).toBe(27);
  });

  it('mixed: loose tray taller than the box wins (27 vs 12)', () => {
    const project = startProject();
    firstBox(project).customBoxHeight = 10; // 10 + lid 2 = 12
    expect(heightOf(project.layers[0], project)).toBe(27);
  });

  it('customBoxHeight raises the layer height by box height + lid', () => {
    const project = startProject();
    firstBox(project).customBoxHeight = 40;
    expect(heightOf(project.layers[0], project)).toBe(42);
  });

  // F3.0.4 (changed on purpose): this block used to document the GUI/worker deviation (characterization).
  // `standees` is now a required option, so the GUI path (project.standees) and the worker path agree.
  describe('standee tray (regression: GUI path = worker path)', () => {
    function standeeProject() {
      const project = startProject();
      project.standees.push({
        id: 'wide',
        name: 'Wide',
        baseRadius: 9,
        baseThickness: 3,
        standeeHeight: 40,
        standeeWidth: 60,
        standeeThickness: 1.5
      });
      const tray = firstStandeeTray(project);
      if (tray.type !== 'standee') throw new Error('expected standee tray');
      tray.params.standeeId = 'wide';
      return { project, tray };
    }

    it('start project: standee tray layer height is unchanged (25.5)', () => {
      const project = startProject();
      expect(heightOf(project.layers[2], project)).toBe(25.5);
    });

    it('loose standee tray uses the custom standee (alt: 25.5 without standees -> neu: 43)', () => {
      const { project, tray } = standeeProject();
      const layer: Layer = { ...project.layers[2], boxes: [], looseTrays: [tray] };
      expect(heightOf(layer, project)).toBe(43);
    });

    it('standee tray inside a box uses the custom standee and raises the box', () => {
      const { project, tray } = standeeProject();
      const box = { ...firstBox(project), trays: [tray] };
      const layer: Layer = { ...project.layers[0], boxes: [box], looseTrays: [] };
      const withCustom = heightOf(layer, project);
      const withDefault = calculateLayerHeight(layer, { ...getHeightDefs(project), standees: [] });
      expect(withCustom).toBeGreaterThan(withDefault);
    });
  });
});

describe('getLayerElements', () => {
  it('is empty for an empty layer', () => {
    const project = startProject();
    expect(getLayerElements({ ...project.layers[0], boxes: [], looseTrays: [] })).toEqual([]);
  });

  it('mixed layer: boxes first, then loose trays, with ids and references', () => {
    const project = startProject();
    const layer = project.layers[0];
    const elements = getLayerElements(layer);
    expect(elements.map((e) => e.kind)).toEqual([
      ...layer.boxes.map(() => 'box'),
      ...layer.looseTrays.map(() => 'looseTray')
    ]);
    expect(elements.map((e) => e.id)).toEqual([...layer.boxes.map((b) => b.id), ...layer.looseTrays.map((t) => t.id)]);
    expect(elements.length).toBeGreaterThan(1);
    const first = elements[0];
    if (first.kind !== 'box') throw new Error('expected box first');
    expect(first.box).toBe(layer.boxes[0]);
  });

  it('keeps the order of boxes and loose trays', () => {
    const project = startProject();
    const layer = project.layers[0];
    const reversed: Layer = { ...layer, boxes: [...layer.boxes].reverse(), looseTrays: [...layer.looseTrays].reverse() };
    expect(getLayerElements(reversed).map((e) => e.id)).toEqual([
      ...reversed.boxes.map((b) => b.id),
      ...reversed.looseTrays.map((t) => t.id)
    ]);
  });

  it('loose trays only', () => {
    const project = startProject();
    const layer = project.layers[1];
    const elements = getLayerElements(layer);
    expect(elements.every((e) => e.kind === 'looseTray')).toBe(true);
    expect(elements.map((e) => e.id)).toEqual(layer.looseTrays.map((t) => t.id));
  });
});

describe('getHeightDefs / getLayoutDefs', () => {
  it('keeps the project lists by reference', () => {
    const project = startProject();
    const defs = getHeightDefs(project);
    expect(defs.cardSizes).toBe(project.cardSizes);
    expect(defs.counterShapes).toBe(project.counterShapes);
    expect(defs.standees).toBe(project.standees);
  });

  it('turns missing lists into empty arrays', () => {
    expect(getHeightDefs({})).toEqual({ cardSizes: [], counterShapes: [], standees: [] });
    expect(getLayoutDefs({})).toEqual({ cardSizes: [], counterShapes: [] });
  });

  it('getLayoutDefs has no standees and keeps references', () => {
    const project = startProject();
    const defs = getLayoutDefs(project);
    expect(defs.cardSizes).toBe(project.cardSizes);
    expect(defs.counterShapes).toBe(project.counterShapes);
    expect('standees' in defs).toBe(false);
  });
});

describe('calculateTotalLayerHeight', () => {
  it('is 0 for no layers', () => {
    const project = startProject();
    expect(calculateTotalLayerHeight([], getHeightDefs(project))).toBe(0);
  });

  it('start project: sum of the three known layer heights (27 + 52 + 25.5)', () => {
    const project = startProject();
    expect(calculateTotalLayerHeight(project.layers, getHeightDefs(project))).toBeCloseTo(104.5, 6);
  });

  it('counts the standee layer with project.standees (custom standee raises the sum)', () => {
    const project = startProject();
    project.standees.push({
      id: 'wide',
      name: 'Wide',
      baseRadius: 9,
      baseThickness: 3,
      standeeHeight: 40,
      standeeWidth: 60,
      standeeThickness: 1.5
    });
    const tray = firstStandeeTray(project);
    if (tray.type !== 'standee') throw new Error('expected standee tray');
    tray.params.standeeId = 'wide';
    // standee layer 25.5 -> 43 (see calculateLayerHeight tests): 27 + 52 + 43
    expect(calculateTotalLayerHeight(project.layers, getHeightDefs(project))).toBeCloseTo(122, 6);
  });
});
