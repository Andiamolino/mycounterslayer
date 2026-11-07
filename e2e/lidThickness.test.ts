import { expect, test } from '@playwright/test';
import {
  lidThicknessField,
  openApp,
  openBoxPanel,
  pageWith,
  readStoredProject,
  shownMinTotalHeight,
  storedBoxes
} from './helpers.js';

// E2E tests for F3.0.9 (box field "Lid thickness")

const BOX = 'Counter box';

test.describe('Lid thickness field', () => {
  test('shows the default 2 and 3 mm raises the minimum total height by 1 mm', async ({ page }) => {
    await openApp(page);
    await openBoxPanel(page, BOX);
    const field = lidThicknessField(page);
    await expect(field).toBeVisible();
    await expect(field).toHaveValue('2');
    const before = await shownMinTotalHeight(page);

    await field.fill('3');
    await field.press('Enter');
    await field.blur();

    await expect.poll(() => shownMinTotalHeight(page)).toBeCloseTo(before + 1, 5);
    await expect(field).toHaveValue('3');
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes[0].lidParams?.thickness === 3);
    expect(stored.layers[0].boxes[0].lidParams.thickness).toBe(3);
  });

  test('value 1 is clamped to 1.5 in the field and in the stored project', async ({ page }) => {
    await openApp(page);
    await openBoxPanel(page, BOX);
    const field = lidThicknessField(page);
    await field.fill('1');
    await field.blur();
    await expect(field).toHaveValue('1.5');
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes[0].lidParams?.thickness === 1.5);
    expect(stored.layers[0].boxes[0].lidParams.thickness).toBe(1.5);
  });

  test('typing 1 again after the clamp still shows 1.5 (no stale value)', async ({ page }) => {
    await openApp(page);
    await openBoxPanel(page, BOX);
    const field = lidThicknessField(page);
    await field.fill('1');
    await field.blur();
    await expect(field).toHaveValue('1.5');
    await field.fill('1');
    await field.blur();
    await expect(field).toHaveValue('1.5');
  });

  test('the value survives a reload', async ({ page }) => {
    await openApp(page);
    await openBoxPanel(page, BOX);
    await lidThicknessField(page).fill('3');
    await lidThicknessField(page).blur();
    await readStoredProject(page, (p) => p.layers[0].boxes[0].lidParams?.thickness === 3);
    await page.reload();
    await openBoxPanel(page, BOX);
    await expect(lidThicknessField(page)).toHaveValue('3');
    expect((await storedBoxes(page))[0].lidParams.thickness).toBe(3);
  });

  test('mobile viewport: field is visible and usable', async ({ browser }) => {
    const page = await pageWith(browser, undefined, true);
    await openBoxPanel(page, BOX);
    const field = lidThicknessField(page);
    await field.scrollIntoViewIfNeeded();
    await expect(field).toBeVisible();
    await field.fill('3');
    await field.blur();
    await expect(field).toHaveValue('3');
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes[0].lidParams?.thickness === 3);
    expect(stored.layers[0].boxes[0].lidParams.thickness).toBe(3);
    await page.context().close();
  });
});
