import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { adminEmail, edgeUrl } from './env.ts';
import { openLineup, openProcessedClip, signIn, signOut } from './helpers.ts';

// A rower sees only their sessions and the notes meant for them (#40); sharing with the crew (#112).
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

test('a coach shares one note with the crew; the rower sees only that note', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  const rowerEmail = `rita.${tag}@example.com`.toLowerCase();

  // The admin lets the rower in.
  await signIn(page, adminEmail);
  await page.goto('./admin');
  await page.getByLabel(/^(E-mail address|E-mailadres)$/).fill(rowerEmail);
  await expect(page.getByRole('checkbox', { name: /^(Rower|Roeier)$/ })).toBeChecked();
  await page.getByRole('button', { name: /^(Give access|Toegang geven)$/ }).click();
  await expect(page.getByTestId('access').filter({ hasText: rowerEmail })).toBeVisible();
  await signOut(page);

  // The coach puts her in the roster with that e-mail, films, sets the lineup and writes two notes.
  await openProcessedClip(page, readFileSync(FIXTURE), `Share ${tag}`);
  const videoUrl = page.url();
  await page.goto('./rowers');
  await page.getByLabel(/^(Name|Naam)$/).fill(`Rita ${tag}`);
  await page.getByLabel(/^E-mail/).fill(rowerEmail);
  await page.getByRole('button', { name: /^(Add rower|Roeier toevoegen)$/ }).click();
  await expect(page.getByTestId('rower-list')).toContainText(`Rita ${tag}`);

  await page.goto(videoUrl);
  await page.getByRole('link', { name: /^(Back to|Terug naar) / }).click();
  const lineup = await openLineup(page);
  await lineup.getByLabel(/^(Boat|Boot)$/).selectOption('C1x');
  await lineup.getByRole('combobox', { name: /^(Rower|Roeier)$/ }).fill(`Rita ${tag}`);
  await page.getByRole('option', { name: new RegExp(`Rita ${tag}`) }).click();
  await lineup.getByRole('button', { name: /^(Save lineup|Opstelling opslaan)$/ }).click();
  await expect(lineup.getByRole('status')).toBeVisible();

  await page.goto(videoUrl);
  await expect(page.getByTestId('player-frame')).toHaveText('0');
  // Steps need the metadata, and the keys must reach the player, not the name field.
  await expect(page.locator('video')).toHaveJSProperty('readyState', 4);
  await page.locator('h1').click();
  const moments = page.getByTestId('moment');
  for (const [count, frame, text] of [
    [1, 5, 'For the crew: hands away earlier'],
    [2, 10, 'Coach only: check rigging'],
  ] as const) {
    for (let n = 0; n < 5; n++) await page.keyboard.press('.');
    await expect(page.getByTestId('player-frame')).toHaveText(String(frame));
    await page
      .getByLabel(new RegExp(`^(Note at frame|Notitie bij frame) ${String(frame)} \\(`))
      .fill(text);
    await page.getByRole('button', { name: /^(Save note|Notitie opslaan)$/ }).click();
    // Wait for the saved note's section before stepping on (CI is slower than a laptop).
    await expect(moments).toHaveCount(count);
    await page.locator('h1').click();
  }
  await expect(moments).toHaveCount(2);
  await moments
    .first()
    .getByRole('button', { name: /^(Share with the whole crew|Met de hele ploeg delen)$/ })
    .click();
  await expect(moments.first().getByTestId('share')).toHaveCount(1);
  await signOut(page);

  // The rower: her session, one note, and no way to delete the coach's note.
  await signIn(page, rowerEmail);
  await page.goto('./sessions');
  await expect(page.getByTestId('session-list')).toContainText(`Share ${tag}`);
  await expect(page.getByTestId('unlinked')).toHaveCount(0);
  await page.goto(videoUrl);
  const hers = page.getByTestId('moment');
  await expect(hers).toHaveCount(1);
  await expect(hers.first().getByTestId('share')).toContainText(/Whole crew|Hele ploeg/);
  await expect(
    hers.first().getByRole('button', { name: /^(Delete note|Notitie verwijderen)$/ }),
  ).toHaveCount(0);
});
