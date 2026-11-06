import { expect, test } from '@playwright/test';
import {
  DEFAULT_NAME,
  STORAGE_KEY,
  expectNoDownload,
  expectProjectName,
  exportCurrentProject,
  headerButton,
  headerInput,
  importJson,
  openApp,
  openExportDialog,
  panelNameField,
  readDownloadJson,
  renameInHeader
} from './helpers.js';

// E2E tests for feature F2 (project name): header editor, Dimensions panel field,
// browser tab title, autosave, JSON import name fallback and JSON export dialog.
// Every test gets a fresh browser context, so localStorage starts empty.

// --- 1. Default name ------------------------------------------------------

test('new project is named "Untitled Project" in header, panel and tab', async ({ page }) => {
  await openApp(page);
  await expectProjectName(page, DEFAULT_NAME);
});

// --- 2. Sync between header and panel ------------------------------------

test('rename in header with Enter updates panel and tab', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, 'Header Name');
  await expect(headerInput(page)).toBeHidden();
  await expectProjectName(page, 'Header Name');
});

test('rename in panel with Enter updates header and tab', async ({ page }) => {
  await openApp(page);
  await panelNameField(page).fill('Panel Enter');
  await panelNameField(page).press('Enter');
  await expectProjectName(page, 'Panel Enter');
});

test('rename in panel with blur updates header and tab', async ({ page }) => {
  await openApp(page);
  await panelNameField(page).fill('Panel Blur');
  await panelNameField(page).blur();
  await expectProjectName(page, 'Panel Blur');
});

// --- 3. Blur in header saves ---------------------------------------------

test('blur in header (click elsewhere) saves the name', async ({ page }) => {
  await openApp(page);
  await headerButton(page).click();
  await headerInput(page).fill('Blur Name');
  await page.locator('.globalsPanel').getByRole('heading', { name: 'Project' }).click();
  await expect(headerInput(page)).toBeHidden();
  await expectProjectName(page, 'Blur Name');
});

// --- 4. Escape, empty input, trimming ------------------------------------

test('Escape in header restores the old name', async ({ page }) => {
  await openApp(page);
  await headerButton(page).click();
  await headerInput(page).fill('Discarded');
  await headerInput(page).press('Escape');
  await expect(headerInput(page)).toBeHidden();
  await expectProjectName(page, DEFAULT_NAME);
});

test('Escape in panel restores the old name', async ({ page }) => {
  await openApp(page);
  await panelNameField(page).fill('Discarded');
  await panelNameField(page).press('Escape');
  await expectProjectName(page, DEFAULT_NAME);
  // A later blur must not save the discarded value either
  await panelNameField(page).blur();
  await expectProjectName(page, DEFAULT_NAME);
});

test('empty and whitespace-only input keeps the name (header)', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, '');
  await expectProjectName(page, DEFAULT_NAME);
  await renameInHeader(page, '   ');
  await expectProjectName(page, DEFAULT_NAME);
});

test('empty and whitespace-only input keeps the name (panel)', async ({ page }) => {
  await openApp(page);
  await panelNameField(page).fill('');
  await panelNameField(page).press('Enter');
  await expectProjectName(page, DEFAULT_NAME);
  await panelNameField(page).fill('   ');
  await panelNameField(page).press('Enter');
  await expectProjectName(page, DEFAULT_NAME);
});

test('leading and trailing spaces are trimmed (header and panel)', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, '  Trimmed Header  ');
  await expectProjectName(page, 'Trimmed Header');
  await panelNameField(page).fill('  Trimmed Panel  ');
  await panelNameField(page).press('Enter');
  await expectProjectName(page, 'Trimmed Panel');
});

// --- 5. Persistence -------------------------------------------------------

test('name survives a page reload', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, 'Persisted Name');
  await expectProjectName(page, 'Persisted Name');

  // Autosave is debounced, wait until the name is in localStorage
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as { name?: string }).name : undefined;
      }, STORAGE_KEY)
    )
    .toBe('Persisted Name');

  await page.reload();
  await expect(headerButton(page)).toBeVisible();
  await expectProjectName(page, 'Persisted Name');
});

// --- 6. Import name fallback ---------------------------------------------

