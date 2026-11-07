import { expect, test, type Page } from '@playwright/test';
import {
  floorField,
  lidThicknessField,
  openApp,
  openBoxPanel,
  openEditorFor,
  readStoredProject,
  trayRow,
  type Json
} from './helpers.js';

// E2E tests for F3.0.15 (numeric fields accept decimal comma and point)

function findTray(project: Record<string, Json>, name: string): Json | undefined {
  return project.layers
    .flatMap((l: Json) => [...l.looseTrays, ...l.boxes.flatMap((b: Json) => b.trays)])
    .find((t: Json) => t.name === name);
}

function wallField(page: Page) {
  return page.getByLabel('Wall', { exact: true });
}

interface FieldCase {
  name: string;
  open: (page: Page) => Promise<void>;
  field: (page: Page) => ReturnType<typeof floorField>;
  read: (project: Record<string, Json>) => number | undefined;
}

const cases: FieldCase[] = [
  {
    name: 'box floor',
    open: (page) => openBoxPanel(page, 'Counter box'),
    field: floorField,
    read: (p) => p.layers[0].boxes[0].floorThickness
  },
  {
    name: 'counter tray wall',
    open: (page) => openEditorFor(page, trayRow(page, 'Counter tray')),
    field: wallField,
    read: (p) => findTray(p, 'Counter tray')?.params.wallThickness
  },
  {
    name: 'lid thickness',
    open: (page) => openBoxPanel(page, 'Counter box'),
    field: lidThicknessField,
    read: (p) => p.layers[0].boxes[0].lidParams?.thickness
  }
];

for (const c of cases) {
  test.describe(`Decimal input: ${c.name}`, () => {
    for (const [typed, expected] of [
      ['1,8', 1.8],
      ['2.5', 2.5]
    ] as const) {
      test(`"${typed}" gives ${expected} in field and stored project`, async ({ page }) => {
        await openApp(page);
        await c.open(page);
        const field = c.field(page);
        await field.fill(typed);
        await field.blur();
        await expect(field).toHaveValue(String(expected));
        const stored = await readStoredProject(page, (p) => c.read(p) === expected);
        expect(c.read(stored)).toBe(expected);
      });
    }

    test('invalid text "abc" keeps the old value', async ({ page }) => {
      await openApp(page);
      await c.open(page);
      const field = c.field(page);
      await field.fill('3');
      await field.blur();
      await expect(field).toHaveValue('3');
      await field.fill('abc');
      await field.blur();
      await expect(field).toHaveValue('3');
      const stored = await readStoredProject(page, (p) => c.read(p) === 3);
      expect(c.read(stored)).toBe(3);
    });
  });
}
