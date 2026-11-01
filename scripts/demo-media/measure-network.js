// Start time + step latency of the player demo under throttled networks (#51), cold cache each run.
//   node scripts/demo-media/measure-network.js [apps/web] [base-url]
// Needs Google Chrome (H.264); default URL is production, which only reads the public demo page.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// Playwright is a dependency of apps/web, not of the workspace root.
const require = createRequire(resolve(process.argv[2] ?? 'apps/web', 'package.json'));
/** @type {typeof import('@playwright/test')} */
const { chromium } = require('@playwright/test');
const BASE = process.argv[3] ?? 'https://trustable.nl/projects/rowlens/demo/player';
const profiles = {
  // Chrome DevTools-like presets; throughput in bytes/s.
  'fast-4g': { latency: 150, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 },
  'slow-4g': { latency: 300, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 },
};
const clips = ['synthetic-60fps-gop025', 'synthetic-60fps-gop050', 'synthetic-60fps-intra540'];
const RUNS = 3;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  for (const [name, cond] of Object.entries(profiles)) {
    for (const clip of clips) {
      const starts = [],
        loads = [],
        steps = [];
      let wrong = 0;
      for (let r = 0; r < RUNS; r++) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); // cold cache
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, ...cond });
        const t0 = Date.now();
        await page.goto(`${BASE}?clip=${clip}`);
        await page
          .getByTestId('measure-start')
          .filter({ hasText: /\d+ ms/ })
          .waitFor({ timeout: 60000 });
        loads.push(Date.now() - t0);
        starts.push(
          Number((await page.getByTestId('measure-start').textContent()).replace(/\D/g, '')),
        );
        await page.locator('h1').click();
        for (let n = 1; n <= 30; n++) {
          await page.keyboard.press('.');
          try {
            await page
              .getByTestId('player-frame')
              .filter({ hasText: new RegExp(`^${n}$`) })
              .waitFor({ timeout: 5000 });
          } catch {
            wrong++;
          }
        }
        const text = await page.getByTestId('measure-steps').textContent();
        steps.push(text);
        await ctx.close();
      }
      console.log(
        JSON.stringify({
          name,
          clip,
          startMs: starts,
          startMedian: median(starts),
          pageToFirstFrameMs: loads,
          wrongFrames: wrong,
          steps,
        }),
      );
    }
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
