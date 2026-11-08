import { defaultTileTrayParams } from '#lib/models/tileTray.js';
import { DEFAULT_TILES } from '#lib/stores/project.svelte.js';
import { makeTile, startProject, viaFile } from '#lib/utils/partTestFixtures.js';
import { migrateProjectData } from '#lib/utils/storage.js';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw project JSON
function raw(): any {
  return viaFile(startProject());
}

describe('migrateProjectData: tiles (structure normalization)', () => {
  it('default tile is the 50 x 50 x 2 mm "Standard" tile', () => {
    expect(DEFAULT_TILES).toEqual([{ id: 'tile-standard', name: 'Standard', width: 50, height: 50, thickness: 2 }]);
  });

  it('start project JSON already contains the default tile', () => {
    expect(startProject().tiles).toEqual(DEFAULT_TILES);
  });

  it('project without tiles gets the default tile', () => {
    const data = raw();
    delete data.tiles;
    expect(migrateProjectData(data).tiles).toEqual(DEFAULT_TILES);
  });

  it('non-array tiles count as missing', () => {
    const data = raw();
    data.tiles = 'x';
    expect(migrateProjectData(data).tiles).toEqual(DEFAULT_TILES);
  });

  it('existing tiles stay JSON-identical and the default is appended when missing', () => {
    const data = raw();
    const own = makeTile({ id: 'mine', angleToFloor: 60, barPositionLeft: 20 });
    data.tiles = [own];
    expect(migrateProjectData(data).tiles).toEqual([own, ...DEFAULT_TILES]);
  });

  it('project with the default tile is not changed', () => {
    const data = raw();
    const migrated = migrateProjectData(viaFile(data));
    expect(JSON.stringify(migrated.tiles)).toBe(JSON.stringify(data.tiles));
  });

  it('adds a missing ID and drops invalid holder fields', () => {
    const data = raw();
    data.tiles = [{ name: 'No ID', width: 10, height: 10, thickness: 1, angleToFloor: 'x', slotClearance: 0.3 }];
    const tile = migrateProjectData(data).tiles.find((t) => t.name === 'No ID')!;
    expect(tile.id).toBeTruthy();
    expect('angleToFloor' in tile).toBe(false);
    expect(tile.slotClearance).toBe(0.3);
  });

  it('legacy (pre-layers) projects get tiles too', () => {
    const legacy = { boxes: [], counterShapes: [], cardSizes: [], selectedBoxId: null, selectedTrayId: null };
    expect(migrateProjectData(legacy as never).tiles).toEqual(DEFAULT_TILES);
  });
});

describe('migrateProjectData: tile tray', () => {
  it('fills missing params with the tile tray defaults', () => {
    const data = raw();
    data.layers[0].looseTrays.push({
      id: 'tt',
      type: 'tile',
      name: 'T',
      params: { tileId: 'tile-standard', count: 5 }
    });
    const tray = migrateProjectData(data).layers[0].looseTrays.find((t) => t.id === 'tt')!;
    expect(tray.type).toBe('tile');
    expect(tray.params).toEqual({ ...defaultTileTrayParams, tileId: 'tile-standard', count: 5 });
    expect(tray.color).toBeTruthy();
  });

  it('tray without params gets all defaults', () => {
    const data = raw();
    data.layers[0].boxes[0].trays.push({ id: 'tt2', type: 'tile', name: 'T' });
    const tray = migrateProjectData(data).layers[0].boxes[0].trays.find((t) => t.id === 'tt2')!;
    expect(tray.params).toEqual(defaultTileTrayParams);
  });
});
