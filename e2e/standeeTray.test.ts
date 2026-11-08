import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  AUTOSAVE_SETTLE_MS,
  MOBILE_VIEWPORT,
  confirmImport,
  defaultProject,
  expandRow,
  exportCurrentProject,
  exportTrayButton,
  exportViaBottomBar,
  importJson,
  importPartFile,
  importTrayFile,
  makePartPackage,
  openEditorFor,
  pageWith,
  previewOf,
  readDownloadJson,
  readStoredProject,
  settledRaw,
  toastText,
  trayRow,
  waitForGeometry,
  type Json
} from './helpers.js';

// E2E tests for the standee: Dimensions -> Standees (angle, slot clearance), the standee tray editor, packages.
// The one-sided standee is gone (T9): cards and tiles are covered by tileTray.test.ts.

const PANEL = '.globalsPanel';

// Mobile: the editor opens collapsed behind "Expand editor". Waits for the button (fresh page load);
// expandEditorIfCollapsed only checks the current state and can run before the page has rendered.
async function showEditor(page: Page): Promise<void> {
  if (page.viewportSize()?.width !== MOBILE_VIEWPORT.width) return;
  await page.getByRole('button', { name: 'Expand editor', exact: true }).click();
}

// The default project has one standee "Standard" (index 0); it is the third "Standard" row (card sizes come first)
async function openStandee(page: Page): Promise<void> {
  await showEditor(page);
  await expandRow(page, 'Standard', 1);
  await expect(field(page, 'standeeHeight-0')).toBeVisible();
}

function field(page: Page, name: string): Locator {
  return page.locator(`${PANEL} input[name="${name}"]`);
}

async function setField(page: Page, name: string, typed: string): Promise<void> {
  const input = field(page, name);
  await input.scrollIntoViewIfNeeded();
  await input.fill(typed);
  await input.blur();
}

async function storedStandee(page: Page, ready: (s: Record<string, unknown>) => boolean = () => true) {
  const project = await readStoredProject(page, (p) => ready(p.standees[0]));
  return project.standees[0] as Record<string, unknown>;
}

const BASE_FIELDS = ['baseRadius-0', 'baseThickness-0'];
const BAR_FIELDS = ['standeeBarPositionLeft-0', 'standeeBarPositionRight-0'];

const HOLDER_FIELDS = { angleToFloor: 55, slotClearance: 0.3 };

