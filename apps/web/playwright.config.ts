import { defineConfig, devices } from '@playwright/test';

// Smoke E2E against the built server (`pnpm build` first), with the production base path.
// The full harness behind Caddy with WebKit/iPhone is #22.
const port = 4173;
const origin = `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  reporter: process.env['CI'] !== undefined ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `${origin}/projects/rowlens/`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node dist/server/main.js',
    url: `${origin}/projects/rowlens/health/live`,
    reuseExistingServer: process.env['CI'] === undefined,
    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      BASE_PATH: '/projects/rowlens',
      PUBLIC_ORIGIN: origin,
      APP_VERSION: 'e2e',
      LOG_LEVEL: 'warn',
    },
  },
});
