import { expect, test } from '@playwright/test';
import { openLineup, openNewSession, signIn } from './helpers.ts';

// BUG-075: a rower who makes a training picks the crew from the whole club and adds a name-only
// crew member on the spot (amends ADR-0021). Runs on the unified visibility fixture.
test.skip(process.env['E2E_UNIFIED'] !== 'true', 'Requires the isolated visibility configuration');

test('a rower picks any club member for the crew of a new training and adds a name', async ({
  page,
}, info) => {
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await signIn(page);
  await page.goto('./sessions');
  await openNewSession(page);
  const form = page.locator('form', { has: page.getByLabel('Titel', { exact: true }) });
  await form.getByRole('combobox').first().selectOption({ label: 'Alpha testclub' });
  await page.getByLabel('Titel', { exact: true }).fill(`Ploeg ${tag}`);
  await page.getByRole('button', { name: 'Training aanmaken', exact: true }).click();
  const lineup = await openLineup(page);
  await lineup.getByLabel('Boot', { exact: true }).selectOption('2x');
  await expect(lineup.getByTestId('seat')).toHaveCount(2);

  // Bow: a club member in none of this rower's trainings, so unseen before BUG-075.
  const bow = lineup.getByRole('combobox', { name: 'Boeg (1)' });
  await bow.fill('Other');
  await page.getByRole('option', { name: 'Other Rower' }).click();
  await expect(bow).toHaveValue('Other Rower');

  // Stroke: someone without an account, added from the seat.
  const stroke = lineup.getByRole('combobox', { name: 'Slag (2)' });
  await stroke.fill(`Gast ${tag}`);
  await page.getByRole('option', { name: `“Gast ${tag}” toevoegen` }).click();
  await expect(stroke).toHaveAttribute('aria-expanded', 'false');
  await expect(stroke).toHaveValue(`Gast ${tag}`);

  await lineup.getByRole('button', { name: 'Opstelling opslaan', exact: true }).click();
  await expect(lineup.getByRole('status')).toHaveText(/^Opstelling opgeslagen/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('crew-whole-club.png'), fullPage: true });

  await page.reload();
  const saved = await openLineup(page);
  await expect(saved.getByRole('combobox', { name: 'Boeg (1)' })).toHaveValue('Other Rower');
  await expect(saved.getByRole('combobox', { name: 'Slag (2)' })).toHaveValue(`Gast ${tag}`);
});
