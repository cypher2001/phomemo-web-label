import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, dismissCompatibilityWarning, screenshot } from './helpers/app';

const CH = '09-units';

/** Switch the display unit via Print Settings */
async function setUnit(page, unit: 'mm' | 'in') {
  await page.click('#print-settings-btn');
  await expect(page.locator('#print-settings-dialog')).toBeVisible();
  await page.locator('#display-units').selectOption(unit);
  await page.click('#print-settings-save');
  await expect(page.locator('#print-settings-dialog')).toBeHidden();
  await page.waitForTimeout(400);
}

test.describe.serial('Units', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);
  });

  test('converts mm to inches and back', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const u: any = await import('/units.js');
      return {
        toIn: u.formatSize(101.6, 152.4, 'in'),
        toMm: u.formatSize(101.6, 152.4, 'mm'),
        parse: u.toMm('2.25', 'in'),
        roundTrip: u.quantize(u.toMm('2.25', 'in'), 'in'),
      };
    });
    expect(result.toIn).toBe('4 x 6 in');
    expect(result.toMm).toBe('101.6 x 152.4 mm');
    expect(result.parse).toBeCloseTo(57.15, 5);
    expect(result.roundTrip).toBeCloseTo(57.15, 5);
  });

  test('status bar and suffixes follow the unit', async ({ page }) => {
    await expect(page.locator('#print-size')).toHaveText('40 x 30 mm');

    await setUnit(page, 'in');
    await expect(page.locator('#print-size')).toHaveText('1.57 x 1.18 in');
    expect(await page.locator('[data-unit-label]').first().textContent()).toBe('in');

    await setUnit(page, 'mm');
    await expect(page.locator('#print-size')).toHaveText('40 x 30 mm');
    expect(await page.locator('[data-unit-label]').first().textContent()).toBe('mm');
  });

  test('offers inch stock the printer can fit', async ({ page }) => {
    await setUnit(page, 'in');

    const options = await page.locator('#label-size option').allTextContents();
    // Default M-series head is 48mm wide, so 4-inch stock must not be offered
    expect(options).toContain('2x1in');
    expect(options).toContain('1x0.5in');
    expect(options).not.toContain('4x6in');
    expect(options.some(o => o.includes('Metric Sizes'))).toBe(true);

    await screenshot(page, CH, 1, 'inch-size-dropdown');
  });

  test('selecting inch stock sets the real millimetre size', async ({ page }) => {
    await setUnit(page, 'in');
    await page.locator('#label-size').selectOption('2x1in');
    await page.waitForTimeout(400);

    await expect(page.locator('#print-size')).toHaveText('2 x 1 in');

    // Switching back proves the underlying geometry is 50.8 x 25.4 mm
    await setUnit(page, 'mm');
    await expect(page.locator('#print-size')).toHaveText('50.8 x 25.4 mm');
  });

  test('accepts fractional inches in custom size', async ({ page }) => {
    await setUnit(page, 'in');
    await page.locator('#label-size').selectOption('custom');
    await page.waitForTimeout(300);

    await page.locator('#custom-width').fill('2.25');
    await page.locator('#custom-width').dispatchEvent('change');
    await page.locator('#custom-height').fill('1.25');
    await page.locator('#custom-height').dispatchEvent('change');
    await page.waitForTimeout(400);

    await expect(page.locator('#print-size')).toHaveText('2.25 x 1.25 in');

    // Display rounds to one decimal (57.15 -> "57.1"), but the stored
    // geometry keeps full precision
    await setUnit(page, 'mm');
    await expect(page.locator('#print-size')).toHaveText('57.1 x 31.8 mm');

    // The fractional millimetres are the point: integer-only parsing would
    // have truncated 57.15 to 57 and silently resized the label
    expect(await page.locator('#print-size').textContent()).toMatch(/^57\.1 x 31\.8 mm$/);

    // And the value round-trips back to the inches that were typed
    await setUnit(page, 'in');
    await expect(page.locator('#print-size')).toHaveText('2.25 x 1.25 in');
    await expect(page.locator('#custom-width')).toHaveValue('2.25');
    await expect(page.locator('#custom-height')).toHaveValue('1.25');
  });

  test('unit choice survives a reload', async ({ page }) => {
    await setUnit(page, 'in');
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);

    await expect(page.locator('#print-size')).toHaveText('1.57 x 1.18 in');
  });
});
