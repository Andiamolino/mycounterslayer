import { defaultStandeeTrayParams } from '#lib/models/standeeTray.js';
import { defaultTileTrayParams } from '#lib/models/tileTray.js';
import type { Project, StandeeTray, TileTray } from '#lib/types/project.js';
import { isCounterTray, isStandeeTray, isTileTray } from '#lib/types/project.js';
import { allTrays, makeStandee, makeTile, startProject } from '#lib/utils/partTestFixtures.js';
import { countTraysReferencing } from '#lib/utils/partReferences.js';
import { STANDEE_HOLDER_FIELDS } from '#lib/utils/standeeHolder.js';
import { TILE_HOLDER_FIELDS } from '#lib/utils/tileHolder.js';
import { describe, expect, it } from 'vitest';
import { deleteDefinition, updateHolderDefinition, updateTrayParamsWhere } from './projectEdits.js';

function standeeTray(id: string, standeeId: string): StandeeTray {
  return {
    id,
    type: 'standee',
    name: id,
    color: '#fff',
    rotationOverride: 'auto',
    params: { ...defaultStandeeTrayParams, standeeId }
  };
}
function tileTray(id: string, tileId: string): TileTray {
  return {
    id,
    type: 'tile',
    name: id,
    color: '#fff',
    rotationOverride: 'auto',
    params: { ...defaultTileTrayParams, tileId }
  };
}

// One box tray and one loose tray per kind, each pointing at the second definition of its list
function projectWithHolders(): Project {
  const project = startProject();
  project.standees = [makeStandee({ id: 's1' }), makeStandee({ id: 's2' })];
  project.tiles = [makeTile({ id: 't1' }), makeTile({ id: 't2' })];
  project.layers[0].boxes[0].trays.push(standeeTray('st-box', 's2'), tileTray('ti-box', 't2'));
  project.layers[0].looseTrays.push(standeeTray('st-loose', 's2'), tileTray('ti-loose', 't2'));
  return project;
}

const idsOf = (project: Project, guard: (t: never) => boolean, key: 'standeeId' | 'tileId') =>
  allTrays(project)
    .filter((t) => (guard as (t: unknown) => boolean)(t) && /^(st|ti)-/.test(t.id)) // only the trays built here
    .map((t) => (t.params as unknown as Record<string, string>)[key]);

describe('deleteDefinition', () => {
  it('deletes an unused definition and touches no tray', () => {
    const project = projectWithHolders();
    const before = JSON.stringify(allTrays(project));
    expect(deleteDefinition(project, 'standee', 's1')).toBe(true);
    expect(project.standees.map((s) => s.id)).toEqual(['s2']);
    expect(deleteDefinition(project, 'tile', 't1')).toBe(true);
    expect(project.tiles.map((t) => t.id)).toEqual(['t2']);
    expect(JSON.stringify(allTrays(project))).toBe(before);
  });

  it('a used definition (box tray or loose tray) is not deleted and nothing changes', () => {
    const project = projectWithHolders();
    const before = JSON.stringify(project);
    expect(deleteDefinition(project, 'standee', 's2')).toBe(false);
    expect(deleteDefinition(project, 'tile', 't2')).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('is deletable again once the last tray using it is gone', () => {
    const project = projectWithHolders();
    project.layers[0].boxes[0].trays = project.layers[0].boxes[0].trays.filter((t) => t.id !== 'ti-box');
    expect(deleteDefinition(project, 'tile', 't2')).toBe(false); // loose tray still uses it
    project.layers[0].looseTrays = project.layers[0].looseTrays.filter((t) => t.id !== 'ti-loose');
    expect(deleteDefinition(project, 'tile', 't2')).toBe(true);
  });

  it('counter shapes and card sizes are guarded the same way', () => {
    const project = startProject();
    const used = project.counterShapes.filter((s) => countTraysReferencing(project, 'counterShape', s.id) > 0);
    expect(used.length).toBeGreaterThan(0);
    expect(deleteDefinition(project, 'counterShape', used[0].id)).toBe(false);
    expect(project.counterShapes.some((s) => s.id === used[0].id)).toBe(true);
    const unused = project.cardSizes.find((c) => countTraysReferencing(project, 'cardSize', c.id) === 0);
    if (unused) expect(deleteDefinition(project, 'cardSize', unused.id)).toBe(true);
  });

  it('unknown ID changes nothing', () => {
    const project = projectWithHolders();
    const before = JSON.stringify(project);
    expect(deleteDefinition(project, 'tile', 'nope')).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });
});

describe('updateHolderDefinition', () => {
  it('tile: applies updates and removes invalid optional fields', () => {
    const tiles = [makeTile({ angleToFloor: 60, slotClearance: 0.4 })];
    expect(
      updateHolderDefinition(tiles, 't1', { width: 55, angleToFloor: undefined, slotClearance: -1 }, TILE_HOLDER_FIELDS)
    ).toBe(true);
    expect(tiles[0].width).toBe(55);
    expect('angleToFloor' in tiles[0]).toBe(false);
    expect('slotClearance' in tiles[0]).toBe(false);
  });

  it('tile: clamps valid values and ignores fields not in the update', () => {
    const tiles = [makeTile({ slotClearance: 0.4 })];
    updateHolderDefinition(tiles, 't1', { angleToFloor: 95 }, TILE_HOLDER_FIELDS);
    expect(tiles[0].angleToFloor).toBe(90);
    expect(tiles[0].slotClearance).toBe(0.4);
  });

  it('standee: same behaviour with its own field list', () => {
    const standees = [makeStandee({ barPositionLeft: 20 })];
    updateHolderDefinition(standees, 's1', { barPositionLeft: undefined, barPositionRight: 60 }, STANDEE_HOLDER_FIELDS);
    expect('barPositionLeft' in standees[0]).toBe(false);
    expect(standees[0].barPositionRight).toBe(50);
  });

  it('unknown ID returns false', () => {
    expect(updateHolderDefinition([makeTile()], 'x', { width: 1 }, TILE_HOLDER_FIELDS)).toBe(false);
  });
});

describe('updateTrayParamsWhere', () => {
  it('replaces params of a matching box tray and loose tray', () => {
    const project = projectWithHolders();
    const params = { ...defaultTileTrayParams, tileId: 't1', count: 3 };
    expect(updateTrayParamsWhere(project, 'ti-box', isTileTray, params)).toBe(true);
    expect(updateTrayParamsWhere(project, 'ti-loose', isTileTray, params)).toBe(true);
    expect(
      allTrays(project)
        .filter(isTileTray)
        .map((t) => t.params.count)
    ).toEqual([3, 3]);
  });

  it('does nothing for a tray of another type or an unknown ID', () => {
    const project = projectWithHolders();
    const before = JSON.stringify(project);
    expect(updateTrayParamsWhere(project, 'st-box', isTileTray, { ...defaultTileTrayParams, count: 1 })).toBe(false);
    expect(updateTrayParamsWhere(project, 'nope', isTileTray, { ...defaultTileTrayParams, count: 1 })).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });
});
