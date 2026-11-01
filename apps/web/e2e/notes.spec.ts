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

  const note = page.getByTestId('note');
  await expect(note).toHaveCount(1);
  await expect(note).toContainText('Frame 10');
  await expect(note).toContainText('E2E coach');
  await expect(note).toContainText('Catch: blade not yet square');
  const marker = page.getByTestId('player-markers').getByRole('button');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAccessibleName(/frame 10: Catch: blade not yet square/);

  // Away, then back through the list and through the marker.
  await page.locator('h1').click();
  for (let n = 1; n <= 5; n++) await page.keyboard.press('.');
  await expect(frame).toHaveText('15');
  await note.getByRole('button', { name: /^(Go to|Naar) frame 10/ }).click();
  await expect(frame).toHaveText('10');
  await page.locator('h1').click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frame).toHaveText('40');
  await marker.click();
  await expect(frame).toHaveText('10');

  // The name is remembered on this device; the note survives a reload.
  await page.reload();
  await expect(page.getByLabel(/^(Your name|Je naam)$/)).toHaveValue('E2E coach');
  await expect(note).toContainText('Catch: blade not yet square');

  await note.getByRole('button', { name: /^(Edit|Bewerken)$/ }).click();
  await note.getByRole('textbox').fill('Catch: blade square 2 frames late');
  await note.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(note).toContainText('blade square 2 frames late');

  page.once('dialog', (d) => void d.accept());
  await note.getByRole('button', { name: /^(Delete|Verwijderen)$/ }).click();
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId('player-markers')).toHaveCount(0);
});
