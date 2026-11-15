import { withBasePath } from '../src/shared/base-path.ts';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the isolated visibility configuration');
async function layout(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
test('primary club, participation boundary, examples and saved filter choices', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('./sessions');
  await page.getByTestId('filters').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const club = page.getByLabel('Club', { exact: true });
  await expect(club).toHaveValue(/.+/);
  await expect(club.locator('option:checked')).toHaveText('Beta testclub');
  await expect(
    page.getByTestId('session-list').getByRole('link', { name: 'Eigen Beta', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Onzichtbare training', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await club.selectOption({ label: 'Alpha testclub' });
  await expect(
    page.getByRole('link', { name: 'Deelname als stuurman', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await page.getByLabel('Alleen trainingen waarin ik voorkom', { exact: true }).check();
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Deelname als stuurman', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Filters wissen', exact: true }).click();
  await expect(club.locator('option:checked')).toHaveText('Beta testclub');
  await club.selectOption('');
  await page.reload();
  await expect(club).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Eigen Beta', exact: true })).toBeVisible();
  await page.getByTestId('account-menu').locator('summary').click();
  const primary = page.getByLabel('Primaire club', { exact: true });
  const save = page.waitForResponse(
    (r) => r.url().includes('/api/me/settings') && r.request().method() === 'PATCH',
  );
  await primary.selectOption({ label: 'Alpha testclub' });
  expect((await save).ok()).toBe(true);
  await page.goto('./sessions');
  await expect(club.locator('option:checked')).toHaveText('Alpha testclub');
  await expect(page.getByRole('link', { name: 'Eigen Alpha', exact: true })).toBeVisible();
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await layout(page);
  await page.screenshot({ path: info.outputPath('primary-club.png'), fullPage: true });
  // Reset to the initial preference so every viewport starts with the same fixture.
  await page.getByTestId('account-menu').locator('summary').click();
  const reset = page.waitForResponse(
    (r) => r.url().includes('/api/me/settings') && r.request().method() === 'PATCH',
  );
  await primary.selectOption({ label: 'Beta testclub' });
  expect((await reset).ok()).toBe(true);
});
test('example playback and Help work for a club member and a clubless account', async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto('./sessions');
  await page
    .getByTestId('examples')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'RowLens voorbeeld', exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await expect(page.getByText('Hidden private fixture')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Opslaan|Verwijderen/ })).toHaveCount(0);
  await page.getByTestId('player-frame').waitFor();
  await layout(page);
  await page.screenshot({ path: info.outputPath('example-playback.png'), fullPage: true });
  await page.locator('.app-header__nav').getByRole('link', { name: 'Uitleg', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Uitleg', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Kies je club', exact: true }).click();
  await expect(page.locator('#clubs')).toBeInViewport();
  await layout(page);
  await page.screenshot({ path: info.outputPath('help.png'), fullPage: true });
  // Unnamed clubless registrations can open Help/examples without inventing a membership.
  await page.context().clearCookies();
  await page.goto('./');
  const statuses = await page.evaluate(
    async ({ otp, verify, email }) => {
      const registered = await fetch(otp, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, clubId: null }),
      });
      const { requestId } = (await registered.json()) as { requestId: string };
      const verified = await fetch(verify, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code: '284619', requestId }),
      });
      return [registered.status, verified.status];
    },
    {
      otp: withBasePath('/projects/rowlens', '/api/auth/registration/otp'),
      verify: withBasePath('/projects/rowlens', '/api/auth/registration/verify'),
      email: `clubless-${info.project.name}@example.test`,
    },
  );
  expect(statuses).toEqual([202, 204]);
  await page.goto('./help');
  await expect(
    page.getByTestId('examples').getByRole('link', { name: 'RowLens voorbeeld', exact: true }),
  ).toBeVisible();
  await page
    .getByTestId('examples')
    .getByRole('link', { name: 'RowLens voorbeeld', exact: true })
    .click();
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await layout(page);
});
