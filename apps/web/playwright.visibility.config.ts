import { defineConfig, devices } from '@playwright/test';
import base from './playwright.unified.config.ts';
export default defineConfig({
  ...base,
  testMatch: 'training-visibility.spec.ts',
  outputDir: 'test-results-visibility',
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
    ...(!Array.isArray(base.webServer) ? base.webServer : {}),
    env: {
      ...(!Array.isArray(base.webServer) ? base.webServer?.env : {}),
      E2E_TRAINING_VISIBILITY: 'true',
    },
  },
});
