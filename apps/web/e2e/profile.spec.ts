import { expect, type Page, test } from '@playwright/test';
import { openLineup, openNewSession, signIn } from './helpers.ts';

// Names, the default boat and renaming (2026-11-03): set in the account menu, used when a session
// is made, shown on the session and in the list.

async function saveProfile(page: Page, first: string, last: string, boat: string) {
  await page.getByTestId('account-menu').locator('summary').click();
  const form = page.getByTestId('account-menu').getByTestId('profile-form');
  await form.getByLabel(/^(First name|Voornaam)$/).fill(first);
  await form.getByLabel(/^(Last name|Achternaam)$/).fill(last);
  await form
    .getByLabel(/^(Boat for a new session|Boot bij een nieuwe training)$/)
    .selectOption(boat);
  await form.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(form.getByRole('status')).toHaveText(/Saved|Opgeslagen/);
  await page.getByTestId('account-menu').locator('summary').click();
}

test('name and default boat from the menu; a new session uses them; rename it', async ({
  page,
}, info) => {
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await signIn(page);
  await saveProfile(page, 'Eva', `Example${tag.slice(-4)}`, 'C2x');

  await page.goto('./sessions');
  await openNewSession(page);
  await expect(page.getByLabel(/^(Boat|Boot)$/)).toHaveValue('C2x');
  await page.getByLabel(/^(Title|Titel)$/).fill(`Profile ${tag}`);
  await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Profile ${tag}` })).toBeVisible();
  // Who made it, and when it was made (not the day it was rowed).
  await expect(page.getByText(/(Created on|Aangemaakt op) .+ (by|door) Eva Example/)).toBeVisible();
  // The videos come first; the lineup is folded below, already on the default boat.
  await expect(page.getByTestId('lineup-fold')).toContainText('C2x');
  const lineup = await openLineup(page);
  await expect(lineup.getByLabel(/^(Boat|Boot)$/)).toHaveValue('C2x');

  await page.getByRole('button', { name: /^(Rename|Naam aanpassen)$/ }).click();
  const renaming = page.getByTestId('rename-form');
  await renaming.getByLabel(/^(Session name|Naam van de training)$/).fill(`Renamed ${tag}`);
  await renaming.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Renamed ${tag}` })).toBeVisible();

  await page.goto('./sessions');
  const row = page.getByTestId('session-list').locator('tr', { hasText: `Renamed ${tag}` });
  await expect(row).toContainText(/Eva Example\w* · (Created on|Aangemaakt op)/);

  // Back to the usual default, so other tests start as before.
  await saveProfile(page, 'E2E', 'Tester', 'C4x+');
});
