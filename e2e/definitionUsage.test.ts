import { expect, test } from '@playwright/test';
import {
  addTileTrayFromStandee,
  defaultProject,
  expandRow,
  GLOBALS_PANEL,
  pageWith,
  projectWithSpareDefinition,
  showEditor,
  type Json
} from './helpers.js';

// E2E tests for the usage display ("Used in N trays · M boxes") of an expanded definition:
// counter shape, card size, standee and tile. Collapsed by default; "Not used" cannot be expanded.

type Kind = 'counterShape' | 'cardSize' | 'standee' | 'tile';

const CASES: {
  kind: Kind;
  usedName: string;
  usedNth: number;
  collection: string;
  // Name of the tray (loose or in a box) that uses the definition and is copied for the mixed project
  sourceTray: string;
  // Rows of the mixed project in project order (layers, box trays before loose trays): "<tray> (<box or layer>)"
  mixedItems: string[];
  mixedText: string;
  // Only loose trays use the definition: the copy goes to the same layer, no box part in the text
  looseOnlyItems?: string[];
  looseOnlyText?: string;
  // Adds a user to the default project (the tile has none)
  prep?: (project: Json) => void;
}[] = [
  {
    kind: 'counterShape',
    usedName: 'Hex',
    usedNth: 0,
    collection: 'counterShapes',
    sourceTray: 'More counters',
    mixedItems: ['Counter tray (Counter box)', 'More counters (Counter box)', 'Usage copy (Bottom layer)'],
    mixedText: 'Used in 3 trays · 1 box'
  },
  {
    kind: 'cardSize',
    usedName: 'Mini European',
    usedNth: 0,
    collection: 'cardSizes',
    sourceTray: 'Card Divider',
    mixedItems: ['Usage copy (Counter box)', 'Card Divider (Middle layer)'],
    mixedText: 'Used in 2 trays · 1 box',
    looseOnlyItems: ['Card Divider (Middle layer)', 'Usage copy (Middle layer)'],
    looseOnlyText: 'Used in 2 trays'
  },
  {
    kind: 'standee',
    usedName: 'Standard',
    usedNth: 1,
    collection: 'standees',
    sourceTray: 'Standee Tray',
    mixedItems: ['Usage copy (Counter box)', 'Standee Tray (Top layer)'],
    mixedText: 'Used in 2 trays · 1 box',
    looseOnlyItems: ['Standee Tray (Top layer)', 'Usage copy (Top layer)'],
    looseOnlyText: 'Used in 2 trays'
  },
  {
    kind: 'tile',
    usedName: 'Standard',
    usedNth: 2,
    collection: 'tiles',
    sourceTray: 'Tile Usage Tray',
    mixedItems: ['Usage copy (Counter box)', 'Tile Usage Tray (Top layer)'],
    mixedText: 'Used in 2 trays · 1 box',
    looseOnlyItems: ['Tile Usage Tray (Top layer)', 'Usage copy (Top layer)'],
    looseOnlyText: 'Used in 2 trays',
    prep: (project) => {
      addTileTrayFromStandee(project, 'tile-usage-tray', 'Tile Usage Tray');
    }
  }
];

type UsageCase = (typeof CASES)[number];

// Default project plus one unused copy of the first definition of the kind
async function unusedProject(c: UsageCase): Promise<{ project: Json; spareName: string }> {
  const spareName = `Spare ${c.kind}`;
  const project = await projectWithSpareDefinition(c.collection, { id: `spare-${c.kind}`, name: spareName }, c.prep);
  return { project, spareName };
}

// Default project plus a copy of the source tray: in the first box if the source is loose, else loose in the
// source's layer (`loose`: always loose in the layer of the source)
async function usedProject(c: UsageCase, loose: boolean): Promise<Json> {
  const project = await defaultProject();
  c.prep?.(project);
  for (const layer of project.layers) {
    const inLayer = layer.looseTrays.find((t: Json) => t.name === c.sourceTray);
    const inBox = layer.boxes.flatMap((b: Json) => b.trays).find((t: Json) => t.name === c.sourceTray);
    const source = inLayer ?? inBox;
    if (!source) continue;
    const copy = { ...structuredClone(source), id: 'usage-copy', name: 'Usage copy' };
    if (loose || inBox) layer.looseTrays.push(copy);
    else project.layers.find((l: Json) => l.boxes.length > 0).boxes[0].trays.push(copy);
    return project;
  }
  throw new Error(`Tray ${c.sourceTray} not found`);
}

for (const mobile of [false, true]) {
  test.describe(`Usage display (${mobile ? 'mobile' : 'desktop'})`, () => {
    for (const c of CASES) {
      const toggle = (page: import('@playwright/test').Page) => page.getByTestId(`usageToggle-${c.kind}`);
      const list = (page: import('@playwright/test').Page) => page.getByTestId(`usageList-${c.kind}`);
      const items = (page: import('@playwright/test').Page) => page.getByTestId(`usageItem-${c.kind}`);

      test(`${c.kind}: unused definition shows "Not used" without expanding`, async ({ browser }) => {
        const { project, spareName } = await unusedProject(c);
        const page = await pageWith(browser, project, mobile);
        await showEditor(page);
        await expandRow(page, spareName, 0);
        await expect(toggle(page)).toHaveText('Not used');
        expect(await toggle(page).evaluate((el) => el.tagName)).toBe('SPAN');
        await expect(toggle(page)).not.toHaveAttribute('aria-expanded', /.*/);
        await toggle(page).click();
        await expect(list(page)).toHaveCount(0);
        await page.context().close();
      });

      const usedScenarios: { title: string; loose: boolean; text: string; rows: string[] | undefined }[] = [
        { title: 'box and loose trays mixed', loose: false, text: c.mixedText, rows: c.mixedItems },
        { title: 'loose trays only', loose: true, text: c.looseOnlyText ?? '', rows: c.looseOnlyItems }
      ];
      for (const s of usedScenarios) {
        if (!s.rows) continue;
        test(`${c.kind}: used (${s.title}) is collapsed, expands and collapses again`, async ({ browser }) => {
          const page = await pageWith(browser, await usedProject(c, s.loose), mobile);
          await showEditor(page);
          await expandRow(page, c.usedName, c.usedNth);
          // Collapsed by default
          await expect(toggle(page)).toHaveText(s.text);
          expect(await toggle(page).evaluate((el) => el.tagName)).toBe('BUTTON');
          await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
          await expect(list(page)).toHaveCount(0);
          await expect(items(page)).toHaveCount(0);
          // Open: one row per tray with tray and box / layer name
          await toggle(page).click();
          await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
          await expect(list(page)).toBeVisible();
          await expect(items(page)).toHaveText(s.rows!);
          // Close again
          await toggle(page).click();
          await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
          await expect(list(page)).toHaveCount(0);
          await page.context().close();
        });
      }

      test(`${c.kind}: collapsing and reopening the definition resets the list to collapsed`, async ({ browser }) => {
        const page = await pageWith(browser, await usedProject(c, false), mobile);
        await showEditor(page);
        await expandRow(page, c.usedName, c.usedNth);
        await toggle(page).click();
        await expect(list(page)).toBeVisible();
        // Close the definition row ("Save"), then open it again
        await page.locator(GLOBALS_PANEL).getByRole('button', { name: 'Save', exact: true }).click();
        await expect(toggle(page)).toHaveCount(0);
        await expandRow(page, c.usedName, c.usedNth);
        await expect(toggle(page)).toHaveText(c.mixedText);
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(list(page)).toHaveCount(0);
        await page.context().close();
      });
    }
  });
}
