import { test, expect, type Page } from '@playwright/test';
import { pixelDifference } from './pixels';

/**
 * Drives the tilt module with synthetic orientation events.
 *
 * A real gyroscope cannot be exercised headlessly, and neither can the iOS
 * permission dialog, so those need a phone over HTTPS. What IS testable here is
 * everything the phone would feed into: the permission branches, the neutral
 * pose, the deadzone, the gimbal guard, the screen-rotation remap and the
 * fallbacks. Those are where the bugs live.
 */

interface Debug {
  status: string;
  events: number;
  gimbalHeld: boolean;
  base: { beta: number; gamma: number } | null;
  target: { x: number; y: number };
  tilt: { x: number; y: number };
}

async function readDebug(page: Page): Promise<Debug> {
  const text = await page.locator('.tilt-debug').textContent();
  const lines = (text ?? '').split('\n');
  const find = (k: string) => lines.find((l) => l.startsWith(k)) ?? '';
  const nums = (l: string) => (l.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  const statusLine = find('status');
  const baseNums = nums(find('neutral'));
  const t = nums(find('target'));
  const ti = nums(find('tilt'));
  return {
    status: statusLine.replace('status', '').replace('(gimbal held)', '').trim(),
    events: nums(find('events'))[0] ?? 0,
    gimbalHeld: statusLine.includes('gimbal held'),
    base: baseNums.length >= 2 ? { beta: baseNums[0], gamma: baseNums[1] } : null,
    target: { x: t[0] ?? 0, y: t[1] ?? 0 },
    tilt: { x: ti[0] ?? 0, y: ti[1] ?? 0 },
  };
}

/** Stubs the iOS permission gate before any app code runs. */
async function stubPermission(page: Page, result: 'granted' | 'denied' | 'throw') {
  await page.addInitScript((r) => {
    const ctor = window.DeviceOrientationEvent as unknown as Record<string, unknown>;
    ctor.requestPermission = () =>
      r === 'throw' ? Promise.reject(new Error('nope')) : Promise.resolve(r);
  }, result);
}

async function setScreenAngle(page: Page, angle: number) {
  await page.addInitScript((a) => {
    Object.defineProperty(screen.orientation, 'angle', { get: () => a, configurable: true });
  }, angle);
}

async function orient(page: Page, beta: number, gamma: number, times = 1) {
  await page.evaluate(
    ({ beta, gamma, times }) => {
      for (let i = 0; i < times; i++) {
        window.dispatchEvent(
          new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma }),
        );
      }
    },
    { beta, gamma, times },
  );
  // Let the render loop copy the new target into the debug readout.
  await page.waitForTimeout(60);
}

async function open(page: Page, query = '') {
  await page.goto(`/?debugTilt=1&nogui=1&${query}`);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
}

async function start(page: Page) {
  await page.locator('.start-button').click();
}

