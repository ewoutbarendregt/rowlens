import { expect, test, devices, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withBasePath } from '../src/shared/base-path.ts';
import { signIn as existingSignIn } from './helpers.ts';
import { adminEmail, authCode } from './env.ts';

async function registerThroughForm(page: Page, email: string, club: string = 'none') {
  await page.goto('./');
  await page.getByRole('button', { name: 'Account aanmaken', exact: true }).click();
  await page.getByLabel('E-mailadres', { exact: true }).fill(email);
  await expect(page.getByLabel('Club', { exact: true })).toBeEnabled();
  await page.getByLabel('Club', { exact: true }).selectOption(club);
  await page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Bevestig je e-mailadres', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Inlogcode', { exact: true }).fill(authCode);
  await page.getByRole('button', { name: 'Bevestigen en aanmelden', exact: true }).click();
  await expect(page.getByTestId('registration-result')).toBeVisible();
}
// Existing editor scenarios need a named synthetic account; onboarding tests below deliberately
// leave names empty and verify that signup/status remain accessible before profile completion.
async function signIn(page: Page, email: string) {
  if (email === adminEmail) return existingSignIn(page, email);
  await registerThroughForm(page, email);
  await page.evaluate(
    async ({ profileUrl, statusUrl }) => {
      const status = (await (await fetch(statusUrl)).json()) as {
        user: { firstName: string | null; lastName: string | null };
      };
      if (status.user.firstName !== null && status.user.lastName !== null) return;
      const csrf =
        document.cookie
          .split('; ')
          .find((p) => p.startsWith('rowlens_csrf='))
          ?.slice(13) ?? '';
      const r = await fetch(profileUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ firstName: 'E2E', lastName: 'Member', defaultBoatType: null }),
      });
      if (!r.ok) throw new Error('Synthetic profile preparation failed');
    },
    {
      profileUrl: withBasePath('/projects/rowlens', '/api/me/profile'),
      statusUrl: withBasePath('/projects/rowlens', '/api/auth/status'),
    },
  );
  await page.reload();
}

