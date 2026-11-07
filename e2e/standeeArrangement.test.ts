import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  AUTOSAVE_SETTLE_MS,
  MOBILE_VIEWPORT,
  confirmImport,
  containerHeightStatus,
  defaultProject,
  expandRow,
  exportCurrentProject,
  exportTrayButton,
  exportViaBottomBar,
  importJson,
  importPartFile,
  importTrayFile,
  layerRow,
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

// E2E tests for F3e.7 (Dimensions -> Standees: arrangement, angle, slot clearance, bar positions)

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

async function chooseArrangement(page: Page, label: 'Alternating' | 'One-sided'): Promise<void> {
  const trigger = page.locator(`${PANEL}`).getByLabel('Arrangement');
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.getByRole('option', { name: label }).click();
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

for (const mobile of [false, true]) {
  test.describe(`Standee arrangement (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('default: alternating, base fields visible, bar fields hidden, placeholders', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      for (const name of BASE_FIELDS) await expect(field(page, name)).toBeVisible();
      for (const name of BAR_FIELDS) await expect(field(page, name)).toHaveCount(0);
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveValue('');
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveAttribute('placeholder', '70');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('');
      await expect(page.getByTestId('standeeBarGap-0')).toHaveCount(0);
      await page.context().close();
    });

    test('switch to one-sided and back: field visibility, summary, stored value', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      for (const name of BASE_FIELDS) await expect(field(page, name)).toHaveCount(0);
      for (const name of BAR_FIELDS) await expect(field(page, name)).toBeVisible();
      await expect(field(page, 'standeeBarPositionLeft-0')).toHaveAttribute('placeholder', '25');
      await expect(page.getByTestId('standeeBarGap-0')).toBeVisible();
      expect((await storedStandee(page, (s) => s.arrangement === 'oneSided')).arrangement).toBe('oneSided');

      await chooseArrangement(page, 'Alternating');
      for (const name of BASE_FIELDS) await expect(field(page, name)).toBeVisible();
      for (const name of BAR_FIELDS) await expect(field(page, name)).toHaveCount(0);
      // Default arrangement is not stored
      const stored = await storedStandee(page, (s) => !('arrangement' in s));
      expect('arrangement' in stored).toBe(false);
      await page.context().close();
    });

    test('summary row shows "· one-sided" when collapsed', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      // Reload shows the collapsed row (a fresh page: an init script would reset the stored project)
      await settledRaw(page);
      await page.reload();
      await showEditor(page);
      await expect(page.getByTitle('Click to edit Standard', { exact: true }).nth(1)).toContainText('· one-sided');
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

    test('bar positions: only one-sided, limits 0-50, stored, empty removes', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      const left = field(page, 'standeeBarPositionLeft-0');
      const right = field(page, 'standeeBarPositionRight-0');
      await setField(page, 'standeeBarPositionLeft-0', '60');
      await expect(left).toHaveValue('50');
      await setField(page, 'standeeBarPositionLeft-0', '-5');
      await expect(left).toHaveValue('0');
      await setField(page, 'standeeBarPositionRight-0', '12,5');
      await expect(right).toHaveValue('12.5');
      const stored = await storedStandee(page, (s) => s.barPositionLeft === 0 && s.barPositionRight === 12.5);
      expect(stored.barPositionLeft).toBe(0);
      expect(stored.barPositionRight).toBe(12.5);
      await setField(page, 'standeeBarPositionRight-0', '');
      await expect(right).toHaveValue('');
      expect('barPositionRight' in (await storedStandee(page, (s) => !('barPositionRight' in s)))).toBe(false);
      await page.context().close();
    });

    test('bar gap and "limited" hint', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      await expect(page.getByTestId('standeeBarGap-0')).toContainText(/^Bar gap: \d+\.\d mm$/);
      await expect(page.getByTestId('standeeBarLimited-0')).toHaveCount(0);
      // Both bars at the center: they cannot fit and get limited
      await setField(page, 'standeeBarPositionLeft-0', '50');
      await setField(page, 'standeeBarPositionRight-0', '50');
      await expect(page.getByTestId('standeeBarLimited-0')).toBeVisible();
      await page.context().close();
    });

    test('values stay when switching arrangement (bar values hidden, not removed)', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      await setField(page, 'standeeBarPositionLeft-0', '20');
      await setField(page, 'standeeAngleToFloor-0', '60');
      await chooseArrangement(page, 'Alternating');
      const stored = await storedStandee(
        page,
        (s) => !('arrangement' in s) && s.barPositionLeft === 20 && s.angleToFloor === 60
      );
      expect(stored.barPositionLeft).toBe(20);
      expect(stored.angleToFloor).toBe(60);
      await chooseArrangement(page, 'One-sided');
      await expect(field(page, 'standeeBarPositionLeft-0')).toHaveValue('20');
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveValue('60');
      await page.context().close();
    });

    test('values survive reload', async ({ browser }) => {
      const page = await pageWith(browser, undefined, mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      await setField(page, 'standeeAngleToFloor-0', '55');
      await setField(page, 'standeeSlotClearance-0', '0.3');
      await setField(page, 'standeeBarPositionLeft-0', '15');
      await setField(page, 'standeeBarPositionRight-0', '35');
      const raw = JSON.parse((await settledRaw(page)) ?? '{}');
      expect(raw.standees[0]).toMatchObject({
        arrangement: 'oneSided',
        angleToFloor: 55,
        slotClearance: 0.3,
        barPositionLeft: 15,
        barPositionRight: 35
      });
      await page.reload();
      await openStandee(page);
      await expect(field(page, 'standeeAngleToFloor-0')).toHaveValue('55');
      await expect(field(page, 'standeeSlotClearance-0')).toHaveValue('0.3');
      await expect(field(page, 'standeeBarPositionLeft-0')).toHaveValue('15');
      await expect(field(page, 'standeeBarPositionRight-0')).toHaveValue('35');
      await expect(page.getByTestId('standeeSlotWidth-0')).toHaveText('Slot width: 1.8 mm');
      await page.context().close();
    });

    test('regenerate button becomes dirty after switching (E13)', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await waitForGeometry(page);
      const dirty = page.locator('.regenerateButton--dirty');
      await expect(dirty).toHaveCount(0);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      await expect(dirty.first()).toBeAttached();
      await page.context().close();
    });

    test('no horizontal overflow of the fields', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openStandee(page);
      await chooseArrangement(page, 'One-sided');
      await setField(page, 'standeeBarPositionLeft-0', '50');
      await setField(page, 'standeeBarPositionRight-0', '50');
      const names = ['standeeAngleToFloor-0', 'standeeSlotClearance-0', ...BAR_FIELDS];
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

// --- F3e.8: StandeeTrayEditor (distribution text, info text, select label, slot wall height) ---

const TRAY = 'Standee Tray';

// Default project, optionally with the standee definition switched to one-sided and a tray count
async function trayProject(opts: { oneSided?: boolean; count?: number } = {}) {
  const project = await defaultProject();
  if (opts.oneSided) project.standees[0].arrangement = 'oneSided';
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

async function storedTrayParams(page: Page, ready: (p: Record<string, unknown>) => boolean = () => true) {
  const find = (project: Record<string, any>) =>
    project.layers.flatMap((l: any) => l.looseTrays).find((t: any) => t.name === TRAY).params;
  const project = await readStoredProject(page, (p) => ready(find(p)));
  return find(project) as Record<string, unknown>;
}

for (const mobile of [false, true]) {
  test.describe(`Standee tray editor (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('alternating: distribution follows the count (5, 7, 1, 10)', async ({ browser }) => {
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

    test('one-sided: one row, info text, select label, element line', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject({ oneSided: true, count: 5 }), mobile);
      await openStandeeTray(page);
      await expect(page.getByTestId('standeeDistribution')).toHaveText('One row of 5');
      await setCount(page, '7');
      await expect(page.getByTestId('standeeDistribution')).toHaveText('One row of 7');
      await expect(page.getByTestId('standeeDistributionInfo')).toHaveText(
        'One row across two slotted walls, no base.'
      );
      await expect(editor(page)).toContainText('25mm × 40mm element, one-sided');
      await expect(page.getByLabel('Standee type')).toContainText('Standard (one-sided)');
      await page.context().close();
    });

    test('alternating: select label shows the base, no slot wall height field', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject(), mobile);
      await openStandeeTray(page);
      await expect(page.getByLabel('Standee type')).toContainText('Standard (18mm base)');
      await expect(editor(page)).toContainText('figure, 18mm base');
      await expect(page.locator('input[name="standeeSlotWallHeight"]')).toHaveCount(0);
      await page.context().close();
    });

    test('slot wall height: one-sided only, placeholder, "12,5" stored, empty -> null', async ({ browser }) => {
      const page = await pageWith(browser, await trayProject({ oneSided: true }), mobile);
      await openStandeeTray(page);
      const field = page.locator('input[name="standeeSlotWallHeight"]');
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      await expect(field).toHaveValue('');
      await expect(field).toHaveAttribute('placeholder', /^Auto \(\d+\.\d\)$/);
      await field.fill('12,5');
      await field.blur();
      await expect(field).toHaveValue('12.5');
      expect((await storedTrayParams(page, (p) => p.slotWallHeight === 12.5)).slotWallHeight).toBe(12.5);
      await field.fill('');
      await field.blur();
      await expect(field).toHaveValue('');
      expect((await storedTrayParams(page, (p) => p.slotWallHeight === null)).slotWallHeight).toBeNull();
      await page.context().close();
    });

    test('shown tray size matches the Auto placeholders and reacts to count and mode', async ({ browser }) => {
      for (const oneSided of [false, true]) {
        const page = await pageWith(browser, await trayProject({ oneSided, count: 6 }), mobile);
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
      }
    });
  });
}

