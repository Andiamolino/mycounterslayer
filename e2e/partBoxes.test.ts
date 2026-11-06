/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON of packages and projects is untyped */
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  addBoxTrigger,
  addTrayTrigger,
  anyDialog,
  boxRow,
  defaultProject,
  exportBoxButton,
  headerButton,
  importBoxFile,
  importTrayFile,
  openApp,
  partImportDialog,
  readDownloadJson,
  readStoredProject,
  settledRaw,
  STORAGE_KEY,
  storedBoxes,
  toastText,
  trayRow,
  waitForGeometry
} from './helpers.js';

// E2E tests for F1.6 (export / import of boxes).
// "Fresh project" = new browser context (empty localStorage), not a reload.

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const BOX_TOAST = 'Box imported';
const FAIL_TOAST = 'Box import failed';

// --- Helpers --------------------------------------------------------------

// Page with a prepared project in localStorage (or the start project when `project` is missing)
async function pageWith(browser: Browser, project?: any, mobile = false): Promise<Page> {
  const context = await browser.newContext({ viewport: mobile ? MOBILE_VIEWPORT : { width: 1280, height: 720 } });
  const page = await context.newPage();
  if (project) {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key as string, value as string),
      [STORAGE_KEY, JSON.stringify(project)]
    );
  }
  await openApp(page);
  if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
  return page;
}

function importButton(page: Page, name = 'Import') {
  return partImportDialog(page).getByRole('button', { name, exact: true });
}

function preview(page: Page) {
  return partImportDialog(page).locator('.partImportDialog__preview');
}

// Confirm the import dialog and wait for it to close
async function confirmImport(page: Page, name = 'Import') {
  await importButton(page, name).click();
  await expect(anyDialog(page)).toHaveCount(0);
}

// Select a box in the navigation and export it; returns file name and parsed package
async function exportBox(page: Page, boxName: string) {
  await boxRow(page, boxName).click();
  // Mobile: the editor (with the bottom bar) opens collapsed
  const expandEditor = page.getByRole('button', { name: 'Expand editor', exact: true });
  if (await expandEditor.isVisible()) await expandEditor.click();
  const downloadPromise = page.waitForEvent('download');
  await exportBoxButton(page).click();
  const download = await downloadPromise;
  // Mobile: back to the navigation
  const expandNavigation = page.getByRole('button', { name: 'Expand navigation', exact: true });
  if (await expandNavigation.isVisible()) await expandNavigation.click();
  return { fileName: download.suggestedFilename(), json: (await readDownloadJson(download)) as any };
}

// Start project whose "Counter box" has a rotated manual layout (x/y not 0)
async function projectWithManualLayout(): Promise<any> {
  const project = await defaultProject();
  const box = project.layers[0].boxes[0];
  box.manualLayout = [
    { trayId: box.trays[0].id, x: 5, y: 10, rotation: 90 },
    { trayId: box.trays[1].id, x: 70, y: 20, rotation: 90 }
  ];
  return project;
}

// Package of "Counter box" with manual layout, exported from an app that has the prepared project
async function layoutPackage(browser: Browser) {
  const source = await projectWithManualLayout();
  const page = await pageWith(browser, source);
  const result = await exportBox(page, 'Counter box');
  await page.context().close();
  return { ...result, source };
}

const trayIdsOf = (box: any): string[] => box.trays.map((t: any) => t.id);

// --- Desktop --------------------------------------------------------------

