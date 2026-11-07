import { expect, test } from '@playwright/test';
import { authCode, authEmail, edgeUrl } from './env.ts';

const origin = edgeUrl ?? 'http://127.0.0.1:4173';

test('email code opens the club, persists and sign-out revokes it', async ({ page }) => {
  await page.goto('./');
  const email = page.getByLabel(/^(Email address|E-mailadres)$/);
  await expect(email).toBeVisible();
  await expect(page.getByText(/not backed up|niet geback-upt/i)).toBeVisible();

  await email.fill(authEmail);
  await page.getByRole('button', { name: /^(Send code|Stuur code)$/ }).click();
  const code = page.getByLabel(/^(Login code|Inlogcode)$/);
  await expect(code).toBeVisible();
  await code.fill('000000');
  await page.getByRole('button', { name: /^(Sign in|Inloggen)$/ }).click();
  await expect(page.getByRole('alert')).toHaveText(/invalid|ongeldig/i);

  await code.fill(authCode);
  await page.getByRole('button', { name: /^(Sign in|Inloggen)$/ }).click();
  await expect(page.getByTestId('club-name')).toHaveText('WVIJburg');

  const cookies = await page.context().cookies();
  expect(cookies.find((item) => item.name === 'rowlens_sid')).toMatchObject({
    httpOnly: true,
    sameSite: 'Lax',
    path: '/projects/rowlens',
  });
  expect(cookies.find((item) => item.name === 'rowlens_csrf')).toMatchObject({
    httpOnly: false,
    sameSite: 'Lax',
    path: '/projects/rowlens',
  });

  await page.reload();
  await expect(page.getByTestId('club-name')).toHaveText('WVIJburg');

  await page.getByTestId('account-menu').locator('summary').click();
  await page.getByRole('button', { name: /^(Sign out|Afmelden)$/ }).click();
  await expect(email).toBeVisible();
});

test('OTP request does not reveal whether an address has access', async ({ request }) => {
  const known = await request.post('api/auth/otp', {
    data: { email: authEmail },
    headers: { origin },
  });
  const unknown = await request.post('api/auth/otp', {
    data: { email: 'unknown@example.com' },
    headers: { origin },
  });
  expect([known.status(), await known.json()]).toEqual([unknown.status(), await unknown.json()]);
});

test('club API is a plain 404 without a session', async ({ request }) => {
  const response = await request.get('api/club');
  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({ error: 'not_found' });
});
