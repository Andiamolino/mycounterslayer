import { expect, test, type Page } from '@playwright/test';
import {
  DEFAULT_NAME,
  TITLE_SUFFIX,
  anyDialog,
  expectProjectName,
  exportCurrentProject,
  exportDialog,
  headerButton,
  importExportButton,
  importJson,
  openApp,
  openExportDialog,
  openMenuItem,
  panelNameField,
  renameInHeader,
  waitForGeometry
} from './helpers.js';

// E2E tests for F2.3b (project name as STL/3MF/PDF file name), F2.4 (community
// project names from the manifest), F2.5 (focus trap and focus return in the
// export name dialog) and the mobile layout.

const EXPORT_TIMEOUT = 120_000;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

// --- Helpers --------------------------------------------------------------

// Click an export menu item and return the suggested download file name
async function exportViaMenu(page: Page, itemName: string): Promise<string> {
  await waitForGeometry(page);
  const item = await openMenuItem(page, itemName);
  await expect(item).toBeEnabled({ timeout: EXPORT_TIMEOUT });
  const downloadPromise = page.waitForEvent('download', { timeout: EXPORT_TIMEOUT });
  await item.click();
  const download = await downloadPromise;
  return download.suggestedFilename();
}

async function expectNameKeptWithoutDialog(page: Page, name: string): Promise<void> {
  await expectProjectName(page, name);
  await expect(anyDialog(page)).toHaveCount(0);
}

async function loadCommunityOption(page: Page, pick: (page: Page) => Promise<void>): Promise<void> {
  await importExportButton(page).click();
  await page.getByLabel('Load community project').click();
  await pick(page);
}

async function loadCommunityByName(page: Page, optionName: string): Promise<void> {
  await loadCommunityOption(page, (p) => p.getByRole('option', { name: optionName }).click());
}

async function loadCommunityByIndex(page: Page, index: number): Promise<void> {
  await loadCommunityOption(page, (p) => p.locator('.select__option').nth(index).click());
}

async function expectFocusInsideDialog(page: Page): Promise<void> {
  const isInside = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return !!dialog && !!document.activeElement && dialog.contains(document.activeElement);
  });
  expect(isInside).toBe(true);
}

// --- F2.3b: project name as export file name -----------------------------

test.describe('F2.3b exports use the project name', () => {
  test.setTimeout(300_000);

  test('Export STLs downloads "A-B-stls.zip" and keeps the name', async ({ page }) => {
    await openApp(page);
    await renameInHeader(page, 'A/B');
    expect(await exportViaMenu(page, 'Export STLs')).toBe('A-B-stls.zip');
    await expectNameKeptWithoutDialog(page, 'A/B');
  });

  test('Export 3MF downloads "A-B.3mf" and keeps the name', async ({ page }) => {
    await openApp(page);
    await renameInHeader(page, 'A/B');
    expect(await exportViaMenu(page, 'Export 3MF')).toBe('A-B.3mf');
    await expectNameKeptWithoutDialog(page, 'A/B');
  });

  test('PDF reference downloads "A-B-reference.pdf" and keeps the name', async ({ page }) => {
    await openApp(page);
    await renameInHeader(page, 'A/B');
    expect(await exportViaMenu(page, 'PDF reference')).toBe('A-B-reference.pdf');
    await expectNameKeptWithoutDialog(page, 'A/B');
  });

  test('all three exports in a row keep "A/B"', async ({ page }) => {
    await openApp(page);
    await renameInHeader(page, 'A/B');
    expect(await exportViaMenu(page, 'Export STLs')).toBe('A-B-stls.zip');
    await expectNameKeptWithoutDialog(page, 'A/B');
    expect(await exportViaMenu(page, 'Export 3MF')).toBe('A-B.3mf');
    await expectNameKeptWithoutDialog(page, 'A/B');
    expect(await exportViaMenu(page, 'PDF reference')).toBe('A-B-reference.pdf');
    await expectNameKeptWithoutDialog(page, 'A/B');
  });
});

// --- F2.4: community projects --------------------------------------------

test.describe('F2.4 community projects take the manifest name', () => {
  test('"D-Day: Omaha Beach" appears in header, panel and tab', async ({ page }) => {
    await openApp(page);
    await loadCommunityByName(page, 'D-Day: Omaha Beach');
    await expectProjectName(page, 'D-Day: Omaha Beach');
    await expect(page).toHaveTitle('D-Day: Omaha Beach' + TITLE_SUFFIX);
    await expect(page.locator('.errorBanner')).toHaveCount(0);
  });

  test('"Witchcraft" appears in header, panel and tab', async ({ page }) => {
    await openApp(page);
    await loadCommunityByName(page, 'Witchcraft');
    await expectProjectName(page, 'Witchcraft');
  });

  test.describe('with an intercepted manifest', () => {
    test.beforeEach(async ({ page }) => {
      await page.route('**/projects/manifest.json', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            projects: [
              { id: 'missing-name', author: 'Test', file: 'omaha.json' },
              { id: 'blank-name', name: '   ', author: 'Test', file: 'omaha.json' },
              { id: 'padded-name', name: '  Witchcraft  ', author: 'Test', file: 'witchcraft.json' }
            ]
          })
        })
      );
    });

    test('missing manifest name falls back to the file name "omaha"', async ({ page }) => {
      await openApp(page);
      await loadCommunityByIndex(page, 0);
      await expectProjectName(page, 'omaha');
    });

    test('whitespace-only manifest name falls back to the file name "omaha"', async ({ page }) => {
      await openApp(page);
      await loadCommunityByIndex(page, 1);
      await expectProjectName(page, 'omaha');
    });

    test('manifest name "  Witchcraft  " is trimmed to "Witchcraft"', async ({ page }) => {
      await openApp(page);
      await loadCommunityByIndex(page, 2);
      await expectProjectName(page, 'Witchcraft');
    });
  });
});