test.describe('desktop', () => {
  test('BD1 export: file name, content, no container size, only used definitions, no toast', async ({ page }) => {
    await openApp(page);
    const project = await defaultProject();
    const source = project.layers[0].boxes[0];
    const { fileName, json } = await exportBox(page, 'Counter box');
    expect(fileName).toBe('Counter box.box.json');
    expect(json.format).toBe('counterslayer-part');
    expect(json.kind).toBe('box');
    expect(json.part.name).toBe('Counter box');
    expect(json.part.trays).toHaveLength(2);
    expect(json.part.trays.map((t: any) => t.name)).toEqual(['Counter tray', 'More counters']);
    for (const tray of json.part.trays) {
      expect(tray.params.gameContainerWidth).toBeUndefined();
      expect(tray.params.gameContainerDepth).toBeUndefined();
    }
    // All box fields are part of the file
    for (const field of ['tolerance', 'wallThickness', 'floorThickness', 'fillSolidEmpty', 'lidParams']) {
      expect(json.part[field]).toEqual(source[field]);
    }
    // Dependencies: exactly the shapes the trays use
    const used = new Set<string>();
    for (const tray of source.trays) {
      for (const stack of [...tray.params.topLoadedStacks, ...tray.params.edgeLoadedStacks]) used.add(stack[0]);
    }
    const expectedNames = project.counterShapes
      .filter((c: any) => used.has(c.id))
      .map((c: any) => c.name)
      .sort();
    expect(json.dependencies.counterShapes.map((c: any) => c.name).sort()).toEqual(expectedNames);
    expect(json.dependencies.cardSizes).toEqual([]);
    expect(json.dependencies.standees).toEqual([]);
    await page.waitForTimeout(500);
    await expect(page.getByText('Export failed')).toHaveCount(0);
    await expect(page.getByText('Box exported')).toHaveCount(0);
    await expect(anyDialog(page)).toHaveCount(0);
  });

  test('BD1b export button for tray and box, not for layer', async ({ page }) => {
    await openApp(page);
    await boxRow(page, 'Counter box').click();
    await expect(exportBoxButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export tray', exact: true })).toHaveCount(0);
    await trayRow(page, 'Counter tray').click();
    await expect(page.getByRole('button', { name: 'Export tray', exact: true })).toBeVisible();
    await expect(exportBoxButton(page)).toHaveCount(0);
    await page.locator('.navItem--layer').first().click();
    await expect(page.getByRole('button', { name: 'Export tray', exact: true })).toHaveCount(0);
    await expect(exportBoxButton(page)).toHaveCount(0);
  });

  test('BD2 + BD3 layout is kept and refers to the new tray IDs; box and tray IDs are new', async ({ browser }) => {
    const { fileName, json, source } = await layoutPackage(browser);
    const sourceBox = source.layers[0].boxes[0];
    expect(json.part.manualLayout).toHaveLength(2);

    const fresh = await pageWith(browser);
    await importBoxFile(fresh, 0, fileName, json);
    await expect(fresh.getByRole('dialog', { name: 'Import box "Counter box"?' })).toBeVisible();
    await expect(preview(fresh)).toContainText('Box · 2 trays (Counters) · manual layout');
    await confirmImport(fresh);
    await expect(toastText(fresh, BOX_TOAST)).toBeVisible();

    const stored = await readStoredProject(fresh, (p) => p.layers[0].boxes.length === 2);
    const imported = stored.layers[0].boxes[1];
    expect(imported.name).toBe('Counter box (2)');
    // BD2: same positions and rotation, same order
    expect(imported.manualLayout).toHaveLength(2);
    expect(imported.manualLayout.map((m: any) => [m.x, m.y, m.rotation])).toEqual(
      sourceBox.manualLayout.map((m: any) => [m.x, m.y, m.rotation])
    );
    expect(imported.manualLayout.map((m: any) => m.trayId)).toEqual(trayIdsOf(imported));
    // BD3: new IDs everywhere
    const sourceIds = [sourceBox.id, ...trayIdsOf(sourceBox)];
    expect(sourceIds).not.toContain(imported.id);
    for (const id of trayIdsOf(imported)) expect(sourceIds).not.toContain(id);
    for (const entry of imported.manualLayout) {
      expect(trayIdsOf(imported)).toContain(entry.trayId);
      expect(sourceIds).not.toContain(entry.trayId);
    }
    await fresh.context().close();
  });

  test('BD4 too large box: warning in preview and toast, import still happens, values kept', async ({ browser }) => {
    const project = await projectWithManualLayout();
    project.layers[0].boxes[0].customWidth = 300;
    const sourcePage = await pageWith(browser, project);
    const { fileName, json } = await exportBox(sourcePage, 'Counter box');
    await sourcePage.context().close();
    expect(json.part.customWidth).toBe(300);

    const page = await pageWith(browser);
    await importBoxFile(page, 0, fileName, json);
    await expect(preview(page)).toContainText('"Counter box (2)"');
    await expect(preview(page)).toContainText('is larger than the game container (150 × 200 mm)');
    await confirmImport(page);
    await expect(toastText(page, BOX_TOAST)).toBeVisible();
    await expect(toastText(page, 'is larger than the game container')).toBeVisible();
    await expect(page.getByText(FAIL_TOAST)).toHaveCount(0);

    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    const imported = stored.layers[0].boxes[1];
    expect(imported.customWidth).toBe(300);
    expect(imported.manualLayout.map((m: any) => [m.x, m.y, m.rotation])).toEqual([
      [5, 10, 90],
      [70, 20, 90]
    ]);
    await page.context().close();
  });

  test('BD5 orphaned and duplicate layout entries are reported and not stored', async ({ browser }) => {
    const { fileName, json } = await layoutPackage(browser);
    const pkg = structuredClone(json);
    const [first] = pkg.part.manualLayout;
    pkg.part.manualLayout = [first, { ...first, x: 99 }, { trayId: 'ghost-tray', x: 1, y: 2, rotation: 0 }];

    const page = await pageWith(browser);
    await importBoxFile(page, 0, fileName, pkg);
    await expect(preview(page)).toContainText('1 manual layout entry without a matching tray dropped');
    await expect(preview(page)).toContainText('1 duplicate manual layout entry dropped');
    await confirmImport(page);
    await expect(toastText(page, BOX_TOAST)).toBeVisible();
    await expect(toastText(page, 'without a matching tray dropped')).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    const imported = stored.layers[0].boxes[1];
    expect(imported.manualLayout).toHaveLength(1);
    expect(imported.manualLayout[0]).toMatchObject({ trayId: imported.trays[0].id, x: 5, y: 10, rotation: 90 });
    await page.context().close();
  });

  test('BD6 same box into the same project is counted up, trays too', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportBox(page, 'Counter box');
    await importBoxFile(page, 0, fileName, json);
    await expect(preview(page)).toContainText('A box "Counter box" already exists – will be added as "Counter box (2)"');
    await expect(preview(page)).toContainText('to layer "Bottom layer"');
    await expect(preview(page)).toContainText(
      'Trays renamed: Counter tray → Counter tray (2), More counters → More counters (2).'
    );
    await confirmImport(page);
    await expect(toastText(page, BOX_TOAST)).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    expect(stored.layers[0].boxes.map((b: any) => b.name)).toEqual(['Counter box', 'Counter box (2)']);
    expect(stored.layers[0].boxes[1].trays.map((t: any) => t.name)).toEqual(['Counter tray (2)', 'More counters (2)']);
    // Definitions with the same content are reused
    expect(stored.counterShapes).toHaveLength(4);
  });

  test('BD7 layer layout stays untouched, new box is shown', async ({ browser }) => {
    const project = await defaultProject();
    const box = project.layers[0].boxes[0];
    project.layers[0].manualLayout = {
      boxes: [{ boxId: box.id, x: 0, y: 0, rotation: 0 }],
      looseTrays: [{ trayId: project.layers[0].looseTrays[0].id, x: 0, y: 100, rotation: 0 }]
    };
    const page = await pageWith(browser, project);
    const { fileName, json } = await exportBox(page, 'Counter box');
    await importBoxFile(page, 0, fileName, json);
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    expect(stored.layers[0].manualLayout).toEqual(project.layers[0].manualLayout);
    await expect(boxRow(page, 'Counter box (2)')).toBeVisible();
    await page.context().close();
  });

  test('BD8 missing definition: error toast with path, no dialog, project unchanged', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportBox(page, 'Counter box');
    const pkg = structuredClone(json);
    pkg.part.trays[0].params.topLoadedStacks[0][0] = 'k3x9a2b';
    const rawBefore = await settledRaw(page);
    await importBoxFile(page, 0, fileName, pkg);
    await expect(toastText(page, FAIL_TOAST)).toBeVisible();
    await expect(page.getByText('part.trays[0]').first()).toBeVisible();
    await expect(page.getByText('k3x9a2b').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('BD9 geometry of the imported box without errors via ?debug=1&boxId=', async ({ browser }) => {
    const { fileName, json } = await layoutPackage(browser);
    const page = await pageWith(browser);
    await importBoxFile(page, 0, fileName, json);
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    const boxId = stored.layers[0].boxes[1].id;
    const raw = await settledRaw(page);
    await page.context().close();

    const context = await browser.newContext();
    const view = await context.newPage();
    await view.addInitScript(
      ([key, value]) => localStorage.setItem(key as string, value as string),
      [STORAGE_KEY, raw as string]
    );
    await view.goto(`/?debug=1&boxId=${boxId}`);
    await expect(headerButton(view)).toBeVisible();
    await waitForGeometry(view);
    await expect(view.locator('.errorBanner')).toHaveCount(0);
    await expect(view.getByText('failed', { exact: false })).toHaveCount(0);
    await context.close();
  });

  for (const how of ['Cancel button', 'Escape', 'backdrop'] as const) {
    test(`BD10 ${how} changes nothing, focus returns to "Add box", file can be chosen again`, async ({ page }) => {
      await openApp(page);
      const { fileName, json } = await exportBox(page, 'Counter box');
      const rawBefore = await settledRaw(page);
      await importBoxFile(page, 0, fileName, json);
      await expect(partImportDialog(page)).toBeVisible();
      if (how === 'Cancel button') await importButton(page, 'Cancel').click();
      else if (how === 'Escape') await page.keyboard.press('Escape');
      else await page.locator('.modalDialog').click({ position: { x: 5, y: 5 } });
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(page.getByText(BOX_TOAST)).toHaveCount(0);
      expect(await settledRaw(page)).toBe(rawBefore);
      await expect(addBoxTrigger(page, 0)).toBeFocused();

      await importBoxFile(page, 0, fileName, json);
      await expect(partImportDialog(page)).toBeVisible();
    });
  }

  test('BD11a tray file via "Add box": "Import as tray", lands loose in this layer', async ({ page }) => {
    await openApp(page);
    await trayRow(page, 'Counter tray').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export tray', exact: true }).click();
    const tray = await readDownloadJson(await downloadPromise);

    await importBoxFile(page, 0, 'Counter tray.tray.json', tray);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a tray, not a box. Import it as tray?' })
    ).toBeVisible();
    await expect(preview(page)).toContainText('as a loose tray to layer "Bottom layer"');
    await confirmImport(page, 'Import as tray');
    await expect(toastText(page, 'Imported as tray')).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.layers[0].looseTrays.length === 2);
    expect(stored.layers[0].looseTrays.map((t: any) => t.name)).toContain('Counter tray (2)');
    expect(stored.layers[0].boxes[0].trays).toHaveLength(2);
  });

  test('BD11b box file via "Add tray" (box) and "Add loose tray": "Import as box" in the layer', async ({
    page
  }) => {
    await openApp(page);
    const { fileName, json } = await exportBox(page, 'Counter box');

    await importTrayFile(page, false, 0, fileName, json);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a box, not a tray. Import it as box?' })
    ).toBeVisible();
    await expect(preview(page)).toContainText('to layer "Bottom layer"');
    await confirmImport(page, 'Import as box');
    await expect(toastText(page, 'Imported as box')).toBeVisible();
    await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);

    // "Add loose tray" of the middle layer
    await importTrayFile(page, true, 1, fileName, json);
    await expect(preview(page)).toContainText('to layer "Middle layer"');
    await confirmImport(page, 'Import as box');
    const stored = await readStoredProject(page, (p) => p.layers[1].boxes.length === 1);
    expect(stored.layers[0].boxes).toHaveLength(2);
    expect(stored.layers[1].boxes[0].name).toBe('Counter box (3)');
  });

  test('BD11c counter file via "Add box": "Import as counter"', async ({ page }) => {
    await openApp(page);
    const pkg = {
      format: 'counterslayer-part',
      formatVersion: 1,
      kind: 'counterShape',
      exportedAt: '2026-01-01T00:00:00.000Z',
      part: { id: 'src-wide', name: 'Wide', baseShape: 'square', width: 15.9, length: 15.9, thickness: 1.3 },
      dependencies: { counterShapes: [], cardSizes: [], standees: [] }
    };
    await importBoxFile(page, 0, 'Wide.counter.json', pkg);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a counter, not a box. Import it as counter?' })
    ).toBeVisible();
    await confirmImport(page, 'Import as counter');
    await expect(toastText(page, 'Imported as counter')).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.counterShapes.some((c: any) => c.name === 'Wide'));
    expect(stored.layers[0].boxes).toHaveLength(1);
  });

  test('BD11d box file in the globals panel: error toast, project unchanged', async ({ page }) => {
    await openApp(page);
    const { json } = await exportBox(page, 'Counter box');
    // The globals panel is only shown while nothing is selected
    await page.reload();
    await expect(headerButton(page)).toBeVisible();
    const rawBefore = await settledRaw(page);
    await page.locator('input[type="file"][aria-label="Import counter file"]').setInputFiles({
      name: 'Counter box.box.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(json))
    });
    await expect(toastText(page, 'Counter import failed')).toBeVisible();
    await expect(page.getByText('Boxes are imported via').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('BD12 export with dead reference: download plus info toast', async ({ browser }) => {
    const project = await defaultProject();
    project.layers[0].boxes[0].trays[0].params.topLoadedStacks[0][0] = 'no-such-shape';
    const page = await pageWith(browser, project);
    const { fileName } = await exportBox(page, 'Counter box');
    expect(fileName).toBe('Counter box.box.json');
    await expect(toastText(page, 'Box exported with warnings')).toBeVisible();
    await expect(page.getByText('trays[0]').first()).toBeVisible();
    await page.context().close();
  });

  test('BD13 after the import the new box and its first tray are selected', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportBox(page, 'Counter box');
    await importBoxFile(page, 0, fileName, json);
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    const imported = stored.layers[0].boxes[1];
    await expect.poll(async () => (await readStoredProject(page)).selectedBoxId).toBe(imported.id);
    expect((await readStoredProject(page)).selectedTrayId).toBe(imported.trays[0].id);
    await expect(boxRow(page, 'Counter box (2)')).toHaveClass(/navItem--selected/);
    // The editor shows the export button of the box
    await expect(exportBoxButton(page)).toBeVisible();
  });

  test('BD14 "Import from file…" of "Add box" opens a single-file chooser; tray popover unchanged', async ({ page }) => {
    await openApp(page);
    await addBoxTrigger(page, 0).click();
    await expect(page.getByText('Box from a .box.json file')).toBeVisible();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /^Import from file…/ }).click();
    expect((await chooserPromise).isMultiple()).toBe(false);
    await expect(page.locator('input[type="file"][aria-label="Import box file"]')).toHaveAttribute(
      'accept',
      '.json,application/json'
    );
    await expect(addTrayTrigger(page, false, 0)).toBeVisible();
  });
});

