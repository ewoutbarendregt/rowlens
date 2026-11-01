import { expect, type Page, test } from '@playwright/test';
import { edgeUrl } from './env.ts';

// Player spike (#51) against the VP9 fixture (open-source Chromium has no H.264): 30 fps, 4 s,
// frames 0–119, each showing its own number. Needs `pnpm demo:media --e2e` and a build with
// VITE_FEATURE_PLAYER_DEMO=true (CI does both).
test.skip(edgeUrl !== undefined, 'the demo page is not in production images');

const frame = (page: Page) => page.getByTestId('player-frame');
const press = (page: Page, key: string) => page.keyboard.press(key);

async function expectFrame(page: Page, n: number) {
  await expect(frame(page)).toHaveText(String(n));
  // The readout comes from requestVideoFrameCallback; the element's time must agree with it.
  const time = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(Math.floor(time * 30 + 1e-4)).toBe(n);
}

test.beforeEach(async ({ page, request }) => {
  const manifest = await request.get('demo-media/manifest.json');
  test.skip(
    !manifest.ok() && process.env['CI'] === undefined,
    'run `pnpm demo:media --e2e` and build with VITE_FEATURE_PLAYER_DEMO=true first',
  );
  await page.goto('demo/player?clip=e2e-30fps');
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(frame(page)).toHaveText('0');
  await page.locator('h1').click(); // focus the page, not a control
});

test('steps exactly one frame forward and back, across keyframes', async ({ page }) => {
  for (let n = 1; n <= 20; n++) {
    await press(page, '.');
    await expectFrame(page, n);
  }
  for (let n = 19; n >= 5; n--) {
    await press(page, ',');
    await expectFrame(page, n);
  }
});

test('buttons step frames and seconds (0.1 s = 3 frames at 30 fps)', async ({ page }) => {
  await page.getByRole('button', { name: /next frame|volgende frame/i }).click();
  await expectFrame(page, 1);
  await page.getByRole('button', { name: /forward 0\.1|0,1 seconde vooruit/i }).click();
  await expectFrame(page, 4);
  await page.getByRole('button', { name: /forward 1 second|1 seconde vooruit/i }).click();
  await expectFrame(page, 34);
  await press(page, 'Shift+ArrowLeft');
  await expectFrame(page, 4);
  await press(page, 'ArrowLeft');
  await expectFrame(page, 1);
  await page.getByRole('button', { name: /previous frame|vorige frame/i }).click();
  await expectFrame(page, 0);
  // Never before the first frame.
  await press(page, ',');
  await expectFrame(page, 0);
});

test('speed buttons set the playback rate', async ({ page }) => {
  for (const [label, rate] of [
    ['0.25×', 0.25],
    ['0.5×', 0.5],
    ['1×', 1],
  ] as const) {
    const button = page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('video')).toHaveJSProperty('playbackRate', rate);
  }
});

for (const speed of ['1', '2', '3'] as const) {
  test(`loop stays inside its range at speed key ${speed}`, async ({ page }) => {
    // Loop 30–45 (half a second at 30 fps).
    await page.locator('input[type=range]').fill('30');
    await expectFrame(page, 30);
    await press(page, '[');
    await page.locator('input[type=range]').fill('45');
    await expectFrame(page, 45);
    await press(page, ']');
    await expect(page.getByRole('button', { name: /^(Loop|Lus)$/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await press(page, speed);
    await press(page, ' ');

    const seen = await page.evaluate(async () => {
      const el = document.querySelector('[data-testid=player-frame]');
      const frames: number[] = [];
      const until = performance.now() + 3000;
      while (performance.now() < until) {
        frames.push(Number(el?.textContent));
        await new Promise((r) => setTimeout(r, 5));
      }
      return frames;
    });
    await press(page, ' ');

    const wraps = seen.filter((f, i) => i > 0 && f < (seen[i - 1] ?? 0)).length;
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(30);
    // At most one frame past the end: the loop jumps once `out` has been shown.
    expect(Math.max(...seen)).toBeLessThanOrEqual(46);
    expect(wraps).toBeGreaterThanOrEqual(speed === '3' ? 3 : 1);
  });
}
