import { expect, type Page } from '@playwright/test';
import { pilotCode } from './env.ts';

/** Through the gate like a user (#84). */
export async function signIn(page: Page): Promise<void> {
  await page.goto('./');
  await page.getByLabel(/^(Access code|Toegangscode)$/).fill(pilotCode);
  await page.getByRole('button', { name: /^(Continue|Verder)$/ }).click();
  await expect(page.getByTestId('club-name')).toBeVisible();
}

/**
 * Edge stack only (needs the worker): a new session with the E2E clip, processed and opened in the
 * player. Returns at frame 0 with the page focused for keyboard steps.
 */
export async function openProcessedClip(page: Page, clip: Buffer, title: string): Promise<void> {
  await signIn(page);
  await page.goto('./sessions');
  await page.getByLabel(/^(Title|Titel)$/).fill(title);
  await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page
    .getByLabel(/^(Choose videos|Video’s kiezen)$/)
    .setInputFiles([{ name: 'stroke.webm', mimeType: 'video/webm', buffer: clip }]);
  await page.getByRole('button', { name: /^(Upload|Uploaden)$/ }).click();
  const video = page.getByTestId('video').filter({ hasText: 'stroke.webm' });
  await expect(video.getByTestId('video-status')).toHaveText(/^(Ready|Klaar)$/, {
    timeout: 60_000,
  });
  await video.getByRole('link', { name: 'stroke.webm', exact: true }).click();
  await expect(page.getByTestId('player-frame')).toHaveText('0');
  // Steps need the frame count from the metadata; before that they clamp to frame 0.
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.locator('h1').click();
}
