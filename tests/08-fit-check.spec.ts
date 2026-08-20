import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, dismissCompatibilityWarning, screenshot } from './helpers/app';

const CH = '08-fit-check';

/** Build a label whose text field spans a range of value lengths */
async function buildLabel(page) {
  await page.click('#add-text');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.locator('#prop-text-content').fill('Item {{SN}}');
  await page.locator('#prop-text-content').dispatchEvent('input');
  await page.waitForTimeout(500);
}

/** Generate `count` records starting at `start`, then close the data dialog */
async function generate(page, count: string, start: string) {
  await page.click('#template-toolbar-btn');
  await page.click('#template-manage-data');
  await page.click('#template-generate-series');
  await expect(page.locator('#series-dialog')).toBeVisible();
  await page.locator('#series-count').fill(count);
  await page.locator('.series-field .series-start').fill(start);
  await page.click('#series-generate');
  await expect(page.locator('#series-dialog')).toBeHidden();
  await page.click('#template-data-close');
  await page.waitForTimeout(300);
}

/** Fingerprint of what is currently painted on the label canvas */
function canvasFingerprint(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#preview-canvas') as HTMLCanvasElement;
    return c.toDataURL().length + ':' + c.toDataURL().slice(-64);
  });
}

test.describe.serial('Fit Check', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);
  });

  test('picks the longest value per element', async ({ page }) => {
    // Exercise the substitution directly: 8..12 means "Item 10" is the widest
    const result = await page.evaluate(async () => {
      const m: any = await import('/templates.js');
      const records = [8, 9, 10, 11, 12].map(n => ({ SN: String(n) }));
      const els = [
        { id: 1, type: 'text', text: 'Item {{SN}}' },
        { id: 2, type: 'qr', qrData: 'https://x/{{SN}}' },
        { id: 3, type: 'text', text: 'Untouched' },
      ];
      return m.substituteLongestValues(els, records);
    });

    expect(result[0].text).toBe('Item 10');
    expect(result[1].qrData).toBe('https://x/10');
    expect(result[2].text).toBe('Untouched');
  });

  test('leaves elements alone when there are no records', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m: any = await import('/templates.js');
      return m.substituteLongestValues([{ id: 1, text: 'Item {{SN}}' }], []);
    });
    expect(result[0].text).toBe('Item {{SN}}');
  });

  test('will not turn on without data to size against', async ({ page }) => {
    await buildLabel(page);
    await page.click('#template-toolbar-btn');
    await page.click('#template-worst-case');

    await expect(page.locator('#template-worst-case-label')).toHaveText('Show Longest Values');
  });

  test('repaints the canvas with the longest value and back', async ({ page }) => {
    await buildLabel(page);
    await generate(page, '5', '8');

    const placeholder = await canvasFingerprint(page);

    await page.click('#template-worst-case');
    await expect(page.locator('#template-worst-case-label')).toHaveText('Showing Longest Values');
    await page.waitForTimeout(300);
    const worstCase = await canvasFingerprint(page);

    // "Item {{SN}}" and "Item 10" are different widths, so the canvas must differ
    expect(worstCase).not.toBe(placeholder);

    await screenshot(page, CH, 1, 'longest-value-on-canvas');

    await page.click('#template-worst-case');
    await expect(page.locator('#template-worst-case-label')).toHaveText('Show Longest Values');
    await page.waitForTimeout(300);
    expect(await canvasFingerprint(page)).toBe(placeholder);
  });

  test('turns itself off when the last field is removed', async ({ page }) => {
    await buildLabel(page);
    await generate(page, '5', '8');
    await page.click('#template-worst-case');
    await expect(page.locator('#template-worst-case-label')).toHaveText('Showing Longest Values');

    // Drop the field from the text, so nothing is templated any more
    await page.locator('#prop-text-content').fill('Plain text');
    await page.locator('#prop-text-content').dispatchEvent('input');
    await page.waitForTimeout(500);

    await expect(page.locator('#template-worst-case-label')).toHaveText('Show Longest Values');
  });
});
