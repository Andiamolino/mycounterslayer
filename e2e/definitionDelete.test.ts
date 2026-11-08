import { expect, test } from '@playwright/test';
import {
  defaultProject,
  expandRow,
  pageWith,
  projectWithSpareDefinition,
  readStoredProject,
  showEditor,
  type Json
} from './helpers.js';

// E2E tests for K1 (delete protection): a counter shape, card size or standee that a tray uses
// cannot be deleted (notice with tray and box / layer names); an unused one is deleted after confirmation.
// (The tile case is covered in tileTray.test.ts.)

type Kind = 'counterShape' | 'cardSize' | 'standee';

const CASES: {
  kind: Kind;
  label: string;
  usedName: string;
  usedNth: number;
  usedIn: string;
  spareName: string;
  collection: string;
}[] = [
  {
    kind: 'counterShape',
    label: 'counter',
    usedName: 'Hex',
    usedNth: 0,
    usedIn: 'Counter tray (Counter box), More counters (Counter box)',
    spareName: 'Spare Shape',
    collection: 'counterShapes'
  },
  {
    kind: 'cardSize',
    label: 'card size',
    usedName: 'Mini European',
    usedNth: 0,
    usedIn: 'Card Divider (Middle layer)',
    spareName: 'Spare Card',
    collection: 'cardSizes'
  },
  {
    kind: 'standee',
    label: 'standee',
    usedName: 'Standard',
    usedNth: 1,
    usedIn: 'Standee Tray (Top layer)',
    spareName: 'Spare Standee',
    collection: 'standees'
  }
];

const spareProject = (c: (typeof CASES)[number]) =>
  projectWithSpareDefinition(c.collection, { id: `spare-${c.kind}`, name: c.spareName });

for (const mobile of [false, true]) {
  test.describe(`Delete protection (${mobile ? 'mobile' : 'desktop'})`, () => {
    for (const c of CASES) {
      test(`${c.kind}: used definition shows the notice with tray and box / layer names and stays`, async ({
        browser
      }) => {
        const page = await pageWith(browser, await spareProject(c), mobile);
        await showEditor(page);
        const before = (await defaultProject())[c.collection].length;
        await expandRow(page, c.usedName, c.usedNth);
        await page.getByTestId(`deleteDefinition-${c.kind}`).click();
        await expect(page.getByTestId(`definitionInUse-${c.kind}`)).toHaveAttribute('role', 'alert');
        await expect(page.getByTestId(`definitionInUse-${c.kind}`)).toContainText(
          `"${c.usedName}" is in use and cannot be deleted.`
        );
        await expect(page.getByTestId(`definitionInUseList-${c.kind}`)).toHaveText(`Used in: ${c.usedIn}`);
        await expect(page.getByText(`Delete the "${c.usedName}" ${c.label}?`)).toHaveCount(0);
        // Entry is still there (row is still open, spare one is the only addition)
        await expect(page.getByTestId(`deleteDefinition-${c.kind}`)).toBeVisible();
        const raw = await page.evaluate(() => localStorage.getItem('counter-tray-project'));
        if (raw) expect(JSON.parse(raw)[c.collection]).toHaveLength(before + 1);
        await page.context().close();
      });

      test(`${c.kind}: unused definition is deleted after confirmation`, async ({ browser }) => {
        const page = await pageWith(browser, await spareProject(c), mobile);
        await showEditor(page);
        await expandRow(page, c.spareName, 0);
        await page.getByTestId(`deleteDefinition-${c.kind}`).click();
        await expect(page.getByTestId(`definitionInUse-${c.kind}`)).toHaveCount(0);
        await expect(page.getByText(`Delete the "${c.spareName}" ${c.label}?`)).toBeVisible();
        await page.getByRole('button', { name: `Delete ${c.label}`, exact: true }).click();
        await expect(page.getByTitle(`Click to edit ${c.spareName}`, { exact: true })).toHaveCount(0);
        const project = await readStoredProject(
          page,
          (p) => !p[c.collection].some((d: Json) => d.name === c.spareName)
        );
        expect(project[c.collection].some((d: Json) => d.name === c.usedName)).toBe(true);
        await page.context().close();
      });
    }
  });
}
