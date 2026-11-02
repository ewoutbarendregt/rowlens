import { expect, test } from '@playwright/test';
import { openNewSession, signIn } from './helpers.ts';

// The sessions list is the start page; filters and sort live in the URL (#108).
test('lands on the sessions list, filters by rower, sorts by title, keeps it on reload', async ({
  page,
}, info) => {
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await signIn(page);
  await expect(page).toHaveURL(/\/sessions$/);

  // Two sessions; only the second has Mia in its lineup.
  for (const [title, withMia] of [
    [`B first ${tag}`, false],
    [`A second ${tag}`, true],
  ] as const) {
    await page.goto('./sessions');
    await openNewSession(page);
    await page.getByLabel(/^(Title|Titel)$/).fill(title);
    await page.getByRole('button', { name: /^(Create session|Training aanmaken)$/ }).click();
    const lineup = page.getByTestId('lineup');
    await expect(lineup).toBeVisible();
    if (withMia) {
      await lineup.getByLabel(/^(Boat|Boot)$/).selectOption('C1x');
      await lineup.getByRole('combobox', { name: /^(Rower|Roeier)$/ }).fill(`Mia ${tag}`);
      await page.getByRole('option', { name: new RegExp(`Mia ${tag}`) }).click();
      await lineup.getByRole('button', { name: /^(Save lineup|Opstelling opslaan)$/ }).click();
      await expect(lineup.getByRole('status')).toBeVisible();
    }
  }

  await page.goto('./sessions');
  const filters = page.getByTestId('filters');
  // Open on a laptop, folded on a phone.
  const search = filters.getByLabel(/^(Search|Zoeken)$/);
  if (!(await search.isVisible())) await filters.locator('summary').click();
  await search.fill(tag);
  await expect(page).toHaveURL(/q=/);
  await filters.getByLabel(/^(Sort by|Sorteren op)/).selectOption('title');
  const titles = page.getByTestId('session');
  await expect(titles).toHaveCount(2);
  await expect(titles.first()).toContainText(`A second ${tag}`);

  const mia = await filters
    .getByLabel(/^(Rower|Roeier)/)
    .locator('option', { hasText: `Mia ${tag}` })
    .getAttribute('value');
  await filters.getByLabel(/^(Rower|Roeier)/).selectOption(mia ?? '');
  await expect(titles).toHaveCount(1);
  await expect(page).toHaveURL(/rower=/);

  await page.reload();
  await expect(page.getByTestId('session')).toHaveCount(1);
  await expect(page.getByTestId('session')).toContainText(`A second ${tag}`);
  await page.getByRole('button', { name: /^(Clear filters|Filters wissen)$/ }).click();
  await expect(page).not.toHaveURL(/rower=/);

  // Sorted by title it is one table; sorted by date, one table per month under a month heading.
  const month = page.getByTestId('session-list').getByRole('heading', { level: 2 });
  await expect(month).toHaveCount(0);
  await filters.getByLabel(/^(Sort by|Sorteren op)/).selectOption('date-desc');
  await expect(month.first()).toHaveText(/^\p{L}+ \d{4}$/u);
});
