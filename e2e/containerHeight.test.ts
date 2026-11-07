import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  confirmImport,
  containerHeightField,
  containerHeightStatus,
  defaultProject,
  exportCurrentProject,
  importJson,
  layerRow,
  lidLiftField,
  openEditorFor,
  pageWith,
  previewOf,
  readStoredProject,
  reimportBottomLayer,
  settledRaw,
  toastText
} from './helpers.js';

// E2E tests for F3a.4-F3a.6 (optional game container height: globals panel, navigation, persistence)

const START_TOTAL = 'Layers total: 104.5 mm';

async function setField(field: Locator, typed: string): Promise<void> {
  await field.scrollIntoViewIfNeeded();
  await field.fill(typed);
  await field.blur();
}

async function setHeight(page: Page, typed: string): Promise<void> {
  await setField(containerHeightField(page), typed);
}

async function setLift(page: Page, typed: string): Promise<void> {
  await setField(lidLiftField(page), typed);
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

// Optional container measures with identical persistence behaviour (height and lid lift).
// importedStatus: navigation status after the layer import raised the total to 131.5 mm.
interface Measure {
  key: string;
  label: string;
  field: (page: Page) => Locator;
  set: (page: Page, typed: string) => Promise<void>;
  value: string;
  statusText: string;
  importedStatus: string;
  // Extra setup before the value is set (lift only counts with a height)
  pre?: (page: Page) => Promise<void>;
}

const MEASURES: Measure[] = [
  {
    key: 'gameContainerHeight',
    label: 'F3a.6 height',
    field: containerHeightField,
    set: setHeight,
    value: '123.4',
    statusText: 'Total 104.5 / 123.4 mm · 18.9 mm free',
    importedStatus: 'too tall by 8.1 mm'
  },
  {
    key: 'lidLiftAllowance',
    label: 'F3d.4 lift',
    field: lidLiftField,
    set: setLift,
    value: '2',
    statusText: 'Total 104.5 / 103.0 mm · lid lifts by 1.5 mm',
    importedStatus: 'too tall by 26.5 mm',
    pre: (page) => setHeight(page, '103')
  }
];

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
      await expect(navStatus(page)).not.toHaveAttribute('role', 'status');
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

    // --- F3d.2: lid lift -------------------------------------------------------

    test('F3d.2 lid lift field: empty, placeholder 0, hint', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      const field = lidLiftField(page);
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      await expect(field).toHaveValue('');
      await expect(field).toHaveAttribute('placeholder', '0');
      await expect(page.getByText('How far the lid may rise above the box. Only used when a height is set.')).toBeVisible();
      await page.context().close();
    });

    test('F3d.2 height 103 + lift 2: lid lifts by 1.5 mm (panel and navigation)', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '103');
      await setLift(page, '2');
      await expect(containerHeightStatus(page)).toHaveText(`${START_TOTAL} of 103.0 mm – lid lifts by 1.5 mm`);
      await expect(navStatus(page)).toHaveText('Total 104.5 / 103.0 mm · lid lifts by 1.5 mm');
      await expect(containerHeightStatus(page)).toHaveClass(/containerHeightStatus--lidLift/);
      await expect(navStatus(page)).toHaveClass(/containerHeightStatus--lidLift/);
      await expect(containerHeightStatus(page)).not.toHaveClass(/containerHeightStatus--ok/);
      await page.context().close();
    });

    test('F3d.2 height 102.5 + lift 1: too tall by 1.0 mm', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '102.5');
      await setLift(page, '1');
      await expect(containerHeightStatus(page)).toHaveText(`${START_TOTAL} of 102.5 mm – too tall by 1.0 mm`);
      await expect(navStatus(page)).toHaveText('too tall by 1.0 mm');
      await page.context().close();
    });

    test('F3d.2 height 103 without lift: too tall by 1.5 mm', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '103');
      await expect(containerHeightStatus(page)).toHaveText(`${START_TOTAL} of 103.0 mm – too tall by 1.5 mm`);
      await page.context().close();
    });

    test('F3d.2 lift -1: field shows 0 or empty, no key in the stored project', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setHeight(page, '90');
      await setLift(page, '3');
      await readStoredProject(page, (p) => p.globalSettings?.lidLiftAllowance === 3);
      await setLift(page, '-1');
      await expect(lidLiftField(page)).toHaveValue(/^(0|)$/);
      const stored = await readStoredProject(page, (p) => p.globalSettings && !('lidLiftAllowance' in p.globalSettings));
      expect('lidLiftAllowance' in stored.globalSettings).toBe(false);
      await page.context().close();
    });

    test('F3d.2 lift 1,5 is stored as 1.5', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setLift(page, '1,5');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.lidLiftAllowance === 1.5);
      expect(stored.globalSettings.lidLiftAllowance).toBe(1.5);
      await page.context().close();
    });

    test('F3d.2 lift without height: only the total', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setLift(page, '2');
      await readStoredProject(page, (p) => p.globalSettings?.lidLiftAllowance === 2);
      await expect(containerHeightStatus(page)).toHaveText(START_TOTAL);
      await expect(navStatus(page)).toHaveText('Total 104.5 mm');
      await page.context().close();
    });

    test('F3d.2 counter trays get no lift param', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await setLift(page, '2');
      const stored = await readStoredProject(page, (p) => p.globalSettings?.lidLiftAllowance === 2);
      const trays = stored.layers.flatMap((l: any) => [...l.boxes.flatMap((b: any) => b.trays), ...(l.looseTrays ?? [])]);
      expect(trays.length).toBeGreaterThan(0);
      for (const tray of trays) expect(tray.params).not.toHaveProperty('lidLiftAllowance');
      await page.context().close();
    });

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

    // --- F3a.6 / F3d.4: persistence of the optional measures -----------------

    for (const m of MEASURES) {
      test(`${m.label} survives a reload`, async ({ browser }) => {
        const page = await pageWith(browser, undefined, mobile);
        await m.pre?.(page);
        await m.set(page, m.value);
        const raw = await settledRaw(page);
        expect(JSON.parse(raw as string).globalSettings[m.key]).toBe(Number(m.value));
        await page.reload();
        await expandNavIfCollapsed(page);
        await expect(m.field(page)).toHaveValue(m.value);
        await expect(navStatus(page)).toHaveText(m.statusText);
        await page.context().close();
      });

      test(`${m.label} is kept by JSON export and import`, async ({ browser }) => {
        const stored = (p: any) => p.globalSettings?.[m.key] === Number(m.value);
        const source = await pageWith(browser, undefined, mobile);
        await m.pre?.(source);
        await m.set(source, m.value);
        await readStoredProject(source, stored);
        const { json } = await exportCurrentProject(source);
        expect((json as any).globalSettings[m.key]).toBe(Number(m.value));
        await source.context().close();

        const page = await pageWith(browser, undefined, mobile);
        await expect(m.field(page)).toHaveValue('');
        await importJson(page, `${m.key}.json`, json);
        await expect(m.field(page)).toHaveValue(m.value);
        await expect(navStatus(page)).toHaveText(m.statusText);
        await readStoredProject(page, stored);
        await page.context().close();
      });

      test(`${m.label}: project without the field stays without the key after import`, async ({ browser }) => {
        const page = await pageWith(browser, undefined, mobile);
        await importJson(page, 'plain.json', await defaultProject());
        await expect(navStatus(page)).toHaveText('Total 104.5 mm');
        await expect(m.field(page)).toHaveValue('');
        // Force a save so that the stored project exists
        await m.set(page, m.value);
        await m.set(page, '');
        const stored = await readStoredProject(page, (p) => p.globalSettings && !(m.key in p.globalSettings));
        expect(m.key in stored.globalSettings).toBe(false);
        await page.context().close();
      });

      test(`${m.label} is kept by layer import (F1)`, async ({ browser }) => {
        const page = await pageWith(browser, undefined, mobile);
        await m.pre?.(page);
        await m.set(page, m.value);
        await readStoredProject(page, (p) => p.globalSettings?.[m.key] === Number(m.value));
        await reimportBottomLayer(page);
        await confirmImport(page);
        await expect(page.locator('.navItem--layer')).toHaveCount(4);
        await expect(navStatus(page)).toHaveText(m.importedStatus);
        // The layer editor is open, so the globals panel is not shown: check the stored value
        const stored = await readStoredProject(page, (p) => p.layers.length === 4);
        expect(stored.globalSettings[m.key]).toBe(Number(m.value));
        await page.context().close();
      });
    }

    test('F3a.6 importing a project without the field replaces an existing value', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '70');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 70);
      await importJson(page, 'plain.json', await defaultProject());
      await expect(containerHeightField(page)).toHaveValue('');
      await expect(navStatus(page)).toHaveText('Total 104.5 mm');
      await page.context().close();
    });

    test('F3d.4 lift field is visible and usable in the viewport', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      const field = lidLiftField(page);
      await field.scrollIntoViewIfNeeded();
      const box = await field.boundingBox();
      const viewport = page.viewportSize();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
      await setLift(page, '1.5');
      await expect(field).toHaveValue('1.5');
      await page.context().close();
    });

    test('F3b.3 layer import: no height warning when the total fits', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await setHeight(page, '150');
      await readStoredProject(page, (p) => p.globalSettings?.gameContainerHeight === 150);
      await reimportBottomLayer(page);
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
      await reimportBottomLayer(page);
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
