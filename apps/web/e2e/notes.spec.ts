import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip } from './helpers.ts';

// Notes pinned to a frame (#59) on a video the real worker processed (edge stack only).
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

test('write a note at a frame, jump back to it, edit and delete it', async ({ page }, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  await openProcessedClip(
    page,
    readFileSync(FIXTURE),
    `Notes ${info.project.name} ${String(Date.now())}`,
  );
  const frame = page.getByTestId('player-frame');

  for (let n = 1; n <= 10; n++) await page.keyboard.press('.');
  await expect(frame).toHaveText('10');

  await page
    .getByLabel(/^(Note at frame 10|Notitie bij frame 10) \(/)
    .fill('Catch: blade not yet square');
  await page.getByLabel(/^(Your name|Je naam)$/).fill('E2E coach');
  await page.getByRole('button', { name: /^(Save note|Notitie opslaan)$/ }).click();

  // The frame now has a section with the explanation in an always-open field.
  const moment = page.getByTestId('moment');
  const explanation = moment.getByRole('textbox');
  await expect(moment).toHaveCount(1);
  await expect(moment).toContainText('Frame 10');
  await expect(moment).toContainText('E2E coach');
  await expect(explanation).toHaveValue('Catch: blade not yet square');
  await expect(moment).toHaveAttribute('aria-current', 'true'); // the frame on screen
  // One field per frame: the top field is only for frames without a section.
  await expect(page.getByLabel(/^(Note at frame 10|Notitie bij frame 10) \(/)).toHaveCount(0);
  const marker = page.getByTestId('player-markers').getByRole('button');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAccessibleName(/frame 10: Catch: blade not yet square/);

  // Away, then back: through the Frame link, the marker, and a click anywhere in the section.
  await page.locator('h1').click();
  for (let n = 1; n <= 5; n++) await page.keyboard.press('.');
  await expect(frame).toHaveText('15');
  await expect(moment).not.toHaveAttribute('aria-current', 'true');
  await moment.getByRole('button', { name: /^(Go to|Naar) frame 10/ }).click();
  await expect(frame).toHaveText('10');
  await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frame).toHaveText('40');
  await marker.click();
  await expect(frame).toHaveText('10');
  await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frame).toHaveText('40');
  await moment.getByText('E2E coach').click();
  await expect(frame).toHaveText('10');
  await expect(moment).toHaveAttribute('aria-current', 'true');

  // The name is remembered on this device; the explanation survives a reload.
  await page.reload();
  await expect(page.getByLabel(/^(Your name|Je naam)$/)).toHaveValue('E2E coach');
  await expect(explanation).toHaveValue('Catch: blade not yet square');

  // Edit in place; Save only shows once something changed.
  await expect(moment.getByRole('button', { name: /^(Save|Opslaan)$/ })).toHaveCount(0);
  await explanation.fill('Catch: blade square 2 frames late');
  await moment.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(explanation).toHaveValue('Catch: blade square 2 frames late');
  await page.reload();
  await expect(explanation).toHaveValue('Catch: blade square 2 frames late');

  // Emptied and saved, the explanation goes; with no drawings, so does the section.
  await explanation.fill('');
  await moment.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(moment).toHaveCount(0);
  await expect(page.getByTestId('player-markers')).toHaveCount(0);
});
