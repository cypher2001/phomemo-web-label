import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, dismissCompatibilityWarning } from './helpers/app';

/** Build a label with one templated text element */
async function buildLabel(page) {
  await page.click('#add-text');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.locator('#prop-text-content').fill('Item {{SN}}');
  await page.locator('#prop-text-content').dispatchEvent('input');
  await page.waitForTimeout(500);
}

async function openSeriesDialog(page) {
  await page.click('#template-toolbar-btn');
  await page.click('#template-manage-data');
  await expect(page.locator('#template-data-dialog')).toBeVisible();
  await page.click('#template-generate-series');
  await expect(page.locator('#series-dialog')).toBeVisible();
}

/** Pretend a run of `count` labels starting at `start` was printed */
async function seedPrintedRun(page, start: number, count: number, prefix = '') {
  await page.evaluate(async ({ start, count, prefix }) => {
    const m: any = await import('/templates.js');
    const config = { field: 'SN', mode: 'number', start, step: 1, pad: 0, prefix, suffix: '' };
    const { records } = m.generateSeries([config], count);
    localStorage.setItem('phomymo_series', JSON.stringify({
      config: { SN: config },
      memory: {
        SN: {
          last: m.lastSeriesNumber(config, records),
          next: m.nextSeriesStart(config, records),
          updatedAt: Date.now(),
        },
      },
    }));
  }, { start, count, prefix });
}

test.describe.serial('Resumable serials', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);
  });

  test('derives the next start from what actually printed', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const m: any = await import('/templates.js');
      const cfg = { field: 'SN', mode: 'number', start: 1, step: 1, pad: 3, prefix: 'SN-', suffix: '' };
      const { records } = m.generateSeries([cfg], 100);
      const down = { field: 'C', mode: 'number', start: 100, step: -5, pad: 0, prefix: '', suffix: '' };
      return {
        full: m.nextSeriesStart(cfg, records),
        cancelled: m.nextSeriesStart(cfg, records.slice(0, 63)),
        mixed: m.nextSeriesStart(cfg, [...records.slice(0, 5), { SN: 'not-a-serial' }]),
        descending: m.nextSeriesStart(down, m.generateSeries([down], 4).records),
        fixed: m.lastSeriesNumber({ field: 'B', mode: 'fixed', value: 'A' }, [{ B: 'A' }]),
        none: m.nextSeriesStart(cfg, []),
      };
    });

    expect(r.full).toBe(101);
    expect(r.cancelled).toBe(64);   // a cancelled run resumes where it stopped
    expect(r.mixed).toBe(6);        // foreign rows are ignored
    expect(r.descending).toBe(80);  // negative steps count down
    expect(r.fixed).toBeNull();
    expect(r.none).toBeNull();
  });

  test('start continues past the last printed run', async ({ page }) => {
    await seedPrintedRun(page, 1, 100);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);

    await buildLabel(page);
    await openSeriesDialog(page);

    await expect(page.locator('.series-field .series-start')).toHaveValue('101');
    await expect(page.locator('.series-field .series-memory')).toBeVisible();
    await expect(page.locator('.series-field .series-memory-text')).toContainText('Continuing after 100');
  });

  test('generated values continue rather than repeat', async ({ page }) => {
    await seedPrintedRun(page, 1, 100);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);

    await buildLabel(page);
    await openSeriesDialog(page);
    await page.locator('#series-count').fill('3');
    await page.click('#series-generate');

    const values = page.locator('#template-data-body .template-field-input');
    await expect(values.nth(0)).toHaveValue('101');
    await expect(values.nth(2)).toHaveValue('103');
  });

  test('Start over forgets the history', async ({ page }) => {
    await seedPrintedRun(page, 1, 100);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);

    await buildLabel(page);
    await openSeriesDialog(page);
    await expect(page.locator('.series-field .series-start')).toHaveValue('101');

    await page.locator('.series-field .series-reset').click();
    await page.waitForTimeout(300);

    await expect(page.locator('.series-field .series-memory')).toBeHidden();
    await expect(page.locator('.series-field .series-start')).toHaveValue('1');

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('phomymo_series') || '{}').memory);
    expect(stored.SN).toBeUndefined();
  });

  test('a run that never printed leaves no history', async ({ page }) => {
    await buildLabel(page);
    await openSeriesDialog(page);
    await page.locator('#series-count').fill('5');
    await page.click('#series-generate');

    // Generating is not printing, so nothing should be remembered
    const memory = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('phomymo_series') || '{}').memory || {});
    expect(memory.SN).toBeUndefined();
  });
});
