/* eslint-disable @typescript-eslint/no-explicit-any -- parsed JSON of packages and projects is untyped */
import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  addBoxTrigger,
  addLayerTrigger,
  addTrayTrigger,
  anyDialog,
  confirmImport,
  defaultProject,
  exportLayerButton,
  exportViaBottomBar,
  headerButton,
  importBoxFile,
  importButton,
  importLayerFile,
  importTrayFile,
  layerRow,
  makePartPackage,
  MOBILE_VIEWPORT,
  openApp,
  pageWith,
  partImportDialog,
  previewOf,
  readDownloadJson,
  readStoredProject,
  settledRaw,
  STORAGE_KEY,
  storedLayers,
  toastText,
  waitForGeometry
} from './helpers.js';

// E2E tests for F1.7 (export / import of layers).
// "Fresh project" = new browser context (empty localStorage), not a reload.

const LAYER_TOAST = 'Layer imported';
const FAIL_TOAST = 'Layer import failed';

// --- Helpers --------------------------------------------------------------

// Select a layer in the navigation and export it; returns file name and parsed package
async function exportLayer(page: Page, layerName: string) {
  return exportViaBottomBar(page, layerRow(page, layerName), exportLayerButton(page));
}

// Start project whose "Bottom layer" has a rotated manual layout (box with its own layout + 2 loose trays)
async function projectWithManualLayout(): Promise<any> {
  const project = await defaultProject();
  const layer = project.layers[0];
  const box = layer.boxes[0];
  box.manualLayout = [
    { trayId: box.trays[0].id, x: 5, y: 10, rotation: 90 },
    { trayId: box.trays[1].id, x: 70, y: 20, rotation: 90 }
  ];
  const second = structuredClone(layer.looseTrays[0]);
  second.id = 'second-cup';
  second.name = 'Second cup tray';
  layer.looseTrays.push(second);
  layer.manualLayout = {
    boxes: [{ boxId: box.id, x: 3, y: 7, rotation: 90 }],
    looseTrays: [
      { trayId: layer.looseTrays[0].id, x: 60, y: 11, rotation: 180 },
      { trayId: second.id, x: 10, y: 120, rotation: 90 }
    ]
  };
  return project;
}

// Layer package of "Bottom layer" with manual layout, exported from an app that has the prepared project
async function layoutPackage(browser: Browser) {
  const source = await projectWithManualLayout();
  const page = await pageWith(browser, source);
  const result = await exportLayer(page, 'Bottom layer');
  await page.context().close();
  return { ...result, source };
}

const placements = (entries: any[]): number[][] => entries.map((m) => [m.x, m.y, m.rotation]);

// --- Desktop --------------------------------------------------------------

