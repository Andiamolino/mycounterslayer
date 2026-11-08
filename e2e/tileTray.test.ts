import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  AUTOSAVE_SETTLE_MS,
  MOBILE_VIEWPORT,
  confirmImport,
  defaultProject,
  expandRow,
  importPartFile,
  makePartPackage,
  pageWith,
  previewOf,
  readDownloadJson,
  readStoredProject,
  settledRaw,
  toastText,
  type Json
} from './helpers.js';

// E2E tests for T8a (Dimensions -> Tiles: definition section, part export / import, delete)

const PANEL = '.globalsPanel';

// Mobile: the editor opens collapsed behind "Expand editor". Waits for the button (fresh page load).
async function showEditor(page: Page): Promise<void> {
  if (page.viewportSize()?.width !== MOBILE_VIEWPORT.width) return;
  if ((await page.getByRole('button', { name: 'Collapse editor', exact: true }).count()) > 0) return;
  await page.getByRole('button', { name: 'Expand editor', exact: true }).click();
}

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

    test('delete with a tile tray: warning counts the tray', async ({ browser }) => {
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
      await page.locator(`${PANEL} .shapePanel`).getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByText(/Deleting "Standard" will affect\s+1\s+tile tray using it\./)).toBeVisible();
      await page.context().close();
    });
  });
}
