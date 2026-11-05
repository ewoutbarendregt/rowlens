import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.ts';

// Focused review of the coach's editing flow against the real worker and Caddy.
// Touch taps run in WebKit; Playwright's public touchscreen API does not expose touch dragging.
export default defineConfig({
  ...base,
  testMatch: ['drawing.spec.ts', 'angles.spec.ts', 'boatline.spec.ts', 'playback.spec.ts'],
  outputDir: 'test-results/editing',
  projects: [
    {
      name: 'laptop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'laptop-low-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1000, height: 540 },
      },
    },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
