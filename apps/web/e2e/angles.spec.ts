import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openLineup, openProcessedClip, settledBox } from './helpers.ts';

// Angles per rower and phase (ADR-0017) on a video the real worker processed (edge stack only):
// a coach marks a catch, draws the boat line, measures two rowers' knees and an upper body, and
// reads the table with the difference in the crew.
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

/** Taps the picture at fractions of its width and height. */
async function tap(page: Page, points: [number, number][]) {
  const box = await settledBox(page, 'drawing-layer');
  // A finger where the device has one: the touch path is what coaches use (2026-11-03).
  const finger = test.info().project.use.hasTouch === true;
  await expect(page.locator('.drawing-confirm')).toHaveCount(0);
  for (const [index, [x, y]] of points.entries()) {
    if (finger) await page.touchscreen.tap(box.x + x * box.width, box.y + y * box.height);
    else await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
    if (index < points.length - 1) {
      await expect(page.locator('.drawing-confirm')).toHaveCount(0);
    }
  }
  // The entire picture must remain tappable, including on iPhone and a low laptop window.
  const completeBox = await settledBox(page, 'drawing-layer');
  const controls = await page.locator('.drawing-confirm').boundingBox();
  if (controls === null) throw new Error('drawing controls not visible');
  expect(controls.y).toBeGreaterThanOrEqual(completeBox.y + completeBox.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const targets = await page
    .locator('.drawing-confirm button, .drawing-confirm select')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
  for (const height of targets) expect(height).toBeGreaterThanOrEqual(44);
  // Points stay adjustable until saved (touch drawing, 2026-11-03).
  await page.getByTestId('drawing-save').click();
}

test('measure knees and the upper body at the catch, per rower, with the crew difference', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await openProcessedClip(page, readFileSync(FIXTURE), `Angles ${tag}`);
  const videoUrl = page.url();

  // A lineup: Anna at bow, Bram at stroke.
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

  // A catch at frame 0, then the Angles tab.
  await page.locator('h1').click();
  await page.keyboard.press('i');
  await expect(page.getByTestId('stroke-marks').locator('[data-frame="0"]')).toHaveCount(1);
  await page.getByRole('tab', { name: /^(Angles|Hoeken)/ }).click();
  const panel = page.getByTestId('angles');
  await expect(panel).toContainText(/(Catch|Inpik) · (stroke|haal) 1/);

  // The boat line: bow side left, stern side right.
  await panel.getByRole('button', { name: /^(Draw boat line|Bootlijn tekenen)$/ }).click();
  await expect(page.getByTestId('angle-prompt')).toBeVisible();
  await tap(page, [
    [0.1, 0.6],
    [0.9, 0.6],
  ]);
  await expect(page.getByTestId('boat-line')).toHaveCount(1);
  await expect(page.getByTestId('boat-line-here')).toContainText(/frame 0/);

  const measure = async (rower: RegExp, joint: RegExp, points: [number, number][]) => {
    await panel.getByRole('button', { name: rower }).click();
    await panel.getByRole('button', { name: joint }).click();
    await panel.getByRole('button', { name: /^(Measure|Meten) \(/ }).click();
    await tap(page, points);
  };
  const right: [number, number][] = [
    [0.4, 0.3],
    [0.4, 0.7],
    [0.6, 0.7],
  ];
  const straight: [number, number][] = [
    [0.3, 0.5],
    [0.5, 0.5],
    [0.7, 0.5],
  ];
  // Anna's knee bent square (90°), Bram's straight (180°), Anna's upper body upright.
  await measure(new RegExp(`· Anna ${tag}$`), /^(Knee|Knie)$/, right);
  await expect(page.getByTestId('measure-label')).toContainText(['90° · Anna']);
  await measure(new RegExp(`· Bram ${tag}$`), /^(Knee|Knie)$/, straight);
  await measure(new RegExp(`· Anna ${tag}$`), /^(Upper body|Bovenlichaam)$/, [
    [0.5, 0.65],
    [0.5, 0.35],
  ]);
  await expect(page.getByTestId('angle-here')).toHaveCount(3);
  await expect(page.getByTestId('angle-here').last()).toContainText(/upright|rechtop/);

  const knee = page.getByTestId('angle-table').filter({ hasText: /^(Knee|Knie)/ });
  await expect(knee).toContainText(`Anna ${tag}`);
  await expect(knee.getByRole('row', { name: new RegExp(`Anna ${tag}`) })).toContainText('90°');
  await expect(knee.getByRole('row', { name: new RegExp(`Bram ${tag}`) })).toContainText('180°');
  await expect(
    knee.getByRole('row', { name: /Difference in the crew|Verschil in de ploeg/ }),
  ).toContainText('90°');

  // A corner of a measurement can be moved after saving (#141): the value follows, the table too.
  const layer = await settledBox(page, 'drawing-layer');
  // Anna's knee: an upright arm (x = 0.4) and a horizontal one, 90°.
  await page.mouse.click(layer.x + 0.4 * layer.width, layer.y + 0.35 * layer.height);
  await expect(page.getByTestId('drawing-handle')).toHaveCount(3);
  await page.mouse.move(layer.x + 0.6 * layer.width, layer.y + 0.7 * layer.height);
  await page.mouse.down();
  // Straight down from the vertex: the knee becomes straight.
  await page.mouse.move(layer.x + 0.4 * layer.width, layer.y + 0.98 * layer.height, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('angle-here').first()).toContainText('180°');
  await page.reload();
  await page.getByRole('tab', { name: /^(Angles|Hoeken)/ }).click();
  await expect(page.getByTestId('angle-here').first()).toContainText('180°');
  await expect(knee.getByRole('row', { name: new RegExp(`Anna ${tag}`) })).toContainText('180°');
  await expect(
    knee.getByRole('row', { name: /Difference in the crew|Verschil in de ploeg/ }),
  ).toContainText('0°');

  // Measuring Anna's knee again replaces it: still three on this frame, now 180° for both.
  await measure(new RegExp(`· Anna ${tag}$`), /^(Knee|Knie)$/, straight);
  await expect(page.getByTestId('angle-here')).toHaveCount(3);
  await expect(
    knee.getByRole('row', { name: /Difference in the crew|Verschil in de ploeg/ }),
  ).toContainText('0°');

  // A frame without a stroke mark can't be measured.
  await page.locator('h1').click();
  await page.keyboard.press('.');
  await expect(page.getByTestId('player-frame')).toHaveText('1');
  await expect(panel).toContainText(/Step to a catch|Stap naar een inpik/);
  await expect(panel.getByRole('button', { name: /^(Measure|Meten) \(/ })).toHaveCount(0);

  // A second boat line from here on (a moving camera turns the boat); frame 0 keeps the first.
  await panel
    .getByRole('button', {
      name: /^(New boat line from this frame|Nieuwe bootlijn vanaf dit frame)$/,
    })
    .click();
  await tap(page, [
    [0.1, 0.55],
    [0.9, 0.65],
  ]);
  await expect(page.getByTestId('boat-line')).toHaveCount(2);
  await expect(page.getByTestId('boat-line-here')).toContainText(/frame 1\b/);
  await page.locator('h1').click();
  await page.keyboard.press(',');
  await expect(page.getByTestId('player-frame')).toHaveText('0');
  await expect(page.getByTestId('boat-line-here')).toContainText(/frame 0\b/);
});
