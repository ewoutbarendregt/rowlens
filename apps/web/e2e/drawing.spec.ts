import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip, settledBox } from './helpers.ts';

// Drawings at a frame (#60) on a video the real worker processed (edge stack only).
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

/** Clicks at a fraction of the picture (the drawing layer covers exactly the picture here). */
async function at(page: Page, fx: number, fy: number) {
  const box = await settledBox(page, 'drawing-layer');
  // A finger where the device has one: the touch path is what coaches use (2026-11-03).
  if (test.info().project.use.hasTouch === true) {
    await page.touchscreen.tap(box.x + fx * box.width, box.y + fy * box.height);
  } else {
    await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
  }
}

/** Drags with the mouse from one fraction of the picture to another. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.getByTestId('drawing-layer').boundingBox();
  if (box === null) throw new Error('drawing layer not visible');
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 8 });
  await page.mouse.up();
}

test('draw an angle and an arrow at a frame; they remain visible for the note hold', async ({
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
  await expect(angle).toBeEnabled(); // the signed-in account supplies the author
  await angle.click();
  // Arms horizontal and vertical in picture pixels: exactly 90° whatever the picture's shape.
  await at(page, 0.75, 0.5);
  await at(page, 0.5, 0.5);
  await at(page, 0.5, 0.15);
  const label = page.getByTestId('angle-label');
  await expect(label).toHaveText('90°');
  // Nothing is saved until Save (touch drawing, 2026-11-03): the points can still be dragged.
  const save = page.getByTestId('drawing-save');
  await expect(save).toBeEnabled();
  const box = await page.getByTestId('drawing-layer').boundingBox();
  const wide = (box?.width ?? 1) / (box?.height ?? 1); // the picture's aspect ratio
  const tip45: [number, number] = [0.5 + 0.35 / wide, 0.15];
  await drag(page, [0.5, 0.15], tip45);
  await expect(label).toHaveText('45°');
  await drag(page, tip45, [0.5, 0.15]);
  await expect(label).toHaveText('90°');
  await save.click();
  await expect(save).toHaveCount(0);

  await page.getByRole('button', { name: /^(Arrow|Pijl)$/ }).click();
  // A swipe across the picture places nothing; only taps do.
  await drag(page, [0.1, 0.9], [0.3, 0.7]);
  await expect(save).toHaveCount(0);
  await at(page, 0.2, 0.8);
  await at(page, 0.4, 0.6);
  await save.click();

  const shapes = page.locator('[data-testid=drawing-layer] g[data-kind]');
  await expect(shapes).toHaveCount(2);
  // Several drawings on one frame are one entry, with room for one explanation.
  const moment = page.getByTestId('moment');
  const drawings = moment.getByTestId('drawing');
  await expect(moment).toHaveCount(1);
  await expect(drawings).toHaveCount(2);
  await expect(drawings.filter({ hasText: /(Angle|Hoek) 90°/ })).toHaveCount(1);
  await expect(page.getByTestId('player-markers').getByRole('button')).toHaveCount(1);
  // The explanation field is always open in the frame's section.
  const explanation = moment.getByRole('textbox');
  await explanation.fill('Rug te vroeg open; hoek knie te klein bij de inpik.');
  await moment.getByRole('button', { name: /^(Save|Opslaan)$/ }).click();
  await expect(moment).toHaveCount(1);
  await expect(explanation).toHaveValue('Rug te vroeg open; hoek knie te klein bij de inpik.');

  // Esc leaves the tool; then a click on the picture plays/pauses again instead of drawing.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^(Arrow|Pijl)$/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.locator('h1').click();
  await page.keyboard.press('.');
  await expect(frame).toHaveText('11');
  await expect(shapes).toHaveCount(2);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(frame).toHaveText('41');
  await expect(shapes).toHaveCount(0);
  await page.getByTestId('player-markers').getByRole('button').click();
  await expect(frame).toHaveText('10');
  await expect(shapes).toHaveCount(2);

  // Confirmations are in the page, not browser popups.
  page.on('dialog', () => {
    throw new Error('no browser dialogs expected');
  });
  await drawings.getByRole('button', { name: /^(Delete Arrow|Pijl verwijderen)$/ }).click();
  await drawings
    .getByTestId('confirm')
    .getByRole('button', { name: /^(Yes|Ja)$/ })
    .click();
  await expect(shapes).toHaveCount(1);
  await expect(drawings).toHaveCount(1);
  await expect(moment).toHaveCount(1);

  // The whole note goes at once: remaining drawing, explanation and marker.
  const deleteNote = moment.getByRole('button', { name: /^(Delete note|Notitie verwijderen)$/ });
  await deleteNote.click();
  await expect(moment.getByTestId('confirm')).toContainText(/frame 10/);
  await moment.getByRole('button', { name: /^(Cancel|Annuleren)$/ }).click();
  await expect(moment).toHaveCount(1); // cancelled: nothing gone
  await expect(shapes).toHaveCount(1);
  await deleteNote.click();
  await moment.getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }).click();
  await expect(moment).toHaveCount(0);
  await expect(shapes).toHaveCount(0);
  await expect(page.getByTestId('player-markers')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('player-frame')).toBeVisible();
  await expect(moment).toHaveCount(0);
});

test('drawing on the zoomed picture lands where tapped and zooms with it', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  await openProcessedClip(
    page,
    readFileSync(FIXTURE),
    `Zoom ${info.project.name} ${String(Date.now())}`,
  );
  await page.locator('h1').click();
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect(page.getByTestId('zoom-level')).toHaveText('225%');

  // A level line across the middle of the zoomed view.
  await page.getByRole('button', { name: /^(Line|Lijn)$/ }).click();
  await at(page, 0.3, 0.5);
  await at(page, 0.7, 0.5);
  await page.getByTestId('drawing-save').click();
  const line = page.locator('[data-testid=drawing-layer] g[data-kind=line] line').first();
  const layer = await settledBox(page, 'drawing-layer');
  /** The line's ends on screen; the box includes the round-capped stroke, as wide as it is high. */
  const ends = async () => {
    const b = await line.boundingBox();
    if (b === null) throw new Error('no line');
    return { left: b.x + b.height / 2, right: b.x + b.width - b.height / 2 };
  };
  // On screen it sits where it was tapped.
  const zoomed = await ends();
  expect(Math.abs(zoomed.left - (layer.x + 0.3 * layer.width))).toBeLessThan(4);
  expect(Math.abs(zoomed.right - (layer.x + 0.7 * layer.width))).toBeLessThan(4);
  // Back to the whole picture, the line shrinks with it about the same centre.
  await page.locator('h1').click();
  await page.keyboard.press('0');
  await expect(page.getByTestId('zoom-level')).toHaveCount(0);
  await expect
    .poll(async () => {
      const e = await ends();
      return e.right - e.left;
    })
    .toBeCloseTo((0.4 / 2.25) * layer.width, -1);
  const whole = await ends();
  expect(Math.abs((whole.left + whole.right) / 2 - (layer.x + layer.width / 2))).toBeLessThan(4);
  // In the picture it is the middle 0.4 / 2.25 of its width (the viewBox is whole again).
  const picture = await line.evaluate((l) => {
    const width = l.closest('svg')?.viewBox.baseVal.width ?? 1;
    return [Number(l.getAttribute('x1')) / width, Number(l.getAttribute('x2')) / width];
  });
  expect(picture[0]).toBeCloseTo(0.5 - 0.2 / 2.25, 2);
  expect(picture[1]).toBeCloseTo(0.5 + 0.2 / 2.25, 2);
});
