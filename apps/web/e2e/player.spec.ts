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

test('quick presses never lose a step (no waiting between them)', async ({ page }) => {
  // Regression: a late `seeked` of a replaced seek used to reset the pending step (#59 E2E).
  for (let n = 0; n < 20; n++) await press(page, '.');
  await expectFrame(page, 20);
  for (let n = 0; n < 15; n++) await press(page, ',');
  await expectFrame(page, 5);
});

test('buttons step frames and seconds (0.1 s = 3 frames at 30 fps)', async ({ page }) => {
  await page.getByRole('button', { name: /next frame|volgende frame/i }).click();
  await expectFrame(page, 1);
  await page.getByRole('button', { name: /forward 0\.1|0,1 seconde vooruit/i }).click();
  await expectFrame(page, 4);
  await page.getByRole('button', { name: /^(forward 1 second|1 seconde vooruit)$/i }).click();
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

test('zoom into the picture: the stage and controls stay put, stepping still works', async ({
  page,
}, info) => {
  const stage = page.locator('.player__stage');
  const video = page.locator('video');
  const before = await stage.boundingBox();
  const level = page.getByTestId('zoom-level');
  await expect(level).toHaveCount(0); // the whole picture: no level shown

  await press(page, '+');
  await expect(level).toHaveText('150%');
  await page
    .getByTestId('zoom')
    .getByRole('button', { name: /^(Zoom in|Inzoomen)$/ })
    .click();
  await expect(level).toHaveText('225%');
  // Only the video is scaled; the stage keeps its size and place.
  await expect(video).toHaveCSS('transform', /matrix\(2\.25, 0, 0, 2\.25/);
  expect(await stage.boundingBox()).toEqual(before);

  // The keys and buttons below still work while zoomed.
  await page.locator('h1').click();
  await press(page, '.');
  await expectFrame(page, 1);
  await page.getByRole('button', { name: /next frame|volgende frame/i }).click();
  await expectFrame(page, 2);

  if (info.project.use.hasTouch !== true) {
    // A drag pans the zoomed picture and doesn't play it.
    // Measured now: clicking a button below may have scrolled the page.
    const box = (await stage.boundingBox()) ?? { x: 0, y: 0, width: 400, height: 225 };
    const transform = await video.evaluate((v) => v.style.transform);
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, { steps: 6 });
    await page.mouse.up();
    expect(await video.evaluate((v) => v.style.transform)).not.toBe(transform);
    await expect(video).toHaveJSProperty('paused', true);
  }

  // The level button and 0 go back to the whole picture; − stops there.
  await level.click();
  await expect(level).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Zoom out|Uitzoomen)$/ })).toBeDisabled();
  await page.locator('h1').click();
  await press(page, '+');
  await press(page, '0');
  await expect(level).toHaveCount(0);
  await expect(video).toHaveCSS('transform', 'none');
});

test('two fingers pinch the picture, not the page', async ({ page, browserName }, info) => {
  test.skip(
    info.project.use.hasTouch !== true || browserName !== 'chromium',
    'multi-touch needs the Chromium DevTools protocol',
  );
  const box = await page.locator('.player__stage').boundingBox();
  if (box === null) throw new Error('no stage');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const fingers = (type: 'touchStart' | 'touchMove' | 'touchEnd', apart: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: cx - apart, y: cy, id: 1 },
              { x: cx + apart, y: cy, id: 2 },
            ],
    });
  // Fingers from 40 px to 120 px apart: three times as close.
  await fingers('touchStart', 20);
  for (let apart = 25; apart <= 60; apart += 5) await fingers('touchMove', apart);
  await fingers('touchEnd', 60);
  await expect(page.getByTestId('zoom-level')).toHaveText('300%');
  expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
});
