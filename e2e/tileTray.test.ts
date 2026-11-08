import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  AUTOSAVE_SETTLE_MS,
  addBoxTrigger,
  addTrayTrigger,
  confirmImport,
  containerHeightStatus,
  defaultProject,
  expandEditorIfCollapsed,
  expandRow,
  exportCurrentProject,
  exportTrayButton,
  exportViaBottomBar,
  importJson,
  importPartFile,
  importTrayFile,
  layerRow,
  makePartPackage,
  openEditorFor,
  pageWith,
  previewOf,
  readDownloadJson,
  readStoredProject,
  readStoredRaw,
  settledRaw,
  showEditor,
  toastText,
  trayRow,
  type Json
} from './helpers.js';

// E2E tests for T8a (Dimensions -> Tiles: definition section, part export / import, delete)
// and T8b (tile tray: add popovers, editor, preview counters, project JSON, packages, height status)

const PANEL = '.globalsPanel';

// The default project has one tile "Standard" (index 0); it is the third "Standard" row
// (card sizes and standees come first)
async function openTile(page: Page): Promise<void> {
  await showEditor(page);
  await expandRow(page, 'Standard', 2);
  await expect(field(page, 'tileWidth-0')).toBeVisible();
}

function field(page: Page, name: string): Locator {
  return page.locator(`${PANEL} input[name="${name}"]`);
}

async function setField(page: Page, name: string, typed: string): Promise<void> {
  const input = field(page, name);
  await input.scrollIntoViewIfNeeded();
  await input.fill(typed);
  await input.blur();
}

async function storedTile(page: Page, ready: (t: Record<string, unknown>) => boolean = () => true, index = 0) {
  const project = await readStoredProject(page, (p) => p.tiles.length > index && ready(p.tiles[index]));
  return project.tiles[index] as Record<string, unknown>;
}

const BAR_FIELDS = ['tileBarPositionLeft-0', 'tileBarPositionRight-0'];

