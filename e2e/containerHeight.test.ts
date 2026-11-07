import { expect, test, type Page } from '@playwright/test';
import {
  confirmImport,
  containerHeightField,
  containerHeightStatus,
  defaultProject,
  exportCurrentProject,
  exportLayerButton,
  exportViaBottomBar,
  importJson,
  importLayerFile,
  layerRow,
  openEditorFor,
  pageWith,
  previewOf,
  readStoredProject,
  settledRaw,
  toastText
} from './helpers.js';

// E2E tests for F3a.4-F3a.6 (optional game container height: globals panel, navigation, persistence)

const START_TOTAL = 'Layers total: 104.5 mm';

async function setHeight(page: Page, typed: string): Promise<void> {
  const field = containerHeightField(page);
  await field.scrollIntoViewIfNeeded();
  await field.fill(typed);
  await field.blur();
}

// Compact status in the navigation, under the layer list
function navStatus(page: Page) {
  return page.locator('.navTree .containerHeightStatus');
}

// Height shown in a layer row of the navigation
function navLayerHeight(page: Page, layerName: string) {
  return layerRow(page, layerName).locator('.navItemHeight');
}

// After a reload mobile starts with the navigation collapsed
async function expandNavIfCollapsed(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand navigation' });
  if (await expand.isVisible()) await expand.click();
}

