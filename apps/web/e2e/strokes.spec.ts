import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Locator, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip } from './helpers.ts';

// Stroke marks (#85) on a video the real worker processed (edge stack only): the coach marks
// catches and finishes with the keys; the Strokes tab shows each stroke's timings at 30 fps.
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

async function stepTo(page: Page, target: number) {
  const frame = page.getByTestId('player-frame');
  const now = Number(await frame.textContent());
  for (let n = now; n < target; n++) {
    await page.keyboard.press('.');
    await expect(frame).toHaveText(String(n + 1));
  }
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

  // ↑ and ↓ step to the previous and the next catch (Ewout, 2026-11-03).
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('player-frame')).toHaveText('50');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('player-frame')).toHaveText('85');

  // The same key on a marked frame takes the mark off: two complete strokes, no averages.
  await page.keyboard.press('i');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId('stroke-averages')).toHaveCount(0);
  await expect(panel.getByRole('status')).toContainText(/3/);

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

for (const language of ['nl', 'en'] as const) {
  test(`delete individual moments from a stroke row, cancel and handle failure (${language})`, async ({
    page,
  }, info) => {
    test.skip(!existsSync(FIXTURE), 'run pnpm demo:media --e2e first');
    await page.addInitScript((chosen) => {
      localStorage.setItem('rowlens.lang', chosen);
    }, language);
    await openProcessedClip(
      page,
      readFileSync(FIXTURE),
      `Inline moments ${language} ${info.project.name} ${String(Date.now())}`,
    );
    const activate = async (button: Locator) => {
      if (info.project.use.hasTouch === true) await button.tap();
      else await button.click();
    };
    await activate(page.getByRole('tab', { name: /^(Strokes|Halen)/ }));
    const panel = page.getByTestId('strokes');
    const frame = page.getByTestId('player-frame');
    for (const [at, name] of [
      [0, /^(Catch|Inpik) /],
      [8, /^(Half slide|Halve bank) /],
      [15, /^(Finish|Uitpik) /],
      [30, /^(Catch|Inpik) /],
      [45, /^(Half slide|Halve bank) /],
    ] as const) {
      await page.locator('input[type=range]').fill(String(at));
      await expect(frame).toHaveText(String(at));
      await activate(panel.getByRole('button', { name }));
      await expect(
        page.getByTestId('stroke-marks').locator(`[data-frame="${String(at)}"]`),
      ).toHaveCount(1);
    }
    await expect(panel.getByTestId('stroke-mark-editor')).toHaveCount(0);
    const rows = panel.getByTestId('stroke-row');
    const editRow = (n: number) =>
      rows.nth(n).getByRole('button', { name: /^(Choose a moment|Kies een moment)/ });
    await expect(rows).toHaveCount(2);
    for (let n = 0; n < 2; n++) await expect(editRow(n)).toBeVisible();
    await activate(editRow(0));
    const editor = panel.getByTestId('stroke-row-editor');
    const item = (at: number) =>
      panel.locator(`[data-testid=stroke-mark][data-frame="${String(at)}"]`);
    const remove = (at: number) => item(at).getByRole('button', { name: /^(Delete|Verwijder)/ });
    await expect(editor.getByTestId('stroke-mark')).toHaveCount(3);
    const tableWrap = panel.locator('.table-wrap');
    const assertTableFits = async () => {
      const size = await tableWrap.evaluate((el) => ({
        width: el.clientWidth,
        scroll: el.scrollWidth,
        left: el.scrollLeft,
      }));
      expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
      expect(size.left).toBe(0);
    };
    await assertTableFits();
    const headers = await panel
      .locator('thead th')
      .evaluateAll((cells) => cells.map((c) => ({ width: c.clientWidth, scroll: c.scrollWidth })));
    for (const cell of headers) expect(cell.scroll).toBeLessThanOrEqual(cell.width + 1);
    const rowTargets = await rows
      .first()
      .locator('.strokes__actions button')
      .evaluateAll((bs) =>
        bs.map((b) => ({
          width: b.getBoundingClientRect().width,
          height: b.getBoundingClientRect().height,
        })),
      );
    for (const target of rowTargets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }

    await expect(item(30)).toHaveCount(0); // the next catch belongs to the next stroke
    await activate(remove(15));
    await expect(item(15).getByTestId('confirm')).toContainText(/Finish|Uitpik/);
    await activate(item(15).getByRole('button', { name: /^(Cancel|Annuleren)$/ }));
    await expect(item(15)).toBeVisible();
    await activate(remove(15));
    const confirm = item(15).getByTestId('confirm');
    const box = await confirm.boundingBox();
    if (box === null) throw new Error('confirmation not visible');
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
    for (const height of await confirm
      .getByRole('button')
      .evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height)))
      expect(height).toBeGreaterThanOrEqual(44);
    await assertTableFits();
    if (language === 'nl')
      await page.screenshot({ path: info.outputPath('inline-moment-deletion.png') });
    await activate(confirm.getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }));
    await expect(item(15)).toHaveCount(0);
    await expect(rows.first()).toContainText(/finish missing|uitpik ontbreekt/);
    await expect(frame).toHaveText('45');
    await expect(page.getByTestId('stroke-marks').locator('[data-frame="30"]')).toHaveCount(1);
    await page.reload();
    await activate(page.getByRole('tab', { name: /^(Strokes|Halen)/ }));
    await activate(editRow(0));
    await expect(item(15)).toHaveCount(0);
    await expect(editor.getByTestId('stroke-mark')).toHaveCount(2);
    const denied = '**/api/videos/*/strokes/0';
    await page.route(denied, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"error":"test_failure"}',
      }),
    );
    await activate(remove(0));
    await activate(item(0).getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }));
    await expect(panel.getByRole('alert')).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(item(0)).toBeVisible();
    await page.unroute(denied);
    await activate(remove(0));
    await activate(item(0).getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }));
    await expect(rows).toHaveCount(1);
    // A half-slide left before the first catch stays individually removable.
    await expect(panel.getByTestId('stroke-loose-marks').getByTestId('stroke-mark')).toHaveCount(1);
    await activate(remove(8));
    await activate(item(8).getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }));
    await expect(item(8)).toHaveCount(0);
    await activate(editRow(0));
    await expect(editor.getByTestId('stroke-mark')).toHaveCount(2);
    await activate(remove(30));
    await activate(item(30).getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }));
    await expect(rows).toHaveCount(0);
    await activate(remove(45));
    await activate(item(45).getByRole('button', { name: /^(Yes, delete|Ja, verwijderen)$/ }));
    await expect(page.getByTestId('stroke-marks')).toHaveCount(0);
    await page.reload();
    await activate(page.getByRole('tab', { name: /^(Strokes|Halen)/ }));
    await expect(panel).toContainText(/No strokes marked yet|Nog geen halen gemarkeerd/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('mark catch and finish beside the picture, toggle, use keyboard and fullscreen', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run pnpm demo:media --e2e first');
  await openProcessedClip(
    page,
    readFileSync(FIXTURE),
    `Frame tools ${info.project.name} ${String(Date.now())}`,
  );
  const activate = async (button: Locator) => {
    if (info.project.use.hasTouch === true) await button.tap();
    else await button.click();
  };
  const tools = page.getByTestId('stroke-frame-tools');
  const down = tools.getByRole('button', { name: /^(Catch|Inpik)$/ });
  const up = tools.getByRole('button', { name: /^(Finish|Uitpik)$/ });
  const strip = page.getByTestId('stroke-marks');
  const frame = page.getByTestId('player-frame');
  await expect(page.getByRole('tab', { name: /^(Notes|Notities)/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.evaluate(() => {
    document.addEventListener(
      'click',
      (event) => {
        if (
          event.detail > 0 &&
          event.target instanceof Element &&
          event.target.closest('.stroke-frame-tools') !== null
        ) {
          event.stopImmediatePropagation();
          event.preventDefault();
        }
      },
      true,
    );
  });
  await activate(down);
  await expect(strip.locator('[data-kind=catch][data-frame="0"]')).toHaveCount(1);
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  // PressButton must not toggle twice through its compatibility click.
  await activate(down);
  await expect(strip.locator('[data-kind=catch]')).toHaveCount(0);
  await down.focus();
  await page.keyboard.press('Enter');
  await expect(strip.locator('[data-kind=catch]')).toHaveCount(1);
  await page.locator('input[type=range]').fill('15');
  await expect(frame).toHaveText('15');
  await activate(up);
  await expect(strip.locator('[data-kind=finish][data-frame="15"]')).toHaveCount(1);
  const measure = async () => {
    await tools.scrollIntoViewIfNeeded();
    const t = await tools.boundingBox();
    const stage = await page.locator('.player__stage').boundingBox();
    if (t === null || stage === null) throw new Error('player tools not visible');
    expect(t.y + t.height).toBeLessThanOrEqual(stage.y + 1);
    for (const height of await tools
      .getByRole('button')
      .evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().height)))
      expect(height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  };
  await measure();
  await page.screenshot({ path: info.outputPath('stroke-frame-tools.png') });
  await activate(page.getByRole('button', { name: /^(Full screen|Volledig scherm)$/ }));
  await expect(page.locator('.player')).toHaveClass(/player--fullscreen/);
  await measure();
  await expect(down).toHaveCSS('color', 'rgb(230, 238, 242)');
  await expect(up).toHaveCSS('background-color', 'rgb(250, 203, 141)');
  await page.locator('input[type=range]').fill('30');
  await expect(frame).toHaveText('30');
  await activate(down);
  await expect(strip.locator('[data-kind=catch][data-frame="30"]')).toHaveCount(1);
  await expect(down).toHaveCSS('background-color', 'rgb(250, 203, 141)');
  await page.screenshot({
    path: info.outputPath('stroke-frame-tools-fullscreen.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(strip.locator('[data-kind=catch]')).toHaveCount(2);
  await expect(strip.locator('[data-kind=finish]')).toHaveCount(1);
});