// This suite runs only through the dedicated unified-users server, not the legacy feature-off stack.
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the unified account stack');
async function json(page: Page, path: string, body?: unknown, selectedClub?: string) {
  return page.evaluate(
    async ({ path, body, selectedClub }) => {
      const csrf =
        document.cookie
          .split('; ')
          .find((p) => p.startsWith('rowlens_csrf='))
          ?.slice(13) ?? '';
      const club = selectedClub ?? sessionStorage.getItem('rowlens.activeClub');
      const r = await fetch(path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          'x-csrf-token': csrf,
          ...(club ? { 'x-rowlens-club': club } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await r.text();
      return { status: r.status, data: text ? (JSON.parse(text) as unknown) : null };
    },
    { path: withBasePath('/projects/rowlens', path), body, selectedClub },
  );
}
async function filterEmail(page: Page, email: string) {
  await page.getByRole('button', { name: 'Filters wissen', exact: true }).click();
  await page.getByRole('button', { name: 'Filter toevoegen', exact: true }).click();
  await page.getByLabel('Waarde 1', { exact: true }).fill(email);
  const response = page.waitForResponse(
    (r) =>
      r.url().includes('/api/manage/users/query') &&
      (r.request().postDataJSON() as { filters?: { value: unknown }[] }).filters?.some(
        (f) => f.value === email,
      ) === true,
  );
  await page.getByRole('button', { name: 'Filters toepassen', exact: true }).click();
  await response;
  await expect(page.getByTestId('user-table')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('user-row')).toHaveCount(1);
  await expect(page.getByTestId('user-row').filter({ hasText: email })).toHaveCount(1);
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await page
    .locator(
      '.registration button,.registration input,.registration select,:is(.clubs-page,.club-admin-page) button,:is(.clubs-page,.club-admin-page) select,:is(.clubs-page,.club-admin-page) input:not([type=checkbox]),.club-admin-page .role-choices label,.users-admission > summary,.user-columns > summary,.user-toggle',
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
  await filterEmail(admin, email);
  const memberRow = admin.getByTestId('user-row').filter({ hasText: email });
  await memberRow.getByRole('button', { name: 'Gebruiker bewerken', exact: true }).click();
  const roleForm = admin.getByTestId('club-role-form');
  await roleForm.getByRole('checkbox', { name: 'Coach', exact: true }).check();
  await roleForm.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(
    admin.getByTestId('user-editor').getByRole('listitem').filter({ hasText: 'Coach' }),
  ).toBeVisible();
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
  await filterEmail(page, adminEmail);
  await expect(page.getByTestId('user-row').filter({ hasText: adminEmail })).toBeVisible();
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
  await filterEmail(operator, email);
  const row = operator.getByTestId('user-row').filter({ hasText: email });
  await row.getByRole('button', { name: 'Gebruiker bewerken', exact: true }).click();
  const editor = operator.getByTestId('admin-user-settings');
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
  await expect(page.getByTestId('user-row')).toHaveCount(1);
  await expect(page.getByTestId('user-row')).toContainText(email);
  expect((await json(page, '/api/platform/users')).status).toBe(404);
  await layout(page);
  await page.screenshot({ path: info.outputPath('users-club-admin.png'), fullPage: true });
  await operator.goto('./clubs');
  await expect(operator.getByLabel('Gebruikersinstellingen', { exact: true })).toHaveCount(0);
  await context.close();
});

test('full table editor filters/sorts, manages global role, preferences and verifies an email change', async ({
  page,
  browser,
}, info) => {
  const email = `edit-${randomUUID()}@example.test`,
    newEmail = `verified-${randomUUID()}@example.test`;
  await signIn(page, adminEmail);
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() });
  const user = await context.newPage();
  await signIn(user, email);
  const id = ((await json(user, '/api/auth/status')).data as { user: { id: string } }).user.id;
  await page.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  await filterEmail(page, email);
  await page.getByLabel('Sorteren op', { exact: true }).selectOption('email');
  await expect(
    page.getByTestId('user-table').getByRole('columnheader', { name: 'E-mail', exact: true }),
  ).toHaveAttribute('aria-sort', 'ascending');
  const sortButton = page
    .getByTestId('user-table')
    .getByRole('button', { name: 'E-mail', exact: true });
  if (info.project.name === 'iphone-webkit') await sortButton.tap();
  else await sortButton.click();
  await expect(
    page.getByTestId('user-table').getByRole('columnheader', { name: 'E-mail', exact: true }),
  ).toHaveAttribute('aria-sort', 'descending');
  await layout(page);
  await page.screenshot({ path: info.outputPath('user-table.png'), fullPage: true });
  await page
    .getByTestId('user-row')
    .getByRole('button', { name: 'Gebruiker bewerken', exact: true })
    .click();
  const editor = page.getByTestId('user-editor'),
    profile = page.getByTestId('admin-user-settings');
  await profile.getByLabel('Voornaam', { exact: true }).fill('Edited');
  await profile.getByLabel('Weergave', { exact: true }).selectOption('dark');
  await profile.getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(profile.getByRole('status')).toContainText('Opgeslagen');
  const globalRole = editor.getByRole('checkbox', { name: 'RowLens-beheerder', exact: true });
  await globalRole.click();
  await page.getByTestId('confirm').getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(globalRole).toBeChecked();
  await expect(editor.locator('.badge')).toHaveText('RowLens-beheerder');
  await user.reload();
  expect(
    ((await json(user, '/api/auth/status')).data as { user: { platformAdmin: boolean } }).user
      .platformAdmin,
  ).toBe(true);
  await globalRole.click();
  await page.getByTestId('confirm').getByRole('button', { name: 'Opslaan', exact: true }).click();
  await expect(globalRole).not.toBeChecked();
  await editor.getByLabel('E-mail', { exact: true }).fill(newEmail);
  await editor.getByRole('button', { name: 'Verificatiecode versturen', exact: true }).click();
  await expect(
    editor.getByText(
      'Verificatiecode naar het nieuwe adres verstuurd. Die is tien minuten geldig.',
      { exact: true },
    ),
  ).toBeVisible();
  await editor.getByLabel('Verificatiecode', { exact: true }).fill(authCode);
  await editor.getByRole('button', { name: 'Nieuw e-mailadres bevestigen', exact: true }).click();
  await expect(
    editor.getByText('E-mailadres gewijzigd; bestaande sessies zijn afgemeld.', { exact: true }),
  ).toBeVisible();
  expect(((await json(user, '/api/auth/status')).data as { access: boolean }).access).toBe(false);
  await signIn(user, newEmail);
  expect(((await json(user, '/api/auth/status')).data as { user: { id: string } }).user.id).toBe(
    id,
  );
  await layout(page);
  await page.screenshot({ path: info.outputPath('full-user-editor.png'), fullPage: true });
  await editor.getByRole('button', { name: 'Terug naar gebruikers', exact: true }).click();
  await filterEmail(page, newEmail);
  await expect(page.getByTestId('user-row')).toContainText('Edited');
  await page.getByRole('button', { name: 'Filters wissen', exact: true }).click();
  await page.getByRole('button', { name: 'Filter toevoegen', exact: true }).click();
  await page.getByLabel('Veld 1', { exact: true }).selectOption('theme');
  await page.getByLabel('Waarde 1', { exact: true }).selectOption('dark');
  await page.getByRole('button', { name: 'Filters toepassen', exact: true }).click();
  await expect(page.getByTestId('user-row').filter({ hasText: newEmail })).toBeVisible();
  await context.close();
});

