import { defaultStandeeTrayParams } from '#lib/models/standeeTray.js';
import { defaultTileTrayParams } from '#lib/models/tileTray.js';
import type { Project, StandeeTray, TileTray } from '#lib/types/project.js';
import { isCounterTray, isStandeeTray, isTileTray } from '#lib/types/project.js';
import { allTrays, makeStandee, makeTile, startProject } from '#lib/utils/partTestFixtures.js';
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
  it('standee: re-points only standee trays to the first remaining standee', () => {
    const project = projectWithHolders();
    expect(deleteDefinition(project, 'standee', 's2')).toBe(true);
    expect(project.standees.map((s) => s.id)).toEqual(['s1']);
    expect(idsOf(project, isStandeeTray as never, 'standeeId')).toEqual(['s1', 's1']);
    expect(idsOf(project, isTileTray as never, 'tileId')).toEqual(['t2', 't2']);
    expect(project.tiles).toHaveLength(2);
  });

  it('tile: re-points only tile trays to the first remaining tile', () => {
    const project = projectWithHolders();
    expect(deleteDefinition(project, 'tile', 't2')).toBe(true);
    expect(project.tiles.map((t) => t.id)).toEqual(['t1']);
    expect(idsOf(project, isTileTray as never, 'tileId')).toEqual(['t1', 't1']);
    expect(idsOf(project, isStandeeTray as never, 'standeeId')).toEqual(['s2', 's2']);
  });

  it('deleting the first entry falls back to the new first entry', () => {
    const project = projectWithHolders();
    project.tiles[0].id = 't0';
    project.layers[0].looseTrays.push(tileTray('ti-first', 't0'));
    deleteDefinition(project, 'tile', 't0');
    expect(project.layers[0].looseTrays.find((t) => t.id === 'ti-first')).toMatchObject({ params: { tileId: 't2' } });
  });

  it('empty list gives an empty reference', () => {
    const project = projectWithHolders();
    deleteDefinition(project, 'tile', 't1');
    deleteDefinition(project, 'tile', 't2');
    expect(project.tiles).toEqual([]);
    expect(idsOf(project, isTileTray as never, 'tileId')).toEqual(['', '']);
  });

  it('unknown ID changes nothing', () => {
    const project = projectWithHolders();
    const before = JSON.stringify(project);
    expect(deleteDefinition(project, 'tile', 'nope')).toBe(false);
    expect(JSON.stringify(project)).toBe(before);
  });

  it('leaves other tray types alone', () => {
    const project = projectWithHolders();
    const counters = allTrays(project).filter(isCounterTray);
    const before = JSON.stringify(counters);
    deleteDefinition(project, 'standee', 's2');
    expect(JSON.stringify(allTrays(project).filter(isCounterTray))).toBe(before);
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