for (const mobile of [false, true]) {
  test.describe(`Tiles section (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('section is visible with the default tile; fields and placeholders', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await showEditor(page);
      await expect(page.locator(PANEL).getByRole('heading', { name: 'Tiles', exact: true })).toBeVisible();
      await expect(page.getByTitle('Click to edit Standard', { exact: true }).nth(2)).toContainText('50×50 mm');
      await openTile(page);
      await expect(field(page, 'tileName-0')).toHaveValue('Standard');
      await expect(field(page, 'tileWidth-0')).toHaveValue('50');
      await expect(field(page, 'tileHeight-0')).toHaveValue('50');
      await expect(field(page, 'tileThickness-0')).toHaveValue('2');
      await expect(field(page, 'tileAngleToFloor-0')).toHaveValue('');
      await expect(field(page, 'tileAngleToFloor-0')).toHaveAttribute('placeholder', '70');
      await expect(field(page, 'tileSlotClearance-0')).toHaveValue('');
      await expect(field(page, 'tileSlotClearance-0')).toHaveAttribute('placeholder', '1');
      for (const name of BAR_FIELDS) {
        await expect(field(page, name)).toBeVisible();
        await expect(field(page, name)).toHaveValue('');
        await expect(field(page, name)).toHaveAttribute('placeholder', '25');
      }
      await expect(page.locator(PANEL).getByText('90° = upright, 45° = flattest.')).toBeVisible();
      await expect(page.getByTestId('tileSlotWidth-0')).toHaveText('Slot width: 3.0 mm');
      await page.context().close();
    });

    test('required fields: values are stored, minimum is enforced', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      await setField(page, 'tileWidth-0', '60,5');
      await expect(field(page, 'tileWidth-0')).toHaveValue('60.5');
      await setField(page, 'tileHeight-0', '0');
      await expect(field(page, 'tileHeight-0')).toHaveValue('1');
      await setField(page, 'tileThickness-0', '0');
      await expect(field(page, 'tileThickness-0')).toHaveValue('0.1');
      const stored = await storedTile(page, (t) => t.width === 60.5 && t.height === 1 && t.thickness === 0.1);
      expect(stored).toMatchObject({ width: 60.5, height: 1, thickness: 0.1 });
      await page.context().close();
    });

    test('angle limits: 30 -> 45, 95 -> 90, "62,5" -> 62.5', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      const angle = field(page, 'tileAngleToFloor-0');
      await setField(page, 'tileAngleToFloor-0', '30');
      await expect(angle).toHaveValue('45');
      expect((await storedTile(page, (t) => t.angleToFloor === 45)).angleToFloor).toBe(45);
      await setField(page, 'tileAngleToFloor-0', '95');
      await expect(angle).toHaveValue('90');
      expect((await storedTile(page, (t) => t.angleToFloor === 90)).angleToFloor).toBe(90);
      await setField(page, 'tileAngleToFloor-0', '62,5');
      await expect(angle).toHaveValue('62.5');
      expect((await storedTile(page, (t) => t.angleToFloor === 62.5)).angleToFloor).toBe(62.5);
      await page.context().close();
    });

    test('empty input removes the field (back to default)', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      await setField(page, 'tileAngleToFloor-0', '60');
      await setField(page, 'tileSlotClearance-0', '0.4');
      await storedTile(page, (t) => t.angleToFloor === 60 && t.slotClearance === 0.4);
      await setField(page, 'tileAngleToFloor-0', '');
      await setField(page, 'tileSlotClearance-0', '');
      await expect(field(page, 'tileAngleToFloor-0')).toHaveValue('');
      await expect(field(page, 'tileSlotClearance-0')).toHaveValue('');
      const stored = await storedTile(page, (t) => !('angleToFloor' in t) && !('slotClearance' in t));
      expect('angleToFloor' in stored).toBe(false);
      expect('slotClearance' in stored).toBe(false);
      await page.context().close();
    });

    test('slot clearance 0.5 with thickness 2 -> "Slot width: 2.5 mm"; negative is limited to 0', async ({
      browser
    }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      const width = page.getByTestId('tileSlotWidth-0');
      await setField(page, 'tileSlotClearance-0', '0,5');
      await expect(field(page, 'tileSlotClearance-0')).toHaveValue('0.5');
      await expect(width).toHaveText('Slot width: 2.5 mm');
      await setField(page, 'tileSlotClearance-0', '-1');
      await expect(field(page, 'tileSlotClearance-0')).toHaveValue('0');
      await expect(width).toHaveText('Slot width: 2.0 mm');
      await page.context().close();
    });

    test('bar positions: limits 0-50, stored, empty removes', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      const left = field(page, 'tileBarPositionLeft-0');
      const right = field(page, 'tileBarPositionRight-0');
      await setField(page, 'tileBarPositionLeft-0', '60');
      await expect(left).toHaveValue('50');
      await setField(page, 'tileBarPositionLeft-0', '-5');
      await expect(left).toHaveValue('0');
      await setField(page, 'tileBarPositionRight-0', '12,5');
      await expect(right).toHaveValue('12.5');
      const stored = await storedTile(page, (t) => t.barPositionLeft === 0 && t.barPositionRight === 12.5);
      expect(stored.barPositionLeft).toBe(0);
      expect(stored.barPositionRight).toBe(12.5);
      await setField(page, 'tileBarPositionRight-0', '');
      await expect(right).toHaveValue('');
      expect('barPositionRight' in (await storedTile(page, (t) => !('barPositionRight' in t)))).toBe(false);
      await page.context().close();
    });

    test('values survive reload', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await openTile(page);
      await setField(page, 'tileWidth-0', '70');
      await setField(page, 'tileAngleToFloor-0', '55');
      await setField(page, 'tileSlotClearance-0', '0.3');
      await setField(page, 'tileBarPositionLeft-0', '15');
      await setField(page, 'tileBarPositionRight-0', '35');
      const raw = JSON.parse((await settledRaw(page)) ?? '{}');
      expect(raw.tiles[0]).toMatchObject({
        width: 70,
        angleToFloor: 55,
        slotClearance: 0.3,
        barPositionLeft: 15,
        barPositionRight: 35
      });
      await page.reload();
      await openTile(page);
      await expect(field(page, 'tileWidth-0')).toHaveValue('70');
      await expect(field(page, 'tileAngleToFloor-0')).toHaveValue('55');
      await expect(field(page, 'tileSlotClearance-0')).toHaveValue('0.3');
      await expect(field(page, 'tileBarPositionLeft-0')).toHaveValue('15');
      await expect(field(page, 'tileBarPositionRight-0')).toHaveValue('35');
      await expect(page.getByTestId('tileSlotWidth-0')).toHaveText('Slot width: 2.3 mm');
      await page.context().close();
    });

    test('"+ New tile" adds "Custom Tile 2" (50 x 50 x 2 mm) expanded; duplicate names are rejected', async ({
      browser
    }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await showEditor(page);
      await page.getByRole('button', { name: '+ New tile', exact: true }).click();
      await expect(field(page, 'tileName-1')).toHaveValue('Custom Tile 2');
      await expect(field(page, 'tileWidth-1')).toHaveValue('50');
      await expect(field(page, 'tileHeight-1')).toHaveValue('50');
      await expect(field(page, 'tileThickness-1')).toHaveValue('2');
      const stored = await storedTile(page, (t) => t.name === 'Custom Tile 2', 1);
      expect(stored).toMatchObject({ name: 'Custom Tile 2', width: 50, height: 50, thickness: 2 });
      // A name that already exists is not applied
      await setField(page, 'tileName-1', 'Standard');
      await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
      expect((await storedTile(page, () => true, 1)).name).toBe('Custom Tile 2');
      await setField(page, 'tileName-1', 'Slab');
      expect((await storedTile(page, (t) => t.name === 'Slab', 1)).name).toBe('Slab');
      await page.context().close();
    });

    test('no horizontal overflow of the fields', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      await setField(page, 'tileBarPositionLeft-0', '50');
      await setField(page, 'tileBarPositionRight-0', '50');
      const names = [
        'tileWidth-0',
        'tileHeight-0',
        'tileThickness-0',
        'tileAngleToFloor-0',
        'tileSlotClearance-0',
        ...BAR_FIELDS
      ];
      const viewportWidth = page.viewportSize()!.width;
      for (const name of names) {
        const box = await field(page, name).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.x, name).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, name).toBeLessThanOrEqual(viewportWidth);
      }
      const overflow = await page.evaluate(() => {
        const panel = document.querySelector('.globalsPanel') as HTMLElement;
        return panel.scrollWidth - panel.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  });

  test.describe(`Tiles part export / import / delete (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('export: "Standard.tile.json", kind tile, values and set optional fields', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openTile(page);
      await setField(page, 'tileAngleToFloor-0', '55');
      await setField(page, 'tileBarPositionLeft-0', '15');
      await storedTile(page, (t) => t.angleToFloor === 55 && t.barPositionLeft === 15);
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export tile', exact: true }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('Standard.tile.json');
      const json = (await readDownloadJson(download)) as Json;
      expect(json.kind).toBe('tile');
      expect(json.part).toMatchObject({
        name: 'Standard',
        width: 50,
        height: 50,
        thickness: 2,
        angleToFloor: 55,
        barPositionLeft: 15
      });
      await page.context().close();
    });

    test('import of the same values: "already exists", nothing added', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await showEditor(page);
      const pkg = makePartPackage('tile', { id: 'src-tile', name: 'Standard', width: 50, height: 50, thickness: 2 });
      await importPartFile(page, 'tile', 'Standard.tile.json', pkg);
      await expect(previewOf(page)).toContainText('"Standard" already exists – nothing will be added.');
      await confirmImport(page);
      await expect(toastText(page, 'Tile already exists')).toBeVisible();
      await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
      await expect(page.getByTitle('Click to edit Standard (2)', { exact: true })).toHaveCount(0);
      expect((await readStoredProject(page)).tiles).toHaveLength(1);
      await page.context().close();
    });

    test('import of other values under the same name: added as "Standard (2)"', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await showEditor(page);
      const pkg = makePartPackage('tile', {
        id: 'src-tile',
        name: 'Standard',
        width: 63,
        height: 89,
        thickness: 0.5,
        angleToFloor: 60
      });
      await importPartFile(page, 'tile', 'Standard.tile.json', pkg);
      await expect(page.getByRole('dialog', { name: 'Import tile "Standard"?' })).toBeVisible();
      await expect(previewOf(page)).toContainText('Tile 63 × 89 × 0.5 mm');
      await expect(previewOf(page)).toContainText('will be added as "Standard (2)"');
      await confirmImport(page);
      await expect(page.getByTitle('Click to edit Standard (2)', { exact: true })).toContainText('63×89 mm');
      const project = await readStoredProject(page, (p) => p.tiles.length === 2);
      expect(project.tiles[1]).toMatchObject({ name: 'Standard (2)', width: 63, height: 89, angleToFloor: 60 });
      expect(project.tiles[1].id).not.toBe('src-tile');
      await page.context().close();
    });

    test('delete without trays: confirmation text, tile is removed', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await showEditor(page);
      await page.getByRole('button', { name: '+ New tile', exact: true }).click();
      await expect(field(page, 'tileName-1')).toBeVisible();
      await page.locator(`${PANEL} .shapePanel`).getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText('Delete the "Custom Tile 2" tile?')).toBeVisible();
      await page.getByRole('button', { name: 'Delete tile', exact: true }).click();
      await expect(field(page, 'tileName-1')).toHaveCount(0);
      const project = await readStoredProject(page, (p) => p.tiles.length === 1);
      expect(project.tiles.map((t: { name: string }) => t.name)).toEqual(['Standard']);
      await page.context().close();
    });

    test('delete with a tile tray: notice instead of deleting, tile stays', async ({ browser }) => {
      const project = await defaultProject();
      // A tile tray made from the standee tray of the default project
      const layer = project.layers.find((l: Json) => l.looseTrays.some((t: Json) => t.type === 'standee'));
      const standeeTray = layer.looseTrays.find((t: Json) => t.type === 'standee');
      const { standeeId: _standeeId, ...params } = standeeTray.params;
      layer.looseTrays.push({
        ...standeeTray,
        id: 'tile-tray-1',
        name: 'Tile Tray Test',
        type: 'tile',
        params: { ...params, tileId: 'tile-standard', slotWallHeight: null }
      });
      const page = await pageWith(browser, project, mobile);
      await openTile(page);
      await page.getByTestId('deleteDefinition-tile').click();
      await expect(page.getByTestId('definitionInUse-tile')).toContainText('"Standard" is in use and cannot be deleted.');
      await expect(page.getByTestId('definitionInUseList-tile')).toHaveText(`Used in: Tile Tray Test (${layer.name})`);
      await expect(page.getByText('Delete the "Standard" tile?')).toHaveCount(0);
      await expect(field(page, 'tileName-0')).toBeVisible();
      await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
      const stored = await readStoredRaw(page);
      if (stored) expect(JSON.parse(stored).tiles.map((t: Json) => t.name)).toEqual(['Standard']);
      await page.context().close();
    });
  });
}

