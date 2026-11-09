import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.ts';
const port = 4186;
const origin = `http://127.0.0.1:${String(port)}`;
export default defineConfig({
  ...base,
  testMatch: 'video-reuse.spec.ts',
  outputDir: 'test-results/reuse',
  use: { ...base.use, baseURL: `${origin}/projects/rowlens/` },
  projects: [
    {
      name: 'laptop-low',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 540 } },
    },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node --experimental-strip-types e2e/server.ts',
    timeout: 120000,
    url: `${origin}/projects/rowlens/health/live`,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      API_PORT: String(port),
      BASE_PATH: '/projects/rowlens',
      PUBLIC_ORIGIN: origin,
      APP_VERSION: 'e2e',
      LOG_LEVEL: 'warn',
      E2E_VIDEO_REUSE: 'true',
    },
  },
});
