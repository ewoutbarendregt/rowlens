import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip } from './helpers.ts';

// Stroke marks (#85) on a video the real worker processed (edge stack only): the coach marks
// catches and finishes with the keys; the Strokes tab shows each stroke's timings at 30 fps.
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

async function stepTo(page: Page, target: number) {
  const frame = page.getByTestId('player-frame');
  const now = Number(await frame.textContent());
  for (let n = now; n < target; n++) await page.keyboard.press('.');
  await expect(frame).toHaveText(String(target));
}

test('mark strokes with the keys and read rate, drive, recovery and ratio', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  await openProcessedClip(
    page,
    readFileSync(FIXTURE),
    `Strokes ${info.project.name} ${String(Date.now())}`,
  );
  await page.getByRole('tab', { name: /^(Strokes|Halen)/ }).click();
  const panel = page.getByTestId('strokes');
  await expect(panel).toContainText(/No strokes marked yet|Nog geen halen gemarkeerd/);
  // Without marks the jumps to a stroke moment are off, and say how to get them (2026-11-04).
  const prevMoment = page.getByRole('button', {
    name: /^(Previous stroke moment|Vorig haalmoment)$/,
  });
  const nextMoment = page.getByRole('button', {
    name: /^(Next stroke moment|Volgend haalmoment)$/,
  });
  await expect(prevMoment).toBeDisabled();
  await expect(nextMoment).toBeDisabled();
  await expect(page.getByTestId('moments-hint')).toHaveText(
    /Mark a stroke moment to jump there|Geef een haalmoment aan om daarheen te springen/,
  );
  await page.locator('h1').click();

  // Catches every 40, 35 and 30 frames, finishes 20, 15 and 15 frames after them.
  const plan: [number, string][] = [
    [10, 'i'],
    [30, 'u'],
    [50, 'i'],
    [65, 'u'],
    [85, 'i'],
    [100, 'u'],
    [115, 'i'],
  ];
  const catchButton = panel.getByRole('button', { name: /^(Catch|Inpik)/ });
  for (const [at, key] of plan) {
    await stepTo(page, at);
    await page.keyboard.press(key);
    await expect(
      page.getByTestId('stroke-marks').locator(`[data-frame="${String(at)}"]`),
    ).toHaveCount(1);
  }
  await expect(catchButton).toHaveAttribute('aria-pressed', 'true'); // a catch on the frame on screen

  // Back and forth over the moments; quick taps each go one further.
  const frame = page.getByTestId('player-frame');
  await expect(page.getByTestId('moments-hint')).toHaveCount(0);
  await expect(nextMoment).toBeDisabled(); // 115 is the last moment
  await prevMoment.click();
  await expect(frame).toHaveText('100');
  await prevMoment.click();
  await prevMoment.click();
  await expect(frame).toHaveText('65');
  await nextMoment.click();
  await expect(frame).toHaveText('85');

  // Under the video: the catch an arrow down, the finish an arrow up (Ewout, 2026-11-03).
  const strip = page.getByTestId('stroke-marks');
  await expect(strip.locator('[data-kind="catch"] svg')).toHaveCount(4);
  await expect(strip.locator('[data-kind="finish"] svg')).toHaveCount(3);
  // The middle of the drive, calculated, only when turned on: halfway catch → finish.
  const middles = strip.locator('[data-kind="drive_middle"]');
  await expect(middles).toHaveCount(0);
  await panel.getByRole('checkbox').check();
  await expect(middles).toHaveCount(3);
  await expect(middles.first()).toHaveAttribute('data-frame', '20');
  await expect(middles.nth(1)).toHaveAttribute('data-frame', '58');
  await panel.getByRole('checkbox').uncheck();
  await expect(middles).toHaveCount(0);
  await page.locator('h1').click();

  const rows = page.getByTestId('stroke-row');
  await expect(rows).toHaveCount(4);
  // Stroke 1: 40 frames → 45.0 spm, drive 20 frames = 0.67 s, recovery 20 frames, 1 : 1.0.
  await expect(rows.first()).toContainText(/0[,.]67/);
  await expect(rows.first()).toContainText(/1 : 1[,.]0/);
  await expect(rows.first()).toContainText(/45[,.]0/);
  // The last stroke has no next catch: no rate, and it says so.
  await expect(rows.last()).toContainText(/last stroke|laatste haal/);
  // Three complete strokes: averages, rate (45 + 51.4 + 60) / 3.
  await expect(page.getByTestId('stroke-averages')).toContainText(/52[,.]1/);

  // The same key on a marked frame takes the mark off: two complete strokes, no averages.
  await page.keyboard.press('i');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('stroke-averages')).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText(/3/);

  // ↑ goes to the previous catch.
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('player-frame')).toHaveText('85');

  // Loop stroke 1: from its catch up to the frame before the next one.
  await panel.getByRole('button', { name: /^(Loop stroke 1|Haal 1 in een lus)$/ }).click();
  await expect(page.getByTestId('player-frame')).toHaveText('10');
  await expect(page.getByRole('button', { name: /^(Loop|Lus)$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // The marks are saved: after a reload they are still there.
  await page.reload();
  await page.getByRole('tab', { name: /^(Strokes|Halen)/ }).click();
  await expect(page.getByTestId('stroke-row')).toHaveCount(3);
});
