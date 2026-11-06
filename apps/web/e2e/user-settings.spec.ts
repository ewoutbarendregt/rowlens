import { expect, test, type Page } from '@playwright/test';
import { withBasePath } from '../src/shared/base-path.ts';
import { adminEmail, authEmail } from './env.ts';
import { signIn, signOut, openNewSession } from './helpers.ts';
import type { UserSettings } from '../src/shared/user-settings.ts';

async function mutation(page: Page, path: string, method: string, body: unknown) {
  return page.evaluate(
    async ({ url, method, body }) => {
      const csrf =
        document.cookie
          .split('; ')
          .find((c) => c.startsWith('rowlens_csrf='))
          ?.split('=')[1] ?? '';
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify(body),
      });
      return response.status;
    },
    { url: withBasePath('/projects/rowlens', path), method, body },
  );
}
const settings = async (page: Page) =>
  (await page.request.get('./api/me/settings')).json() as Promise<UserSettings>;

test('admin edits one central account; rower boundaries, combined roles and preferences follow that account', async ({
  page,
  browser,
}, info) => {
  const email = `settings.${info.project.name.replace(/\W/g, '')}.${String(Date.now())}@example.com`;
  await signIn(page, adminEmail);
  expect(await mutation(page, '/api/admin/access', 'POST', { email, roles: ['rower'] })).toBe(201);
  // A second browser is a different device, not an impersonation or shared cookie jar.
  const context = await browser.newContext({
    baseURL: new URL('./', page.url()).href,
    viewport: page.viewportSize(),
    isMobile: info.project.use.isMobile ?? false,
    hasTouch: info.project.use.hasTouch ?? false,
    userAgent: await page.evaluate(() => navigator.userAgent),
  });
  const member = await context.newPage();
  try {
    await signIn(member, email);
    await member.getByTestId('account-menu').locator('summary').click();
    await member
      .getByTestId('profile-form')
      .getByLabel(/^(First name|Voornaam)$/)
      .fill('Draft');
    await member.getByTestId('account-menu').locator('summary').click();
    const status = (await (await member.request.get('./api/auth/status')).json()) as {
      user: { id: string };
    };
    const original = await settings(member);
    await page.goto('./admin');
    await page.getByLabel(/Search users|Zoek gebruikers/).fill(email);
    const row = page.getByTestId('access').filter({ hasText: email });
    await row.getByRole('button', { name: /^(Settings|Instellingen)$/ }).click();
    const editor = row.getByTestId('admin-user-settings');
    await editor.getByLabel(/^(First name|Voornaam)$/).fill('Central');
    await editor.getByLabel(/^(Last name|Achternaam)$/).fill('Tester');
    await editor.getByLabel(/^(Default boat|Standaardboot)$/).selectOption('C2x');
    await editor.getByLabel(/^(Language|Taal)$/).selectOption('en');
    await editor.getByLabel(/^(Display|Weergave)$/).selectOption('dark');
    await editor
      .getByLabel(/^(Show notes on the video|Notities op de video tonen)$/)
      .selectOption('false');
    await editor
      .getByLabel(/^(Note display duration|Weergaveduur van notities)$/)
      .selectOption('0.5');
    await editor
      .getByLabel(/^(Show calculated middle of the drive|Berekend midden van de haal tonen)$/)
      .selectOption('true');
    await editor.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
    await expect(editor.getByRole('status')).toHaveText(/Saved|Opgeslagen/);
    // Editing another user never applies their display choices to the administrator.
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await member.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(member.locator('html')).toHaveAttribute('lang', 'en');
    await expect(member.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(member.getByRole('link', { name: 'Rowers', exact: true })).toHaveCount(0);
    await expect(member.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);

    expect((await member.request.get('./api/rowers')).status()).toBe(404);
    expect(
      (await member.request.get(`./api/admin/users/${status.user.id}/settings`)).status(),
    ).toBe(404);
    expect(
      await mutation(member, '/api/me/settings', 'PATCH', {
        revision: original.revision,
        changes: { theme: 'light' },
      }),
    ).toBe(409);
    await member.getByTestId('account-menu').locator('summary').click();
    const own = member.getByTestId('account-preferences');
    await expect(own.getByRole('checkbox', { name: 'Show notes on the video' })).not.toBeChecked();
    await expect(
      own.getByRole('checkbox', { name: 'Show calculated middle of the drive' }),
    ).toBeChecked();
    await expect(own.getByLabel('Note display duration')).toHaveValue('0.5');
    const profile = member.getByTestId('profile-form');
    await expect(profile.getByLabel('First name', { exact: true })).toHaveValue('Draft');
    await profile.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(profile.getByRole('alert')).toContainText('changed elsewhere');
    await profile.getByRole('button', { name: 'Reload', exact: true }).click();
    await expect(profile.getByLabel('First name', { exact: true })).toHaveValue('Central');
    await member.getByTestId('account-menu').locator('summary').click();
    await member.goto('./rowers');
    await expect(member).toHaveURL(/\/sessions$/);
    await openNewSession(member);
    await expect(
      member
        .getByRole('form', { name: /^(New session|Nieuwe training)$/ })
        .getByLabel(/^(Boat|Boot)$/),
    ).toHaveValue('C2x');
    // Add coach; this is still one identity, with the rower role retained.
    await row.getByRole('checkbox', { name: 'Coach', exact: true }).check();
    const roleSaved = page.waitForResponse(
      (response) =>
        response.url().includes('/api/admin/access/') && response.request().method() === 'PATCH',
    );
    await row
      .getByRole('button', { name: /^(Save|Opslaan)$/ })
      .first()
      .click();
    expect((await roleSaved).status()).toBe(204);
    await member.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(member.getByRole('link', { name: 'Rowers', exact: true })).toBeVisible();
    const combined = (await (await member.request.get('./api/auth/status')).json()) as {
      user: { id: string; roles: string[] };
    };
    expect(combined.user).toMatchObject({ id: status.user.id, roles: ['rower', 'coach'] });
    // Re-login from a fresh device retains centralized choices and combined roles.
    await signOut(member);
    await signIn(member, email);
    await expect(member.locator('html')).toHaveAttribute('lang', 'en');
    expect((await settings(member)).preferences).toMatchObject({
      theme: 'dark',
      noteHoldSeconds: 0.5,
      notesVisible: false,
      driveMiddle: true,
    });
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    for (const control of await editor.locator('input,select,button').all()) {
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    const identity = await row.locator('.access__identity').boundingBox();
    expect(identity?.width).toBeGreaterThan(200);
    await page.screenshot({ path: info.outputPath('admin-settings.png'), fullPage: true });
  } finally {
    await context.close();
  }
});

test('own preferences synchronize across devices, with explicit legacy import and account isolation', async ({
  page,
  browser,
}, info) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('legacy-settings-fixture') === null) {
      localStorage.setItem('rowlens.theme', 'hc');
      localStorage.setItem('rowlens.videoNotes.holdSeconds', '2');
      sessionStorage.setItem('legacy-settings-fixture', 'set');
    }
  });
  await signIn(page, authEmail);
  await page.getByTestId('account-menu').locator('summary').click();
  const own = page.getByTestId('account-preferences');
  const importButton = own.getByRole('button', {
    name: /Save these device|Deze apparaatvoorkeuren/,
  });
  if (await importButton.isVisible()) {
    await importButton.click();
    await expect(importButton).toHaveCount(0);
  }
  await own.getByLabel(/^(Note display duration|Weergaveduur van notities)$/).selectOption('2');
  await expect.poll(async () => (await settings(page)).preferences.noteHoldSeconds).toBe(2);
  await page
    .getByTestId('theme-switch')
    .getByRole('button', { name: /^(High contrast|Hoog contrast)$/ })
    .click();
  await expect.poll(async () => (await settings(page)).preferences.theme).toBe('hc');
  const second = await browser.newContext({
    baseURL: new URL('./', page.url()).href,
    viewport: page.viewportSize(),
    isMobile: info.project.use.isMobile ?? false,
    hasTouch: info.project.use.hasTouch ?? false,
    userAgent: await page.evaluate(() => navigator.userAgent),
  });
  const device = await second.newPage();
  try {
    await signIn(device, authEmail);
    await expect(device.locator('html')).toHaveAttribute('data-theme', 'hc');
    await device.getByTestId('account-menu').locator('summary').click();
    await expect(
      device
        .getByTestId('account-preferences')
        .getByLabel(/^(Note display duration|Weergaveduur van notities)$/),
    ).toHaveValue('2');
    // Restore shared test account defaults, so other specs are order independent.
    const current = await settings(device);
    expect(
      await mutation(device, '/api/me/settings', 'PATCH', {
        revision: current.revision,
        changes: {
          language: 'nl',
          theme: 'light',
          notesVisible: true,
          noteHoldSeconds: 1,
          driveMiddle: false,
        },
      }),
    ).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'hc');
  } finally {
    await second.close();
  }
  await page.getByTestId('account-menu').locator('summary').click();
  await signOut(page);
  await page.evaluate(() => {
    localStorage.removeItem('rowlens.theme');
  });
  await signIn(page, adminEmail);
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'hc');
});