test('RowLens admin sees pending requests from other clubs and can admit without switching clubs', async ({
  page,
  browser,
}) => {
  await signIn(page, adminEmail);
  const users = (await json(page, '/api/platform/users')).data as { id: string; email: string }[];
  const uid = users.find((u) => u.email === adminEmail)?.id ?? '';
  const name = `Pending ${randomUUID().slice(0, 8)}`;
  const created = await json(page, '/api/platform/clubs', {
    slug: `pending-${randomUUID()}`,
    name,
    adminId: uid,
  });
  const clubId = (created.data as { id: string }).id;
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    member = await context.newPage();
  const email = `request-${randomUUID()}@example.test`;
  await signIn(member, email);
  expect((await json(member, '/api/account/applications', { clubId })).status).toBe(201);
  await page.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  await page.getByRole('tab', { name: 'Aanmeldingen', exact: true }).click();
  const request = page
    .getByTestId('registration-request')
    .filter({ hasText: email })
    .filter({ hasText: name });
  await expect(request).toContainText(name);
  await request.getByRole('button', { name: 'Toelaten als roeier', exact: true }).click();
  await expect(request).toContainText('Goedgekeurd');
  await expect(request.getByRole('button')).toHaveCount(0);
  await member.reload();
  expect(
    ((await json(member, '/api/auth/status')).data as { clubs: { id: string }[] }).clubs.some(
      (c) => c.id === clubId,
    ),
  ).toBe(true);
  await context.close();
});

