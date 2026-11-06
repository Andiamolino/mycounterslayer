import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  AUTOSAVE_SETTLE_MS,
  anyDialog,
  expandRow,
  headerButton,
  importJson,
  importLink,
  importPartFile,
  makePartPackage,
  openApp,
  partImportDialog,
  readDownloadJson,
  readStoredProject,
  settledRaw,
  toastText,
  type PartKindName
} from './helpers.js';

// E2E tests for F1.4 (export / import of counters, card sizes and standees).
// "Fresh start project" = new browser context (empty localStorage), not a reload.

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const PROJECT_IMPORT_HINT = 'This is a part package – please load it via Import on the part.';

// --- Helpers --------------------------------------------------------------

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openApp(page);
  return page;
}

// Click an Export button and return file name and parsed content
async function exportPart(page: Page, buttonName: string) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  const download = await downloadPromise;
  return { fileName: download.suggestedFilename(), json: (await readDownloadJson(download)) as any };
}

async function counterNames(page: Page): Promise<string[]> {
  return (await readStoredProject(page)).counterShapes.map((c: { name: string }) => c.name);
}

function importButton(page: Page, name = 'Import') {
  return partImportDialog(page).getByRole('button', { name, exact: true });
}

const hexBigCounter = (overrides: Record<string, unknown> = {}) =>
  makePartPackage('counterShape', {
    id: 'src-hex-big',
    name: 'Hex big',
    baseShape: 'hex',
    width: 30,
    length: 30,
    thickness: 2,
    ...overrides
  });

const squareCounter = (overrides: Record<string, unknown> = {}) =>
  makePartPackage('counterShape', {
    id: 'src-square',
    name: 'Square',
    baseShape: 'square',
    width: 15.9,
    length: 15.9,
    thickness: 1.3,
    ...overrides
  });

const standardCard = (overrides: Record<string, unknown> = {}) =>
  makePartPackage('cardSize', {
    id: 'src-card',
    name: 'Standard',
    width: 66,
    length: 91,
    thickness: 0.5,
    ...overrides
  });