// --- F2.5: focus trap and focus return -----------------------------------

test.describe('F2.5 export dialog focus handling', () => {
  test('Tab cycles field → Cancel → Save → field, Shift+Tab backwards', async ({ page }) => {
    await openApp(page);
    const dialog = await openExportDialog(page);
    const field = dialog.getByLabel('File name');
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    const save = dialog.getByRole('button', { name: 'Save' });

    await expect(field).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(save).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(field).toBeFocused();
  });

  test('focus never leaves the dialog after many Tab / Shift+Tab presses', async ({ page }) => {
    await openApp(page);
    await openExportDialog(page);
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      await expectFocusInsideDialog(page);
    }
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Shift+Tab');
      await expectFocusInsideDialog(page);
    }
  });

  test('disabled Save is skipped when the field is empty', async ({ page }) => {
    await openApp(page);
    const dialog = await openExportDialog(page);
    const field = dialog.getByLabel('File name');
    const cancel = dialog.getByRole('button', { name: 'Cancel' });

    await field.fill('');
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
    await page.keyboard.press('Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(cancel).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(field).toBeFocused();
  });

  test('focus returns to "Import / Export" after Cancel', async ({ page }) => {
    await openApp(page);
    const dialog = await openExportDialog(page);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(importExportButton(page)).toBeFocused();
  });

  test('focus returns to "Import / Export" after Escape', async ({ page }) => {
    await openApp(page);
    const dialog = await openExportDialog(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(importExportButton(page)).toBeFocused();
  });

  test('focus returns to "Import / Export" after Save', async ({ page }) => {
    await openApp(page);
    const dialog = await openExportDialog(page);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await downloadPromise;
    await expect(dialog).toBeHidden();
    await expect(importExportButton(page)).toBeFocused();
  });

  // Keyboard only: Tab lands on the popover trigger wrapper, Enter opens the menu
  test('focus returns to "Import / Export" when the menu was opened by keyboard only', async ({ page }) => {
    await openApp(page);
    await page.locator('.importExportMenu__trigger').focus();
    await page.keyboard.press('Enter');
    const menuItem = page.getByRole('button', { name: 'Export project JSON' });
    await expect(menuItem).toBeVisible();
    await menuItem.focus();
    await page.keyboard.press('Enter');
    await expect(exportDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exportDialog(page)).toBeHidden();
    await expect(importExportButton(page)).toBeFocused();
  });
});

// --- Mobile layout --------------------------------------------------------

// Mobile is decided by matchMedia('(max-width: 768px)') in +page.svelte.
// The editor pane starts collapsed there, so the panel field is only checked after expanding it.
// Not available on mobile (by design of the original layout): the "Export 3MF" menu item.
test.describe('mobile layout (390x844)', () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  async function openMobileApp(page: Page): Promise<void> {
    await page.goto('/');
    await expect(headerButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand editor' })).toBeVisible();
  }

  test('header shows the name, panel field shows it after expanding the editor', async ({ page }) => {
    await openMobileApp(page);
    await expect(headerButton(page)).toContainText(DEFAULT_NAME);
    await expect(page).toHaveTitle(DEFAULT_NAME + TITLE_SUFFIX);

    await renameInHeader(page, 'Mobil Name');
    await expect(headerButton(page)).toContainText('Mobil Name');
    await expect(page).toHaveTitle('Mobil Name' + TITLE_SUFFIX);

    await page.getByRole('button', { name: 'Expand editor' }).click();
    await expect(panelNameField(page)).toBeVisible();
    await expect(panelNameField(page)).toHaveValue('Mobil Name');
  });

  test('export dialog downloads "<name>.json"', async ({ page }) => {
    await openMobileApp(page);
    await renameInHeader(page, 'Mobil Export');

    const dialog = await openExportDialog(page);
    await expect(dialog.getByLabel('File name')).toHaveValue('Mobil Export');
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Mobil Export.json');
    await expect(exportDialog(page)).toBeHidden();
    await expect(headerButton(page)).toContainText('Mobil Export');
  });

  test('import without name uses the file name', async ({ page }) => {
    await openMobileApp(page);
    const { json } = await exportCurrentProject(page);
    const withoutName = { ...json };
    delete withoutName.name;

    await importJson(page, 'mobil-spiel.json', withoutName);
    await expect(headerButton(page)).toContainText('mobil-spiel');
    await expect(page).toHaveTitle('mobil-spiel' + TITLE_SUFFIX);
    await expect(page.locator('.errorBanner')).toHaveCount(0);
  });

  test('"Export 3MF" is not offered in the mobile menu', async ({ page }) => {
    await openMobileApp(page);
    await importExportButton(page).click();
    await expect(page.getByRole('button', { name: 'Export STLs', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export 3MF', exact: true })).toHaveCount(0);
  });
});