for (const mobile of [false, true]) {
  test.describe(`Standee holder fields (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('default: base fields visible, bar fields hidden, placeholders', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      for (const name of BASE_FIELDS) await expect(field(page, name)).toBeVisible();
      for (const name of BAR_FIELDS) await expect(field(page, name)).toHaveCount(0);
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveValue('');
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveAttribute('placeholder', '70');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('');
      await page.context().close();
    });

    test('angle limits: 30 -> 45, 95 -> 90, "62,5" -> 62.5', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      const angle = field(page, 'standeeAngleToFloor-0');
      await setField(page, 'standeeAngleToFloor-0', '30');
      await expect(angle).toHaveValue('45');
      expect((await storedStandee(page, (s) => s.angleToFloor === 45)).angleToFloor).toBe(45);
      await setField(page, 'standeeAngleToFloor-0', '95');
      await expect(angle).toHaveValue('90');
      expect((await storedStandee(page, (s) => s.angleToFloor === 90)).angleToFloor).toBe(90);
      await setField(page, 'standeeAngleToFloor-0', '62,5');
      await expect(angle).toHaveValue('62.5');
      expect((await storedStandee(page, (s) => s.angleToFloor === 62.5)).angleToFloor).toBe(62.5);
      await page.context().close();
    });

    test('empty input removes the field (back to default)', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      await setField(page, 'standeeAngleToFloor-0', '60');
      await setField(page, 'standeeSlotClearance-0', '0.4');
      await storedStandee(page, (s) => s.angleToFloor === 60 && s.slotClearance === 0.4);
      await setField(page, 'standeeAngleToFloor-0', '');
      await setField(page, 'standeeSlotClearance-0', '');
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveValue('');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('');
      const stored = await storedStandee(page, (s) => !('angleToFloor' in s) && !('slotClearance' in s));
      expect('angleToFloor' in stored).toBe(false);
      expect('slotClearance' in stored).toBe(false);
      await page.context().close();
    });

    test('slot clearance 0.5 with thickness 1.5 -> "Slot width: 2.0 mm"; negative is limited to 0', async ({
      browser
    }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      const width = page.getByTestId('standeeSlotWidth-0');
      await expect(width).toBeVisible();
      await setField(page, 'standeeSlotClearance-0', '0,5');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('0.5');
      await expect(width).toHaveText('Slot width: 2.0 mm');
      await setField(page, 'standeeSlotClearance-0', '-1');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('0');
      await expect(width).toHaveText('Slot width: 1.5 mm');
      await page.context().close();
    });

    test('values survive reload', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await openStandee(page);
      await setField(page, 'standeeAngleToFloor-0', '55');
      await setField(page, 'standeeSlotClearance-0', '0.3');
      const raw = JSON.parse((await settledRaw(page)) ?? '{}');
      expect(raw.standees[0]).toMatchObject(HOLDER_FIELDS);
      await page.reload();
      await openStandee(page);
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveValue('55');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('0.3');
      await expect(page.getByTestId('standeeSlotWidth-0')).toHaveText('Slot width: 1.8 mm');
      await page.context().close();
    });

    test('regenerate button becomes dirty after changing the angle (E13)', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await waitForGeometry(page);
      const dirty = page.locator('.regenerateButton--dirty');
      await expect(dirty).toHaveCount(0);
      await openStandee(page);
      await setField(page, 'standeeAngleToFloor-0', '60');
      await expect(dirty.first()).toBeAttached();
      await page.context().close();
    });

    test('no horizontal overflow of the fields', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      const names = ['standeeAngleToFloor-0', 'standeeSlotClearance-0'];
      const viewportWidth = page.viewportSize()!.width;
      for (const name of names) {
        const box = await field(page, name).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box!.x, name).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width, name).toBeLessThanOrEqual(viewportWidth);
      }
      const overflow = await page.evaluate(() => {
        const panel = document.querySelector('.globalsPanel') as HTMLElement;
        return panel.scrollWidth - panel.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);
      await page.context().close();
    });
  });
}

// --- F3e.8: StandeeTrayEditor (distribution text, info text, select label) ---

const TRAY = 'Standee Tray';

// Default project, optionally with a tray count
async function trayProject(opts: { count?: number } = {}) {
  const project = await defaultProject();
  if (opts.count !== undefined) {
    for (const layer of project.layers) {
      for (const tray of layer.looseTrays) if (tray.name === TRAY) tray.params.count = opts.count;
    }
  }
  return project;
}

async function openStandeeTray(page: Page): Promise<void> {
  await openEditorFor(page, trayRow(page, TRAY));
  await expect(page.getByTestId('standeeDistribution')).toBeVisible();
}

function editor(page: Page): Locator {
  return page.locator('.panelFormSection').filter({ has: page.getByTestId('standeeDistribution') });
}

async function setCount(page: Page, value: string): Promise<void> {
  const input = page.locator('input[name="count"]').first();
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
  await input.blur();
}

for (const mobile of [false, true]) {
  test.describe(`Standee tray editor (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('distribution follows the count (5, 7, 1, 10)', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject({ count: 5 }), mobile);
      await openStandeeTray(page);
      const text = page.getByTestId('standeeDistribution');
      await expect(text).toHaveText('Left 3 + right 2 = 5');
      await setCount(page, '7');
      await expect(text).toHaveText('Left 4 + right 3 = 7');
      await setCount(page, '1');
      await expect(text).toHaveText('Left 1 + right 0 = 1');
      await setCount(page, '10');
      await expect(text).toHaveText('Left 5 + right 5 = 10');
      await expect(page.getByTestId('standeeDistributionInfo')).toHaveText(
        'Split across two opposing slotted walls; an odd one goes left.'
      );
      await page.context().close();
    });

    test('select label shows the base, no slot wall height field', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject(), mobile);
      await openStandeeTray(page);
      await expect(page.getByLabel('Standee type')).toContainText('Standard (18mm base)');
      await expect(editor(page)).toContainText('figure, 18mm base');
      await expect(page.locator('input[name="standeeSlotWallHeight"]')).toHaveCount(0);
      await page.context().close();
    });

    test('no bar gap hints in the standee editor', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject(), mobile);
      await openStandeeTray(page);
      await expect(page.getByTestId('standeeBarGap')).toHaveCount(0);
      await expect(page.getByTestId('standeeBarLimited')).toHaveCount(0);
      await page.context().close();
    });

    test('field labels and hints', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject(), mobile);
      await openStandeeTray(page);
      const ed = editor(page);
      for (const label of ['Slot wall thickness', 'Wall height above standees', 'Tray width', 'Tray length']) {
        await expect(ed.getByLabel(label, { exact: true })).toHaveCount(1);
      }
      for (const label of ['Bar thickness', 'Bar height']) {
        await expect(ed.getByLabel(label, { exact: true })).toHaveCount(0);
      }
      for (const old of ['Inner wall', 'Rim height', 'Width', 'Length', 'Slot wall height']) {
        await expect(ed.getByLabel(old, { exact: true })).toHaveCount(0);
      }
      await expect(ed.getByTestId('hintInnerWall')).toHaveText('Thickness of the slotted walls.');
      await expect(ed.getByTestId('hintRimHeight')).toHaveText(
        'How far the outer walls rise above the highest standee.'
      );
      await expect(ed.getByTestId('hintWidth')).toHaveText(
        'Tray width including walls. Grows automatically if the standees need more.'
      );
      await expect(ed.getByTestId('hintLength')).toHaveText(
        'Tray length including walls. Grows automatically if the standees need more.'
      );
      await expect(ed.getByTestId('hintBarHeight')).toHaveCount(0);
      await page.context().close();
    });

    test('shown tray size matches the Auto placeholders and reacts to the count', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject({ count: 6 }), mobile);
      await openStandeeTray(page);
      const info = editor(page).locator('.dimensionsInfo');
      const read = async () => {
        const m = ((await info.textContent()) ?? '').match(/([\d.]+) × ([\d.]+) × ([\d.]+) mm/);
        expect(m).not.toBeNull();
        return m!.slice(1, 4).map(Number);
      };
      const [w, d, h] = await read();
      const autoW = await page.locator('input[name="trayWidthOverride"]').getAttribute('placeholder');
      const autoD = await page.locator('input[name="trayDepthOverride"]').getAttribute('placeholder');
      expect(autoW).toBe(`Auto (${w.toFixed(1)})`);
      expect(autoD).toBe(`Auto (${d.toFixed(1)})`);
      expect(h).toBeGreaterThan(0);
      await setCount(page, '12');
      await expect(info).not.toHaveText(new RegExp(`^\\s*${w.toFixed(1)} × ${d.toFixed(1)} × `));
      await page.context().close();
    });
  });
}

