import { defineConfig, devices } from '@playwright/test';
import base from './playwright.unified.config.ts';
const server = base.webServer;
if (!server || Array.isArray(server))
  throw new Error('Visibility tests require the isolated local server');
export default defineConfig({
  ...base,
  testMatch: 'training-sharing.spec.ts',
  outputDir: 'test-results-sharing',
  projects: [
    {
      name: 'laptop-low',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 540 } },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    ...server,
    env: { ...server.env, E2E_TRAINING_VISIBILITY: 'true', E2E_TRAINING_SHARING: 'true' },
  },
});
