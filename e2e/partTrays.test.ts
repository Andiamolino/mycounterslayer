/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON of packages and projects is untyped */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  addTrayTrigger,
  anyDialog,
  exportTrayButton,
  headerButton,
  importJson,
  importTrayFile,
  openApp,
  openTrayFileChooser,
  partImportDialog,
  readDownloadJson,
  readStoredProject,
  readStoredRaw,
  toastText,
  trayRow,
  waitForGeometry
} from './helpers.js';

// E2E tests for F1.5 (export / import of single trays).
// "Fresh project" = new browser context (empty localStorage), not a reload.

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TRAY_TOAST = 'Tray imported';
const FAIL_TOAST = 'Tray import failed';

// --- Helpers --------------------------------------------------------------

async function freshPage(browser: Browser, mobile = false): Promise<Page> {
  const context = await browser.newContext({ viewport: mobile ? MOBILE_VIEWPORT : { width: 1280, height: 720 } });
  const page = await context.newPage();
  await openApp(page);
  if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
  return page;
}

// Wait longer than the autosave debounce, then return the stored raw value
async function settledRaw(page: Page): Promise<string | null> {
  await page.waitForTimeout(700);
  return readStoredRaw(page);
}

function importButton(page: Page, name = 'Import') {
  return partImportDialog(page).getByRole('button', { name, exact: true });
}

function preview(page: Page) {
  return partImportDialog(page).locator('.partImportDialog__preview');
}

// Select a tray in the navigation and export it; returns file name and parsed package
async function exportTray(page: Page, trayName: string) {
  await trayRow(page, trayName).click();
  // Mobile: the editor (with the bottom bar) opens collapsed
  const expandEditor = page.getByRole('button', { name: 'Expand editor', exact: true });
  if (await expandEditor.isVisible()) await expandEditor.click();
  const downloadPromise = page.waitForEvent('download');
  await exportTrayButton(page).click();
  const download = await downloadPromise;
  // Mobile: back to the navigation
  const expandNavigation = page.getByRole('button', { name: 'Expand navigation', exact: true });
  if (await expandNavigation.isVisible()) await expandNavigation.click();
  return { fileName: download.suggestedFilename(), json: (await readDownloadJson(download)) as any };
}

// Package of a default tray, taken from a fresh app (used as template for hand-made packages)
async function templatePackage(browser: Browser, trayName: string) {
  const page = await freshPage(browser);
  const result = await exportTray(page, trayName);
  await page.context().close();
  return result;
}

// Start project of the app (it is stored in localStorage only after the first change)
async function defaultProject(): Promise<any> {
  return JSON.parse(await readFile('src/lib/data/defaultProject.json', 'utf8'));
}

async function storedTrays(page: Page): Promise<any[]> {
  const project = await readStoredProject(page);
  return project.layers.flatMap((l: any) => [...l.boxes.flatMap((b: any) => b.trays), ...l.looseTrays]);
}

function allIds(value: unknown, ids: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allIds(v, ids));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'id' && typeof v === 'string') ids.push(v);
      else allIds(v, ids);
    }
  }
  return ids;
}

// Confirm the import dialog and wait for it to close
async function confirmImport(page: Page, name = 'Import') {
  await importButton(page, name).click();
  await expect(anyDialog(page)).toHaveCount(0);
}

const counterShapePart = (id: string, name: string, thickness: number) => ({
  id,
  name,
  baseShape: 'square',
  width: 15.9,
  length: 15.9,
  thickness
});

// Counter tray package with its own two shapes (no default shape IDs)
function counterTrayWithShapes(template: any, shapes: any[], extra: Record<string, unknown> = {}) {
  const pkg = structuredClone(template);
  pkg.part.params.topLoadedStacks = shapes.map((s) => [s.id, 5, null]);
  pkg.part.params.edgeLoadedStacks = [];
  pkg.dependencies = { counterShapes: shapes, cardSizes: [], standees: [] };
  Object.assign(pkg.part.params, extra);
  return pkg;
}