// --- T8b: tile tray (add popovers, editor, preview counters, project JSON, packages, height status) ---

const TILE_TRAY = 'Tile Tray Test';

// Settings set on the Standard tile for the JSON / package tests (all optional fields)
const TILE_FIELDS = { width: 40, angleToFloor: 55, slotClearance: 0.3, barPositionLeft: 15, barPositionRight: 35 };

// Default project plus a loose tile tray (in the layer that holds the standee tray)
async function tileProject(opts: { count?: number; slotWallHeight?: number | null } = {}) {
  const project = await defaultProject();
  const layer = project.layers.find((l: Json) => l.looseTrays.some((t: Json) => t.type === 'standee'));
  layer.looseTrays.push({
    id: 'tile-tray-1',
    name: TILE_TRAY,
    color: '#4488cc',
    type: 'tile',
    params: {
      tileId: project.tiles[0].id,
      count: opts.count ?? 12,
      wallThickness: 2,
      innerWallThickness: 2,
      floorThickness: 2,
      clearance: 0.5,
      rimHeight: 2,
      trayWidthOverride: null,
      trayDepthOverride: null,
      slotWallHeight: opts.slotWallHeight ?? null
    }
  });
  return { project, layerName: layer.name as string };
}

function allTrays(project: Record<string, any>): any[] {
  return project.layers.flatMap((l: any) => [...l.looseTrays, ...l.boxes.flatMap((b: any) => b.trays)]);
}

