import { test, expect, type Page } from '@playwright/test';
import { pixelDifference } from './pixels';

/**
 * Depth checks for the parallax layers.
 *
 * Note on what is NOT tested here. Measuring the parallax as a pixel shift by
 * cross-correlation does not work: the digit lattice is periodic, so the
 * correlation is only defined modulo the cell pitch, and a walk of more than
 * half a cell reports the remainder instead. The tests below check properties
 * that survive that, and screenshots/phase-2 carries the visual evidence.
 */

async function shot(page: Page, tilt: string, set: string) {
  await page.goto(`/?nogui=1&tilt=${tilt}&set=${set}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(400);
  return page.screenshot();
}

/** Mean brightness over the slab, ignoring the black surround. */
async function meanBrightness(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (b64) => {
    const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
    const img = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (v < 3) continue;
      sum += v; n++;
    }
    return n ? sum / n : 0;
  }, png.toString('base64'));
}

test.describe('parallax layers', () => {
  test('depth moves a layer across the surface', async ({ page }) => {
    // Absorption and depth blur off, so the only thing layer spacing can change
    // is where the refracted ray lands.
    const base = 'layers:2,density:0,deepDensity:1,absorptionSigma:0,depthSoftness:0';
    const d = await pixelDifference(
      page,
      await shot(page, '0.5,0', `${base},layerSpacing:0`),
      await shot(page, '0.5,0', `${base},layerSpacing:0.25`),
    );
    expect(d.meanDiff).toBeGreaterThan(8);
  });

  test('all four layers reach the eye', async ({ page }) => {
    const png = await shot(page, '0,0', 'set=viewMode:layer%20id');
    // The layer-id view gives each depth its own hue, so counting distinct hues
    // counts the layers that are actually visible somewhere.
    const distinct = await page.evaluate(async (b64) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const img = await createImageBitmap(blob);
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, img.width, img.height);
      const seen = new Map<string, number>();
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] + data[i + 1] + data[i + 2] < 30) continue;
        const key = `${data[i] >> 5}:${data[i + 1] >> 5}:${data[i + 2] >> 5}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      // Only colours covering a real share of the slab count as a layer.
      return [...seen.values()].filter((n) => n > 2000).length;
    }, png.toString('base64'));
    expect(distinct).toBeGreaterThanOrEqual(4);
  });

  test('deeper layers are dimmer than the front layer', async ({ page }) => {
    // Same occupancy in both, so only depth attenuation differs.
    const front = await meanBrightness(page, await shot(page, '0,0', 'layers:1,density:1'));
    const deep = await meanBrightness(page, await shot(page, '0,0', 'layers:4,density:0,deepDensity:1'));
    expect(deep).toBeLessThan(front * 0.8);
  });

  test('no swimming or stretching at the tilt limits', async ({ page }) => {
    // A smeared sample shows up as lit coverage collapsing or exploding; a
    // correct parallax walk keeps it roughly constant.
    const coverage = async (tilt: string) => {
      const png = await shot(page, tilt, '');
      return page.evaluate(async (b64) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const img = await createImageBitmap(blob);
        const c = new OffscreenCanvas(img.width, img.height);
        const ctx = c.getContext('2d') as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, img.width, img.height);
        let lit = 0, total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const v = data[i] + data[i + 1] + data[i + 2];
          if (v < 12) continue;
          total++;
          if (v > 40) lit++;
        }
        return total ? lit / total : 0;
      }, png.toString('base64'));
    };
    const centre = await coverage('0,0');
    for (const tilt of ['1,1', '-1,-1', '1,-1', '-1,1']) {
      const c = await coverage(tilt);
      expect(c, `coverage at tilt ${tilt}`).toBeGreaterThan(centre * 0.6);
      expect(c, `coverage at tilt ${tilt}`).toBeLessThan(centre * 1.6);
    }
  });
});