// Run the shared scenarios on desktop and mobile layout
function defineTrayTests(mobile: boolean) {
  test('TD3 roundtrip: values kept, new ID, box target, selected after import', async ({ page, browser }) => {
    await openApp(page);
    if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
    // Rename and change a value through the stored project: set via UI where cheap
    await trayRow(page, 'Counter tray').click();
    if (mobile) await page.getByRole('button', { name: 'Expand editor', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('My tokens');
    await page.getByRole('textbox', { name: 'Name', exact: true }).press('Tab');
    await page.getByLabel('Clearance', { exact: true }).fill('0.4');
    await page.getByLabel('Clearance', { exact: true }).press('Tab');
    const source = await readStoredProject(page, (p) =>
      p.layers[0].boxes[0].trays.some((t: any) => t.name === 'My tokens' && t.params.clearance === 0.4)
    );
    const sourceTray = source.layers[0].boxes[0].trays.find((t: any) => t.name === 'My tokens');
    const expandNavigation = page.getByRole('button', { name: 'Expand navigation', exact: true });
    if (await expandNavigation.isVisible()) await expandNavigation.click();

    const { fileName, json } = await exportTray(page, 'My tokens');
    expect(fileName).toBe('My tokens.tray.json');
    expect(json.kind).toBe('tray');
    expect(json.part.params.gameContainerWidth).toBeUndefined();

    const fresh = await freshPage(browser, mobile);
    await importTrayFile(fresh, false, 0, fileName, json);
    await expect(fresh.getByRole('dialog', { name: 'Import tray "My tokens"?' })).toBeVisible();
    if (mobile) {
      await expect(fresh.getByRole('dialog')).toBeInViewport({ ratio: 1 });
      await expect(importButton(fresh)).toBeInViewport({ ratio: 1 });
    }
    await expect(preview(fresh)).toContainText('Counters · ');
    // All four default counters are reused (one "already exists" line each)
    expect(((await preview(fresh).innerText()).match(/already exists/g) ?? []).length).toBe(4);
    await expect(preview(fresh)).toContainText('"My tokens" will be added to box "Counter box".');
    await importButton(fresh).click();
    await expect(anyDialog(fresh)).toHaveCount(0);
    await expect(toastText(fresh, TRAY_TOAST)).toBeVisible();

    const stored = await readStoredProject(fresh, (p) =>
      p.layers[0].boxes[0].trays.some((t: any) => t.name === 'My tokens')
    );
    const box = stored.layers[0].boxes[0];
    const imported = box.trays.find((t: any) => t.name === 'My tokens');
    expect(imported.id).not.toBe(sourceTray.id);
    expect(imported.color).toBe(sourceTray.color);
    expect(imported.params).toEqual({
      ...sourceTray.params,
      gameContainerWidth: 150,
      gameContainerDepth: 200
    });
    expect(box.manualLayout).toBeUndefined();
    expect(box.customWidth).toBeUndefined();
    expect(box.customDepth).toBeUndefined();
    expect(stored.selectedTrayId).toBe(imported.id);
    await expect(trayRow(fresh, 'My tokens')).toBeVisible();
    await fresh.context().close();
  });

  test('TD4 same tray imported into the same project is counted up', async ({ page }) => {
    await openApp(page);
    if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
    const { fileName, json } = await exportTray(page, 'Counter tray');
    await importTrayFile(page, false, 0, fileName, json);
    await expect(preview(page)).toContainText('already exists');
    await expect(preview(page)).toContainText('Counter tray (2)');
    await confirmImport(page);
    await expect(toastText(page, TRAY_TOAST)).toBeVisible();
    const stored = await readStoredProject(page, (p) =>
      p.layers[0].boxes[0].trays.some((t: any) => t.name === 'Counter tray (2)')
    );
    const trays = stored.layers[0].boxes[0].trays;
    expect(trays.filter((t: any) => t.name === 'Counter tray')).toHaveLength(1);
    expect(trays.filter((t: any) => t.name === 'Counter tray (2)')).toHaveLength(1);
    // Definitions of the same content are reused, not duplicated
    expect(stored.counterShapes).toHaveLength(4);
  });

  test('TD5 loose import lands in the layer, layout untouched', async ({ page }) => {
    await openApp(page);
    if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
    const { fileName, json } = await exportTray(page, 'Card draw');
    const before = await defaultProject();
    // "Add loose tray": index 1 = Middle layer
    await importTrayFile(page, true, 1, fileName, json);
    await expect(preview(page)).toContainText('as a loose tray to layer "Middle layer".');
    await confirmImport(page);
    await expect(toastText(page, TRAY_TOAST)).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.layers[1].looseTrays.length === 4);
    expect(stored.layers[1].looseTrays.map((t: any) => t.name)).toContain('Card draw (2)');
    expect(stored.layers[0].looseTrays).toHaveLength(before.layers[0].looseTrays.length);
    expect(stored.layers[1].manualLayout).toEqual(before.layers[1].manualLayout);
  });

  test('TD6 no source ID is left: cup tray twice, card well once', async ({ page }) => {
    await openApp(page);
    if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
    const cup = await exportTray(page, 'Split cup tray');
    const sourceIds = allIds(cup.json.part).filter((id) => id !== cup.json.part.id);
    expect(sourceIds.length).toBeGreaterThan(0);
    const cupCount = (await storedTrays(page)).filter((t) => t.type === 'cup').length;

    for (let i = 0; i < 2; i++) {
      await importTrayFile(page, true, 1, cup.fileName, cup.json);
      await confirmImport(page);
      await expect(toastText(page, TRAY_TOAST).first()).toBeVisible();
    }
    await expect.poll(async () => (await storedTrays(page)).filter((t) => t.type === 'cup').length).toBe(cupCount + 2);
    const copies = (await storedTrays(page)).filter((t) => t.type === 'cup' && /\(\d+\)$/.test(t.name));
    expect(copies).toHaveLength(2);
    const seen = new Set<string>();
    for (const copy of copies) {
      for (const id of allIds(copy)) {
        expect(sourceIds).not.toContain(id);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }

    const well = await exportTray(page, 'Card well');
    await importTrayFile(page, true, 2, well.fileName, well.json);
    await confirmImport(page);
    await expect.poll(async () => (await storedTrays(page)).some((t) => t.name === 'Card well (2)')).toBe(true);
    const imported = (await storedTrays(page)).find((t) => t.name === 'Card well (2)');
    const oldIds: string[] = [
      ...well.json.part.params.layout.columns.flat(),
      ...well.json.part.params.stacks.map((s: any) => s.id)
    ];
    const flatCells: string[] = imported.params.layout.columns.flat();
    expect(flatCells).toHaveLength(2);
    for (const id of [...flatCells, ...imported.params.stacks.map((s: any) => s.id)]) {
      expect(oldIds).not.toContain(id);
    }
    for (const stack of imported.params.stacks) expect(flatCells).toContain(stack.cellId);
  });

  test('TD7 definitions: conflicting name gets (2), new one is added, references rewritten', async ({
    page,
    browser
  }) => {
    const template = await templatePackage(browser, 'Counter tray');
    const square = counterShapePart('src-square', 'Square', 1.8);
    const hexBig = { ...counterShapePart('src-hex-big', 'Hex big', 1.3), baseShape: 'hex' };
    const pkg = counterTrayWithShapes(template.json, [square, hexBig]);

    await openApp(page);
    if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
    await importTrayFile(page, false, 0, 'shapes.tray.json', pkg);
    await expect(preview(page)).toContainText('Square – will be added as "Square (2)"');
    await expect(preview(page)).toContainText('Hex big – will be added');
    await confirmImport(page);
    await expect(toastText(page, 'New definitions: ')).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.counterShapes.length === 6);
    const sq2 = stored.counterShapes.find((c: any) => c.name === 'Square (2)');
    const hex = stored.counterShapes.find((c: any) => c.name === 'Hex big');
    expect(sq2.thickness).toBe(1.8);
    expect(stored.counterShapes.map((c: any) => c.id)).not.toContain('src-square');
    const tray = stored.layers[0].boxes[0].trays.find((t: any) => t.name === 'Counter tray (2)');
    expect(tray.params.topLoadedStacks.map((s: any[]) => s[0])).toEqual([sq2.id, hex.id]);
  });

  test('TD8 missing definition: error toast, no dialog, project unchanged', async ({ page, browser }) => {
    const template = await templatePackage(browser, 'Counter tray');
    const pkg = counterTrayWithShapes(template.json, []);
    pkg.part.params.topLoadedStacks = [['k3x9a2b', 5, null]];
    pkg.dependencies = { counterShapes: [counterShapePart('unused', 'Unused', 1)], cardSizes: [], standees: [] };

    await openApp(page);
    if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
    const rawBefore = await settledRaw(page);
    await importTrayFile(page, false, 0, 'broken.tray.json', pkg);
    await expect(toastText(page, FAIL_TOAST)).toBeVisible();
    await expect(page.getByText('k3x9a2b').first()).toBeVisible();
    await expect(page.getByText('that is not in the file').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });
}

test.describe('desktop', () => {
  defineTrayTests(false);

  test('TD1 export: file name "Counter tray.tray.json", content, no toast', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportTray(page, 'Counter tray');
    expect(fileName).toBe('Counter tray.tray.json');
    expect(json.format).toBe('counterslayer-part');
    expect(json.kind).toBe('tray');
    expect(json.part.type).toBe('counter');
    expect(json.part.name).toBe('Counter tray');
    expect(json.part.params.gameContainerWidth).toBeUndefined();
    expect(json.part.params.gameContainerDepth).toBeUndefined();
    expect(json.dependencies.counterShapes.map((c: any) => c.name).sort()).toEqual([
      'Circle',
      'Hex',
      'Square',
      'Triangle'
    ]);
    expect(json.dependencies.cardSizes).toEqual([]);
    expect(json.dependencies.standees).toEqual([]);
    await page.waitForTimeout(500);
    await expect(page.getByText('Export failed')).toHaveCount(0);
    await expect(page.getByText('Tray exported')).toHaveCount(0);
    await expect(anyDialog(page)).toHaveCount(0);
  });

  test('TD2 export button only when a tray is selected', async ({ page }) => {
    await openApp(page);
    await trayRow(page, 'Counter tray').click();
    await expect(exportTrayButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();
    await page.locator('.navItem--layer').first().click();
    await expect(exportTrayButton(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await page.locator('.navItem--box').and(page.locator(':not(.navItem--add)')).first().click();
    await expect(exportTrayButton(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  });

  test('TD9 empty reference: standee tray without dependencies imports', async ({ page, browser }) => {
    const template = await templatePackage(browser, 'Standee Tray');
    const pkg = structuredClone(template.json);
    pkg.part.params.standeeId = '';
    pkg.dependencies = { counterShapes: [], cardSizes: [], standees: [] };

    await openApp(page);
    await importTrayFile(page, true, 2, 'empty.tray.json', pkg);
    await expect(partImportDialog(page)).toBeVisible();
    await expect(preview(page)).not.toContainText('Uses');
    await confirmImport(page);
    await expect(toastText(page, TRAY_TOAST)).toBeVisible();
    await expect(page.getByText(FAIL_TOAST)).toHaveCount(0);
    const stored = await readStoredProject(page, (p) => p.layers[2].looseTrays.length === 3);
    const added = stored.layers[2].looseTrays.find((t: any) => t.name === 'Standee Tray (2)');
    expect(added.params.standeeId).toBe('');
  });

  test('TD10 geometry without errors via ?debug=1&trayId=', async ({ page, browser }) => {
    await openApp(page);
    const { fileName, json } = await exportTray(page, 'Counter tray');
    const cup = await exportTray(page, 'Split cup tray');
    await importTrayFile(page, false, 0, fileName, json);
    await confirmImport(page);
    await importTrayFile(page, true, 1, cup.fileName, cup.json);
    await confirmImport(page);
    const stored = await readStoredProject(
      page,
      (p) =>
        p.layers[0].boxes[0].trays.some((t: any) => t.name === 'Counter tray (2)') &&
        p.layers[1].looseTrays.some((t: any) => t.name === 'Split cup tray (2)')
    );
    const counterId = stored.layers[0].boxes[0].trays.find((t: any) => t.name === 'Counter tray (2)').id;
    const cupId = stored.layers[1].looseTrays.find((t: any) => t.name === 'Split cup tray (2)').id;
    const raw = await settledRaw(page);

    for (const id of [counterId, cupId]) {
      const context = await browser.newContext();
      const view = await context.newPage();
      await view.addInitScript(
        ([key, value]) => localStorage.setItem(key as string, value as string),
        ['counter-tray-project', raw as string]
      );
      await view.goto(`/?debug=1&trayId=${id}`);
      await expect(headerButton(view)).toBeVisible();
      await waitForGeometry(view);
      await expect(view.locator('.errorBanner')).toHaveCount(0);
      await expect(view.getByText('failed', { exact: false })).toHaveCount(0);
      await context.close();
    }
  });

  for (const how of ['Cancel button', 'Escape', 'backdrop'] as const) {
    test(`TD11 ${how} changes nothing, focus returns to "Add tray", file can be chosen again`, async ({ page }) => {
      await openApp(page);
      const { fileName, json } = await exportTray(page, 'Counter tray');
      const rawBefore = await settledRaw(page);
      await importTrayFile(page, false, 0, fileName, json);
      await expect(partImportDialog(page)).toBeVisible();
      if (how === 'Cancel button') await importButton(page, 'Cancel').click();
      else if (how === 'Escape') await page.keyboard.press('Escape');
      else await page.locator('.modalDialog').click({ position: { x: 5, y: 5 } });
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(page.getByText(TRAY_TOAST)).toHaveCount(0);
      expect(await settledRaw(page)).toBe(rawBefore);
      await expect(addTrayTrigger(page, false, 0)).toBeFocused();

      await importTrayFile(page, false, 0, fileName, json);
      await expect(partImportDialog(page)).toBeVisible();
    });
  }

  test('TD12 counter file via tray import: "Import as counter"', async ({ page }) => {
    await openApp(page);
    const before = await defaultProject();
    const pkg = {
      format: 'counterslayer-part',
      formatVersion: 1,
      kind: 'counterShape',
      exportedAt: '2026-01-01T00:00:00.000Z',
      part: counterShapePart('src-wide', 'Wide', 1.3),
      dependencies: { counterShapes: [], cardSizes: [], standees: [] }
    };
    await importTrayFile(page, false, 0, 'Wide.counter.json', pkg);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a counter, not a tray. Import it as counter?' })
    ).toBeVisible();
    await confirmImport(page, 'Import as counter');
    await expect(toastText(page, 'Imported as counter')).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.counterShapes.some((c: any) => c.name === 'Wide'));
    expect((await storedTrays(page)).length).toBe(
      before.layers.flatMap((l: any) => [...l.boxes.flatMap((b: any) => b.trays), ...l.looseTrays]).length
    );
    expect(stored.selectedTrayId).toBe(before.selectedTrayId);
  });

  for (const kind of ['box', 'layer']) {
    test(`TD13 ${kind} package via tray import: error toast, no dialog, project unchanged`, async ({
      page,
      browser
    }) => {
      const template = await templatePackage(browser, 'Counter tray');
      const pkg = { ...structuredClone(template.json), kind };
      await openApp(page);
      const rawBefore = await settledRaw(page);
      await importTrayFile(page, false, 0, `x.${kind}.json`, pkg);
      await expect(toastText(page, FAIL_TOAST)).toBeVisible();
      await expect(page.getByText('not supported yet').first()).toBeVisible();
      await expect(anyDialog(page)).toHaveCount(0);
      expect(await settledRaw(page)).toBe(rawBefore);
    });
  }

  test('TD14 tray file via "Import counter…" in the globals panel: error toast, project unchanged', async ({
    page,
    browser
  }) => {
    const template = await templatePackage(browser, 'Counter tray');
    await openApp(page);
    const rawBefore = await settledRaw(page);
    await page.locator('input[type="file"][aria-label="Import counter file"]').setInputFiles({
      name: 'Counter tray.tray.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(template.json))
    });
    await expect(toastText(page, 'Counter import failed')).toBeVisible();
    await expect(page.getByText('Trays are imported via').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('TD15 export with dead reference warns, importing the file fails like TD8', async ({ page }) => {
    const project = await defaultProject();
    const standeeTray = project.layers[2].looseTrays.find((t: any) => t.name === 'Standee Tray');
    standeeTray.params.standeeId = 'no-such-standee';

    await openApp(page);
    await importJson(page, 'dead.json', project);
    await expect(trayRow(page, 'Standee Tray')).toBeVisible();
    const { fileName, json } = await exportTray(page, 'Standee Tray');
    expect(fileName).toBe('Standee Tray.tray.json');
    await expect(toastText(page, 'Tray exported with warnings')).toBeVisible();

    const rawBefore = await settledRaw(page);
    await importTrayFile(page, true, 2, fileName, json);
    await expect(toastText(page, FAIL_TOAST)).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('TD16 "Import from file…" opens a single-file chooser and closes the popover', async ({ page }) => {
    await openApp(page);
    const chooser = await openTrayFileChooser(page, false, 0);
    expect(chooser.isMultiple()).toBe(false);
    await expect(page.getByRole('button', { name: /^Import from file…/ })).toHaveCount(0);
    await expect(page.locator('input[type="file"][aria-label="Import tray file"]')).toHaveAttribute(
      'accept',
      '.json,application/json'
    );
  });
});

test.describe('mobile layout (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  defineTrayTests(true);

  test('TM1 export: button fully in viewport, file "Counter tray.tray.json"', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await trayRow(page, 'Counter tray').click();
    await page.getByRole('button', { name: 'Expand editor' }).click();
    await expect(exportTrayButton(page)).toBeInViewport({ ratio: 1 });
    const downloadPromise = page.waitForEvent('download');
    await exportTrayButton(page).click();
    expect((await downloadPromise).suggestedFilename()).toBe('Counter tray.tray.json');
  });

  test('TM3 loose import lands in the chosen layer', async ({ page, browser }) => {
    const template = await templatePackage(browser, 'Card draw');
    await openApp(page);
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await importTrayFile(page, true, 2, 'Card draw.tray.json', template.json);
    await expect(preview(page)).toContainText('to layer "Top layer".');
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers[2].looseTrays.length === 3);
    expect(stored.layers[2].looseTrays.map((t: any) => t.name)).toContain('Card draw (2)');
  });
});
