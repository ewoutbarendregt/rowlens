import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withBasePath } from '../src/shared/base-path.ts';
import { signIn } from './helpers.ts';
import { adminEmail } from './env.ts';

// This suite runs only through the dedicated unified-users server, not the legacy feature-off stack.
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the unified account stack');
async function json(page: Page, path: string, body?: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const csrf =
        document.cookie
          .split('; ')
          .find((p) => p.startsWith('rowlens_csrf='))
          ?.slice(13) ?? '';
      const club = sessionStorage.getItem('rowlens.activeClub');
      const r = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-csrf-token': csrf,
          ...(club ? { 'x-rowlens-club': club } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, data: r.status === 204 ? null : ((await r.json()) as unknown) };
    },
    { path: withBasePath('/projects/rowlens', path), body },
  );
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await page
    .locator(
      ':is(.clubs-page,.club-admin-page) button,:is(.clubs-page,.club-admin-page) select,:is(.clubs-page,.club-admin-page) input:not([type=checkbox]),.club-admin-page .role-choices label,.users-admission > summary',
    )
    .evaluateAll((nodes) =>
      nodes.flatMap((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.height < 43.5
          ? [
              {
                tag: n.tagName,
                height: r.height,
                label: n.getAttribute('aria-label'),
                text: n.textContent.slice(0, 40),
              },
            ]
          : [];
      }),
    );
  expect(small).toEqual([]);
}
test('account request, admission, history-free user selection and club switching', async ({
  page,
  browser,
}, testInfo) => {
  const email = `join-${randomUUID()}@example.test`;
  await signIn(page, email);
  await expect(page).toHaveURL(/\/clubs$/);
  await expect(page.getByRole('link', { name: /^Roeiers$/ })).toHaveCount(0);
  const club = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'WVIJburg', exact: true }) });
  await club.getByRole('button', { name: /Lidmaatschap aanvragen/ }).click();
  await expect(club).toContainText('Wacht op toelating');
  await layout(page);
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() });
  const admin = await context.newPage();
  await signIn(admin, adminEmail);
  await admin.getByRole('link', { name: 'Clubs', exact: true }).click();
  await admin
    .locator('article')
    .filter({ has: admin.getByRole('heading', { name: 'WVIJburg', exact: true }) })
    .getByRole('button', { name: /^(Huidige club|Club openen)$/ })
    .click();
  await admin.getByRole('link', { name: 'Clubbeheer', exact: true }).click();
  await admin.getByRole('tab', { name: 'Aanmeldingen', exact: true }).click();
  const request = admin.locator('article').filter({ hasText: email });
  await request.getByRole('button', { name: 'Toelaten als roeier', exact: true }).click();
  await expect(request).toHaveCount(0);
  await admin.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  const memberRow = admin.getByTestId('access').filter({ hasText: email });
  await expect(memberRow).toBeVisible();
  await memberRow.getByRole('button', { name: 'Instellingen', exact: true }).click();
  await memberRow.getByRole('checkbox', { name: 'Coach', exact: true }).check();
  await memberRow
    .locator('.form__actions')
    .first()
    .getByRole('button', { name: 'Opslaan', exact: true })
    .click();
  await expect(memberRow.locator('.badge').filter({ hasText: /^Coach$/ })).toBeVisible();
  await layout(admin);
  await admin.screenshot({ path: testInfo.outputPath('club-members.png'), fullPage: true });
  await admin.getByRole('link', { name: 'Clubs', exact: true }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Huidige club', exact: true }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await page.getByRole('link', { name: 'Clubs', exact: true }).click();
  await layout(page);
  await page.screenshot({ path: testInfo.outputPath('account-clubs.png'), fullPage: true });
  // Platform administrator can create a second club and appoint an existing verified account.
  const all = await json(admin, '/api/platform/users');
  const users = all.data as { id: string; email: string }[];
  const uid = users.find((u) => u.email === email)?.id;
  expect(uid).toBeTruthy();
  const second = `Club ${randomUUID().slice(0, 8)}`;
  await admin.getByLabel('Clubnaam', { exact: true }).fill(second);
  await admin.getByLabel('Clubadres', { exact: true }).fill(`club-${randomUUID()}`);
  await admin.getByLabel('Clubbeheerder', { exact: true }).selectOption(uid ?? '');
  await admin.getByRole('button', { name: 'Club aanmaken', exact: true }).click();
  await expect(admin.getByRole('heading', { name: second, exact: true })).toBeVisible();
  await page.reload();
  const other = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: second, exact: true }) });
  await other.getByRole('button', { name: 'Club openen', exact: true }).click();
  await expect(page.getByTestId('club-name')).toHaveText(second);
  const status = await json(page, '/api/auth/status');
  expect((status.data as { user: { roles: string[] } }).user.roles).toContain('admin');
  await page.getByRole('link', { name: 'Clubs', exact: true }).click();
  await layout(page);
  await page.screenshot({ path: testInfo.outputPath('second-club.png'), fullPage: true });
  await context.close();
});