test('club administrator email changes require confirmation by the existing account owner', async ({
  page,
  browser,
}, info) => {
  await signIn(page, adminEmail);
  const device = devices[info.project.name === 'iphone-webkit' ? 'iPhone 13' : 'Desktop Chrome'];
  const viewport =
    info.project.name === 'iphone-webkit'
      ? devices['iPhone 13'].viewport
      : { width: 1000, height: 540 };
  const context = await browser.newContext({
      ...device,
      viewport,
      baseURL: new URL('.', page.url()).toString(),
    }),
    ownerContext = await browser.newContext({
      ...device,
      viewport,
      baseURL: new URL('.', page.url()).toString(),
    }),
    clubAdmin = await context.newPage(),
    owner = await ownerContext.newPage();
  const admin = `clubadmin-${randomUUID()}@example.test`,
    email = `owner-${randomUUID()}@example.test`,
    next = `owner-new-${randomUUID()}@example.test`;
  await signIn(clubAdmin, admin);
  await signIn(owner, email);
  const a = ((await json(clubAdmin, '/api/auth/status')).data as { user: { id: string } }).user.id;
  const u = ((await json(owner, '/api/auth/status')).data as { user: { id: string } }).user.id;
  const club = (
    await json(page, '/api/platform/clubs', {
      slug: `owner-${randomUUID()}`,
      name: `Owner ${randomUUID().slice(0, 8)}`,
      adminId: a,
    })
  ).data as { id: string };
  expect((await json(page, '/api/admin/access', { email, roles: ['rower'] }, club.id)).status).toBe(
    201,
  );
  await json(page, '/api/platform/clubs', {
    slug: `other-${randomUUID()}`,
    name: 'Other owner club',
    adminId: u,
  });
  await clubAdmin.goto('./users');
  await filterEmail(clubAdmin, email);
  await clubAdmin
    .getByTestId('user-row')
    .getByRole('button', { name: 'Gebruiker bewerken', exact: true })
    .click();
  const editor = clubAdmin.getByTestId('user-editor');
  await editor.getByLabel('E-mail', { exact: true }).fill(next);
  const response = clubAdmin.waitForResponse((r) =>
    r.url().includes(`/api/manage/users/${u}/email-change`),
  );
  await editor.getByRole('button', { name: 'Verificatiecode versturen', exact: true }).click();
  const proof = (await (await response).json()) as { id: string };
  expect(
    (
      await json(
        clubAdmin,
        `/api/manage/email-changes/${proof.id}/confirm`,
        { code: authCode },
        club.id,
      )
    ).status,
  ).toBe(409);
  await expect(editor.getByLabel('Verificatiecode', { exact: true })).toHaveCount(0);
  await owner.goto(`./email-change/${proof.id}`);
  await expect(owner.getByText(`${email} → ${next}`, { exact: true })).toBeVisible();
  await owner.getByLabel('Verificatiecode', { exact: true }).fill(authCode);
  await owner.getByRole('button', { name: 'Nieuw e-mailadres bevestigen', exact: true }).click();
  await expect(
    owner.getByRole('heading', {
      name: 'E-mailadres gewijzigd; bestaande sessies zijn afgemeld.',
      exact: true,
    }),
  ).toBeVisible();
  await owner.screenshot({ path: info.outputPath('owner-confirmation.png'), fullPage: true });
  expect(((await json(owner, '/api/auth/status')).data as { access: boolean }).access).toBe(false);
  await context.close();
  await ownerContext.close();
});

test('registration with a club shows its result before names and reaches global approval', async ({
  page,
  browser,
}, testInfo) => {
  const address = `onboarding-${randomUUID()}@example.test`;
  await page.goto('./');
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() });
  const admin = await context.newPage();
  await existingSignIn(admin, adminEmail);
  const directory = await json(admin, '/api/platform/clubs');
  const club = (directory.data as { id: string; name: string }[]).find(
    (c) => c.name === 'WVIJburg',
  );
  if (!club) throw new Error('No pilot club');
  await registerThroughForm(page, address, club.id);
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.getByTestId('registration-result')).toContainText('WVIJburg');
  const pending = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'WVIJburg', exact: true }) });
  await expect(pending).toContainText('Wacht op toelating');
  await layout(page);
  await page.screenshot({
    path: testInfo.outputPath('registration-with-club.png'),
    fullPage: true,
  });
  await admin.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  await admin.getByRole('tab', { name: 'Aanmeldingen', exact: true }).click();
  const application = admin.getByTestId('registration-request').filter({ hasText: address });
  await expect(application).toContainText('WVIJburg');
  await expect(application).toContainText('Wacht op toelating');
  await application.getByRole('button', { name: 'Toelaten als roeier', exact: true }).click();
  await expect(application).toContainText('Goedgekeurd');
  await expect(application.getByRole('button')).toHaveCount(0);
  await layout(admin);
  await application.screenshot({ path: testInfo.outputPath('registration-review.png') });
  await page.reload();
  await pending.getByRole('button', { name: /^(Club openen|Huidige club)$/ }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await context.close();
});