// F3e.9/N3: "Preview counters" is automatic (on for standee trays); a manual click only counts for the tray it was made on

function previewCounters(page: Page): Locator {
  return page.locator('.toolbarRight').getByLabel('Preview counters');
}

// Desktop only: the mobile layout (isMobile branch of +page.svelte) has no "Preview counters" checkbox
const mobile = false;
{
  test.describe('Preview counters auto state (desktop)', () => {
    test('standee tray selected: on; counter tray selected: off', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await openEditorFor(page, trayRow(page, 'Cup tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await page.context().close();
    });

    test('counter tray -> standee tray before any click switches on automatically', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Counter tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await page.context().close();
    });

    test('click off on a standee tray: choice is dropped when another tray is selected', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await previewCounters(page).uncheck();
      await expect(previewCounters(page)).not.toBeChecked();
      await openEditorFor(page, trayRow(page, 'Cup tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      // Back on the standee tray: the old choice is gone, Auto applies again (on)
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await page.context().close();
    });

    test('click on a counter tray (on) does not carry over to other trays', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Counter tray'));
      await previewCounters(page).check();
      await expect(previewCounters(page)).toBeChecked();
      await openEditorFor(page, trayRow(page, 'Cup tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await page.context().close();
    });

    test('choice is not persisted: reload with a standee tray selected is on', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await previewCounters(page).uncheck();
      await page.reload();
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await page.context().close();
    });
  });
}

// --- F3e.10: persistence, project JSON, packages ---

// Project with the Standard standee carrying both holder fields
async function holderProject() {
  const project = await defaultProject();
  Object.assign(project.standees[0], HOLDER_FIELDS);
  return project;
}

// Old one-sided standee (E6): the fields are ignored on import
const LEGACY_ONE_SIDED_FIELDS = { arrangement: 'oneSided', barPositionLeft: 15, barPositionRight: 35 };

for (const mobile of [false, true]) {
  test.describe(`Standee: project JSON and packages (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('project JSON export keeps the fields, import restores them', async ({ browser }) => {
      const source = await pageWith(browser, await holderProject(), mobile);
      const { json } = await exportCurrentProject(source);
      expect((json.standees as any[])[0]).toMatchObject(HOLDER_FIELDS);
      await source.context().close();

      const fresh = await pageWith(browser, undefined, mobile);
      await openStandee(fresh);
      await expect(field(fresh, 'standeeAngleToFloor-0')).toHaveValue('');
      await importJson(fresh, 'holder.json', json);
      await expect(field(fresh, 'standeeAngleToFloor-0')).toHaveValue('55');
      await expect(field(fresh, 'standeeSlotClearance-0')).toHaveValue('0.3');
      const stored = await storedStandee(fresh, (s) => s.angleToFloor === 55);
      expect(stored).toMatchObject(HOLDER_FIELDS);
      await fresh.context().close();
    });

    test('standee package export contains the fields', async ({ browser }) => {
      const page = await pageWith(browser, await holderProject(), mobile);
      const { json } = await exportStandeeViaBar(page);
      expect(json.kind).toBe('standee');
      expect(json.part).toMatchObject(HOLDER_FIELDS);
      await page.context().close();
    });

    test('import of an old standee file (no new fields) = Standard: "already exists"', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await showEditor(page);
      const pkg = makePartPackage('standee', {
        id: 'old-standee',
        name: 'Standard',
        baseRadius: 9,
        baseThickness: 3,
        standeeHeight: 40,
        standeeWidth: 25,
        standeeThickness: 1.5
      });
      await importPartFile(page, 'standee', 'Standard.standee.json', pkg);
      await expect(previewOf(page)).toContainText('"Standard" already exists – nothing will be added.');
      await confirmImport(page);
      await expect(toastText(page, 'Standee already exists')).toBeVisible();
      await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
      await expect(page.getByTitle('Click to edit Standard (2)', { exact: true })).toHaveCount(0);
      await page.context().close();
    });

    // E6: the legacy fields do not matter, the file counts as the normal Standard
    test('import of a legacy one-sided standee file (same values) = Standard: "already exists", fields ignored', async ({
      browser
    }) => {
      const page = await pageWith(browser, undefined, mobile);
      await showEditor(page);
      const pkg = makePartPackage('standee', {
        id: 'legacy-standee',
        name: 'Standard',
        baseRadius: 9,
        baseThickness: 3,
        standeeHeight: 40,
        standeeWidth: 25,
        standeeThickness: 1.5,
        ...LEGACY_ONE_SIDED_FIELDS
      });
      await importPartFile(page, 'standee', 'Standard.standee.json', pkg);
      await expect(previewOf(page)).toContainText('"Standard" already exists – nothing will be added.');
      await confirmImport(page);
      await expect(toastText(page, 'Standee already exists')).toBeVisible();
      await page.waitForTimeout(AUTOSAVE_SETTLE_MS);
      await expect(page.getByTitle('Click to edit Standard (2)', { exact: true })).toHaveCount(0);
      await page.context().close();
    });

    test('import of a standee file with other holder values becomes "Standard (2)" with the fields', async ({
      browser
    }) => {
      const page = await pageWith(browser, undefined, mobile);
      await showEditor(page);
      const pkg = makePartPackage('standee', {
        id: 'new-standee',
        name: 'Standard',
        baseRadius: 9,
        baseThickness: 3,
        standeeHeight: 40,
        standeeWidth: 25,
        standeeThickness: 1.5,
        ...HOLDER_FIELDS
      });
      await importPartFile(page, 'standee', 'Standard.standee.json', pkg);
      await expect(previewOf(page)).toContainText('"Standard (2)"');
      await confirmImport(page);
      await expect(page.getByTitle('Click to edit Standard (2)', { exact: true })).toBeVisible();
      const project = await readStoredProject(page, (p) => p.standees.length === 2);
      expect(project.standees[1].name).toBe('Standard (2)');
      expect(project.standees[1]).toMatchObject(HOLDER_FIELDS);
      expect(project.standees[0].angleToFloor).toBeUndefined();
      await page.context().close();
    });

    test('tray package with an embedded standee: export, import, definition arrives', async ({ browser }) => {
      const source = await pageWith(browser, await holderProject(), mobile);
      const { json } = await exportViaBottomBar(source, trayRow(source, TRAY), exportTrayButton(source));
      expect(json.dependencies.standees).toHaveLength(1);
      expect(json.dependencies.standees[0]).toMatchObject(HOLDER_FIELDS);
      await source.context().close();

      // Fresh project: the Standard standee there has other holder values -> the embedded one is added as "Standard (2)"
      const target = await pageWith(browser, undefined, mobile);
      await importTrayFile(target, true, 2, 'Standee Tray.tray.json', json);
      await expect(previewOf(target)).toContainText('Standard (2)');
      await confirmImport(target);
      const stored = await readStoredProject(target, (p) => p.standees.length === 2);
      expect(stored.standees[1]).toMatchObject({ name: 'Standard (2)', ...HOLDER_FIELDS });
      const added = stored.layers[2].looseTrays.find((t: any) => t.name === `${TRAY} (2)`);
      expect(added.params.standeeId).toBe(stored.standees[1].id);
      await target.context().close();
    });
  });
}

// Select the standee row and export it (button of the expanded definition row)
async function exportStandeeViaBar(page: Page) {
  await showEditor(page);
  await expandRow(page, 'Standard', 1);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export standee', exact: true }).click();
  const download = await downloadPromise;
  return { fileName: download.suggestedFilename(), json: (await readDownloadJson(download)) as Json };
}