// --- Mobile ---------------------------------------------------------------

test.describe('mobile layout (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('BM1 export: button fully in viewport, file "Counter box.box.json"', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await boxRow(page, 'Counter box').click();
    await page.getByRole('button', { name: 'Expand editor' }).click();
    await expect(exportBoxButton(page)).toBeInViewport({ ratio: 1 });
    const downloadPromise = page.waitForEvent('download');
    await exportBoxButton(page).click();
    expect((await downloadPromise).suggestedFilename()).toBe('Counter box.box.json');
  });

  test('BM2 import: dialog fully in viewport, Import clickable, layout on new IDs', async ({ browser }) => {
    const source = await projectWithManualLayout();
    const sourcePage = await pageWith(browser, source, true);
    const { fileName, json } = await exportBox(sourcePage, 'Counter box');
    await sourcePage.context().close();

    const page = await pageWith(browser, undefined, true);
    await importBoxFile(page, 0, fileName, json);
    await expect(page.getByRole('dialog', { name: 'Import box "Counter box"?' })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await expect(preview(page)).toContainText('manual layout');
    await importButton(page).click();
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(toastText(page, BOX_TOAST)).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.layers[0].boxes.length === 2);
    const imported = stored.layers[0].boxes[1];
    const sourceIds = trayIdsOf(source.layers[0].boxes[0]);
    expect(imported.manualLayout).toHaveLength(2);
    for (const entry of imported.manualLayout) {
      expect(trayIdsOf(imported)).toContain(entry.trayId);
      expect(sourceIds).not.toContain(entry.trayId);
    }
    expect((await storedBoxes(page)).map((b) => b.name)).toEqual(['Counter box', 'Counter box (2)']);
    await page.context().close();
  });

  test('BM3 too large box: warning visible in the dialog', async ({ browser }) => {
    const project = await defaultProject();
    project.layers[0].boxes[0].customWidth = 300;
    const sourcePage = await pageWith(browser, project, true);
    const { fileName, json } = await exportBox(sourcePage, 'Counter box');
    await sourcePage.context().close();

    const page = await pageWith(browser, undefined, true);
    await importBoxFile(page, 0, fileName, json);
    await expect(page.getByRole('dialog')).toBeInViewport({ ratio: 1 });
    const warning = preview(page).getByText('is larger than the game container', { exact: false });
    await expect(warning).toBeVisible();
    await expect(warning).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await page.context().close();
  });

  test('BM4 orphaned layout entry: message visible in the dialog', async ({ browser }) => {
    const { fileName, json } = await layoutPackage(browser);
    const pkg = structuredClone(json);
    pkg.part.manualLayout.push({ trayId: 'ghost-tray', x: 1, y: 2, rotation: 0 });

    const page = await pageWith(browser, undefined, true);
    await importBoxFile(page, 0, fileName, pkg);
    await expect(page.getByRole('dialog')).toBeInViewport({ ratio: 1 });
    const message = preview(page).getByText('without a matching tray dropped', { exact: false });
    await expect(message).toBeVisible();
    await expect(message).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await page.context().close();
  });
});