test('registration without a club requires platform review and supports later club requests', async ({
  page,
  browser,
}, testInfo) => {
  const address = `no-club-${randomUUID()}@example.test`;
  await registerThroughForm(page, address);
  await expect(page.getByTestId('registration-result')).toContainText(
    'Je hebt bij deze aanmelding geen club gekozen',
  );
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await layout(page);
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    admin = await context.newPage();
  await existingSignIn(admin, adminEmail);
  await admin.getByRole('link', { name: 'Gebruikers', exact: true }).click();
  await admin.getByRole('tab', { name: 'Aanmeldingen', exact: true }).click();
  const row = admin.getByTestId('registration-request').filter({ hasText: address });
  await expect(row).toContainText('Voorlopig geen club');
  await expect(row).toContainText('Wacht op beoordeling door de RowLens-beheerder');
  await expect(row.getByRole('button')).toHaveCount(2);
  await row.getByRole('button', { name: 'Aanmelding accepteren', exact: true }).click();
  await expect(row).toContainText('Aanmelding zonder club geaccepteerd');
  await layout(admin);
  await row.screenshot({ path: testInfo.outputPath('registration-without-club-review.png') });
  const club = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'WVIJburg', exact: true }) });
  await club.getByRole('button', { name: 'Lidmaatschap aanvragen', exact: true }).click();
  await expect(club).toContainText('Wacht op toelating');
  await context.close();
});

test('registration form loads clubs, requires an explicit choice and recovers a failed directory load', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await page.route('**/api/auth/registration/clubs', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  );
  await page.getByRole('button', { name: 'Account aanmaken', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('De clubs konden niet worden geladen');
  await expect(
    page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }),
  ).toBeDisabled();
  await page.unroute('**/api/auth/registration/clubs');
  await page.getByRole('button', { name: 'Opnieuw proberen', exact: true }).click();
  await expect(page.getByLabel('Club', { exact: true })).toBeEnabled();
  await page.getByLabel('E-mailadres', { exact: true }).fill(`choice-${randomUUID()}@example.test`);
  await expect(
    page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Club', { exact: true }).selectOption('none');
  await expect(
    page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }),
  ).toBeEnabled();
  await layout(page);
  await page.screenshot({ path: testInfo.outputPath('registration-form.png'), fullPage: true });
});

