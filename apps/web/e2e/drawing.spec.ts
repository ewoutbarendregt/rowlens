import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip } from './helpers.ts';

// Drawings at a frame (#60) on a video the real worker processed (edge stack only).
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

/** Clicks at a fraction of the picture (the drawing layer covers exactly the picture here). */
async function at(page: Page, fx: number, fy: number) {
  const box = await page.getByTestId('drawing-layer').boundingBox();
  if (box === null) throw new Error('drawing layer not visible');
  await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
}

test('draw an angle and an arrow at a frame; they show only on that frame', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  await openProcessedClip(
    page,
    readFileSync(FIXTURE),
    `Draw ${info.project.name} ${String(Date.now())}`,
  );
  const frame = page.getByTestId('player-frame');
  for (let n = 1; n <= 10; n++) await page.keyboard.press('.');
  await expect(frame).toHaveText('10');

  const angle = page.getByRole('button', { name: /^(Angle|Hoek)$/ });
  await expect(angle).toBeDisabled(); // a drawing needs the author's name
  await page.getByLabel(/^(Your name|Je naam)$/).fill('E2E coach');
  await angle.click();
  // Arms horizontal and vertical in picture pixels: exactly 90° whatever the picture's shape.
  await at(page, 0.75, 0.5);
  await at(page, 0.5, 0.5);
  await at(page, 0.5, 0.15);
  await expect(page.getByTestId('angle-label')).toHaveText('90°');

  await page.getByRole('button', { name: /^(Arrow|Pijl)$/ }).click();
  await at(page, 0.2, 0.8);
  await at(page, 0.4, 0.6);

  const shapes = page.locator('[data-testid=drawing-layer] g[data-kind]');
  await expect(shapes).toHaveCount(2);
  // Several drawings on one frame are one entry, with room for one explanation.
  const moment = page.getByTestId('moment');
  const drawings = moment.getByTestId('drawing');
  await expect(moment).toHaveCount(1);
  await expect(drawings).toHaveCount(2);
  await expect(drawings.filter({ hasText: /(Angle|Hoek) 90°/ })).toHaveCount(1);
  await expect(page.getByTestId('player-markers').getByRole('button')).toHaveCount(1);
  await moment.getByRole('button', { name: /^(Add explanation|Uitleg toevoegen)$/ }).click();
  await moment.getByRole('textbox').fill('Rug te vroeg open; hoek knie te klein bij de inpik.');
  await moment.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(moment).toHaveCount(1);
  await expect(moment.getByTestId('note')).toContainText('Rug te vroeg open');
  await expect(
    moment.getByRole('button', { name: /^(Add explanation|Uitleg toevoegen)$/ }),
  ).toHaveCount(0);

  // Esc leaves the tool; then a click on the picture plays/pauses again instead of drawing.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^(Arrow|Pijl)$/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.locator('h1').click();
  await page.keyboard.press('.');
  await expect(frame).toHaveText('11');
  await expect(shapes).toHaveCount(0);
  await page.keyboard.press(',');
  await expect(frame).toHaveText('10');
  await expect(shapes).toHaveCount(2);

  page.once('dialog', (d) => void d.accept());
  await drawings.getByRole('button', { name: /^(Delete Arrow|Pijl verwijderen)$/ }).click();
  await expect(shapes).toHaveCount(1);
  await expect(drawings).toHaveCount(1);
  await expect(moment).toHaveCount(1);
});
