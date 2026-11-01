import { expect, test } from '@playwright/test';
import { pilotCode } from './env.ts';

// Pilot access code (#84). Few attempts on purpose: the server allows 5 per minute per IP, and
// both browser projects share one IP.
test('access code opens the pilot club, sign-out closes it again', async ({ page }) => {
  await page.goto('./');
  const code = page.getByLabel(/^(Access code|Toegangscode)$/);
  await expect(code).toBeVisible();
  await expect(page.getByText(/not backed up|geen back-up/i)).toBeVisible();

  await code.fill('not-the-code');
  await page.getByRole('button', { name: /^(Continue|Verder)$/ }).click();
  await expect(page.getByRole('alert')).toHaveText(/not right|klopt niet/);

  await code.fill(pilotCode.toUpperCase().replaceAll('-', ' '));
  await page.getByRole('button', { name: /^(Continue|Verder)$/ }).click();
  await expect(page.getByTestId('club-name')).toHaveText('Pilot');

  const cookie = (await page.context().cookies()).find((c) => c.name === 'rowlens_pilot');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/projects/rowlens/' });

  await page.reload();
  await expect(page.getByTestId('club-name')).toHaveText('Pilot');

  await page.getByRole('button', { name: /^(Sign out|Afmelden)$/ }).click();
  await expect(code).toBeVisible();
});

test('club API is a plain 404 without access', async ({ request }) => {
  const res = await request.get('api/club');
  expect(res.status()).toBe(404);
  expect(await res.json()).toEqual({ error: 'not_found' });
});