// Run the shared scenarios on desktop and mobile layout
function definePartTests() {
  // --- D1 / D8 / D9: export ----------------------------------------------

  test('D1 export counter: file name "Square.counter.json" and package content, no toast', async ({ page }) => {
    await openApp(page);
    await expandRow(page, 'Square');
    const { fileName, json } = await exportPart(page, 'Export counter');
    expect(fileName).toBe('Square.counter.json');
    expect(json.format).toBe('counterslayer-part');
    expect(json.formatVersion).toBe(1);
    expect(json.kind).toBe('counterShape');
    expect(json.part.name).toBe('Square');
    await page.waitForTimeout(500);
    await expect(page.getByText('Export failed')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveText('');
    await expect(anyDialog(page)).toHaveCount(0);
  });

  test('D8 export card size: "Standard.card.json", kind cardSize', async ({ page }) => {
    await openApp(page);
    // "Standard" exists for card sizes (first) and standees (second)
    await expandRow(page, 'Standard', 0);
    const { fileName, json } = await exportPart(page, 'Export card size');
    expect(fileName).toBe('Standard.card.json');
    expect(json.kind).toBe('cardSize');
    expect(json.part.name).toBe('Standard');
    expect(json.part.width).toBe(66);
  });

  test('D9 export standee: "Standard.standee.json", kind standee', async ({ page }) => {
    await openApp(page);
    await expandRow(page, 'Standard', 1);
    const { fileName, json } = await exportPart(page, 'Export standee');
    expect(fileName).toBe('Standard.standee.json');
    expect(json.kind).toBe('standee');
    expect(json.part.name).toBe('Standard');
  });

  // --- D2: roundtrip ------------------------------------------------------

  test('D2 own counter: create, export, import into a fresh project, dialog and toast', async ({ page, browser }) => {
    await openApp(page);
    await page.getByRole('button', { name: '+ New counter' }).click();
    // The new counter is expanded; "Name" fields of other sections are collapsed rows
    await page.locator('input[placeholder="Name"]').first().fill('Hex big');
    await page.locator('input[placeholder="Name"]').first().press('Tab');
    await page.locator('.shapePanel').getByLabel('Width', { exact: true }).fill('30');
    await page.locator('.shapePanel').getByLabel('Width', { exact: true }).press('Tab');
    const sourceProject = await readStoredProject(page, (p) =>
      p.counterShapes.some((c: { name: string; width: number }) => c.name === 'Hex big' && c.width === 30)
    );
    const sourceId = sourceProject.counterShapes.find((c: { name: string }) => c.name === 'Hex big').id;

    const { fileName, json } = await exportPart(page, 'Export counter');
    expect(fileName).toBe('Hex big.counter.json');
    expect(json.part.name).toBe('Hex big');

    const fresh = await freshPage(browser);
    await importPartFile(fresh, 'counter', fileName, json);
    const dialog = partImportDialog(fresh);
    await expect(fresh.getByRole('dialog', { name: 'Import counter "Hex big"?' })).toBeVisible();
    await expect(dialog.locator('.partImportDialog__preview')).toContainText('Hex big');
    await expect(dialog.locator('.partImportDialog__preview')).toContainText('Rectangle · 30 × 30 ×');
    await expect(dialog.locator('.partImportDialog__preview')).toContainText('"Hex big" will be added.');

    await importButton(fresh).click();
    await expect(partImportDialog(fresh)).toHaveCount(0);
    await expect(toastText(fresh, 'Counter imported')).toBeVisible();
    await expect(fresh.getByTitle('Click to edit Hex big', { exact: true })).toBeVisible();

    const stored = await readStoredProject(fresh, (p) =>
      p.counterShapes.some((c: { name: string }) => c.name === 'Hex big')
    );
    const imported = stored.counterShapes.filter((c: { name: string }) => c.name === 'Hex big');
    expect(imported).toHaveLength(1);
    expect(imported[0].id).not.toBe(sourceId);
    expect(imported[0].width).toBe(30);
    await fresh.context().close();
  });

  // --- D4 / D5: conflicts -------------------------------------------------

  test('D4 same file imported twice: second time "already exists", nothing doubled', async ({ page }) => {
    await openApp(page);
    const pkg = hexBigCounter();
    await importPartFile(page, 'counter', 'Hex big.counter.json', pkg);
    await expect(partImportDialog(page).locator('.partImportDialog__preview')).toContainText('will be added.');
    await importButton(page).click();
    await expect(toastText(page, 'Counter imported')).toBeVisible();
    const before = await readStoredProject(page, (p) =>
      p.counterShapes.some((c: { name: string }) => c.name === 'Hex big')
    );

    await importPartFile(page, 'counter', 'Hex big.counter.json', pkg);
    await expect(partImportDialog(page).locator('.partImportDialog__preview')).toContainText(
      '"Hex big" already exists – nothing will be added.'
    );
    await importButton(page).click();
    await expect(partImportDialog(page)).toHaveCount(0);
    await expect(toastText(page, 'Counter already exists')).toBeVisible();
    await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
    const after = await readStoredProject(page);
    expect(after.counterShapes).toHaveLength(before.counterShapes.length);
    expect(after.counterShapes.filter((c: { name: string }) => c.name === 'Hex big')).toHaveLength(1);
  });

  test('D4b default "Square" exported and re-imported: nothing added', async ({ page }) => {
    await openApp(page);
    await expandRow(page, 'Square');
    const { fileName, json } = await exportPart(page, 'Export counter');
    // The expanded counter row has no summary button anymore, only the card size "Square" is left
    const squareRows = page.getByTitle('Click to edit Square', { exact: true });
    await expect(squareRows).toHaveCount(1);
    await importPartFile(page, 'counter', fileName, json);
    await expect(partImportDialog(page).locator('.partImportDialog__preview')).toContainText(
      '"Square" already exists – nothing will be added.'
    );
    await importButton(page).click();
    await expect(toastText(page, 'Counter already exists')).toBeVisible();
    await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
    await expect(squareRows).toHaveCount(1);
    await expect(page.getByTitle('Click to edit Square (2)', { exact: true })).toHaveCount(0);
  });

  test('D5 same name, different values: added as "Square (2)"', async ({ page }) => {
    await openApp(page);
    await importPartFile(page, 'counter', 'Square.counter.json', squareCounter({ thickness: 1.8 }));
    const preview = partImportDialog(page).locator('.partImportDialog__preview');
    await expect(preview).toContainText('Square · 15.9 × 15.9 × 1.8 mm');
    await expect(preview).toContainText('will be added as "Square (2)"');
    await importButton(page).click();
    await expect(toastText(page, 'Square (2)')).toBeVisible();
    const names = await counterNames(page);
    expect(names).toContain('Square (2)');
    const stored = await readStoredProject(page);
    const added = stored.counterShapes.find((c: { name: string }) => c.name === 'Square (2)');
    expect(added.id).not.toBe('src-square');
    expect(added.thickness).toBe(1.8);
  });

  // --- Cancel / Esc / Backdrop -------------------------------------------

  for (const how of ['Cancel button', 'Escape', 'backdrop'] as const) {
    test(`D3 ${how} changes nothing, no toast, same file can be chosen again`, async ({ page }) => {
      await openApp(page);
      const pkg = hexBigCounter();
      const rawBefore = await settledRaw(page);
      await importPartFile(page, 'counter', 'Hex big.counter.json', pkg);
      await expect(partImportDialog(page)).toBeVisible();
      if (how === 'Cancel button') await importButton(page, 'Cancel').click();
      else if (how === 'Escape') await page.keyboard.press('Escape');
      else await page.locator('.modalDialog').click({ position: { x: 5, y: 5 } });
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveText('');
      expect(await settledRaw(page)).toBe(rawBefore);
      await expect(page.getByTitle('Click to edit Hex big', { exact: true })).toHaveCount(0);

      await importPartFile(page, 'counter', 'Hex big.counter.json', pkg);
      await expect(partImportDialog(page)).toBeVisible();
    });
  }

  // --- D6: wrong kind -----------------------------------------------------

  test('D6 card file via "Import counter…": wrong-kind dialog, lands in card sizes', async ({ page }) => {
    await openApp(page);
    await importPartFile(page, 'counter', 'Wide.card.json', standardCard({ name: 'Wide', width: 70 }));
    const dialog = page.getByRole('dialog', {
      name: 'This file contains a card size, not a counter. Import it as card size?'
    });
    await expect(dialog).toBeVisible();
    await importButton(page, 'Import as card size').click();
    await expect(toastText(page, 'Imported as card size')).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.cardSizes.some((c: { name: string }) => c.name === 'Wide'));
    expect(stored.cardSizes.some((c: { name: string }) => c.name === 'Wide')).toBe(true);
    expect(stored.counterShapes.some((c: { name: string }) => c.name === 'Wide')).toBe(false);
  });

  test('D6b wrong kind with differing values: toast names "Standard (2)"', async ({ page }) => {
    await openApp(page);
    await importPartFile(page, 'counter', 'Standard.card.json', standardCard({ width: 70 }));
    await importButton(page, 'Import as card size').click();
    await expect(toastText(page, 'Standard (2)')).toBeVisible();
    const stored = await readStoredProject(page, (p) =>
      p.cardSizes.some((c: { name: string }) => c.name === 'Standard (2)')
    );
    expect(stored.cardSizes.some((c: { name: string }) => c.name === 'Standard (2)')).toBe(true);
  });

  // --- D8 / D9: import of other kinds ------------------------------------

  test('D8b card size import: dialog, values, appears under Card Sizes', async ({ page }) => {
    await openApp(page);
    await importPartFile(page, 'card size', 'Mega.card.json', standardCard({ name: 'Mega', width: 80, length: 120 }));
    await expect(page.getByRole('dialog', { name: 'Import card size "Mega"?' })).toBeVisible();
    await expect(partImportDialog(page).locator('.partImportDialog__preview')).toContainText('80 × 120 × 0.5 mm');
    await importButton(page).click();
    await expect(page.getByTitle('Click to edit Mega', { exact: true })).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.cardSizes.some((c: { name: string }) => c.name === 'Mega'));
    expect(stored.cardSizes.some((c: { name: string }) => c.name === 'Mega')).toBe(true);
  });

  test('D9b standee import: dialog, values, appears under Standees', async ({ page }) => {
    await openApp(page);
    const pkg = makePartPackage('standee', {
      id: 'src-standee',
      name: 'Tall',
      baseRadius: 10,
      baseThickness: 3,
      standeeHeight: 60,
      standeeWidth: 30,
      standeeThickness: 2
    });
    await importPartFile(page, 'standee', 'Tall.standee.json', pkg);
    await expect(page.getByRole('dialog', { name: 'Import standee "Tall"?' })).toBeVisible();
    await expect(partImportDialog(page).locator('.partImportDialog__preview')).toContainText(
      'Base r 10 × 3 mm · Figure 30 × 60 × 2 mm'
    );
    await importButton(page).click();
    await expect(page.getByTitle('Click to edit Tall', { exact: true })).toBeVisible();
    const stored = await readStoredProject(page, (p) => p.standees.some((c: { name: string }) => c.name === 'Tall'));
    expect(stored.standees.some((c: { name: string }) => c.name === 'Tall')).toBe(true);
  });

  // --- D7: invalid files --------------------------------------------------

  const invalidCases: Array<[string, () => unknown]> = [
    ['broken JSON', () => '{ not json'],
    ['project file', () => ({ version: 2, layers: [], counterShapes: [], cardSizes: [] })],
    ['tray package', () => ({ ...squareCounter(), kind: 'tray' })],
    ['width 0', () => squareCounter({ width: 0 })]
  ];
  for (const [label, make] of invalidCases) {
    test(`D7 invalid file (${label}): no dialog, error toast, project unchanged`, async ({ page }) => {
      await openApp(page);
      const rawBefore = await settledRaw(page);
      await importPartFile(page, 'counter', 'bad.json', make());
      await expect(toastText(page, 'Counter import failed')).toBeVisible();
      await expect(anyDialog(page)).toHaveCount(0);
      expect(await settledRaw(page)).toBe(rawBefore);
    });
  }

  // --- D11: project import protection ------------------------------------

  test('D11 part package in "Import project JSON": banner, project unchanged', async ({ page }) => {
    await openApp(page);
    const rawBefore = await settledRaw(page);
    const nameBefore = await headerButton(page).innerText();
    await importJson(page, 'Square.counter.json', squareCounter());
    await expect(page.locator('.errorBanner').first()).toContainText(PROJECT_IMPORT_HINT);
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(headerButton(page)).toHaveText(nameBefore);
    expect(await settledRaw(page)).toBe(rawBefore);
  });
}

