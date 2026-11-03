import { expect, test } from '@playwright/test';
import { openLineup, openNewSession, signIn } from './helpers.ts';

// Session lineup (#103): choose the boat, fill seats from the roster or add a rower on the spot.
test('fill a coastal double, adding a rower inline, and keep it after a reload', async ({
  page,
}, info) => {
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await signIn(page);
  await page.goto('./rowers');
  await page.getByLabel(/^(Name|Naam)$/).fill(`Anna ${tag}`);
  await page.getByRole('button', { name: /^(Add rower|Roeier toevoegen)$/ }).click();
  await expect(page.getByTestId('rower-list')).toContainText(`Anna ${tag}`);

  await page.goto('./sessions');
  await openNewSession(page);
  await page.getByLabel(/^(Title|Titel)$/).fill(`Lineup ${tag}`);
  await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
  const lineup = await openLineup(page);
  await expect(lineup).toBeVisible();

  await lineup.getByLabel(/^(Boat|Boot)$/).selectOption('C2x');
  await expect(lineup.getByTestId('seat')).toHaveCount(2);

  // Bow: an existing rower, found by part of the name.
  const bow = lineup.getByRole('combobox', { name: /^(Bow|Boeg) \(1\)$/ });
  // The whole tag (a word of the name), not a part all runs share: the picker shows 8 matches, and
  // a database kept between runs holds every earlier run's Anna (BUG-016).
  await bow.fill(tag);
  await page.getByRole('option', { name: `Anna ${tag}` }).click();
  await expect(bow).toHaveValue(`Anna ${tag}`);

  // Stroke: someone not on the roster yet, added from the seat.
  const stroke = lineup.getByRole('combobox', { name: /^(Stroke|Slag) \(2\)$/ });
  await stroke.fill(`Bram ${tag}`);
  await page.getByRole('option', { name: new RegExp(`Bram ${tag}`) }).click();
  await expect(stroke).toHaveValue(`Bram ${tag}`);

  await lineup.getByRole('button', { name: /^(Save lineup|Opstelling opslaan)$/ }).click();
  await expect(lineup.getByRole('status')).toHaveText(/Lineup saved|Opstelling opgeslagen/);

  await page.reload();
  await openLineup(page);
  await expect(page.getByTestId('lineup').getByLabel(/^(Boat|Boot)$/)).toHaveValue('C2x');
  await expect(
    page.getByTestId('lineup').getByRole('combobox', { name: /^(Stroke|Slag) \(2\)$/ }),
  ).toHaveValue(`Bram ${tag}`);

  await page.goto('./rowers');
  await expect(page.getByTestId('rower-list')).toContainText(`Bram ${tag}`);
  await page.goto('./sessions');
  const row = page.getByTestId('session-list').locator('tr', { hasText: `Lineup ${tag}` });
  await expect(row).toContainText('C2x');
  // The crew column lists first names.
  await expect(row).toContainText('Bram');

  // A next session offers this lineup to copy; its long title must not widen the page on a phone.
  await openNewSession(page);
  await page.getByLabel(/^(Title|Titel)$/).fill(`Next ${tag} with a rather long session title`);
  await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
  await openLineup(page);
  const copy = page.getByTestId('lineup').getByLabel(/^(Copy from|Kopieer van)/);
  const earlier = await copy.locator('option', { hasText: `Lineup ${tag}` }).getAttribute('value');
  await copy.selectOption(earlier ?? '');
  await expect(
    page.getByTestId('lineup').getByRole('combobox', { name: /^(Bow|Boeg) \(1\)$/ }),
  ).toHaveValue(`Anna ${tag}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