test('import without name uses the file name, import with name keeps it', async ({ page }) => {
  await openApp(page);
  const { json } = await exportCurrentProject(page);

  const withoutName = { ...json };
  delete withoutName.name;
  await importJson(page, 'mein-spiel.json', withoutName);
  await expectProjectName(page, 'mein-spiel');

  await importJson(page, 'anderer-dateiname.json', { ...json, name: 'Mein Name' });
  await expectProjectName(page, 'Mein Name');

  await expect(page.locator('.errorBanner')).toHaveCount(0);
});

// --- 7. Export proposal and file name ------------------------------------

test('export dialog proposes the project name and downloads <name>.json', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, 'Mein Export');

  const dialog = await openExportDialog(page);
  await expect(dialog.getByLabel('File name')).toHaveValue('Mein Export');
  await expect(dialog).toContainText('.json');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Mein Export.json');
  await expect(dialog).toBeHidden();
});

test('unsafe characters: "A/B" proposes "A-B", file "A-B.json", name stays "A/B"', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, 'A/B');
  await expectProjectName(page, 'A/B');

  const dialog = await openExportDialog(page);
  await expect(dialog.getByLabel('File name')).toHaveValue('A-B');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('A-B.json');

  // Saving the proposal "A-B" must not overwrite the project name "A/B"
  await expectProjectName(page, 'A/B');
});

// --- 8. Save under a new name --------------------------------------------

test('saving as "neues-spiel" renames project, file and JSON content', async ({ page }) => {
  await openApp(page);
  const dialog = await openExportDialog(page);
  await dialog.getByLabel('File name').fill('neues-spiel');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('neues-spiel.json');
  const json = await readDownloadJson(download);
  expect(json.name).toBe('neues-spiel');
  await expectProjectName(page, 'neues-spiel');
});

// --- 9. Dialog behaviour --------------------------------------------------

test('dialog: empty field disables Save and Enter does nothing', async ({ page }) => {
  await openApp(page);
  const dialog = await openExportDialog(page);
  const field = dialog.getByLabel('File name');

  await field.fill('');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expectNoDownload(page, () => field.press('Enter'));
  await expect(dialog).toBeVisible();

  await field.fill('   ');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('dialog: Escape and Cancel close without download and keep the name', async ({ page }) => {
  await openApp(page);

  let dialog = await openExportDialog(page);
  await dialog.getByLabel('File name').fill('verworfen');
  await expectNoDownload(page, () => dialog.getByLabel('File name').press('Escape'));
  await expect(dialog).toBeHidden();
  await expectProjectName(page, DEFAULT_NAME);

  dialog = await openExportDialog(page);
  await dialog.getByLabel('File name').fill('verworfen');
  await expectNoDownload(page, () => dialog.getByRole('button', { name: 'Cancel' }).click());
  await expect(dialog).toBeHidden();
  await expectProjectName(page, DEFAULT_NAME);
});

test('dialog: Enter in the field saves', async ({ page }) => {
  await openApp(page);
  const dialog = await openExportDialog(page);
  await dialog.getByLabel('File name').fill('per-enter');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByLabel('File name').press('Enter');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('per-enter.json');
  await expect(dialog).toBeHidden();
  await expectProjectName(page, 'per-enter');
});

// --- 10. Roundtrip and smoke ---------------------------------------------

test('export/import roundtrip keeps the name and the project data', async ({ page }) => {
  await openApp(page);
  await renameInHeader(page, 'Roundtrip');
  const { json } = await exportCurrentProject(page);

  expect(json.name).toBe('Roundtrip');
  expect(Array.isArray(json.layers)).toBe(true);
  expect((json.layers as unknown[]).length).toBeGreaterThan(0);
  expect(Array.isArray(json.counterShapes)).toBe(true);
  expect(Array.isArray(json.cardSizes)).toBe(true);

  await renameInHeader(page, 'Something Else');
  await importJson(page, 'other-file-name.json', json);
  await expectProjectName(page, 'Roundtrip');
  await expect(page.locator('.errorBanner')).toHaveCount(0);

  // Re-export after import still contains the same structure
  const { json: reExported } = await exportCurrentProject(page);
  expect(reExported.name).toBe('Roundtrip');
  expect((reExported.layers as unknown[]).length).toBe((json.layers as unknown[]).length);
});
