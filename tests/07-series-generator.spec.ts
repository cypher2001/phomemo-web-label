import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, dismissCompatibilityWarning, screenshot } from './helpers/app';

const CH = '07-series-generator';

/** Add a text element and a QR element that both use the same {{SN}} field */
async function buildSerialLabel(page) {
  await page.click('#add-text');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.locator('#prop-text-content').fill('Item {{SN}}');
  await page.locator('#prop-text-content').dispatchEvent('input');
  await page.waitForTimeout(300);

  await page.click('#add-qr');
  await page.waitForTimeout(300);
  await page.locator('#prop-qr-data').fill('https://example.com/{{SN}}');
  await page.locator('#prop-qr-data').dispatchEvent('input');
  await page.waitForTimeout(500);
}

/** Open the series generator from the template panel */
async function openSeriesDialog(page) {
  await page.click('#template-toolbar-btn');
  await expect(page.locator('#template-panel')).toBeVisible();
  await page.click('#template-manage-data');
  await expect(page.locator('#template-data-dialog')).toBeVisible();
  await page.click('#template-generate-series');
  await expect(page.locator('#series-dialog')).toBeVisible();
}

test.describe.serial('Series Generator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);
  });

  test('shared field is detected across text and QR', async ({ page }) => {
    await buildSerialLabel(page);

    await expect(page.locator('#template-toolbar-btn')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#template-field-count')).toHaveText('1');

    await screenshot(page, CH, 1, 'shared-field-detected');
  });

  test('series dialog previews values live', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    // One config row per detected field
    await expect(page.locator('#series-fields .series-field')).toHaveCount(1);

    await page.locator('#series-count').fill('100');
    await page.locator('.series-field .series-pad').fill('3');
    await page.locator('.series-field .series-prefix').fill('SN-');
    await page.waitForTimeout(300);

    await expect(page.locator('.series-field .series-preview'))
      .toHaveText('SN-001, SN-002, SN-003 ... SN-100');
    await expect(page.locator('#series-summary')).toHaveText('Creates 100 labels');

    await screenshot(page, CH, 2, 'series-dialog-configured');
  });

  test('generates incrementing records', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    await page.locator('#series-count').fill('100');
    await page.locator('.series-field .series-pad').fill('3');
    await page.locator('.series-field .series-prefix').fill('SN-');
    await page.click('#series-generate');

    await expect(page.locator('#series-dialog')).toBeHidden();
    await expect(page.locator('#template-data-body tr')).toHaveCount(100);

    const values = page.locator('#template-data-body .template-field-input');
    await expect(values.first()).toHaveValue('SN-001');
    await expect(values.nth(41)).toHaveValue('SN-042');
    await expect(values.last()).toHaveValue('SN-100');

    // All generated records are selected for printing
    await expect(page.locator('#template-print-count')).toHaveText('100');

    await screenshot(page, CH, 3, 'generated-records');
  });

  test('step and start are honoured', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    await page.locator('#series-count').fill('5');
    await page.locator('.series-field .series-start').fill('1000');
    await page.locator('.series-field .series-step').fill('25');
    await page.click('#series-generate');

    const values = page.locator('#template-data-body .template-field-input');
    await expect(values.first()).toHaveValue('1000');
    await expect(values.nth(1)).toHaveValue('1025');
    await expect(values.last()).toHaveValue('1100');
  });

  test('append adds to existing records', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    await page.locator('#series-count').fill('3');
    await page.click('#series-generate');
    await expect(page.locator('#template-data-body tr')).toHaveCount(3);

    await page.click('#template-generate-series');
    await expect(page.locator('#series-dialog')).toBeVisible();
    await page.locator('#series-apply-mode').selectOption('append');
    await page.locator('#series-count').fill('2');
    await page.locator('.series-field .series-start').fill('10');
    await page.waitForTimeout(200);
    await expect(page.locator('#series-summary')).toHaveText('Adds 2 labels to the existing 3');
    await page.click('#series-generate');

    await expect(page.locator('#template-data-body tr')).toHaveCount(5);
    const values = page.locator('#template-data-body .template-field-input');
    await expect(values.nth(3)).toHaveValue('10');
    await expect(values.nth(4)).toHaveValue('11');
  });

  test('fixed mode repeats one value on every label', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    await page.locator('#series-count').fill('4');
    await page.locator('.series-field .series-mode').selectOption('fixed');
    await expect(page.locator('.series-field .series-number-opts')).toBeHidden();
    await page.locator('.series-field .series-value').fill('BATCH-A');
    await page.click('#series-generate');

    const values = page.locator('#template-data-body .template-field-input');
    await expect(values.first()).toHaveValue('BATCH-A');
    await expect(values.last()).toHaveValue('BATCH-A');
  });

  test('each field advances independently', async ({ page }) => {
    // Text and QR carry different fields, so each gets its own counter
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('#prop-text-content').fill('Box {{BOX}}');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(300);

    await page.click('#add-qr');
    await page.waitForTimeout(300);
    await page.locator('#prop-qr-data').fill('https://example.com/{{SN}}');
    await page.locator('#prop-qr-data').dispatchEvent('input');
    await page.waitForTimeout(500);

    await page.click('#template-toolbar-btn');
    await page.click('#template-manage-data');
    await page.click('#template-generate-series');
    await expect(page.locator('#series-dialog')).toBeVisible();
    await expect(page.locator('#series-fields .series-field')).toHaveCount(2);

    await page.locator('#series-count').fill('3');
    const box = page.locator('.series-field', { hasText: '{{BOX}}' });
    const sn = page.locator('.series-field', { hasText: '{{SN}}' });
    await box.locator('.series-start').fill('1');
    await box.locator('.series-step').fill('1');
    await sn.locator('.series-start').fill('500');
    await sn.locator('.series-step').fill('10');
    await page.click('#series-generate');

    // Two columns per row: BOX then SN, in field-detection order
    const rows = page.locator('#template-data-body tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('.template-field-input').first()).toHaveValue('1');
    await expect(rows.nth(0).locator('.template-field-input').last()).toHaveValue('500');
    await expect(rows.nth(2).locator('.template-field-input').first()).toHaveValue('3');
    await expect(rows.nth(2).locator('.template-field-input').last()).toHaveValue('520');
  });

  test('quotes in a prefix do not corrupt the row', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    await page.locator('#series-count').fill('2');
    await page.locator('.series-field .series-prefix').fill('A"<b>-');
    await page.waitForTimeout(300);

    // The row survives intact and the literal text is carried through
    await expect(page.locator('#series-fields .series-field')).toHaveCount(1);
    await expect(page.locator('.series-field .series-preview')).toHaveText('A"<b>-1, A"<b>-2');

    await page.click('#series-generate');
    await expect(page.locator('#template-data-body .template-field-input').first())
      .toHaveValue('A"<b>-1');

    // Reopening restores the saved settings rather than mangling them
    await page.click('#template-generate-series');
    await expect(page.locator('.series-field .series-prefix')).toHaveValue('A"<b>-');
  });

  test('generated series renders in the label preview', async ({ page }) => {
    await buildSerialLabel(page);
    await openSeriesDialog(page);

    await page.locator('#series-count').fill('6');
    await page.locator('.series-field .series-pad').fill('3');
    await page.click('#series-generate');

    await page.click('#template-preview-btn');
    await expect(page.locator('#preview-dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.preview-thumbnail')).toHaveCount(6);
    await page.waitForTimeout(1000); // Let the thumbnails rasterize

    await screenshot(page, CH, 4, 'series-preview-grid');
  });
});
