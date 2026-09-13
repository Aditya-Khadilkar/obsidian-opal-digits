import { test, expect } from '@playwright/test';

/**
 * Captures the five fixed tilt states from PRD section 8 plus the debug views,
 * into screenshots/phase-<PHASE>/. These are artifacts for eyeballing against
 * reference/, not pixel assertions.
 */
const PHASE = process.env.PHASE ?? '0';
const OUT = `screenshots/phase-${PHASE}`;

const TILTS: Array<[string, string]> = [
  ['centre', '0,0'],
  ['left', '-1,0'],
  ['right', '1,0'],
  ['up', '0,1'],
  ['down', '0,-1'],
];

const VIEWS: Array<[string, string]> = [
  ['final', 'final'],
  ['segment-mask', 'segment mask'],
  ['layer-id', 'layer id'],
  ['grating-angle', 'grating angle'],
  ['diffraction-only', 'diffraction only'],
  ['cosine-palette', 'cosine-palette comparison'],
  ['fresnel', 'fresnel / reflection only (phase 3)'],
];

async function open(page: import('@playwright/test').Page, query: string) {
  await page.goto(`/?nogui=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  // Let the shader compile and a few frames land before capturing.
  await page.waitForTimeout(600);
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  expect(size.w, 'canvas has a non-zero drawing buffer').toBeGreaterThan(0);
  expect(size.h).toBeGreaterThan(0);
}

for (const [name, tilt] of TILTS) {
  test(`tilt ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await open(page, `tilt=${tilt}`);
    await page.screenshot({ path: `${OUT}/tilt-${name}.png` });
    expect(errors, 'no console or page errors').toEqual([]);
  });
}

for (const [file, view] of VIEWS) {
  test(`view ${file}`, async ({ page }) => {
    await open(page, `tilt=0.3,-0.2&set=viewMode:${encodeURIComponent(view)}`);
    await page.screenshot({ path: `${OUT}/view-${file}.png` });
  });
}

test('digit geometry at extreme zoom stays crisp', async ({ page }) => {
  await open(page, 'tilt=0,0&set=gridScale:1.2,density:1');
  await page.screenshot({ path: `${OUT}/zoom-glyphs.png` });
});

test('renders a full grid of ghost cells', async ({ page }) => {
  await open(page, 'tilt=0,0&set=gridScale:26');
  await page.screenshot({ path: `${OUT}/grid-dense.png` });
});
