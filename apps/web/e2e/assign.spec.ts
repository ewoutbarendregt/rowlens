import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openLineup, openProcessedClip } from './helpers.ts';

// Who a note is for (#105) on a video the real worker processed (edge stack only).
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

test('assign a note to the whole crew, remove one rower, filter by rower', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await openProcessedClip(page, readFileSync(FIXTURE), `Assign ${tag}`);
  const videoUrl = page.url();

  // A lineup for the session: two rowers added on the spot.
  await page.getByRole('link', { name: /^(Back to|Terug naar) / }).click();
  const lineup = await openLineup(page);
  await lineup.getByLabel(/^(Boat|Boot)$/).selectOption('C2x');
  for (const [seat, name] of [
    [/^(Bow|Boeg) \(1\)$/, `Anna ${tag}`],
    [/^(Stroke|Slag) \(2\)$/, `Bram ${tag}`],
  ] as const) {
    await lineup.getByRole('combobox', { name: seat }).fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).click();
    await expect(lineup.getByRole('combobox', { name: seat })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expect(lineup.getByRole('combobox', { name: seat })).toHaveValue(name);
  }
  await lineup.getByRole('button', { name: /^(Save lineup|Opstelling opslaan)$/ }).click();
  await expect(lineup.getByRole('status')).toBeVisible();

  await page.goto(videoUrl);
  await expect(page.getByTestId('player-frame')).toHaveText('0');
  await page.locator('h1').click();
  for (let n = 1; n <= 5; n++) await page.keyboard.press('.');
  await page.getByLabel(/^(Note at frame 5|Notitie bij frame 5) \(/).fill('Both: catch too late');
  await page.getByRole('button', { name: /^(Save note|Notitie opslaan)$/ }).click();

  const moment = page.getByTestId('moment');
  await expect(moment).toHaveCount(1);
  // The lineup comes first in the picker, with each rower's seat.
  const picker = moment.getByRole('combobox', { name: /frame 5$/ });
  await picker.click();
  await expect(page.getByRole('option', { name: /Anna .* · (Bow|Boeg) \(1\)/ })).toBeVisible();
  await page.keyboard.press('Escape');

  // "For": a chip per seat (mockup 1e) and "whole crew", each a switch.
  const crew = moment.getByRole('button', { name: /^(Whole crew|Hele ploeg)$/ });
  await crew.click();
  await expect(crew).toHaveAttribute('aria-pressed', 'true');
  const assignees = moment.getByTestId('assignee');
  await expect(assignees).toHaveCount(2);
  const anna = moment.getByRole('button', { name: new RegExp(`· Anna ${tag}$`) });
  await expect(anna).toHaveAttribute('aria-pressed', 'true');
  await anna.click();
  await expect(anna).toHaveAttribute('aria-pressed', 'false');
  await expect(crew).toHaveAttribute('aria-pressed', 'false');
  await expect(assignees).toHaveCount(1);
  await expect(assignees).toContainText(`Bram`);

  await page.reload();
  await expect(page.getByTestId('assignee')).toHaveCount(1);
  const filter = page.getByLabel(/^(Notes for|Notities voor)$/);
  await expect(filter.locator('option')).toHaveText([/Everyone|Iedereen/, `Bram ${tag}`]);
  const bram = await filter.locator('option', { hasText: `Bram ${tag}` }).getAttribute('value');
  // One filter, in the notes column's header, for both the list and the video (mockup 1e).
  await filter.selectOption(bram ?? '');
  await expect(page.getByTestId('moment')).toHaveCount(1);
  await expect(page.getByTestId('player-markers').getByRole('button')).toHaveCount(1);
});
