import { expect, test } from '@playwright/test';
import { expectedRelease } from './env.ts';
import { openLineup, openNewSession, signIn } from './helpers.ts';

test('brand returns to trainings and shows tagline and numeric version', async ({ page }, info) => {
  await page.route('**/health/live*', (route) =>
    route.fulfill({ json: { version: 'sha-1234567' } }),
  );
  await signIn(page);
  await page.goto('./rowers');
  await expect(page.locator('.app-header').getByText('focus on rowing')).toBeVisible();
  await expect(page.locator('.app-header').getByTestId('app-version')).toHaveText(expectedRelease);
  await page.locator('.app-header').getByRole('link', { name: 'RowLens' }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const brand = await page
    .locator('.app-header')
    .getByRole('link', { name: 'RowLens', exact: true })
    .boundingBox();
  expect(brand?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('header-version.png'), fullPage: true });
  await page.unroute('**/health/live*');
  await page.route('**/health/live*', (route) => route.fulfill({ json: { version: 'v1.2.3' } }));
  await page.reload();
  await expect(page.locator('.app-header').getByTestId('app-version')).toHaveText(expectedRelease);
  // Runtime diagnostic tags must never replace the numeric release of the loaded bundle.
  await expect(page.locator('.app-header').getByTestId('app-version')).toHaveText(
    /^\d+\.\d+\.\d+$/,
  );
});

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
    const lineup = await openLineup(page);
    await expect(lineup).toBeVisible();
    if (withMia) {
      await lineup.getByLabel(/^(Boat|Boot)$/).selectOption('C1x');
      await lineup.getByRole('combobox', { name: /^(Rower|Roeier)$/ }).fill(`Mia ${tag}`);
      await page.getByRole('option', { name: new RegExp(`Mia ${tag}`) }).click();
      // Adding the rower is asynchronous; wait for the chosen value before saving the lineup.
      await expect(lineup.getByRole('combobox', { name: /^(Rower|Roeier)$/ })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await expect(lineup.getByRole('combobox', { name: /^(Rower|Roeier)$/ })).toHaveValue(
        `Mia ${tag}`,
      );
      await lineup.getByRole('button', { name: /^(Save lineup|Opstelling opslaan)$/ }).click();
      await expect(lineup.getByRole('status')).toBeVisible();
    }
  }

  await page.goto('./sessions');
  const filters = page.getByTestId('filters');
  // A row without a toggle on a laptop, a fold on a phone. Wait for the block itself: the laptop
  // opens it just after rendering, so "is the search field visible yet?" raced that (BUG-013) and
  // clicked the toggle that a laptop hides.
  await expect(filters).toBeVisible();
  const toggle = filters.locator('summary');
  if (await toggle.isVisible()) await toggle.click();
  const search = filters.getByLabel(/^(Search|Zoeken)$/);
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