for (const mobile of [false, true]) {
  test.describe(`Game container height (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('empty: shows only the total, no limit, no warning', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      const field = containerHeightField(page);
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      await expect(field).toHaveValue('');
      await expect(field).toHaveAttribute('placeholder', 'Optional');
      await expect(containerHeightStatus(page)).toHaveText(START_TOTAL);
      await expect(containerHeightStatus(page)).toHaveAttribute('role', 'status');
      await page.context().close();
    });

    test('large value: "of 200.0 mm", no "too tall"', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '200');
      const status = containerHeightStatus(page);
      await expect(status).toHaveText(`${START_TOTAL} of 200.0 mm – 95.5 mm free`);
      await expect(status).not.toContainText('too tall');
      await expect(status).toHaveClass(/containerHeightStatus--ok/);
      await page.context().close();
    });

    test('small value: "too tall by"', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '50');
      const status = containerHeightStatus(page);
      await expect(status).toContainText('of 50.0 mm – too tall by');
      await expect(status).toHaveClass(/containerHeightStatus--tooTall/);
      await page.context().close();
    });

    test('"60,5" (decimal comma) is stored as 60.5', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '60,5');
      await expect(containerHeightStatus(page)).toContainText('of 60.5 mm');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 60.5);
      expect(stored.globalSettings.gameContainerHeight).toBe(60.5);
      await page.context().close();
    });

    test('value below the minimum is clamped to 1 mm', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '0.2');
      await expect(containerHeightField(page)).toHaveValue('1');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 1);
      expect(stored.globalSettings.gameContainerHeight).toBe(1);
      await page.context().close();
    });

    test('clearing the field removes the key from the stored project', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '80');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 80);
      await setHeight(page, '');
      await expect(containerHeightStatus(page)).toHaveText(START_TOTAL);
      const stored = await readStoredProject(page, (p) => p.globalSettings && !('gameContainerHeight' in p.globalSettings));
      expect('gameContainerHeight' in stored.globalSettings).toBe(false);
      await page.context().close();
    });

    test('width and depth stay unchanged, trays get no height param', async ({ browser }) => {
      const start = await defaultProject();
      const page = await pageWith(browser, start, mobile);
      await setHeight(page, '75');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 75);
      expect(stored.globalSettings.gameContainerWidth).toBe(150);
      expect(stored.globalSettings.gameContainerDepth).toBe(200);
      const trays = stored.layers.flatMap((l: any) => [...l.boxes.flatMap((b: any) => b.trays), ...(l.looseTrays ?? [])]);
      expect(trays.length).toBeGreaterThan(0);
      const startTrays = start.layers.flatMap((l: any) => [...l.boxes.flatMap((b: any) => b.trays), ...(l.looseTrays ?? [])]);
      for (const tray of trays) {
        const before = startTrays.find((t: any) => t.id === tray.id);
        expect(tray.params.gameContainerWidth).toBe(before.params.gameContainerWidth);
        expect(tray.params.gameContainerDepth).toBe(before.params.gameContainerDepth);
        expect(tray.params).not.toHaveProperty('gameContainerHeight');
      }
      await page.context().close();
    });

    test('project without globalSettings: setting the height keeps the effective size (not 256x256)', async ({ browser }) => {
      const project = await defaultProject();
      delete project.globalSettings;
      const page = await pageWith(browser, project, mobile);
      await setHeight(page, '90');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 90);
      expect(stored.globalSettings.gameContainerWidth).toBe(150);
      expect(stored.globalSettings.gameContainerDepth).toBe(200);
      await page.context().close();
    });

    // --- F3a.5: navigation ---------------------------------------------------

    test('F3a.5 navigation shows the height of every layer of the start project', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await expect(page.locator('.navItem--layer .navItemHeight')).toHaveText(['27.0 mm', '52.0 mm', '25.5 mm']);
      await expect(navLayerHeight(page, 'Bottom layer')).toHaveText('27.0 mm');
      await expect(navLayerHeight(page, 'Middle layer')).toHaveText('52.0 mm');
      await expect(navLayerHeight(page, 'Top layer')).toHaveText('25.5 mm');
      await expect(navStatus(page)).toHaveText('Total 104.5 mm');
      await expect(navStatus(page)).toHaveAttribute('role', 'status');
      await page.context().close();
    });

    test('F3a.5 deleting a layer lowers the total in the navigation and the globals panel', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await layerRow(page, 'Bottom layer').getByTitle('Delete layer').click();
      await page.getByRole('button', { name: 'Delete layer', exact: true }).last().click();
      await expect(page.locator('.navItem--layer')).toHaveCount(2);
      await expect(navStatus(page)).toHaveText('Total 77.5 mm');
      await expect(containerHeightStatus(page)).toHaveText('Layers total: 77.5 mm');
      await page.context().close();
    });

    for (const [typed, shown, tooTall] of [
      ['200', '200.0', false],
      ['50', '50.0', true]
    ] as const) {
      test(`F3a.5 height ${typed}: navigation and globals panel agree`, async ({ browser }) => {
        const page = await pageWith(browser, await defaultProject(), mobile);
        await setHeight(page, typed);
        const nav = navStatus(page);
        const globals = containerHeightStatus(page);
        if (tooTall) {
          await expect(nav).toHaveText('too tall by 54.5 mm');
          await expect(globals).toHaveText(`${START_TOTAL} of ${shown} mm – too tall by 54.5 mm`);
          await expect(nav).toHaveClass(/containerHeightStatus--tooTall/);
          await expect(globals).toHaveClass(/containerHeightStatus--tooTall/);
        } else {
          await expect(nav).toHaveText(`Total 104.5 / ${shown} mm · 95.5 mm free`);
          await expect(globals).toHaveText(`${START_TOTAL} of ${shown} mm – 95.5 mm free`);
          await expect(nav).toHaveClass(/containerHeightStatus--ok/);
          await expect(globals).toHaveClass(/containerHeightStatus--ok/);
        }
        await page.context().close();
      });
    }

    // --- F3b.2: remaining space ---------------------------------------------

    test('F3b.2 height equal to the total: "0.0 mm free"', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '104.5');
      await expect(containerHeightStatus(page)).toHaveText(`${START_TOTAL} of 104.5 mm – 0.0 mm free`);
      await expect(navStatus(page)).toHaveText('Total 104.5 / 104.5 mm · 0.0 mm free');
      await page.context().close();
    });

    test('F3b.2 deleting a layer raises the remaining space', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '200');
      await expect(navStatus(page)).toHaveText('Total 104.5 / 200.0 mm · 95.5 mm free');
      await layerRow(page, 'Bottom layer').getByTitle('Delete layer').click();
      await page.getByRole('button', { name: 'Delete layer', exact: true }).last().click();
      await expect(page.locator('.navItem--layer')).toHaveCount(2);
      await expect(navStatus(page)).toHaveText('Total 77.5 / 200.0 mm · 122.5 mm free');
      await expect(containerHeightStatus(page)).toHaveText('Layers total: 77.5 mm of 200.0 mm – 122.5 mm free');
      await page.context().close();
    });

    test('F3b.2 tooTall shows no "free"', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '50');
      await expect(containerHeightStatus(page)).not.toContainText('free');
      await expect(navStatus(page)).not.toContainText('free');
      await page.context().close();
    });

    test('F3a.5 editor shows the layer height with one decimal place', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, layerRow(page, 'Top layer'));
      const dims = page.locator('.layerContents .treeItemDims');
      await expect(dims.first()).toBeVisible();
      await expect(dims.filter({ hasText: '25.5' })).not.toHaveCount(0);
      await page.context().close();
    });

    // --- F3a.6: persistence --------------------------------------------------

    test('F3a.6 value survives a reload', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '123.4');
      const raw = await settledRaw(page);
      expect(JSON.parse(raw as string).globalSettings.gameContainerHeight).toBe(123.4);
      await page.reload();
      await expandNavIfCollapsed(page);
      await expect(containerHeightField(page)).toHaveValue('123.4');
      await expect(navStatus(page)).toHaveText('Total 104.5 / 123.4 mm · 18.9 mm free');
      await page.context().close();
    });

    test('F3a.6 JSON export and import keep the value', async ({ browser }) => {
      const source = await pageWith(browser, undefined, mobile);
      await setHeight(source, '120.5');
      await readStoredProject(source, (p) => p.globalSettings?.gameContainerHeight === 120.5);
      const { json } = await exportCurrentProject(source);
      expect((json as any).globalSettings.gameContainerHeight).toBe(120.5);
      await source.context().close();

      const page = await pageWith(browser, undefined, mobile);
      await expect(containerHeightField(page)).toHaveValue('');
      await importJson(page, 'height.json', json);
      await expect(containerHeightField(page)).toHaveValue('120.5');
      await expect(navStatus(page)).toHaveText('Total 104.5 / 120.5 mm · 16.0 mm free');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 120.5);
      expect(stored.globalSettings.gameContainerHeight).toBe(120.5);
      await page.context().close();
    });

    test('F3a.6 project without the field stays without it after import', async ({ browser }) => {
      const project = await defaultProject();
      const page = await pageWith(browser, undefined, mobile);
      await importJson(page, 'plain.json', project);
      await expect(navStatus(page)).toHaveText('Total 104.5 mm');
      await expect(containerHeightField(page)).toHaveValue('');
      // Force a save so that the stored project exists
      await setHeight(page, '70');
      await setHeight(page, '');
      const stored = await readStoredProject(page, (p) => p.globalSettings && !('gameContainerHeight' in p.globalSettings));
      expect('gameContainerHeight' in stored.globalSettings).toBe(false);
      await page.context().close();
    });

    test('F3a.6 importing a project without the field replaces an existing value', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '70');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 70);
      await importJson(page, 'plain.json', await defaultProject());
      await expect(containerHeightField(page)).toHaveValue('');
      await expect(navStatus(page)).toHaveText('Total 104.5 mm');
      await page.context().close();
    });

    test('F3a.6 layer import (F1) keeps the field and raises the total', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '150');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 150);
      const { fileName, json } = await exportViaBottomBar(page, layerRow(page, 'Bottom layer'), exportLayerButton(page));
      await importLayerFile(page, fileName, json);
      await confirmImport(page);
      await expect(page.locator('.navItem--layer')).toHaveCount(4);
      await expect(navStatus(page)).toHaveText('Total 131.5 / 150.0 mm · 18.5 mm free');
      // The layer editor is open, so the globals panel is not shown: check the stored value
      const stored = await readStoredProject(page, (p) => p.layers.length === 4);
      expect(stored.globalSettings.gameContainerHeight).toBe(150);
      await page.context().close();
    });

    test('F3b.3 layer import: no height warning when the total fits', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '150');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 150);
      const { fileName, json } = await exportViaBottomBar(page, layerRow(page, 'Bottom layer'), exportLayerButton(page));
      await importLayerFile(page, fileName, json);
      await expect(previewOf(page)).not.toContainText('was added.');
      await confirmImport(page);
      await expect(toastText(page, 'Layer imported')).toBeVisible();
      await expect(page.getByText('was added.')).toHaveCount(0);
      await page.context().close();
    });

    test('F3b.3 layer import: too tall gives a warning in preview and toast', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '120');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 120);
      const { fileName, json } = await exportViaBottomBar(page, layerRow(page, 'Bottom layer'), exportLayerButton(page));
      await importLayerFile(page, fileName, json);
      const warning = 'was added. Layers total: 131.5 mm of 120.0 mm – too tall by 11.5 mm';
      await expect(previewOf(page)).toContainText(warning);
      await confirmImport(page);
      await expect(toastText(page, warning)).toBeVisible();
      await expect(page.locator('.navItem--layer')).toHaveCount(4);
      await expect(navStatus(page)).toHaveText('too tall by 11.5 mm');
      await page.context().close();
    });
  });
}
