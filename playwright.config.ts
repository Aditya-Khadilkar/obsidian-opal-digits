import { defineConfig } from '@playwright/test';

// Headless Chromium needs to be pushed onto a real GPU path for WebGL2.
// SwiftShader is the portable fallback when no GPU is available (CI).
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=default',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
      ],
    },
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
