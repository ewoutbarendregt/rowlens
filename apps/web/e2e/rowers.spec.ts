import { expect, test } from '@playwright/test';
import { signIn } from './helpers.ts';

// The club roster (#104): add rowers without an account, the duplicate question, edit and archive.
test('add a rower, answer the similar-name question, rename and archive', async ({
  page,
}, info) => {
  const family = `E2E${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await signIn(page);
  await page.getByRole('link', { name: /^(Rowers|Roeiers)$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^(Rowers|Roeiers)$/ })).toBeVisible();

  const name = page.getByLabel(/^(Name|Naam)$/);
  const add = page.getByRole('button', { name: /^(Add rower|Roeier toevoegen)$/ });
  const list = page.getByTestId('rower-list');

  await name.fill(`Jan ${family}`);
  await add.click();
  await expect(list.getByText(`Jan ${family}`, { exact: true })).toBeVisible();

  // Same person typed differently: RowLens asks before adding a second entry.
  await name.fill(`jan  ${family.toLowerCase()}`);
  await add.click();
  await expect(page.getByText(/looks like someone|lijkt op iemand/)).toBeVisible();
  await page.getByRole('button', { name: /^(Cancel|Annuleren)$/ }).click();
  await expect(list.getByText(new RegExp(`^Jan ${family}$`, 'i'))).toHaveCount(1);

  const row = page.getByTestId('rower').filter({ hasText: `Jan ${family}` });
  await row.getByRole('button', { name: /^(Edit|Bewerken)$/ }).click();
  // In edit mode the name is an input value, not text: find the row by its Save button.
  const save = /^(Save|Opslaan)$/;
  const editing = page
    .getByTestId('rower')
    .filter({ has: page.getByRole('button', { name: save }) });
  await editing.getByLabel(/^(Name|Naam)$/).fill(`Johan ${family}`);
  await editing.getByRole('button', { name: save }).click();
  const renamed = page.getByTestId('rower').filter({ hasText: `Johan ${family}` });
  await expect(renamed).toBeVisible();

  await renamed.getByRole('button', { name: /^(Archive|Archiveren)$/ }).click();
  await expect(page.getByTestId('rower').filter({ hasText: `Johan ${family}` })).toHaveCount(0);
  await page.getByRole('button', { name: /archived rowers|gearchiveerde roeiers/i }).click();
  await expect(page.getByTestId('rower').filter({ hasText: `Johan ${family}` })).toContainText(
    /Archived|Gearchiveerd/,
  );
});