test.describe('permission flow', () => {
  test('granted: gyro drives tilt and the gate disappears', async ({ page }) => {
    await stubPermission(page, 'granted');
    await open(page);
    await expect(page.locator('.start-button')).toBeVisible();
    await start(page);
    await orient(page, 50, 0);              // first event captures the neutral pose
    await expect(page.locator('.start-overlay')).toHaveCount(0, { timeout: 4000 });

    const d = await readDebug(page);
    expect(d.status).toBe('gyro');
    expect(d.base).not.toBeNull();
    expect(d.base!.beta).toBeCloseTo(50, 0);
    // The pose the user is holding reads as zero, however far off flat it is.
    expect(Math.abs(d.target.x)).toBeLessThan(0.02);
    expect(Math.abs(d.target.y)).toBeLessThan(0.02);
  });

  test('denied: falls back to drag, with a toast, and never breaks', async ({ page }) => {
    await stubPermission(page, 'denied');
    await open(page);
    await start(page);

    await expect(page.locator('.toast')).toHaveText('Tilt unavailable — drag instead');
    await expect(page.locator('.start-overlay')).toHaveCount(0, { timeout: 4000 });

    // Pointer input still moves the material.
    await page.mouse.move(300, 400);
    await page.mouse.move(1000, 200);
    await page.waitForTimeout(80);
    const d = await readDebug(page);
    expect(d.status).toBe('pointer');
    expect(d.target.x).toBeGreaterThan(0.2);
  });

  test('a thrown permission request is treated as a refusal', async ({ page }) => {
    await stubPermission(page, 'throw');
    await open(page);
    await start(page);
    await expect(page.locator('.toast')).toBeVisible();
    await page.mouse.move(1000, 300);
    await page.waitForTimeout(80);
    expect((await readDebug(page)).status).toBe('pointer');
  });

  test('granted but silent sensor falls back after the timeout', async ({ page }) => {
    await stubPermission(page, 'granted');
    await open(page);
    await start(page);
    // No events dispatched: permission alone is not proof of a sensor.
    await page.waitForTimeout(1600);
    const d = await readDebug(page);
    expect(d.events).toBe(0);
    expect(d.status).toBe('unsupported');

    await page.mouse.move(1000, 300);
    await page.waitForTimeout(80);
    expect((await readDebug(page)).status).toBe('pointer');
  });
});

test.describe('calibration', () => {
  test.beforeEach(async ({ page }) => {
    await stubPermission(page, 'granted');
  });

  test('tilting away from the neutral pose moves tilt in both axes', async ({ page }) => {
    await open(page, 'set=recenterRate:0,deadzoneDeg:1,tiltRangeDeg:30');
    await start(page);
    await orient(page, 50, 0);

    // Tipping the top of the phone away lowers beta and tips the slab top away.
    await orient(page, 35, 0);
    expect((await readDebug(page)).target.y).toBeCloseTo(14 / 30, 1);

    // Tipping the right edge down turns the slab's right edge away.
    await orient(page, 50, 12);
    const d = await readDebug(page);
    expect(d.target.x).toBeCloseTo(11 / 30, 1);
    expect(Math.abs(d.target.y)).toBeLessThan(0.05);
  });

  test('deadzone swallows idle jitter', async ({ page }) => {
    await open(page, 'set=recenterRate:0,deadzoneDeg:4');
    await start(page);
    await orient(page, 50, 0);
    await orient(page, 51.5, -2);
    const d = await readDebug(page);
    expect(d.target.x).toBe(0);
    expect(d.target.y).toBe(0);
  });

  test('gimbal guard holds the last value near vertical', async ({ page }) => {
    await open(page, 'set=recenterRate:0,tiltRangeDeg:30');
    await start(page);
    await orient(page, 50, 0);
    await orient(page, 65, 0);
    const before = (await readDebug(page)).target;

    await orient(page, 88, 40);   // past the guard
    const after = await readDebug(page);
    expect(after.gimbalHeld).toBe(true);
    expect(after.target.x).toBeCloseTo(before.x, 3);
    expect(after.target.y).toBeCloseTo(before.y, 3);
  });

  test('tilt is clamped beyond the range', async ({ page }) => {
    await open(page, 'set=recenterRate:0,tiltRangeDeg:10');
    await start(page);
    await orient(page, 50, 0);
    await orient(page, 50, 75);
    expect((await readDebug(page)).target.x).toBeCloseTo(1, 3);
  });

  test('baseline drift re-centres a held pose', async ({ page }) => {
    await open(page, 'set=recenterRate:0.2,tiltRangeDeg:30,deadzoneDeg:0');
    await start(page);
    await orient(page, 50, 0);
    await orient(page, 70, 0);
    const moved = Math.abs((await readDebug(page)).target.y);
    expect(moved).toBeGreaterThan(0.1);

    await orient(page, 70, 0, 60);          // hold still
    expect(Math.abs((await readDebug(page)).target.y)).toBeLessThan(moved / 3);
  });

  test('recalibrate re-captures the neutral pose', async ({ page }) => {
    await open(page, 'set=recenterRate:0,tiltRangeDeg:30,deadzoneDeg:0');
    await start(page);
    await orient(page, 50, 0);
    await orient(page, 70, 0);
    expect(Math.abs((await readDebug(page)).target.y)).toBeGreaterThan(0.1);

    // Double tap on the canvas, once the gate has actually gone away.
    await expect(page.locator('.start-overlay')).toHaveCount(0, { timeout: 4000 });
    await page.mouse.click(640, 400);
    await page.mouse.click(640, 400);
    await orient(page, 70, 0);
    const d = await readDebug(page);
    expect(d.base!.beta).toBeCloseTo(70, 0);
    expect(Math.abs(d.target.y)).toBeLessThan(0.02);
  });
});

