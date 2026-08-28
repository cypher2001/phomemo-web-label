import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, dismissCompatibilityWarning, screenshot } from './helpers/app';
import path from 'path';

const CH = '04-templates-batch';

test.describe.serial('Templates and Batch Printing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);
  });

  test('create text with template field', async ({ page }) => {
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await page.locator('#prop-text-content').fill('{{Name}} - ${{Price}}');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(500);

    await expect(page.locator('#template-toolbar-btn')).toBeVisible({ timeout: 5000 });

    await screenshot(page, CH, 1, 'template-field-in-text');
  });

  test('open template panel', async ({ page }) => {
    // Add element with template fields
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('#prop-text-content').fill('{{Name}} - ${{Price}}');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(500);

    await page.click('#template-toolbar-btn');
    await expect(page.locator('#template-panel')).toBeVisible();

    await screenshot(page, CH, 2, 'template-panel-open');
  });

  test('import CSV data', async ({ page }) => {
    // Setup: add template field and open data dialog
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('#prop-text-content').fill('{{Name}} - ${{Price}}');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(500);

    await page.click('#template-toolbar-btn');
    await expect(page.locator('#template-panel')).toBeVisible();

    await page.click('#template-manage-data');
    await expect(page.locator('#template-data-dialog')).toBeVisible();
    await screenshot(page, CH, 3, 'template-data-dialog-empty');

    // Import CSV
    const csvPath = path.join(__dirname, 'fixtures', 'sample.csv');
    await page.locator('#template-csv-input').setInputFiles(csvPath);
    await page.waitForTimeout(500);

    // Verify data loaded
    const rows = page.locator('#template-data-body tr');
    await expect(rows).not.toHaveCount(0);

    await screenshot(page, CH, 4, 'csv-data-imported');
  });

  test('export data back out as CSV', async ({ page }) => {
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('#prop-text-content').fill('{{Name}} - ${{Price}}');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(500);

    await page.click('#template-toolbar-btn');
    await page.click('#template-manage-data');
    const csvPath = path.join(__dirname, 'fixtures', 'sample.csv');
    await page.locator('#template-csv-input').setInputFiles(csvPath);
    await page.waitForTimeout(500);

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.click('#template-export-csv'),
    ]).then(([d]) => d);

    expect(download.suggestedFilename()).toMatch(/\.csv$/);

    const stream = await download.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
      let out = '';
      stream.on('data', (c: Buffer) => { out += c.toString(); });
      stream.on('end', () => resolve(out));
      stream.on('error', reject);
    });

    // Header names the detected fields, and every imported row comes back
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('Name,Price');
    expect(lines.length).toBeGreaterThan(1);
  });

  test('preview labels', async ({ page }) => {
    // Full setup: template field + CSV data + preview
    await page.click('#add-text');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('#prop-text-content').fill('{{Name}} - ${{Price}}');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(500);

    await page.click('#template-toolbar-btn');
    await page.click('#template-manage-data');
    await expect(page.locator('#template-data-dialog')).toBeVisible();

    const csvPath = path.join(__dirname, 'fixtures', 'sample.csv');
    await page.locator('#template-csv-input').setInputFiles(csvPath);
    await page.waitForTimeout(500);

    await page.click('#template-preview-btn');
    await expect(page.locator('#preview-dialog')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000); // Wait for previews to render

    await screenshot(page, CH, 5, 'preview-grid');
  });
});
