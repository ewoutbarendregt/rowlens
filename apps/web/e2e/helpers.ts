import { expect, type Page } from '@playwright/test';
import { authCode, authEmail } from './env.ts';

/** Through email OTP authentication like a club member (#28). */
export async function signIn(page: Page, email: string = authEmail): Promise<void> {
  await page.goto('./');
  await page.getByLabel(/^(Email address|E-mailadres)$/).fill(email);
  await page.getByRole('button', { name: /^(Send code|Stuur code)$/ }).click();
  await page.getByLabel(/^(Login code|Inlogcode)$/).fill(authCode);
  await page.getByRole('button', { name: /^(Sign in|Inloggen)$/ }).click();
  // The club name is hidden on a phone; the account menu is always there.
  await expect(page.getByTestId('account-menu')).toBeVisible();
}

/** Opens the account menu in the header and signs out (#108). */
export async function signOut(page: Page): Promise<void> {
  await page.getByTestId('account-menu').locator('summary').click();
  await page.getByRole('button', { name: /^(Sign out|Afmelden)$/ }).click();
  await expect(page.getByLabel(/^(Email address|E-mailadres)$/)).toBeVisible();
}

/** The new-session form sits behind a button on the sessions list (#108). */
export async function openNewSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: /(New session|Nieuwe training)$/ }).click();
}

/**
 * Edge stack only (needs the worker): a new session with the E2E clip, processed and opened in the
 * player. Returns at frame 0 with the page focused for keyboard steps.
 */
export async function openProcessedClip(page: Page, clip: Buffer, title: string): Promise<void> {
  await signIn(page);
  await page.goto('./sessions');
  await openNewSession(page);
  await page.getByLabel(/^(Title|Titel)$/).fill(title);
  await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page
    .getByLabel(/^(Choose videos|Video’s kiezen)$/)
    .setInputFiles([{ name: 'stroke.webm', mimeType: 'video/webm', buffer: clip }]);
  await page.getByRole('button', { name: /^(Upload|Uploaden)$/ }).click();
  // The only video in this new session; a ready video no longer shows its file name.
  const video = page.getByTestId('video');
  await expect(video.getByTestId('video-status')).toHaveText(/^(Ready|Klaar)$/, {
    timeout: 60_000,
  });
  // The display name: [session]-[#]-[start]-[length]; the E2E clip has no recording time, so
  // that part is left out.
  await video.getByRole('link', { name: `${title}-1-0:04`, exact: true }).click();
  await expect(page.getByTestId('player-frame')).toHaveText('0');
  // Steps need the frame count from the metadata; before that they clamp to frame 0.
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.locator('h1').click();
}

/** The box of an element once the page has stopped scrolling it into view (a phone scrolls the
 * picture into view when a drawing tool is chosen). */
export async function settledBox(page: Page, testId: string) {
  let last = '';
  for (let i = 0; i < 20; i++) {
    const box = await page.getByTestId(testId).boundingBox();
    const key = JSON.stringify(box);
    if (box !== null && key === last) return box;
    last = key;
    await page.waitForTimeout(100);
  }
  throw new Error(`${testId} kept moving`);
}