test('platform management at phone/laptop sizes has no Rowers route', async ({
  page,
}, testInfo) => {
  await signIn(page, adminEmail);
  await page.getByRole('link', { name: 'Clubs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'RowLens-beheer', exact: true })).toBeVisible();
  await layout(page);
  await page.screenshot({ path: testInfo.outputPath('platform.png'), fullPage: true });
  await page.goto('./rowers');
  await expect(page).toHaveURL(/\/sessions$/);
});

test('long club names fit the header without horizontal overflow', async ({ page }, info) => {
  await signIn(page, adminEmail);
  await page.getByRole('link', { name: 'Clubs', exact: true }).click();
  const data = await json(page, '/api/platform/users');
  const users = data.data as { id: string; email: string }[];
  const id = users.find((u) => u.email === adminEmail)?.id ?? '';
  const name = 'W'.repeat(68) + randomUUID().slice(0, 8);
  await page.getByLabel('Clubnaam', { exact: true }).fill(name);
  await page.getByLabel('Clubadres', { exact: true }).fill(`long-${randomUUID()}`);
  await page.getByLabel('Clubbeheerder', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'Club aanmaken', exact: true }).click();
  const row = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await row.getByRole('button', { name: 'Club openen', exact: true }).click();
  await expect(page.getByTestId('club-name')).toHaveText(name);
  await layout(page);
  await page.screenshot({ path: info.outputPath('long-club.png'), fullPage: true });
});

test('platform club edit, archive and restore preserve a club administrator membership', async ({
  page,
}, info) => {
  await signIn(page, adminEmail);
  await page.getByRole('link', { name: 'Clubs', exact: true }).click();
  const users = (await json(page, '/api/platform/users')).data as { id: string; email: string }[];
  const uid = users.find((u) => u.email === adminEmail)?.id ?? '';
  const name = `Lifecycle ${randomUUID().slice(0, 8)}`;
  await page.getByLabel('Clubnaam', { exact: true }).fill(name);
  await page.getByLabel('Clubadres', { exact: true }).fill(`life-${randomUUID()}`);
  await page.getByLabel('Clubbeheerder', { exact: true }).selectOption(uid);
  await page.getByRole('button', { name: 'Club aanmaken', exact: true }).click();
  const row = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await row.getByRole('button', { name: /^(Club openen|Huidige club)$/ }).click();
  await page.getByRole('link', { name: 'Clubs', exact: true }).click();
  await row.getByRole('button', { name: 'Club wijzigen', exact: true }).click();
  const changed = name + ' edited';
  await page.getByLabel('Clubnaam', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Club opslaan', exact: true }).click();
  const edited = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: changed, exact: true }) });
  await edited.getByRole('button', { name: 'Club archiveren', exact: true }).click();
  await edited
    .getByTestId('confirm')
    .getByRole('button', { name: 'Club archiveren', exact: true })
    .click();
  await expect(edited).toContainText('Gearchiveerd');
  await expect(edited.getByRole('button', { name: /^(Club openen|Huidige club)$/ })).toHaveCount(0);
  await layout(page);
  await page.screenshot({ path: info.outputPath('archived-club.png'), fullPage: true });
  await edited.getByRole('button', { name: 'Club herstellen', exact: true }).click();
  await edited
    .getByTestId('confirm')
    .getByRole('button', { name: 'Club herstellen', exact: true })
    .click();
  await expect(edited).not.toContainText('Gearchiveerd');
  await edited.getByRole('button', { name: /^(Club openen|Huidige club)$/ }).click();
  await page.getByRole('link', { name: 'Clubbeheer', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Aanmeldingen', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Gebruikers', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('access').filter({ hasText: adminEmail })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Users includes account-only users for platform admins and only own-club members for club admins', async ({
  page,
  browser,
}, info) => {
  const email = `accountonly-${randomUUID()}@example.test`;
  await signIn(page, email);
  await expect(page.getByRole('link', { name: 'Gebruikers', exact: true })).toHaveCount(0);
  const account = (await json(page, '/api/auth/status')).data as {
    user: { id: string };
    clubs: unknown[];
  };
  expect(account.clubs).toEqual([]);
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() });
  const operator = await context.newPage();
  await signIn(operator, adminEmail);
  await operator.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  // A global directory and its settings do not require an active club, even in an old tab.
  await operator.evaluate((id) => {
    sessionStorage.setItem('rowlens.activeClub', id);
  }, randomUUID());
  await operator.reload();
  await operator.getByLabel('Zoek gebruikers op naam of e-mail').fill(email);
  const row = operator.getByTestId('access').filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Instellingen', exact: true }).click();
  const editor = row.getByTestId('admin-user-settings');
  await editor.getByLabel('Voornaam', { exact: true }).fill('Account');
  await editor.getByLabel('Achternaam', { exact: true }).fill('Without club');
  await editor.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(editor.getByRole('status')).toContainText('Opgeslagen');
  await layout(operator);
  await operator.screenshot({ path: info.outputPath('users-without-club.png'), fullPage: true });
  expect(((await json(page, '/api/auth/status')).data as { clubs: unknown[] }).clubs).toEqual([]);
  const created = await json(operator, '/api/platform/clubs', {
    slug: `users-${randomUUID()}`,
    name: `Users club ${randomUUID().slice(0, 8)}`,
    adminId: account.user.id,
  });
  expect(created.status).toBe(200);
  const clubId = (created.data as { id: string }).id;
  await page.evaluate((id) => {
    sessionStorage.setItem('rowlens.activeClub', id);
  }, clubId);
  await page.goto('./users');
  await expect(
    page.getByRole('heading', { name: 'Gebruikers', level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('access')).toHaveCount(1);
  await expect(page.getByTestId('access')).toContainText(email);
  expect((await json(page, '/api/platform/users')).status).toBe(404);
  await layout(page);
  await page.screenshot({ path: info.outputPath('users-club-admin.png'), fullPage: true });
  await operator.goto('./clubs');
  await expect(operator.getByLabel('Gebruikersinstellingen', { exact: true })).toHaveCount(0);
  await context.close();
});
