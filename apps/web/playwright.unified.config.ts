import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.ts';
const port = 4184;
const edgeUrl = process.env['E2E_UNIFIED_EDGE_URL'];
const origin = edgeUrl ?? `http://127.0.0.1:${String(port)}`;
export default defineConfig({
  ...base,
  testMatch: 'unified-users.spec.ts',
  outputDir: 'test-results-unified',
  use: { ...base.use, baseURL: `${origin}/projects/rowlens/` },
  projects: [
    {
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1000, height: 540 },
        ...(edgeUrl ? { channel: 'chrome' } : {}),
      },
    },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: edgeUrl
    ? []
    : {
        command: 'node --experimental-strip-types e2e/server.ts',
        timeout: 120000,
        url: `http://127.0.0.1:${String(port)}/projects/rowlens/health/live`,
        reuseExistingServer: false,
        env: {
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(port),
          API_PORT: String(port),
          BASE_PATH: '/projects/rowlens',
          PUBLIC_ORIGIN: `http://127.0.0.1:${String(port)}`,
          APP_VERSION: 'e2e',
          LOG_LEVEL: 'warn',
          E2E_UNIFIED: 'true',
        },
      },
});