test.describe('desktop', () => {
  test('LD1 export: file name, content, no container size, only used definitions, no toast', async ({ page }) => {
    await openApp(page);
    const project = await defaultProject();
    const source = project.layers[1];
    const { fileName, json } = await exportLayer(page, 'Middle layer');
    expect(fileName).toBe('Middle layer.layer.json');
    expect(json.format).toBe('counterslayer-part');
    expect(json.kind).toBe('layer');
    expect(json.part.name).toBe('Middle layer');
    expect(json.part.looseTrays.map((t: any) => t.name)).toEqual(source.looseTrays.map((t: any) => t.name));
    expect(json.part.manualLayout).toEqual(source.manualLayout);
    for (const tray of json.part.looseTrays) {
      expect(tray.params.gameContainerWidth).toBeUndefined();
      expect(tray.params.gameContainerDepth).toBeUndefined();
    }
    expect(JSON.stringify(json)).not.toContain('gameContainer');
    // Dependencies: exactly the definitions the trays use
    // "Card draw" uses Standard, "Card Divider" uses Mini European
    expect(json.dependencies.cardSizes.map((c: any) => c.name).sort()).toEqual(['Mini European', 'Standard']);
    expect(json.dependencies.counterShapes).toEqual([]);
    await page.waitForTimeout(500);
    await expect(page.getByText('Export failed')).toHaveCount(0);
    await expect(page.getByText('Layer exported')).toHaveCount(0);
    await expect(anyDialog(page)).toHaveCount(0);
  });

  test('LD2 + LD3 arrangement is kept and refers to the new IDs; all IDs are new', async ({ browser }) => {
    const { fileName, json, source } = await layoutPackage(browser);
    const sourceLayer = source.layers[0];
    expect(json.part.manualLayout.looseTrays).toHaveLength(2);

    const fresh = await pageWith(browser);
    await importLayerFile(fresh, fileName, json);
    await expect(fresh.getByRole('dialog', { name: 'Import layer "Bottom layer"?' })).toBeVisible();
    await expect(previewOf(fresh)).toContainText('Layer · 1 box, 2 loose trays · manual layout');
    await confirmImport(fresh);
    await expect(toastText(fresh, LAYER_TOAST)).toBeVisible();

    const stored = await readStoredProject(fresh, (p) => p.layers.length === 4);
    const imported = stored.layers[3];
    expect(imported.name).toBe('Bottom layer (2)');
    // LD2: same positions, rotation and order on layer and box level
    expect(placements(imported.manualLayout.boxes)).toEqual(placements(sourceLayer.manualLayout.boxes));
    expect(placements(imported.manualLayout.looseTrays)).toEqual(placements(sourceLayer.manualLayout.looseTrays));
    expect(placements(imported.boxes[0].manualLayout)).toEqual(placements(sourceLayer.boxes[0].manualLayout));
    // LD3: new IDs everywhere
    const sourceIds = [
      sourceLayer.id,
      sourceLayer.boxes[0].id,
      ...sourceLayer.boxes[0].trays.map((t: any) => t.id),
      ...sourceLayer.looseTrays.map((t: any) => t.id)
    ];
    const boxIds = imported.boxes.map((b: any) => b.id);
    const looseIds = imported.looseTrays.map((t: any) => t.id);
    expect(sourceIds).not.toContain(imported.id);
    for (const id of [...boxIds, ...looseIds, ...imported.boxes[0].trays.map((t: any) => t.id)]) {
      expect(sourceIds).not.toContain(id);
    }
    expect(imported.manualLayout.boxes.map((m: any) => m.boxId)).toEqual(boxIds);
    expect(imported.manualLayout.looseTrays.map((m: any) => m.trayId)).toEqual(looseIds);
    expect(imported.boxes[0].manualLayout.map((m: any) => m.trayId)).toEqual(
      imported.boxes[0].trays.map((t: any) => t.id)
    );
    await fresh.context().close();
  });

  test('LD4 smaller container: only a warning, layer imported, positions unchanged', async ({ browser }) => {
    const project = await defaultProject();
    project.globalSettings.gameContainerWidth = 300;
    project.globalSettings.gameContainerDepth = 300;
    project.layers[1].manualLayout.looseTrays[1].x = 250;
    const sourcePage = await pageWith(browser, project);
    const { fileName, json } = await exportLayer(sourcePage, 'Middle layer');
    await sourcePage.context().close();

    const page = await pageWith(browser);
    await importLayerFile(page, fileName, json);
    await expect(previewOf(page)).toContainText('the game container is 150 × 200 mm. Positions were kept.');
    await confirmImport(page);
    await expect(toastText(page, LAYER_TOAST)).toBeVisible();
    await expect(toastText(page, 'the game container is 150 × 200 mm')).toBeVisible();
    await expect(page.getByText(FAIL_TOAST)).toHaveCount(0);

    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    expect(stored.layers[3].manualLayout.looseTrays[1].x).toBe(250);
    expect(placements(stored.layers[3].manualLayout.looseTrays)).toEqual(
      placements(project.layers[1].manualLayout.looseTrays)
    );
    await page.context().close();
  });

  test('LD5 orphaned and duplicate layout entries are reported and not stored', async ({ browser }) => {
    const { fileName, json } = await layoutPackage(browser);
    const pkg = structuredClone(json);
    const [first] = pkg.part.manualLayout.looseTrays;
    pkg.part.manualLayout.looseTrays = [first, { ...first, x: 99 }];
    pkg.part.manualLayout.boxes.push({ boxId: 'ghost-box', x: 1, y: 2, rotation: 0 });

    const page = await pageWith(browser);
    await importLayerFile(page, fileName, pkg);
    await expect(previewOf(page)).toContainText('without a matching box or tray dropped');
    await expect(previewOf(page)).toContainText('duplicate');
    await confirmImport(page);
    await expect(toastText(page, LAYER_TOAST)).toBeVisible();
    await expect(toastText(page, 'without a matching box or tray dropped')).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    const imported = stored.layers[3];
    expect(imported.manualLayout.boxes).toHaveLength(1);
    expect(imported.manualLayout.looseTrays).toHaveLength(1);
    expect(imported.manualLayout.looseTrays[0]).toMatchObject({ trayId: imported.looseTrays[0].id, x: 60 });
    await page.context().close();
  });

  test('LD6 same layer into the same project is counted up, boxes and trays too', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportLayer(page, 'Bottom layer');
    await importLayerFile(page, fileName, json);
    await expect(previewOf(page)).toContainText(
      'A layer "Bottom layer" already exists – will be added as "Bottom layer (2)" as the top layer.'
    );
    await expect(previewOf(page)).toContainText('Boxes renamed: Counter box → Counter box (2).');
    await expect(previewOf(page)).toContainText('Trays renamed:');
    await confirmImport(page);
    await expect(toastText(page, LAYER_TOAST)).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    const imported = stored.layers[3];
    expect(imported.name).toBe('Bottom layer (2)');
    expect(imported.boxes.map((b: any) => b.name)).toEqual(['Counter box (2)']);
    expect(imported.boxes[0].trays.map((t: any) => t.name)).toEqual(['Counter tray (2)', 'More counters (2)']);
    expect(imported.looseTrays.map((t: any) => t.name)).toEqual(['Cup tray (2)']);
    // Definitions with the same content are reused
    expect(stored.counterShapes).toHaveLength(4);
  });

  test('LD7 the new layer is the last one, existing layers stay unchanged', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportLayer(page, 'Middle layer');
    // Make sure the project is stored before the comparison
    const before = await storedLayers(page);
    await importLayerFile(page, fileName, json);
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    expect(stored.layers.slice(0, 3)).toEqual(before);
    expect(stored.layers[3].name).toBe('Middle layer (2)');
  });

  test('LD8 missing definition: error toast with path, no dialog, project unchanged', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportLayer(page, 'Bottom layer');
    const pkg = structuredClone(json);
    pkg.part.boxes[0].trays[0].params.topLoadedStacks[0][0] = 'k3x9a2b';
    const rawBefore = await settledRaw(page);
    await importLayerFile(page, fileName, pkg);
    await expect(toastText(page, FAIL_TOAST)).toBeVisible();
    await expect(page.getByText('part.boxes[0].trays[0]').first()).toBeVisible();
    await expect(page.getByText('k3x9a2b').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('LD9 geometry of the imported layer without errors via ?debug=1&layerId=', async ({ browser }) => {
    test.slow();
    const { fileName, json } = await layoutPackage(browser);
    const page = await pageWith(browser);
    await importLayerFile(page, fileName, json);
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    const layerId = stored.layers[3].id;
    const raw = await settledRaw(page);
    await page.context().close();

    const context = await browser.newContext();
    const view = await context.newPage();
    await view.addInitScript(
      ([key, value]) => localStorage.setItem(key as string, value as string),
      [STORAGE_KEY, raw as string]
    );
    await view.goto(`/?debug=1&layerId=${layerId}`);
    await expect(headerButton(view)).toBeVisible();
    await waitForGeometry(view);
    await expect(view.locator('.errorBanner')).toHaveCount(0);
    await expect(view.getByText('failed', { exact: false })).toHaveCount(0);
    await context.close();
  });

  for (const how of ['Cancel button', 'Escape', 'backdrop'] as const) {
    test(`LD10 ${how} changes nothing, focus returns to "Add layer", file can be chosen again`, async ({ page }) => {
      await openApp(page);
      const { fileName, json } = await exportLayer(page, 'Bottom layer');
      const rawBefore = await settledRaw(page);
      await importLayerFile(page, fileName, json);
      await expect(partImportDialog(page)).toBeVisible();
      if (how === 'Cancel button') await importButton(page, 'Cancel').click();
      else if (how === 'Escape') await page.keyboard.press('Escape');
      else await page.locator('.modalDialog').click({ position: { x: 5, y: 5 } });
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(page.getByText(LAYER_TOAST)).toHaveCount(0);
      expect(await settledRaw(page)).toBe(rawBefore);
      await expect(addLayerTrigger(page)).toBeFocused();

      await importLayerFile(page, fileName, json);
      await expect(partImportDialog(page)).toBeVisible();
    });
  }

  test('LD11a layer file via "Add box", "Add tray" and "Add loose tray": "Import as layer"', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportLayer(page, 'Middle layer');

    await importBoxFile(page, 0, fileName, json);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a layer, not a box. Import it as layer?' })
    ).toBeVisible();
    await confirmImport(page, 'Import as layer');
    await expect(toastText(page, 'Imported as layer')).toBeVisible();
    await readStoredProject(page, (p) => p.layers.length === 4);

    await importTrayFile(page, false, 0, fileName, json);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a layer, not a tray. Import it as layer?' })
    ).toBeVisible();
    await confirmImport(page, 'Import as layer');
    await readStoredProject(page, (p) => p.layers.length === 5);

    await importTrayFile(page, true, 1, fileName, json);
    await confirmImport(page, 'Import as layer');
    const stored = await readStoredProject(page, (p) => p.layers.length === 6);
    expect(stored.layers.map((l: any) => l.name).slice(3)).toEqual([
      'Middle layer (2)',
      'Middle layer (3)',
      'Middle layer (4)'
    ]);
    // The existing layers were not touched
    expect(stored.layers[1].looseTrays).toHaveLength(3);
  });

  test('LD11b tray and box file via "Add layer": hint toast, project unchanged', async ({ page }) => {
    await openApp(page);
    await page.locator('.navItem--tray:not(.navItem--add)').first().click();
    const trayDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export tray', exact: true }).click();
    const tray = await readDownloadJson(await trayDownload);
    const layerPkg = (await exportLayer(page, 'Bottom layer')).json;
    const boxPkg = { ...layerPkg, kind: 'box', part: layerPkg.part.boxes[0] };
    const rawBefore = await settledRaw(page);

    await importLayerFile(page, 'x.tray.json', tray);
    await expect(toastText(page, FAIL_TOAST)).toBeVisible();
    await expect(page.getByText('Trays are imported via').first()).toBeVisible();
    await importLayerFile(page, 'x.box.json', boxPkg);
    await expect(page.getByText('Boxes are imported via').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('LD11c counter file via "Add layer": "Import as counter"', async ({ page }) => {
    await openApp(page);
    const pkg = makePartPackage('counterShape', {
      id: 'src-wide',
      name: 'Wide',
      baseShape: 'square',
      width: 15.9,
      length: 15.9,
      thickness: 1.3
    });
    await importLayerFile(page, 'Wide.counter.json', pkg);
    await expect(
      page.getByRole('dialog', { name: 'This file contains a counter, not a layer. Import it as counter?' })
    ).toBeVisible();
    await confirmImport(page, 'Import as counter');
    await expect(toastText(page, 'Imported as counter')).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.counterShapes.some((c: any) => c.name === 'Wide'));
    expect(stored.layers).toHaveLength(3);
  });

  test('LD11d layer file in the globals panel: error toast, project unchanged', async ({ page }) => {
    await openApp(page);
    const { json } = await exportLayer(page, 'Middle layer');
    // The globals panel is only shown while nothing is selected
    await page.reload();
    await expect(headerButton(page)).toBeVisible();
    const rawBefore = await settledRaw(page);
    await page.locator('input[type="file"][aria-label="Import counter file"]').setInputFiles({
      name: 'Middle layer.layer.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(json))
    });
    await expect(toastText(page, 'Counter import failed')).toBeVisible();
    await expect(page.getByText('Layers are imported via').first()).toBeVisible();
    await expect(anyDialog(page)).toHaveCount(0);
    expect(await settledRaw(page)).toBe(rawBefore);
  });

  test('LD12 export with dead reference: download plus info toast', async ({ browser }) => {
    const project = await defaultProject();
    project.layers[1].looseTrays[0].params.cardSizeId = 'no-such-card';
    const page = await pageWith(browser, project);
    const { fileName } = await exportLayer(page, 'Middle layer');
    expect(fileName).toBe('Middle layer.layer.json');
    await expect(toastText(page, 'Layer exported with warnings')).toBeVisible();
    await expect(page.getByText('looseTrays[0]').first()).toBeVisible();
    await page.context().close();
  });

  test('LD13 after the import the new layer is selected and shown as layer', async ({ page }) => {
    await openApp(page);
    const { fileName, json } = await exportLayer(page, 'Middle layer');
    await importLayerFile(page, fileName, json);
    await confirmImport(page);
    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    const imported = stored.layers[3];
    await expect.poll(async () => (await readStoredProject(page)).selectedLayerId).toBe(imported.id);
    await expect(layerRow(page, 'Middle layer (2)')).toHaveClass(/navItem--selected/);
    // The editor shows the layer (export button of the layer)
    await expect(exportLayerButton(page)).toBeVisible();
  });

  test('LD14 "Empty layer" still adds an empty layer; import popover entry is a single-file chooser', async ({
    page
  }) => {
    await openApp(page);
    await addLayerTrigger(page).click();
    await expect(page.getByText('Layer from a .layer.json file')).toBeVisible();
    await page.getByRole('button', { name: /^Empty layer/ }).click();
    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    expect(stored.layers[3]).toMatchObject({ name: 'Layer 4', boxes: [], looseTrays: [] });
    expect(stored.selectedLayerId).toBe(stored.layers[3].id);
    await expect(anyDialog(page)).toHaveCount(0);

    await addLayerTrigger(page).click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /^Import from file…/ }).click();
    expect((await chooserPromise).isMultiple()).toBe(false);
    await expect(page.locator('input[type="file"][aria-label="Import layer file"]')).toHaveAttribute(
      'accept',
      '.json,application/json'
    );
    // Box and tray popovers are unchanged
    await expect(addBoxTrigger(page, 0)).toBeVisible();
    await expect(addTrayTrigger(page, false, 0)).toBeVisible();
  });
});

