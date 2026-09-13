import type { Page } from '@playwright/test';

/**
 * Compares two screenshots by decoding them in the page, which avoids needing a
 * PNG decoder in Node.
 *
 * Returns the mean absolute per-pixel channel difference over pixels that are
 * lit in either image. A whole-frame mean colour is not enough: hue changes in
 * opposite directions cancel, and a real sweep reads as almost no change.
 */
export async function pixelDifference(
  page: Page,
  a: Buffer,
  b: Buffer,
): Promise<{ meanDiff: number; litFraction: number }> {
  return page.evaluate(
    async ([b64a, b64b]) => {
      const load = async (b64: string) => {
        const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
        const img = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, img.width, img.height).data;
      };
      const [da, db] = await Promise.all([load(b64a), load(b64b)]);

      let total = 0;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) {
        const sa = da[i] + da[i + 1] + da[i + 2];
        const sb = db[i] + db[i + 1] + db[i + 2];
        if (sa < 24 && sb < 24) continue;   // black surround in both
        total +=
          Math.abs(da[i] - db[i]) +
          Math.abs(da[i + 1] - db[i + 1]) +
          Math.abs(da[i + 2] - db[i + 2]);
        n++;
      }
      return {
        meanDiff: n ? total / (n * 3) : 0,
        litFraction: n / (da.length / 4),
      };
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}
