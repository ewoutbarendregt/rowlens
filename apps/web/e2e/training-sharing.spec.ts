import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers.ts';
import { authEmail } from './env.ts';
import { withBasePath } from '../src/shared/base-path.ts';
import type { SessionSharing } from '../src/shared/session-sharing.ts';
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the dedicated sharing fixture');
async function ownerTraining(page: Page, email = authEmail) {
  await signIn(page, email);
  await page.goto('./sessions');
  if (email === authEmail) {
    await page.getByTestId('filters').evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    await page.getByLabel('Club', { exact: true }).selectOption({ label: 'Alpha testclub' });
  }
  await page.getByRole('link', { name: 'Eigen Alpha', exact: true }).click();
  return new URL(page.url()).pathname.split('/').at(-1) ?? '';
}
async function audience(page: Page, id: string) {
  const club = new URL(page.url()).searchParams.get('club') ?? '';
  const url = new URL(withBasePath('/projects/rowlens', `/api/sessions/${id}/sharing`), page.url());
  url.searchParams.set('club', club);
  const r = await page.request.get(url.toString());
  expect(r.status()).toBe(200);
  return (await r.json()) as SessionSharing;
}
async function clear(page: Page, id: string) {
  const state = await audience(page, id);
  const club = new URL(page.url()).searchParams.get('club') ?? '';
  const csrf = (await page.context().cookies()).find((c) => c.name === 'rowlens_csrf')?.value ?? '';
  const r = await page.request.put(
    withBasePath('/projects/rowlens', `/api/sessions/${id}/sharing`),
    {
      headers: { origin: new URL(page.url()).origin, 'x-rowlens-club': club, 'x-csrf-token': csrf },
      data: { revision: state.revision, clubWide: false, userIds: [] },
    },
  );
  expect(r.status()).toBe(200);
  await page.reload();
}
async function layout(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const undersized = await page
    .locator(
      '.session-sharing button,.session-sharing input[type=search],.session-sharing .filters__check',
    )
    .evaluateAll((nodes) =>
      nodes
        .filter((n) => {
          const r = n.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.height < 43.5;
        })
        .map((n) => n.textContent),
    );
  expect(undersized).toEqual([]);
}
test('rower shares with selected members and the club, recipient stays read-only, then sharing is withdrawn', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const id = await ownerTraining(page);
  await clear(page, id);
  const card = page.getByTestId('training-sharing');
  await card.locator('summary').click();
  await card.getByLabel('Zoek clubleden op naam').fill('Mila');
  await card.getByRole('button', { name: 'Mila Ontvanger toevoegen', exact: true }).click();
  await card.getByRole('button', { name: 'Delen opslaan', exact: true }).click();
  await expect(card.getByRole('status')).toHaveText('Delen opgeslagen.');
  await page.reload();
  await card.locator('summary').click();
  await expect(card).toContainText('Mila Ontvanger');
  await layout(page);
  await page.screenshot({ path: info.outputPath('sharing-selected.png'), fullPage: true });
  const context = await browser.newContext({
    baseURL: new URL(withBasePath('/projects/rowlens', '/'), page.url()).href,
  });
  const receiver = await context.newPage();
  try {
    await signIn(receiver, 'recipient.sharing.e2e@example.test');
    await receiver.goto('./sessions');
    const row = receiver
      .getByTestId('session-list')
      .locator('tr', { has: receiver.getByRole('link', { name: 'Eigen Alpha', exact: true }) });
    await expect(row).toContainText('Met jou gedeeld');
    await row.getByRole('link', { name: 'Eigen Alpha', exact: true }).click();
    await expect(receiver.getByTestId('training-read-only')).toBeVisible();
    await expect(receiver.getByTestId('training-sharing')).toHaveCount(0);
    await receiver.getByTestId('video').getByRole('link').last().click();
    await expect(receiver.locator('video')).toHaveJSProperty('readyState', 4);
    await expect(receiver.getByText('Privé voor maker', { exact: true })).toHaveCount(0);
    await card.getByLabel('Alle clubleden', { exact: true }).check();
    await card.getByRole('button', { name: 'Delen opslaan', exact: true }).click();
    await expect(card.getByRole('status')).toHaveText('Delen opgeslagen.');
    await card.getByRole('button', { name: 'Mila Ontvanger verwijderen', exact: true }).click();
    await card.getByRole('button', { name: 'Delen opslaan', exact: true }).click();
    await expect(card.getByRole('status')).toHaveText('Delen opgeslagen.');
    await receiver.reload();
    await expect(receiver.locator('video')).toHaveJSProperty('readyState', 4);
    await card.getByRole('button', { name: 'Delen stoppen', exact: true }).click();
    await card.getByRole('button', { name: 'Ja, delen stoppen', exact: true }).click();
    await expect(card.getByRole('status')).toHaveText('Delen opgeslagen.');
    await receiver.goto('./sessions');
    await expect(receiver.getByRole('link', { name: 'Eigen Alpha', exact: true })).toHaveCount(0);
    await expect(card.locator('summary')).toContainText('Niet extra gedeeld');
    await layout(page);
  } finally {
    await context.close();
  }
});
test('coach can share club training and stale audience changes require reloading', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const id = await ownerTraining(page);
  await clear(page, id);
  const card = page.getByTestId('training-sharing');
  await card.locator('summary').click();
  const context = await browser.newContext({
    baseURL: new URL(withBasePath('/projects/rowlens', '/'), page.url()).href,
  });
  const coach = await context.newPage();
  try {
    await ownerTraining(coach, 'coach.sharing.e2e@example.test');
    const other = coach.getByTestId('training-sharing');
    await other.locator('summary').click();
    await other.getByLabel('Alle clubleden', { exact: true }).check();
    await other.getByRole('button', { name: 'Delen opslaan', exact: true }).click();
    await expect(other.getByRole('status')).toHaveText('Delen opgeslagen.');
    await card.getByLabel('Zoek clubleden op naam').fill('Noor');
    await card.getByRole('button', { name: 'Noor Clubgenoot toevoegen', exact: true }).click();
    await card.getByRole('button', { name: 'Delen opslaan', exact: true }).click();
    await expect(card.getByRole('alert')).toContainText('elders gewijzigd');
    await card.getByRole('button', { name: 'Delen herladen', exact: true }).click();
    await expect(card.getByLabel('Alle clubleden', { exact: true })).toBeChecked();
    await layout(page);
    await page.screenshot({ path: info.outputPath('sharing-coach-conflict.png'), fullPage: true });
    await clear(page, id);
  } finally {
    await context.close();
  }
});

test('manual club choice survives a delayed primary preference response', async ({ page }) => {
  await signIn(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/me/settings*', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('./sessions');
    await page.getByTestId('filters').evaluate((el) => {
      (el as HTMLDetailsElement).open = true;
    });
    const club = page.getByLabel('Club', { exact: true });
    await club.selectOption({ label: 'Alpha testclub' });
    const selected = await club.inputValue();
    const response = page.waitForResponse(
      (r) => r.url().includes('/api/me/settings') && r.request().method() === 'GET',
    );
    release();
    await response;
    await expect(page).toHaveURL(new RegExp(`clubFilter=${selected}`));
    await expect(club).toHaveValue(selected);
    await page
      .locator('.app-header__nav')
      .getByRole('link', { name: 'Clubs', exact: true })
      .click();
    await expect(page).toHaveURL(/\/clubs$/);
    await page.reload();
    await expect(page).toHaveURL(/\/clubs$/);
  } finally {
    release();
    await page.unroute('**/api/me/settings*');
  }
});
