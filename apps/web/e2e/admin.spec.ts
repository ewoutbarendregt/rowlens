import { expect, test } from '@playwright/test';
import { adminEmail } from './env.ts';
import { signIn, signOut } from './helpers.ts';

// Admins give people access with a role (#42); others don't see the admin page.
test('an admin gives a rower access; the rower signs in without admin rights', async ({
  page,
}, info) => {
  const rower = `rower.${info.project.name.replace(/\W/g, '')}.${String(Date.now())}@example.com`;
  await signIn(page, adminEmail);
  await page.getByRole('link', { name: /^(Admin|Beheer)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^(Admin|Beheer)$/ })).toBeVisible();
  await expect(page.getByTestId('access-list')).toContainText(adminEmail);
  await page.getByRole('tab', { name: /^(Roles|Rollen)$/ }).click();
  await expect(page.getByTestId('roles')).toContainText(
    /Admin: users and roles|Beheer: gebruikers en rollen/,
  );
  await page.getByRole('tab', { name: /^(Users|Gebruikers)$/ }).click();

  await page.getByLabel(/^(E-mail address|E-mailadres)$/).fill(rower);
  await expect(page.getByRole('checkbox', { name: /^(Rower|Roeier)$/ })).toBeChecked();
  await page.getByRole('button', { name: /^(Give access|Toegang geven)$/ }).click();
  // Without a mail server (local E2E) the page says the e-mail couldn't be sent; access is given.
  await expect(page.getByRole('form', { name: /^(Give access|Toegang geven)$/ })).toContainText(
    rower,
  );
  const row = page.getByTestId('access').filter({ hasText: rower });
  await expect(row).toContainText(/Not signed in yet|Nog niet ingelogd/);

  await signOut(page);
  await signIn(page, rower);
  await expect(page.getByRole('link', { name: /^(Admin|Beheer)$/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^(Rowers|Roeiers)$/ })).toHaveCount(0);
  await page.goto('./rowers');
  await expect(page).toHaveURL(/\/sessions$/);
  expect((await page.request.get('./api/rowers')).status()).toBe(404);
  await page.goto('./admin');
  await expect(page).toHaveURL(/\/sessions$/); // sent to the sessions list
  const api = await page.request.get('./api/admin/access');
  expect(api.status()).toBe(404);
});