test('an archived registration choice can be replaced without creating a partial account', async ({
  page,
  browser,
}) => {
  await page.goto('./');
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    admin = await context.newPage();
  await existingSignIn(admin, adminEmail);
  const created = await json(admin, '/api/platform/clubs', {
    slug: `registration-${randomUUID()}`,
    name: 'Temporary signup club',
    adminId: null,
  });
  const clubId = (created.data as { id: string }).id;
  const address = `archived-signup-${randomUUID()}@example.test`;
  await page.getByRole('button', { name: 'Account aanmaken', exact: true }).click();
  await page.getByLabel('E-mailadres', { exact: true }).fill(address);
  await expect(page.getByLabel('Club', { exact: true })).toBeEnabled();
  await page.getByLabel('Club', { exact: true }).selectOption(clubId);
  await page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }).click();
  await expect(page.getByLabel('Inlogcode', { exact: true })).toBeVisible();
  expect(
    (await json(admin, `/api/platform/clubs/${clubId}/archive`, { archived: true })).status,
  ).toBe(204);
  await page.getByLabel('Inlogcode', { exact: true }).fill(authCode);
  await page.getByRole('button', { name: 'Bevestigen en aanmelden', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Deze club is niet meer beschikbaar');
  expect(
    ((await json(admin, '/api/platform/users')).data as { email: string }[]).some(
      (u) => u.email === address,
    ),
  ).toBe(false);
  await page.getByRole('button', { name: 'E-mailadres of club wijzigen', exact: true }).click();
  await expect(page.getByLabel('Club', { exact: true })).toBeEnabled();
  await expect(
    page.getByRole('option', { name: 'Temporary signup club', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Club', { exact: true }).selectOption('none');
  await page.getByRole('button', { name: 'Bevestigingscode versturen', exact: true }).click();
  await page.getByLabel('Inlogcode', { exact: true }).fill(authCode);
  await page.getByRole('button', { name: 'Bevestigen en aanmelden', exact: true }).click();
  await expect(page.getByTestId('registration-result')).toContainText(
    'Je hebt bij deze aanmelding geen club gekozen',
  );
  await context.close();
});

test('an existing registered account signs in again without another registration', async ({
  page,
}) => {
  const address = `returning-${randomUUID()}@example.test`;
  await registerThroughForm(page, address);
  const before = (await json(page, '/api/auth/status')).data as { user: { id: string } };
  await json(page, '/api/auth/logout', {});
  await page.goto('./');
  await page.getByLabel('E-mailadres', { exact: true }).fill(address);
  await page.getByRole('button', { name: 'Stuur code', exact: true }).click();
  await page.getByLabel('Inlogcode', { exact: true }).fill(authCode);
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await expect(page.getByTestId('registration-result')).toBeVisible();
  const after = (await json(page, '/api/auth/status')).data as { user: { id: string } };
  expect(after.user.id).toBe(before.user.id);
  await expect(page.getByTestId('welcome')).toHaveCount(0);
});

test('repeated registration shows the confirmed new club instead of the first no-club choice', async ({
  page,
}) => {
  const address = `repeat-choice-${randomUUID()}@example.test`;
  await registerThroughForm(page, address);
  const directory = (await json(page, '/api/account/clubs')).data as {
    clubs: { id: string; name: string }[];
  };
  const club = directory.clubs.find((c) => c.name === 'WVIJburg');
  if (!club) throw new Error('No pilot club');
  await json(page, '/api/auth/logout', {});
  await registerThroughForm(page, address, club.id);
  await expect(page.getByTestId('registration-result')).toContainText('WVIJburg');
  await expect(page.getByTestId('registration-result')).not.toContainText(
    'Je hebt bij deze aanmelding geen club gekozen',
  );
  await expect(
    page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'WVIJburg', exact: true }) }),
  ).toContainText('Wacht op toelating');
});

test('clubless email review keeps its destination through sign in and requires a confirmed decision', async ({
  page,
  browser,
}, info) => {
  const address = `review-${randomUUID()}@example.test`;
  await registerThroughForm(page, address);
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    admin = await context.newPage();
  await existingSignIn(admin, adminEmail);
  const data = await json(admin, '/api/account/clubless-requests');
  const request = (data.data as { id: string; email: string; status: string }[]).find(
    (r) => r.email === address,
  );
  if (!request) throw new Error('Missing synthetic request');
  const signedOut = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    review = await signedOut.newPage();
  await review.goto(`./admission/${request.id}?scope=platform&decision=accept`);
  await expect(
    review.getByText('Log in om deze aanmelding te beoordelen.', { exact: true }),
  ).toBeVisible();
  await review.getByLabel('E-mailadres', { exact: true }).fill(adminEmail);
  await review.getByRole('button', { name: 'Stuur code', exact: true }).click();
  await review.getByLabel('Inlogcode', { exact: true }).fill(authCode);
  await review.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await expect(
    review.getByRole('button', { name: 'Aanmelding accepteren', exact: true }),
  ).toBeVisible();
  expect((await json(admin, '/api/account/clubless-requests')).data).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: request.id, status: 'pending' })]),
  );
  await expect(review.getByText(address, { exact: true })).toBeVisible();
  expect(await review.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await review.screenshot({ path: info.outputPath('admission-review.png'), fullPage: true });
  await review.getByRole('button', { name: 'Aanmelding accepteren', exact: true }).click();
  await expect(review.getByTestId('confirm')).toBeVisible();
  await review.getByRole('button', { name: 'Aanmelding accepteren', exact: true }).click();
  await expect(review.getByRole('status')).toHaveText('Beslissing opgeslagen.');
  await page.reload();
  await expect(
    page.getByText('Aanmelding zonder club geaccepteerd', { exact: true }),
  ).toBeVisible();
  await context.close();
  await signedOut.close();
});