// F3e.9: "Preview counters" is automatic (on for standee trays) until the first click, then the user's choice wins

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

    test('first click on a standee tray (off) is kept when switching trays', async ({ browser }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).toBeChecked();
      await previewCounters(page).uncheck();
      await expect(previewCounters(page)).not.toBeChecked();
      await openEditorFor(page, trayRow(page, 'Cup tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      await page.context().close();
    });

    test('first click on a counter tray (on) is kept when switching to a standee tray and back', async ({
      browser
    }) => {
      const page = await pageWith(browser, await defaultProject(), mobile);
      await openEditorFor(page, trayRow(page, 'Counter tray'));
      await previewCounters(page).check();
      await openEditorFor(page, trayRow(page, 'Cup tray'));
      await expect(previewCounters(page)).toBeChecked();
      await previewCounters(page).uncheck();
      await openEditorFor(page, trayRow(page, 'Standee Tray'));
      await expect(previewCounters(page)).not.toBeChecked();
      await page.context().close();
    });
  });
}

// --- F3e.10: persistence, project JSON, packages, height status ---

const ONE_SIDED_FIELDS = {
  arrangement: 'oneSided',
  angleToFloor: 55,
  slotClearance: 0.3,
  barPositionLeft: 15,
  barPositionRight: 35
};