test.describe('screen rotation', () => {
  test('landscape swaps the axes', async ({ page }) => {
    await stubPermission(page, 'granted');
    await setScreenAngle(page, 90);
    await open(page, 'set=recenterRate:0,tiltRangeDeg:30,deadzoneDeg:0');
    await start(page);
    await orient(page, 0, -50);             // neutral pose held in landscape

    // At 90 degrees the device's beta becomes the screen's left-to-right axis.
    await orient(page, 12, -50);
    const d = await readDebug(page);
    expect(d.target.x).toBeCloseTo(-12 / 30, 1);
    expect(Math.abs(d.target.y)).toBeLessThan(0.05);
  });

  test('upside down negates both axes', async ({ page }) => {
    await stubPermission(page, 'granted');
    await setScreenAngle(page, 180);
    await open(page, 'set=recenterRate:0,tiltRangeDeg:30,deadzoneDeg:0');
    await start(page);
    await orient(page, 50, 0);
    await orient(page, 50, 12);
    expect((await readDebug(page)).target.x).toBeCloseTo(-12 / 30, 1);
  });
});

test('auto-drift keeps the material alive while idle', async ({ page }) => {
  await open(page, 'set=tiltSource:auto-drift');
  await page.waitForTimeout(400);
  const a = (await readDebug(page)).tilt;
  await page.waitForTimeout(900);
  const b = (await readDebug(page)).tilt;
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0.01);
  expect(Math.abs(b.x)).toBeLessThanOrEqual(0.45);
});

test.describe('how tilt reaches the shader (PRD 5.10.4)', () => {
  /**
   * The PRD's own check. Diffraction depends on the half-vector between light
   * and view in tangent space, so the hue must sweep because the surface turns
   * relative to the lights, not because parallax layers slide. Hold the slab
   * still, turn only the lights, and the colours must still move.
   */
  async function shotAt(page: Page, tilt: string, set: string) {
    await page.goto(`/?nogui=1&tilt=${tilt}&set=${set}`);
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    await page.waitForTimeout(400);
    return page.screenshot();
  }

  test('nothing turning means nothing moves', async ({ page }) => {
    const set = 'slabRotationDeg:0,lightRotationDeg:0';
    const d = await pixelDifference(
      page,
      await shotAt(page, '-1,0', set),
      await shotAt(page, '1,0', set),
    );
    expect(d.meanDiff).toBeLessThan(0.5);
  });

  test('colours sweep with the slab held still and only the lights turning', async ({ page }) => {
    const set = 'slabRotationDeg:0,lightRotationDeg:15';
    const d = await pixelDifference(
      page,
      await shotAt(page, '-1,0', set),
      await shotAt(page, '1,0', set),
    );
    // Geometry is identical in both frames, so every bit of this is hue.
    expect(d.meanDiff).toBeGreaterThan(6);
  });

  test('the default configuration sweeps as the slab turns', async ({ page }) => {
    const d = await pixelDifference(
      page,
      await shotAt(page, '-1,-1', ''),
      await shotAt(page, '1,1', ''),
    );
    expect(d.meanDiff).toBeGreaterThan(6);
  });
});
