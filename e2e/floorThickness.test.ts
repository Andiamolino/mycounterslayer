import { expect, test } from '@playwright/test';
import {
  defaultProject,
  floorField,
  openApp,
  openBoxPanel,
  openEditorFor,
  pageWith,
  readStoredProject,
  trayRow,
  type Json
} from './helpers.js';

// E2E tests for F3.0.11 (minimum floor 1.5 mm on box and tray floor inputs)

// Tray by name from any layer (loose or in a box)
function findTray(project: Record<string, Json>, name: string): Json | undefined {
  return project.layers
    .flatMap((l: Json) => [...l.looseTrays, ...l.boxes.flatMap((b: Json) => b.trays)])
    .find((t: Json) => t.name === name);
}

test.describe('Floor minimum', () => {
  test('box floor: 1 is clamped to 1.5 in the field and in the stored project', async ({ page }) => {
    await openApp(page);
    await openBoxPanel(page, 'Counter box');
    const field = floorField(page);
    await expect(field).toHaveValue('2');
    await field.fill('1');
    await field.blur();
    await expect(field).toHaveValue('1.5');
    const stored = await readStoredProject(page, (p) => p.layers[0].boxes[0].floorThickness === 1.5);
    expect(stored.layers[0].boxes[0].floorThickness).toBe(1.5);
  });

  const trayCases = [
    { type: 'counter tray', name: 'Counter tray' },
    { type: 'cup tray', name: 'Cup tray' },
    { type: 'card draw tray', name: 'Card draw' }
  ];
  for (const { type, name } of trayCases) {
    test(`${type}: floor 1 is clamped to 1.5 in the field and in the stored project`, async ({ page }) => {
      await openApp(page);
      await openEditorFor(page, trayRow(page, name));
      const field = floorField(page);
      await field.fill('1');
      await field.blur();
      await expect(field).toHaveValue('1.5');
      const stored = await readStoredProject(page, (p) => findTray(p, name)?.params.floorThickness === 1.5);
      expect(findTray(stored, name)?.params.floorThickness).toBe(1.5);
    });
  }

  test('loaded project with floor 1 keeps 1 (limit applies to input only)', async ({ browser }) => {
    const project = await defaultProject();
    project.layers[0].boxes[0].floorThickness = 1;
    project.layers[0].looseTrays.find((t: Json) => t.name === 'Cup tray').params.floorThickness = 1;
    const page = await pageWith(browser, project);
    await openBoxPanel(page, 'Counter box');
    await expect(floorField(page)).toHaveValue('1');
    await openEditorFor(page, trayRow(page, 'Cup tray'));
    await expect(floorField(page)).toHaveValue('1');
    // Force an autosave with an unrelated change; the saved project must still hold floor 1 (no clamping on load)
    await openEditorFor(page, trayRow(page, 'Card draw'));
    await floorField(page).fill('5');
    await floorField(page).blur();
    const stored = await readStoredProject(page, (p) =>
      findTray(p, 'Card draw')?.params.floorThickness === 5
    );
    expect(stored.layers[0].boxes[0].floorThickness).toBe(1);
    expect(findTray(stored, 'Cup tray')?.params.floorThickness).toBe(1);
    await page.context().close();
  });

  const emptyCases = [
    { name: 'Cup tray', value: '2' },
    { name: 'Card draw', value: '4' }
  ];
  for (const { name, value } of emptyCases) {
    test(`${name}: empty field keeps the current floor (${value}), no NaN`, async ({ page }) => {
      await openApp(page);
      await openEditorFor(page, trayRow(page, name));
      const field = floorField(page);
      await expect(field).toHaveValue(value);
      await field.fill('');
      await field.blur();
      await expect(field).toHaveValue(value);
      const stored = await readStoredProject(page);
      expect(findTray(stored, name)?.params.floorThickness).toBe(Number(value));
    });
  }
});
