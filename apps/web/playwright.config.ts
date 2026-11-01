import { defineConfig, devices } from '@playwright/test';

// Two modes, same tests:
// - default: against the built server (`pnpm build` first), started here with the production base path;
// - edge (`E2E_EDGE_URL`, see `pnpm e2e:edge`): against the local Caddy stack that mirrors trustable.nl.
const port = 4173;
const edgeUrl = process.env['E2E_EDGE_URL'];
const origin = edgeUrl ?? `http://127.0.0.1:${String(port)}`;

export default defineConfig({
  testDir: 'e2e',
  // Authentication codes are single-use; keep the shared test account deterministic.
  workers: 1,
  forbidOnly: process.env['CI'] !== undefined,
  retries: process.env['CI'] !== undefined ? 1 : 0,
  reporter: process.env['CI'] !== undefined ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `${origin}/projects/rowlens/`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Edge mode plays the worker's H.264 renditions, which open-source Chromium can't decode:
        // use Google Chrome there (CI: `playwright install chrome`).
        ...(edgeUrl === undefined ? {} : { channel: 'chrome' }),
      },
    },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer:
    edgeUrl !== undefined
      ? []
      : {
          // Starts a throwaway Postgres, migrates it, then runs dist/server/main.js (needs Docker).
          command: 'node --experimental-strip-types e2e/server.ts',
          timeout: 120_000,
          url: `${origin}/projects/rowlens/health/live`,
          reuseExistingServer: process.env['CI'] === undefined,
          env: {
            // Enables a deterministic OTP; production startup explicitly rejects that test seam.
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            BASE_PATH: '/projects/rowlens',
            PUBLIC_ORIGIN: origin,
            APP_VERSION: 'e2e',
            LOG_LEVEL: 'warn',
          },
        },
});