test.describe('desktop', () => {
  definePartTests();

  // --- D10: focus ---------------------------------------------------------

  test('D10 focus: starts on confirm button, stays in dialog, returns to import link', async ({ page }) => {
    await openApp(page);
    const kind: PartKindName = 'counter';
    for (const closeWith of ['Cancel', 'Escape', 'Import'] as const) {
      await importPartFile(page, kind, 'x.counter.json', hexBigCounter({ name: `Focus ${closeWith}` }));
      await expect(partImportDialog(page)).toBeVisible();
      await expect(importButton(page)).toBeFocused();

      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
      }
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
      }

      if (closeWith === 'Escape') await page.keyboard.press('Escape');
      else await importButton(page, closeWith).click();
      await expect(anyDialog(page)).toHaveCount(0);
      await expect(importLink(page, kind)).toBeFocused();
    }
  });

  // --- D12: link opens file chooser ---------------------------------------

  test('D12 "Import counter…" opens the file chooser', async ({ page }) => {
    await openApp(page);
    const chooserPromise = page.waitForEvent('filechooser');
    await importLink(page, 'counter').click();
    const chooser = await chooserPromise;
    expect(chooser.isMultiple()).toBe(false);
  });

  test('new counter without conflict says "will be added"', async ({ page }) => {
    await openApp(page);
    await importPartFile(page, 'counter', 'Hex big.counter.json', hexBigCounter());
    await expect(partImportDialog(page).locator('.partImportDialog__preview')).toContainText(
      '"Hex big" will be added.'
    );
  });
});

