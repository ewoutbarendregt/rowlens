import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { signIn } from './helpers.ts';

// Session + resumable upload (#45, #46) through the real UI. The clip is the VP9 player fixture
// (`pnpm demo:media --e2e`; CI generates it); a fake .mov checks the magic-byte rejection.
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));

test('create a session, upload a video and a fake one, delete the video', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  await signIn(page);
  await page.getByRole('link', { name: /^(Sessions and videos|Trainingen en video’s)$/ }).click();

  const title = `E2E ${info.project.name} ${String(Date.now())}`;
  await page.getByLabel(/^(Title|Titel)$/).fill(title);
  await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/Created at \d{2}:\d{2}|Aangemaakt om \d{2}:\d{2}/)).toBeVisible();

  await page.getByLabel(/^(Choose videos|Video’s kiezen)$/).setInputFiles([
    { name: 'stroke.webm', mimeType: 'video/webm', buffer: readFileSync(FIXTURE) },
    { name: 'fake.mov', mimeType: 'video/quicktime', buffer: Buffer.from('not really a movie') },
  ]);
  const queue = page.getByTestId('upload-queue');
  await queue.getByRole('combobox').first().selectOption('bank');
  await page.getByRole('button', { name: /^(Upload|Uploaden)$/ }).click();

  await expect(queue.getByTestId('upload-done')).toHaveCount(1);
  await expect(queue.getByRole('alert')).toHaveText(/not a video|geen video/i);

  const videos = page.getByTestId('video');
  await expect(videos).toHaveCount(2);
  const stroke = videos.filter({ hasText: 'stroke.webm' });
  if (edgeUrl === undefined) {
    // No worker next to the local E2E server: the upload waits for processing.
    await expect(stroke.getByTestId('video-status')).toHaveText(/Uploaded|Geüpload/);
  } else {
    // The edge stack runs the worker (#47): the page refreshes itself until the clip is ready.
    await expect(stroke.getByTestId('video-status')).toHaveText(/^(Ready|Klaar)$/, {
      timeout: 60_000,
    });
    await expect(stroke.getByTestId('video-facts')).toHaveText(/^30 fps · 640×360 · 0:04$/);

    // The worker's H.264 rendition in the frame-accurate player (#49): poster, then exact steps.
    // Named [session]-[#]-[start]-[length]: first in its session, no recording time in the clip.
    const name = `${title}-1-??:??-0:04`;
    await stroke.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByText('stroke.webm')).toBeVisible(); // the original file name, as a detail
    const frame = page.getByTestId('player-frame');
    await expect(frame).toHaveText('0');
    await expect(page.locator('video')).toHaveAttribute('poster', /\/media\/poster$/);
    await page.locator('h1').click();
    for (let n = 1; n <= 10; n++) {
      await page.keyboard.press('.');
      await expect(frame).toHaveText(String(n));
    }
    const time = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(Math.floor(time * 30 + 1e-4)).toBe(10);
    await page.getByRole('link', { name: /^← (Back to|Terug naar) E2E/ }).click();
  }
  await expect(stroke).toContainText(/From the bank|Vanaf de kant/);
  await expect(videos.filter({ hasText: 'fake.mov' }).getByTestId('video-status')).toHaveText(
    /Not a video|Geen video/,
  );

  await stroke.getByRole('button', { name: /^(Delete|Verwijderen)$/ }).click();
  await stroke.getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }).click();
  await expect(videos).toHaveCount(1);

  await page.getByRole('link', { name: /All sessions|Alle trainingen/ }).click();
  await expect(page.getByTestId('session-list')).toContainText(title);
  await expect(page.getByTestId('session-list')).toContainText(
    /Created at \d{2}:\d{2}|Aangemaakt om \d{2}:\d{2}/,
  );

  // A whole session can be removed in one action, including its remaining videos and annotations.
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await page.getByRole('button', { name: /^(Delete session|Training verwijderen)$/ }).click();
  const confirm = page.getByTestId('confirm');
  await expect(confirm).toContainText(title);
  await expect(confirm).toContainText(/video/);
  await expect(confirm).toContainText(/annotation|annotatie/i);
  await confirm.getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
});

test('club pages send you to the gate without access', async ({ page }) => {
  await page.goto('./sessions');
  await expect(page).toHaveURL(/\/projects\/rowlens\/$/);
  await expect(page.getByLabel(/^(Access code|Toegangscode)$/)).toBeVisible();
});