// Project with the Standard standee switched to one-sided (all new fields set)
async function oneSidedProject() {
  const project = await defaultProject();
  Object.assign(project.standees[0], ONE_SIDED_FIELDS);
  return project;
}

function standeeTrayOf(project: Record<string, any>): any {
  return project.layers.flatMap((l: any) => l.looseTrays).find((t: any) => t.name === TRAY);
}

for (const mobile of [false, true]) {
  test.describe(`Standee one-sided: project JSON and packages (${mobile ? 'mobile' : 'desktop'})`, () => {
    test('project JSON export keeps the fields, import restores them', async ({ browser }) => {
      const source = await pageWith(browser, await oneSidedProject(), mobile);
      const { json } = await exportCurrentProject(source);
      expect((json.standees as any[])[0]).toMatchObject(ONE_SIDED_FIELDS);
      await source.context().close();

      const fresh = await pageWith(browser, undefined, mobile);
      await openStandee(fresh);
      await expect(field(fresh, 'standeeAngleToFloor-0')).toHaveValue('');
      await importJson(fresh, 'oneSided.json', json);
      await expect(field(fresh, 'standeeAngleToFloor-0')).toHaveValue('55');
      await expect(field(fresh, 'standeeSlotClearance-0')).toHaveValue('0.3');
      await expect(field(fresh, 'standeeBarPositionLeft-0')).toHaveValue('15');
      await expect(field(fresh, 'standeeBarPositionRight-0')).toHaveValue('35');
      const stored = await storedStandee(fresh, (s) => s.arrangement === 'oneSided');
      expect(stored).toMatchObject(ONE_SIDED_FIELDS);
      await fresh.context().close();
    });

    test('tray slotWallHeight survives reload', async ({ browser }) => {
      const project = await oneSidedProject();
      standeeTrayOf(project).params.slotWallHeight = 12.5;
      const page = await pageWith(browser, project, mobile);
      await openStandeeTray(page);
      // Force a save of the loaded project (the stored copy is only written after a change)
      await setCount(page, '6');
      expect(standeeTrayOf(JSON.parse((await settledRaw(page)) ?? '{}')).params.slotWallHeight).toBe(12.5);
      await page.reload();
      if (mobile) await page.getByRole('button', { name: 'Expand navigation' }).click();
      await openStandeeTray(page);
      await expect(page.locator('input[name="standeeSlotWallHeight"]')).toHaveValue('12.5');
      await page.context().close();
    });

    test('standee package export contains the fields', async ({ browser }) => {
      const page = await pageWith(browser, await oneSidedProject(), mobile);
      const { json } = await exportStandeeViaBar(page);
      expect(json.kind).toBe('standee');
      expect(json.part).toMatchObject(ONE_SIDED_FIELDS);
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

    test('import of a one-sided standee file becomes "Standard (2)" with arrangement oneSided', async ({ browser }) => {
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
        ...ONE_SIDED_FIELDS
      });
      await importPartFile(page, 'standee', 'Standard.standee.json', pkg);
      await expect(previewOf(page)).toContainText('One-sided');
      await expect(previewOf(page)).toContainText('"Standard (2)"');
      await confirmImport(page);
      await expect(page.getByTitle('Click to edit Standard (2)', { exact: true })).toBeVisible();
      const project = await readStoredProject(page, (p) => p.standees.length === 2);
      expect(project.standees[1].name).toBe('Standard (2)');
      expect(project.standees[1]).toMatchObject(ONE_SIDED_FIELDS);
      expect(project.standees[0].arrangement).toBeUndefined();
      await page.context().close();
    });

    test('tray package with an embedded one-sided standee: export, import, definition and slotWallHeight arrive', async ({
      browser
    }) => {
      const project = await oneSidedProject();
      standeeTrayOf(project).params.slotWallHeight = 12.5;
      const source = await pageWith(browser, project, mobile);
      const { json } = await exportViaBottomBar(source, trayRow(source, TRAY), exportTrayButton(source));
      expect(json.dependencies.standees).toHaveLength(1);
      expect(json.dependencies.standees[0]).toMatchObject(ONE_SIDED_FIELDS);
      expect(json.part.params.slotWallHeight).toBe(12.5);
      await source.context().close();

      // Fresh project: the Standard standee there is alternating -> the embedded one is added as "Standard (2)"
      const target = await pageWith(browser, undefined, mobile);
      await importTrayFile(target, true, 2, 'Standee Tray.tray.json', json);
      await expect(previewOf(target)).toContainText('Standard (2)');
      await confirmImport(target);
      const stored = await readStoredProject(target, (p) => p.standees.length === 2);
      expect(stored.standees[1]).toMatchObject({ name: 'Standard (2)', ...ONE_SIDED_FIELDS });
      const added = stored.layers[2].looseTrays.find((t: any) => t.name === `${TRAY} (2)`);
      expect(added.params.standeeId).toBe(stored.standees[1].id);
      expect(added.params.slotWallHeight).toBe(12.5);
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

// Switching the definition to one-sided makes the standee tray taller (about 42.1 instead of 25.5 mm)
// and with it the layer and the total; the status line reacts (container height 120 mm).
test.describe('Standee one-sided: layer height and height status (desktop)', () => {
  test('switching to one-sided raises the layer height and the total', async ({ browser }) => {
    const project = await defaultProject();
    project.globalSettings.gameContainerHeight = 120;
    const page = await pageWith(browser, project, false);
    const status = containerHeightStatus(page);
    const layer = layerRow(page, 'Top layer').locator('.navItemHeight');
    await expect(status).toHaveText('Layers total: 104.5 mm of 120.0 mm – 15.5 mm free');
    await expect(status).toHaveClass(/containerHeightStatus--ok/);
    await expect(layer).toHaveText('25.5 mm');
    await openStandee(page);
    await chooseArrangement(page, 'One-sided');
    await expect(layer).toHaveText('42.1 mm');
    await expect(status).toHaveText('Layers total: 121.1 mm of 120.0 mm – too tall by 1.2 mm');
    await expect(status).toHaveClass(/containerHeightStatus--tooTall/);
    // Back to alternating: original values
    await chooseArrangement(page, 'Alternating');
    await expect(layer).toHaveText('25.5 mm');
    await expect(status).toHaveText('Layers total: 104.5 mm of 120.0 mm – 15.5 mm free');
    await page.context().close();
  });
});