// --- Mobile ---------------------------------------------------------------

test.describe('mobile layout (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  async function openMobileApp(page: Page): Promise<void> {
    await page.goto('/');
    await expect(headerButton(page)).toBeVisible();
    await page.getByRole('button', { name: 'Expand editor' }).click();
    await expect(page.getByRole('button', { name: '+ New counter' })).toBeVisible();
  }

  test('M1 export counter downloads "Square.counter.json"', async ({ page }) => {
    await openMobileApp(page);
    await expandRow(page, 'Square');
    const { fileName, json } = await exportPart(page, 'Export counter');
    expect(fileName).toBe('Square.counter.json');
    expect(json.kind).toBe('counterShape');
  });

  test('M2 import counter: dialog fully usable, entry and toast visible', async ({ page }) => {
    await openMobileApp(page);
    await importPartFile(page, 'counter', 'Hex big.counter.json', hexBigCounter());
    const dialog = page.getByRole('dialog', { name: 'Import counter "Hex big"?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(importButton(page)).toBeInViewport({ ratio: 1 });
    await importButton(page).click();
    await expect(anyDialog(page)).toHaveCount(0);
    await expect(toastText(page, 'Counter imported')).toBeVisible();
    await expect(page.getByTitle('Click to edit Hex big', { exact: true })).toBeVisible();
    expect(await counterNames(page)).toContain('Hex big');
  });

  test('M3 part package in project import: banner visible, project unchanged', async ({ page }) => {
    await openMobileApp(page);
    const rawBefore = await settledRaw(page);
    await importJson(page, 'Square.counter.json', squareCounter());
    const banner = page.locator('.errorBanner').first();
    await expect(banner).toContainText(PROJECT_IMPORT_HINT);
    await expect(banner).toBeVisible();
    expect(await settledRaw(page)).toBe(rawBefore);
  });
});