test('initial club rejection offers explicit clubless fallback and guarded review', async ({
  page,
  browser,
}, info) => {
  await existingSignIn(page, adminEmail);
  const account = (await json(page, '/api/auth/status')).data as { user: { id: string } };
  const name = `Initial review ${randomUUID().slice(0, 8)}`;
  const c = (
    await json(page, '/api/platform/clubs', {
      name,
      slug: `review-${randomUUID()}`,
      adminId: account.user.id,
    })
  ).data as { id: string };
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    member = await context.newPage();
  const address = `club-review-${randomUUID()}@example.test`;
  await registerThroughForm(member, address, c.id);
  const requests = (await json(page, '/api/manage/applications')).data as {
    id: string;
    email: string;
    clubId: string | null;
  }[];
  const request = requests.find((r) => r.email === address && r.clubId === c.id);
  if (!request) throw new Error('Missing synthetic application');
  await page.goto(`./admission/${request.id}?club=${c.id}&decision=reject`);
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Aanmelding afwijzen', exact: true }).click();
  await page.getByRole('button', { name: 'Aanmelding afwijzen', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Beslissing opgeslagen.');
  await member.reload();
  await member.getByRole('button', { name: 'Aanmelden zonder club', exact: true }).click();
  await expect(
    member.getByText('Wacht op beoordeling door de RowLens-beheerder', { exact: true }),
  ).toBeVisible();
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await member.screenshot({ path: info.outputPath('clubless-fallback.png'), fullPage: true });
  await context.close();
});

test('training overview filters accessible clubs and participation and opens the matching tenant', async ({
  page,
  browser,
}, info) => {
  await existingSignIn(page, adminEmail);
  const account = (await json(page, '/api/auth/status')).data as { user: { id: string } };
  const c1 = (
    await json(page, '/api/platform/clubs', {
      name: `Overview A ${randomUUID().slice(0, 8)}`,
      slug: `overview-a-${randomUUID()}`,
      adminId: account.user.id,
    })
  ).data as { id: string };
  const c2 = (
    await json(page, '/api/platform/clubs', {
      name: `Overview B ${randomUUID().slice(0, 8)}`,
      slug: `overview-b-${randomUUID()}`,
      adminId: account.user.id,
    })
  ).data as { id: string };
  const first = `Accessible A ${randomUUID().slice(0, 8)}`,
    second = `Accessible B ${randomUUID().slice(0, 8)}`;
  await json(page, '/api/sessions', { title: first, date: '2026-11-08', boatType: 'C4x+' }, c1.id);
  await json(page, '/api/sessions', { title: second, date: '2026-11-08', boatType: 'C4x+' }, c2.id);
  const context = await browser.newContext({ baseURL: new URL('.', page.url()).toString() }),
    member = await context.newPage();
  const address = `overview-${randomUUID()}@example.test`;
  await signIn(member, address);
  await json(page, '/api/admin/access', { email: address, roles: ['rower'] }, c1.id);
  await json(page, '/api/admin/access', { email: address, roles: ['rower'] }, c2.id);
  await member.goto('./sessions');
  await expect(member.getByRole('link', { name: first, exact: true })).toBeVisible();
  await expect(member.getByRole('link', { name: second, exact: true })).toBeVisible();
  await member.getByTestId('filters').evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await member.getByLabel('Club', { exact: true }).selectOption(c1.id);
  await expect(member.getByRole('link', { name: first, exact: true })).toBeVisible();
  await expect(member.getByRole('link', { name: second, exact: true })).toHaveCount(0);
  await member.getByLabel('Alleen trainingen waarin ik voorkom', { exact: true }).check();
  await expect(member.getByRole('link', { name: first, exact: true })).toHaveCount(0);
  await member.getByLabel('Alleen trainingen waarin ik voorkom', { exact: true }).uncheck();
  expect(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await member.screenshot({ path: info.outputPath('multi-club-trainings.png'), fullPage: true });
  await member.getByRole('link', { name: first, exact: true }).click();
  await expect(member).toHaveURL(new RegExp(`club=${c1.id}`));
  await expect(member.getByRole('heading', { name: first, exact: true })).toBeVisible();
  await context.close();
});
