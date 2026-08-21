import { test, expect } from '@playwright/test';
import { waitForAppReady, dismissInfoDialog, dismissCompatibilityWarning, screenshot } from './helpers/app';

const CH = '11-align';

/**
 * Add n text elements at deliberately ragged positions and differing widths,
 * set through the properties panel so the starting geometry is exact.
 */
const LAYOUT = [
  { x: 10, y: 5, w: 40 },
  { x: 100, y: 40, w: 20 },
  { x: 60, y: 80, w: 30 },
];

async function addTextElements(page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.click('#add-text');
    await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // The element just added is still selected, so the panel targets it
    await page.click('#elements-btn');
    await page.locator('.element-list-item').first().click();
    await page.waitForTimeout(150);

    for (const [sel, value] of [
      ['#prop-x', LAYOUT[i].x], ['#prop-y', LAYOUT[i].y], ['#prop-width', LAYOUT[i].w],
    ] as [string, number][]) {
      await page.locator(sel).fill(String(value));
      await page.locator(sel).dispatchEvent('change');
      await page.waitForTimeout(100);
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

/** Select every element via the Elements list, shift-clicking to accumulate */
async function selectAll(page) {
  await page.click('#elements-btn');
  await expect(page.locator('#elements-dropdown')).toBeVisible();
  const items = page.locator('.element-list-item');
  const count = await items.count();
  for (let i = 0; i < count; i++) {
    await items.nth(i).click({ modifiers: ['Shift'] });
    await page.waitForTimeout(120);
  }
  // Close via the toolbar button - Escape would clear the selection we just built
  await page.click('#elements-btn');
  await page.waitForTimeout(200);
}

/**
 * Read every element's box by selecting each in turn and reading the
 * properties panel - the same numbers a user sees, no test-only hooks.
 */
async function elementBoxes(page): Promise<{ x: number; w: number }[]> {
  await page.click('#elements-btn');
  await expect(page.locator('#elements-dropdown')).toBeVisible();
  const count = await page.locator('.element-list-item').count();
  await page.click('#elements-btn'); // close again; the loop reopens per item

  const boxes: { x: number; w: number }[] = [];
  for (let i = 0; i < count; i++) {
    await page.click('#elements-btn');
    await page.locator('.element-list-item').nth(i).click();
    await page.waitForTimeout(150);
    boxes.push({
      x: Number(await page.locator('#prop-x').inputValue()),
      w: Number(await page.locator('#prop-width').inputValue()),
    });
  }
  return boxes;
}

async function elementXs(page): Promise<number[]> {
  return (await elementBoxes(page)).map(b => b.x);
}

test.describe.serial('Align and distribute', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForAppReady(page);
    await dismissCompatibilityWarning(page);
    await dismissInfoDialog(page);
  });

  test('align maths, exercised directly', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const m: any = await import('/elements.js');
      const els = [
        { id: 1, x: 10,  y: 5,  width: 40, height: 10, rotation: 0 },
        { id: 2, x: 100, y: 40, width: 20, height: 10, rotation: 0 },
        { id: 3, x: 60,  y: 80, width: 30, height: 10, rotation: 0 },
      ];
      const ids = [1, 2, 3];
      const xs = (a: any[]) => a.map(e => e.x);
      const ys = (a: any[]) => a.map(e => e.y);
      const dist = m.distributeElements(els, ids, 'horizontal')
        .sort((a: any, b: any) => a.x - b.x);
      return {
        left: xs(m.alignElements(els, ids, 'left')),
        right: xs(m.alignElements(els, ids, 'right')),
        top: ys(m.alignElements(els, ids, 'top')),
        bottom: ys(m.alignElements(els, ids, 'bottom')),
        gaps: dist.slice(1).map((e: any, i: number) => e.x - (dist[i].x + dist[i].width)),
        distEnds: [dist[0].x, dist[dist.length - 1].x],
        tooFewAlign: m.alignElements(els, [1], 'left')[0].x,
        tooFewDist: m.distributeElements(els, [1, 2], 'horizontal')[1].x,
      };
    });

    expect(r.left).toEqual([10, 10, 10]);
    expect(r.right).toEqual([80, 100, 90]);
    expect(r.top).toEqual([5, 5, 5]);
    expect(r.bottom).toEqual([80, 80, 80]);
    // Equal gaps, and the outermost elements never move
    expect(r.gaps[0]).toBeCloseTo(r.gaps[1], 6);
    expect(r.distEnds).toEqual([10, 100]);
    // Guards: too few elements is a no-op
    expect(r.tooFewAlign).toBe(10);
    expect(r.tooFewDist).toBe(100);
  });

  test('button is disabled until two elements are selected', async ({ page }) => {
    await expect(page.locator('#align-btn')).toBeDisabled();

    await page.click('#add-text');
    await page.waitForTimeout(300);
    await expect(page.locator('#align-btn')).toBeDisabled();

    await page.click('#add-text');
    await page.waitForTimeout(300);
    await selectAll(page);
    await expect(page.locator('#align-btn')).toBeEnabled();
  });

  test('distribute stays disabled until there are three', async ({ page }) => {
    await addTextElements(page, 2);
    await selectAll(page);
    await page.click('#align-btn');
    await expect(page.locator('#align-dropdown')).toBeVisible();

    await expect(page.locator('[data-align-action="left"]')).toBeEnabled();
    await expect(page.locator('[data-align-action="distribute-h"]')).toBeDisabled();
    await expect(page.locator('#align-hint')).toBeVisible();

    await screenshot(page, CH, 1, 'align-dropdown');
  });

  test('aligning left gives every element the same x', async ({ page }) => {
    await addTextElements(page, 3);

    // Read positions first: reading selects elements one at a time, which
    // would otherwise clear the multi-selection we are about to build
    const before = await elementXs(page);
    expect(new Set(before).size).toBeGreaterThan(1); // genuinely ragged to start

    await selectAll(page);
    await page.click('#align-btn');
    await page.locator('[data-align-action="left"]').click();
    await page.waitForTimeout(300);

    const after = await elementXs(page);
    expect(new Set(after).size).toBe(1);
    expect(Math.min(...after)).toBe(Math.min(...before)); // leftmost never moves
  });

  test('distributing three elements equalises the gaps', async ({ page }) => {
    await addTextElements(page, 3);
    await selectAll(page);

    await page.click('#align-btn');
    await expect(page.locator('[data-align-action="distribute-h"]')).toBeEnabled();
    await page.locator('[data-align-action="distribute-h"]').click();
    await page.waitForTimeout(300);

    const boxes = (await elementBoxes(page)).sort((a, b) => a.x - b.x);
    expect(boxes.length).toBe(3);
    const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i].x + boxes[i].w));
    expect(gaps[0]).toBeCloseTo(gaps[1], 1);
  });

  test('align is undoable', async ({ page }) => {
    await addTextElements(page, 3);
    const before = await elementXs(page);

    await selectAll(page);
    await page.click('#align-btn');
    await page.locator('[data-align-action="left"]').click();
    await page.waitForTimeout(300);
    expect(new Set(await elementXs(page)).size).toBe(1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(await elementXs(page)).toEqual(before);
  });
});
