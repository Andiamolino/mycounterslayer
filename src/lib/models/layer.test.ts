import { describe, it, expect } from 'vitest';
import { calculateLayerHeight, getLayerElements } from '#lib/models/layer.js';
import type { Layer, Project } from '#lib/types/project.js';
import { firstBox, firstStandeeTray, layerHeightOptions, startProject } from '#lib/utils/partTestFixtures.js';

// Characterization tests: the expected numbers are the CURRENT behaviour of the code, not a spec.
// They exist so that later height changes (F3.0.x) show up as visible test diffs.
// Start project: bottom layer = Counter box (28.4 incl. lid) + Cup tray (27);
// middle layer = card trays (38.08 / 27 / 52); top layer = card well (20) + standee tray (25.5).

function heightOf(layer: Layer, project: Project) {
  return calculateLayerHeight(layer, layerHeightOptions(project));
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
    expect(heightOf(layer, project)).toBeCloseTo(28.4, 6);
  });

  it('loose trays only: tallest tray height', () => {
    const project = startProject();
    const layer = project.layers[1];
    expect(layer.boxes).toHaveLength(0);
    expect(heightOf(layer, project)).toBe(52);
  });

  it('mixed: box taller than the loose tray wins (28.4 vs 27)', () => {
    const project = startProject();
    expect(heightOf(project.layers[0], project)).toBeCloseTo(28.4, 6);
  });

  it('mixed: loose tray taller than the box wins (27 vs 16)', () => {
    const project = startProject();
    firstBox(project).customBoxHeight = 10; // 10 + lid 6 = 16
    expect(heightOf(project.layers[0], project)).toBe(27);
  });

  it('customBoxHeight raises the layer height by box height + lid', () => {
    const project = startProject();
    firstBox(project).customBoxHeight = 40;
    expect(heightOf(project.layers[0], project)).toBe(46);
  });

  describe('standee tray (documents the known GUI/worker deviation)', () => {
    function standeeLayer() {
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
      const layer: Layer = { ...project.layers[2], boxes: [], looseTrays: [tray] };
      return { project, layer };
    }

    it('start project: standee tray height is the same with and without standees', () => {
      const project = startProject();
      const layer = project.layers[2];
      const without = calculateLayerHeight(layer, { ...layerHeightOptions(project), standees: undefined });
      expect(heightOf(layer, project)).toBe(25.5);
      expect(without).toBe(25.5);
    });

    it('with the standees list the custom standee is used (worker path)', () => {
      const { project, layer } = standeeLayer();
      expect(heightOf(layer, project)).toBe(43);
    });

    it('without the standees list the default standee is used (GUI path, wrong height)', () => {
      const { project, layer } = standeeLayer();
      const without = calculateLayerHeight(layer, { ...layerHeightOptions(project), standees: undefined });
      expect(without).toBe(25.5);
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
