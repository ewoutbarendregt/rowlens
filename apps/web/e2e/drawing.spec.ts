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
  const drawings = page.getByTestId('drawing');
  await expect(drawings).toHaveCount(2);
  await expect(drawings.filter({ hasText: /(Angle|Hoek) 90°/ })).toHaveCount(1);

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
  await drawings
    .filter({ hasText: /(Arrow|Pijl)/ })
    .getByRole('button', { name: /^(Delete|Verwijderen)$/ })
    .click();
  await expect(shapes).toHaveCount(1);
});
