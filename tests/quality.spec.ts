import { test, expect, type Page } from '@playwright/test';
import { pixelDifference, hueDifference } from './pixels';

async function open(page: Page, query: string, errors?: string[]) {
  if (errors) {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  }
  await page.goto(`/?nogui=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(500);
}

async function shot(page: Page, set: string) {
  await open(page, `tilt=0.3,-0.2&set=${set}`);
  return page.screenshot();
}

test.describe('quality tiers', () => {
  for (const tier of ['low', 'medium', 'high'] as const) {
    test(`${tier} compiles and renders`, async ({ page }) => {
      const errors: string[] = [];
      await open(page, `tilt=0.3,-0.2&set=quality:${tier}`, errors);
      expect(errors, 'no shader or runtime errors').toEqual([]);
      await page.screenshot({ path: `screenshots/phase-4/tier-${tier}.png` });
    });
  }

  test('lower tiers actually render less', async ({ page }) => {
    // Grain off so the comparison is not swamped by animated noise.
    const low = await shot(page, 'quality:low,grainAmount:0');
    const high = await shot(page, 'quality:high,grainAmount:0');
    const d = await pixelDifference(page, low, high);
    expect(d.meanDiff).toBeGreaterThan(2);
  });

  test('the tier caps the layer count rather than replacing it', async ({ page }) => {
    // The authored look is 4 layers. High allows 8, so asking for 4 at high and
    // 4 at medium must look the same; low caps at 3 and must differ.
    const high = await shot(page, 'quality:high,layers:4,grainAmount:0');
    const medium = await shot(page, 'quality:medium,layers:4,grainAmount:0');
    const low = await shot(page, 'quality:low,layers:4,grainAmount:0');

    // Medium drops a light and so is not pixel-identical, but the layer stack
    // is the same; low loses a layer as well.
    const mediumDiff = (await pixelDifference(page, high, medium)).meanDiff;
    const lowDiff = (await pixelDifference(page, high, low)).meanDiff;
    expect(lowDiff).toBeGreaterThan(mediumDiff);
  });
});

test.describe('presets', () => {
  for (const preset of ['Reference', 'Opal', 'Deep Obsidian'] as const) {
    test(`${preset} renders without error`, async ({ page }) => {
      const errors: string[] = [];
      await open(page, 'tilt=0.3,-0.2', errors);
      await page.evaluate(async (name) => {
        const { applyPreset } = await import(/* @vite-ignore */ '/src/presets.ts' as string);
        const { __params } = window as unknown as { __params: Record<string, unknown> };
        applyPreset(__params as never, name as never);
      }, preset);
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
      await page.screenshot({ path: `screenshots/phase-4/preset-${preset.replace(/\s+/g, '-')}.png` });
    });
  }

  test('the presets look different from each other', async ({ page }) => {
    const render = async (name: string) => {
      await open(page, 'tilt=0.3,-0.2&set=grainAmount:0');
      await page.evaluate(async (n) => {
        const { applyPreset } = await import(/* @vite-ignore */ '/src/presets.ts' as string);
        const { __params } = window as unknown as { __params: Record<string, unknown> };
        applyPreset(__params as never, n as never);
        (__params as Record<string, unknown>).grainAmount = 0;
      }, name);
      await page.waitForTimeout(400);
      return page.screenshot();
    };
    const reference = await render('Reference');
    const opal = await render('Opal');
    const obsidian = await render('Deep Obsidian');
    expect((await pixelDifference(page, reference, opal)).meanDiff).toBeGreaterThan(4);
    expect((await pixelDifference(page, reference, obsidian)).meanDiff).toBeGreaterThan(4);
  });
});

test.describe('digit animation', () => {
  test('digits change over time when it is switched on', async ({ page }) => {
    await open(page, 'tilt=0,0&set=digitSpeed:2,grainAmount:0');
    const a = await page.screenshot();
    await page.waitForTimeout(1200);
    const b = await page.screenshot();
    expect((await pixelDifference(page, a, b)).meanDiff).toBeGreaterThan(2);
  });

  test('digits hold still when it is off', async ({ page }) => {
    await open(page, 'tilt=0,0&set=digitSpeed:0,grainAmount:0');
    const a = await page.screenshot();
    await page.waitForTimeout(1200);
    const b = await page.screenshot();
    expect((await pixelDifference(page, a, b)).meanDiff).toBeLessThan(0.5);
  });

  test('the colour does not jump when a digit changes', async ({ page }) => {
    // PRD 5.9: the grating angle must stay fixed as a cell counts, or every
    // digit change would flash a new hue. The grating-angle view shows that
    // directly, and must not move while the digits do.
    const view = encodeURIComponent('grating angle');
    await open(page, `tilt=0,0&set=digitSpeed:4,grainAmount:0,viewMode:${view}`);
    const a = await page.screenshot();
    await page.waitForTimeout(1200);
    const b = await page.screenshot();

    // The view dims and brightens as glyph shapes change, so compare hue, which
    // is the grating angle itself.
    expect(await hueDifference(page, a, b)).toBeLessThan(4);
    // And confirm the digits really were moving, or this proves nothing.
    expect((await pixelDifference(page, a, b)).meanDiff).toBeGreaterThan(1);
  });
});
