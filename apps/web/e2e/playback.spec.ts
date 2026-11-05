import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip, settledBox } from './helpers.ts';

// Actual playback on the worker's H.264 rendition, not just the playbackRate property.
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up');

async function activate(button: Locator) {
  if (test.info().project.use.hasTouch === true) await button.tap();
  else await button.click();
}

async function progress(page: Page) {
  return page.locator('video').evaluate(async (video: HTMLVideoElement) => {
    const time = video.currentTime;
    const wall = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return {
      speed: (video.currentTime - time) / ((performance.now() - wall) / 1000),
      paused: video.paused,
    };
  });
}

for (const rate of [0.25, 0.5] as const) {
  test(`plays at ${String(rate)} speed and pauses after stepping and while running`, async ({
    page,
  }, info) => {
    test.skip(!existsSync(FIXTURE), 'run pnpm demo:media --e2e first');
    await openProcessedClip(
      page,
      readFileSync(FIXTURE),
      `Playback ${String(rate)} ${info.project.name} ${String(Date.now())}`,
    );
    const video = page.locator('video');
    const frame = page.getByTestId('player-frame');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(frame).toHaveText('30');
    // Keep the same path as the reported iPhone failure: create, save, select and move a
    // drawing before using the speed and pause controls. No Escape/keyboard focus reset.
    const kind = rate === 0.25 ? 'line' : 'angle';
    const tool = page.getByRole('button', {
      name: kind === 'line' ? /^(Line|Lijn)$/ : /^(Angle|Hoek)$/,
    });
    await activate(tool);
    const box = await settledBox(page, 'drawing-layer');
    const points =
      kind === 'line'
        ? [
            [0.2, 0.4],
            [0.8, 0.4],
          ]
        : [
            [0.2, 0.3],
            [0.5, 0.3],
            [0.5, 0.6],
          ];
    const at = async (x: number, y: number) => {
      if (info.project.use.hasTouch === true)
        await page.touchscreen.tap(box.x + x * box.width, box.y + y * box.height);
      else await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
    };
    for (const point of points) {
      const [x, y] = point;
      if (x !== undefined && y !== undefined) await at(x, y);
    }
    await activate(page.getByTestId('drawing-save'));
    await activate(tool);
    const movedBox = await settledBox(page, 'drawing-layer');
    const y = kind === 'line' ? 0.4 : 0.3;
    if (info.project.use.hasTouch === true)
      await page.touchscreen.tap(
        movedBox.x + 0.35 * movedBox.width,
        movedBox.y + y * movedBox.height,
      );
    else
      await page.mouse.click(movedBox.x + 0.35 * movedBox.width, movedBox.y + y * movedBox.height);
    await expect(page.getByTestId('drawing-handle')).toHaveCount(points.length);
    // Native touch selects the drawing in WebKit. The public API only provides taps;
    // dragging below uses the mouse and does not claim to reproduce a physical finger drag.
    await page.mouse.move(movedBox.x + 0.2 * movedBox.width, movedBox.y + y * movedBox.height);
    await page.mouse.down();
    await page.mouse.move(
      movedBox.x + 0.25 * movedBox.width,
      movedBox.y + (y + 0.1) * movedBox.height,
      { steps: 6 },
    );
    await page.mouse.up();
    const speed = page.getByRole('button', { name: `${String(rate)}×`, exact: true });
    await activate(speed);
    await activate(page.getByRole('button', { name: /^(Play|Afspelen)$/ }));
    await expect(video).toHaveJSProperty('paused', false);
    const first = await progress(page);
    expect(first.paused).toBe(false);
    expect(first.speed).toBeGreaterThan(rate * 0.7);
    expect(first.speed).toBeLessThan(rate * 1.3);

    // Change the rate during playback: the clock must follow the new selection too.
    const other = rate === 0.25 ? 0.5 : 0.25;
    await activate(page.getByRole('button', { name: `${String(other)}×`, exact: true }));
    const changed = await progress(page);
    expect(changed.paused).toBe(false);
    expect(changed.speed).toBeGreaterThan(other * 0.7);
    expect(changed.speed).toBeLessThan(other * 1.3);

    await activate(page.getByRole('button', { name: /^(Pause|Pauzeren)$/ }));
    await expect(video).toHaveJSProperty('paused', true);
    const pausedAt = await video.evaluate((element: HTMLVideoElement) => element.currentTime);
    await page.waitForTimeout(300);
    expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBe(pausedAt);
    await expect(page.getByRole('button', { name: /^(Play|Afspelen)$/ })).toBeVisible();
  });
}

test('entering a note after the video pauses does not start it again', async ({ page }, info) => {
  test.skip(!existsSync(FIXTURE), 'run pnpm demo:media --e2e first');
  await openProcessedClip(
    page,
    readFileSync(FIXTURE),
    `Pause editing ${info.project.name} ${String(Date.now())}`,
  );
  await activate(page.getByRole('button', { name: /^(Play|Afspelen)$/ }));
  await expect(page.locator('video')).toHaveJSProperty('paused', false);
  await expect(page.getByRole('button', { name: /^(Pause|Pauzeren)$/ })).toBeVisible();
  // Safari can pause the media before React has handled its pause event. Focusing the editor
  // requests another pause in that window; it must be idempotent, never a play/pause toggle.
  await page.evaluate(() => {
    document.querySelector('video')?.pause();
    const editor = document.querySelector<HTMLTextAreaElement>('[data-testid=note] textarea');
    if (editor === null) throw new Error('note editor missing');
    editor.focus();
  });
  await page.waitForTimeout(300);
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
});
