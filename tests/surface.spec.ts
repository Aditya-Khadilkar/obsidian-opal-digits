import { test, expect, type Page } from '@playwright/test';
import { pixelDifference } from './pixels';

const FRESNEL_VIEW = encodeURIComponent('fresnel / reflection only (phase 3)');

async function shot(page: Page, tilt: string, set = '') {
  await page.goto(`/?nogui=1&tilt=${tilt}&set=${set}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(400);
  return page.screenshot();
}

/** Spread of brightness across the slab, ignoring the black surround. */
async function contrast(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const img = await createImageBitmap(blob);
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    const vals: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v < 2) continue;
      vals.push(v);
    }
    if (!vals.length) return 0;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.95)] - vals[Math.floor(vals.length * 0.05)];
  }, png.toString('base64'));
}

test.describe('obsidian surface', () => {
  test('highlights slide across the surface as the slab turns', async ({ page }) => {
    const set = `viewMode:${FRESNEL_VIEW}`;
    const d = await pixelDifference(page, await shot(page, '-0.6,0.3', set), await shot(page, '0.6,-0.3', set));
    expect(d.meanDiff).toBeGreaterThan(4);
  });

  test('the reflection is structured, not a flat wash', async ({ page }) => {
    // A wavy surface catches the softboxes in patches. A flat one would return
    // a single value everywhere at this near-normal view.
    const wavy = await contrast(page, await shot(page, '0.4,-0.3', `viewMode:${FRESNEL_VIEW}`));
    const flat = await contrast(page, await shot(page, '0.4,-0.3', `viewMode:${FRESNEL_VIEW},surfaceWaviness:0`));
    expect(wavy).toBeGreaterThan(flat * 2);
  });

  test('the surface is a faint sheen, not a mirror', async ({ page }) => {
    // PRD section 2 calls for faint reflections on black glass, so turning them
    // off must not transform the image.
    const d = await pixelDifference(page, await shot(page, '0.4,-0.3'), await shot(page, '0.4,-0.3', 'envStrength:0'));
    expect(d.meanDiff).toBeGreaterThan(0.5);   // present
    expect(d.meanDiff).toBeLessThan(14);       // but not dominant
  });

  test('bloom lifts the brightest hits only', async ({ page }) => {
    const off = await shot(page, '0.3,-0.2', 'bloomStrength:0');
    const on = await shot(page, '0.3,-0.2', 'bloomStrength:1.2');
    const d = await pixelDifference(page, off, on);
    expect(d.meanDiff).toBeGreaterThan(1);
  });

  test('tone mapping is applied', async ({ page }) => {
    const d = await pixelDifference(
      page,
      await shot(page, '0,0', 'toneMapping:none'),
      await shot(page, '0,0', 'toneMapping:aces'),
    );
    expect(d.meanDiff).toBeGreaterThan(3);
  });
});