function tileTraysOf(project: Record<string, any>): any[] {
  return allTrays(project).filter((t) => t.type === 'tile');
}

function tileTrayOf(project: Record<string, any>): any {
  return allTrays(project).find((t) => t.name === TILE_TRAY);
}

async function openTileTray(page: Page): Promise<void> {
  await openEditorFor(page, trayRow(page, TILE_TRAY));
  await expect(page.getByTestId('tileDistribution')).toBeVisible();
}

function editor(page: Page): Locator {
  return page.locator('.panelFormSection').filter({ has: page.getByTestId('tileDistribution') });
}

async function setCount(page: Page, value: string): Promise<void> {
  const input = page.locator('input[name="count"]').first();
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
  await input.blur();
}

async function storedTrayParams(page: Page, ready: (p: Record<string, unknown>) => boolean = () => true) {
  const project = await readStoredProject(page, (p) => ready(tileTrayOf(p).params));
  return tileTrayOf(project).params as Record<string, unknown>;
}

const TILES_OPTION = /^Tiles/;
const BAR_GAP_TEXT = /^Bar gap: \d+\.\d mm$/;

for (const mobile of [false, true]) {
  test.describe(`Tile tray: add popovers (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('all three add popovers list the same entries, including Tiles', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      const lists: string[][] = [];
      for (const trigger of [addTrayTrigger(page, false, 0), addBoxTrigger(page, 0), addTrayTrigger(page, true, 0)]) {
        await trigger.click();
        const options = page.locator('.trayTypeOption:not(.trayTypeOption--import)');
        await expect(options.last()).toBeVisible();
        lists.push((await options.allTextContents()).map((t) => t.trim()));
        await trigger.click();
        await expect(options).toHaveCount(0);
      }
      expect(lists[0].length).toBeGreaterThan(0);
      expect(lists[1]).toEqual(lists[0]);
      expect(lists[2]).toEqual(lists[0]);
      expect(lists[0].some((t) => t.startsWith('Tiles') && t.includes('Slotted bars for flat tiles and cards'))).toBe(
        true
      );
      await page.context().close();
    });

    test('Add tray (in a box) -> Tiles creates a tile tray with the first tile', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await addTrayTrigger(page, false, 0).click();
      await page.getByRole('button', { name: TILES_OPTION }).click();
      await expandEditorIfCollapsed(page);
      await expect(page.getByTestId('tileDistribution')).toHaveText('One row of 12');
      const stored = await readStoredProject(page, (p) => tileTraysOf(p).length === 1);
      const box = stored.layers[0].boxes[0];
      expect(box.trays.filter((t: any) => t.type === 'tile')).toHaveLength(1);
      expect(tileTraysOf(stored)[0].params.tileId).toBe(stored.tiles[0].id);
      await page.context().close();
    });

    test('Add box (in a layer) -> Tiles creates a box with a tile tray', async ({ browser }) => {
      const before = await defaultProject();
      const page = await pageWith(browser, before, mobile);
      await addBoxTrigger(page, 0).click();
      await page.getByRole('button', { name: TILES_OPTION }).click();
      await expandEditorIfCollapsed(page);
      await expect(page.getByTestId('tileDistribution')).toBeVisible();
      const stored = await readStoredProject(page, (p) => tileTraysOf(p).length === 1);
      const boxes = stored.layers[0].boxes;
      expect(boxes).toHaveLength(before.layers[0].boxes.length + 1);
      expect(boxes[boxes.length - 1].trays.map((t: any) => t.type)).toEqual(['tile']);
      await page.context().close();
    });

    test('Add loose tray -> Tiles creates a loose tile tray', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await addTrayTrigger(page, true, 0).click();
      await page.getByRole('button', { name: TILES_OPTION }).click();
      await expandEditorIfCollapsed(page);
      await expect(page.getByTestId('tileDistribution')).toBeVisible();
      const stored = await readStoredProject(page, (p) => tileTraysOf(p).length === 1);
      expect(stored.layers[0].looseTrays.filter((t: any) => t.type === 'tile')).toHaveLength(1);
      await page.context().close();
    });
  });

  test.describe(`Tile tray editor (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('one row: distribution follows the count, info texts, select label', async ({ browser }) => {
      const page = await pageWith(browser, (await tileProject({ count: 5 })).project, mobile);
      await openTileTray(page);
      const text = page.getByTestId('tileDistribution');
      await expect(text).toHaveText('One row of 5');
      await setCount(page, '7');
      await expect(text).toHaveText('One row of 7');
      await expect(page.getByTestId('tileDistributionInfo')).toHaveText('One row across two slotted bars, no base.');
      await expect(editor(page)).toContainText('50mm × 50mm tile');
      await expect(page.getByLabel('Tile type')).toContainText('Standard (50×50 mm)');
      await page.context().close();
    });

    test('bar gap follows the bar thickness of the tray', async ({ browser }) => {
      const page = await pageWith(browser, (await tileProject()).project, mobile);
      await openTileTray(page);
      const gap = page.getByTestId('tileBarGap');
      await expect(gap).toHaveText(BAR_GAP_TEXT);
      await expect(page.getByTestId('tileBarLimited')).toHaveCount(0);
      const before = await gap.textContent();
      const thickness = page.locator('input[name="innerWallThickness"]');
      await thickness.scrollIntoViewIfNeeded();
      await thickness.fill('4');
      await thickness.blur();
      await expect(gap).not.toHaveText(before ?? '');
      await page.context().close();
    });

    test('"limited" hint when the bars cannot fit', async ({ browser }) => {
      const { project } = await tileProject();
      Object.assign(project.tiles[0], { barPositionLeft: 50, barPositionRight: 50 });
      const page = await pageWith(browser, project, mobile);
      await openTileTray(page);
      await expect(page.getByTestId('tileBarLimited')).toHaveText('Bars limited to fit the tile width.');
      await expect(page.getByTestId('tileBarGap')).toHaveText(BAR_GAP_TEXT);
      await page.context().close();
    });

    test('bar height: placeholder, "12,5" stored, empty -> null', async ({ browser }) => {
      const page = await pageWith(browser, (await tileProject()).project, mobile);
      await openTileTray(page);
      const input = page.locator('input[name="tileSlotWallHeight"]');
      await input.scrollIntoViewIfNeeded();
      await expect(input).toBeVisible();
      await expect(input).toHaveValue('');
      await expect(input).toHaveAttribute('placeholder', /^Auto \(\d+\.\d\)$/);
      await input.fill('12,5');
      await input.blur();
      await expect(input).toHaveValue('12.5');
      expect((await storedTrayParams(page, (p) => p.slotWallHeight === 12.5)).slotWallHeight).toBe(12.5);
      await input.fill('');
      await input.blur();
      await expect(input).toHaveValue('');
      expect((await storedTrayParams(page, (p) => p.slotWallHeight === null)).slotWallHeight).toBeNull();
      await page.context().close();
    });

    test('field labels and hints use "tiles"', async ({ browser }) => {
      const page = await pageWith(browser, (await tileProject()).project, mobile);
      await openTileTray(page);
      const ed = editor(page);
      for (const label of ['Bar thickness', 'Wall height above tiles', 'Tray width', 'Tray length', 'Bar height']) {
        await expect(ed.getByLabel(label, { exact: true })).toHaveCount(1);
      }
      for (const old of [
        'Inner wall',
        'Rim height',
        'Width',
        'Length',
        'Slot wall height',
        'Wall height above standees'
      ]) {
        await expect(ed.getByLabel(old, { exact: true })).toHaveCount(0);
      }
      await expect(ed.getByTestId('hintInnerWall')).toHaveText('Thickness of the two slotted bars.');
      await expect(ed.getByTestId('hintRimHeight')).toHaveText('How far the outer walls rise above the highest tile.');
      await expect(ed.getByTestId('hintWidth')).toHaveText(
        'Tray width including walls. Grows automatically if the tiles need more.'
      );
      await expect(ed.getByTestId('hintLength')).toHaveText(
        'Tray length including walls. Grows automatically if the tiles need more.'
      );
      await expect(ed.getByTestId('hintBarHeight')).toHaveText(
        /^Max \d+\.\d mm\. Max = height of the leaning tiles\. For bars flush with the walls set 'Wall height above tiles' to 0\.$/
      );
      await page.context().close();
    });

    test('shown tray size matches the Auto placeholders and reacts to the count', async ({ browser }) => {
      const page = await pageWith(browser, (await tileProject({ count: 6 })).project, mobile);
      await openTileTray(page);
      const info = editor(page).locator('.dimensionsInfo');
      const [w, d, h] = await (async () => {
        const m = ((await info.textContent()) ?? '').match(/([\d.]+) × ([\d.]+) × ([\d.]+) mm/);
        expect(m).not.toBeNull();
        return m!.slice(1, 4).map(Number);
      })();
      expect(await page.locator('input[name="trayWidthOverride"]').getAttribute('placeholder')).toBe(
        `Auto (${w.toFixed(1)})`
      );
      expect(await page.locator('input[name="trayDepthOverride"]').getAttribute('placeholder')).toBe(
        `Auto (${d.toFixed(1)})`
      );
      expect(h).toBeGreaterThan(0);
      await setCount(page, '12');
      await expect(info).not.toHaveText(new RegExp(`^\\s*${w.toFixed(1)} × ${d.toFixed(1)} × `));
      await page.context().close();
    });
  });

  test.describe(`Tile tray: project JSON and packages (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('project JSON export keeps tile and tray, import restores them', async ({ browser }) => {
      const { project } = await tileProject({ count: 7, slotWallHeight: 12.5 });
      Object.assign(project.tiles[0], TILE_FIELDS);
      const source = await pageWith(browser, project, mobile);
      const { json } = await exportCurrentProject(source);
      expect((json.tiles as any[])[0]).toMatchObject(TILE_FIELDS);
      expect(tileTrayOf(json).params).toMatchObject({ tileId: project.tiles[0].id, count: 7, slotWallHeight: 12.5 });
      await source.context().close();

      const fresh = await pageWith(browser, undefined, mobile);
      await importJson(fresh, 'tiles.json', json);
      await openTileTray(fresh);
      await expect(fresh.getByTestId('tileDistribution')).toHaveText('One row of 7');
      await expect(fresh.locator('input[name="tileSlotWallHeight"]')).toHaveValue('12.5');
      const stored = await readStoredProject(fresh, (p) => tileTrayOf(p) !== undefined);
      expect(stored.tiles[0]).toMatchObject(TILE_FIELDS);
      expect(tileTrayOf(stored).params.tileId).toBe(stored.tiles[0].id);
      await fresh.context().close();
    });

    test('tile tray package with its tile: export, import, definition and bar height arrive', async ({ browser }) => {
      const { project } = await tileProject({ slotWallHeight: 12.5 });
      Object.assign(project.tiles[0], TILE_FIELDS);
      const source = await pageWith(browser, project, mobile);
      const { json } = await exportViaBottomBar(source, trayRow(source, TILE_TRAY), exportTrayButton(source));
      expect(json.part.type).toBe('tile');
      expect(json.dependencies.tiles).toHaveLength(1);
      expect(json.dependencies.tiles[0]).toMatchObject(TILE_FIELDS);
      expect(json.part.params.slotWallHeight).toBe(12.5);
      await source.context().close();

      // Fresh project: its Standard tile differs -> the embedded one is added as "Standard (2)"
      const target = await pageWith(browser, undefined, mobile);
      await importTrayFile(target, true, 2, `${TILE_TRAY}.tray.json`, json);
      await expect(previewOf(target)).toContainText('Standard (2)');
      await confirmImport(target);
      const stored = await readStoredProject(target, (p) => p.tiles.length === 2);
      expect(stored.tiles[1]).toMatchObject({ name: 'Standard (2)', ...TILE_FIELDS });
      const added = stored.layers[2].looseTrays.find((t: any) => t.name === TILE_TRAY);
      expect(added.type).toBe('tile');
      expect(added.params.tileId).toBe(stored.tiles[1].id);
      expect(added.params.slotWallHeight).toBe(12.5);
      await target.context().close();
    });
  });
}

// Desktop only: the mobile layout has no "Preview counters" checkbox
test.describe('Tile tray: preview counters auto state (desktop)', () => {
  test('tile tray selected: on; cup tray selected: off', async ({ browser }) => {
    const page = await pageWith(browser, (await tileProject()).project, false);
    const counters = page.locator('.toolbarRight').getByLabel('Preview counters');
    await openEditorFor(page, trayRow(page, TILE_TRAY));
    await expect(counters).toBeChecked();
    await openEditorFor(page, trayRow(page, 'Cup tray'));
    await expect(counters).not.toBeChecked();
    await openEditorFor(page, trayRow(page, TILE_TRAY));
    await expect(counters).toBeChecked();
    await page.context().close();
  });
});

// A tile tray (about 52 mm) is taller than the 25.5 mm standee layer: layer height and total rise
test.describe('Tile tray: layer height and height status (desktop)', () => {
  test('a tile tray raises the layer height and the total', async ({ browser }) => {
    const base = await defaultProject();
    base.globalSettings.gameContainerHeight = 120;
    const withoutTile = await pageWith(browser, base, false);
    await expect(layerRow(withoutTile, 'Top layer').locator('.navItemHeight')).toHaveText('25.5 mm');
    await expect(containerHeightStatus(withoutTile)).toHaveClass(/containerHeightStatus--ok/);
    await withoutTile.context().close();

    const { project, layerName } = await tileProject();
    project.globalSettings.gameContainerHeight = 120;
    const page = await pageWith(browser, project, false);
    const height = await layerRow(page, layerName).locator('.navItemHeight').textContent();
    expect(parseFloat(height ?? '0')).toBeGreaterThan(40);
    await expect(containerHeightStatus(page)).toHaveClass(/containerHeightStatus--tooTall/);
    await page.context().close();
  });
});