// --- Mobile ---------------------------------------------------------------

test.describe('mobile layout (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test('LM1 export: button fully in viewport, file "Middle layer.layer.json"', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Expand navigation' }).click();
    await layerRow(page, 'Middle layer').click();
    await page.getByRole('button', { name: 'Expand editor' }).click();
    await expect(exportLayerButton(page)).toBeInViewport({ ratio: 1 });
    const downloadPromise = page.waitForEvent('download');
    await exportLayerButton(page).click();
    expect((await downloadPromise).suggestedFilename()).toBe('Middle layer.layer.json');
  });

  test('LM2 import: dialog fully in viewport, Import clickable, layout on new IDs', async ({ browser }) => {
    const { fileName, json, source } = await layoutPackage(browser);

    const page = await pageWith(browser, undefined, true);
    await importLayerFile(page, fileName, json);
    await expect(page.getByRole('dialog', { name: 'Import layer "Bottom layer"?' })).toBeVisible();
    await expect(page.getByRole('dialog')).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await expect(previewOf(page)).toContainText('manual layout');
    await importButton(page).click();
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(toastText(page, LAYER_TOAST)).toBeVisible();

    const stored = await readStoredProject(page, (p) => p.layers.length === 4);
    const imported = stored.layers[3];
    const sourceIds = source.layers[0].looseTrays.map((t: any) => t.id);
    expect(imported.manualLayout.looseTrays).toHaveLength(2);
    for (const entry of imported.manualLayout.looseTrays) {
      expect(imported.looseTrays.map((t: any) => t.id)).toContain(entry.trayId);
      expect(sourceIds).not.toContain(entry.trayId);
    }
    await expect(layerRow(page, 'Bottom layer (2)')).toBeVisible();
    await page.context().close();
  });

  test('LM3 smaller container: warning visible in the dialog', async ({ browser }) => {
    const project = await defaultProject();
    project.globalSettings.gameContainerWidth = 300;
    project.globalSettings.gameContainerDepth = 300;
    project.layers[1].manualLayout.looseTrays[1].x = 250;
    const sourcePage = await pageWith(browser, project, true);
    const { fileName, json } = await exportLayer(sourcePage, 'Middle layer');
    await sourcePage.context().close();

    const page = await pageWith(browser, undefined, true);
    await importLayerFile(page, fileName, json);
    await expect(page.getByRole('dialog')).toBeInViewport({ ratio: 1 });
    const warning = previewOf(page).getByText('the game container is 150 × 200 mm', { exact: false });
    await expect(warning).toBeVisible();
    await expect(warning).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await page.context().close();
  });

  test('LM4 orphaned layout entry: message visible in the dialog', async ({ browser }) => {
    const { fileName, json } = await layoutPackage(browser);
    const pkg = structuredClone(json);
    pkg.part.manualLayout.looseTrays.push({ trayId: 'ghost-tray', x: 1, y: 2, rotation: 0 });

    const page = await pageWith(browser, undefined, true);
    await importLayerFile(page, fileName, pkg);
    await expect(page.getByRole('dialog')).toBeInViewport({ ratio: 1 });
    const message = previewOf(page).getByText('without a matching box or tray dropped', { exact: false });
    await expect(message).toBeVisible();
    await expect(message).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await page.context().close();
  });
});
