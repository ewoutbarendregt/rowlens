import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip, settledBox } from './helpers.ts';

// The boat line found in every frame (ADR-0018) on a drawn boat the real worker processes (edge
// stack only): the hull's bottom edge is at y = 228 of 360, from x = 120 to 520.
const FIXTURE = fileURLToPath(new URL('../public/demo-media/e2e-boat.webm', import.meta.url));
test.skip(edgeUrl === undefined, 'needs the worker: pnpm edge:up && pnpm e2e:edge');

test('the worker finds the waterline; the coach sets the bow and corrects it', async ({
  page,
}, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await openProcessedClip(page, readFileSync(FIXTURE), `Boat line ${tag}`);
  await page.getByRole('tab', { name: /^(Angles|Hoeken)/ }).click();
  const panel = page.getByTestId('angles');
  const status = panel.getByTestId('auto-boat-line');

  // Queued after processing; the page looks again until it's there.
  await expect(status).toContainText(/(Found automatically in|Automatisch gevonden in) 100%/, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('boat-line-here')).toContainText(
    /found automatically|automatisch gevonden/,
  );

  // Dotted on the picture, on the hull's bottom edge.
  const line = page.locator('[data-testid=drawing-layer] g.drawing--auto line.drawing__line');
  await expect(line).toHaveCount(1);
  expect(await line.evaluate((l) => (l as SVGLineElement).style.strokeDasharray)).not.toBe('');
  const at = await line.evaluate((l) => {
    const box = l.closest('svg')?.viewBox.baseVal;
    const n = (name: string) => Number(l.getAttribute(name));
    return {
      x1: n('x1') / (box?.width ?? 1),
      x2: n('x2') / (box?.width ?? 1),
      y: (n('y1') + n('y2')) / 2 / (box?.height ?? 1),
    };
  });
  expect(at.y).toBeCloseTo(228 / 360, 1);
  expect(Math.abs(at.x1 - 120 / 640)).toBeLessThan(0.03);
  expect(Math.abs(at.x2 - 520 / 640)).toBeLessThan(0.03);

  // Which end is the bow: nobody's line says it, so the coach picks it.
  const right = panel.getByRole('button', { name: /^(right|rechts)$/ });
  await right.click();
  await expect(right).toHaveAttribute('aria-pressed', 'true');

  // A coach's own line on this frame wins there, and the search runs again from it.
  await panel.getByRole('button', { name: /^(Correct it here|Hier verbeteren)$/ }).click();
  const box = await settledBox(page, 'drawing-layer');
  for (const [x, y] of [
    [0.85, 0.63],
    [0.15, 0.63],
  ] as const) {
    await page.mouse.click(box.x + x * box.width, box.y + y * box.height);
  }
  await page.getByTestId('drawing-save').click();
  await expect(page.getByTestId('boat-line')).toHaveCount(1);
  await expect(page.getByTestId('boat-line-here')).toContainText(/frame 0/);
  await expect(status).toContainText(/(Found automatically in|Automatisch gevonden in) 100%/, {
    timeout: 60_000,
  });
  // The coach's line says where the bow is now, so the choice isn't asked any more.
  await expect(right).toHaveCount(0);
});

test('the found boat line is corrected by dragging its ends (#141)', async ({ page }, info) => {
  test.skip(!existsSync(FIXTURE), 'run `pnpm demo:media --e2e` first');
  const tag = `${info.project.name.replace(/\W/g, '')}${String(Date.now())}`;
  await openProcessedClip(page, readFileSync(FIXTURE), `Boat drag ${tag}`);
  await page.getByRole('tab', { name: /^(Angles|Hoeken)/ }).click();
  const panel = page.getByTestId('angles');
  await expect(panel.getByTestId('auto-boat-line')).toContainText(
    /(Found automatically in|Automatisch gevonden in) 100%/,
    { timeout: 60_000 },
  );
  // Which end is the bow: only then do the ends have a meaning (ADR-0018).
  await panel.getByRole('button', { name: /^(right|rechts)$/ }).click();
  const auto = page.locator('[data-testid=drawing-layer] g.drawing--auto line.drawing__line');
  await expect(auto).toHaveCount(1);

  // Press the dotted line, then drag its bow end (the right one) down the picture.
  const box = await settledBox(page, 'drawing-layer');
  await page.mouse.click(box.x + 0.5 * box.width, box.y + (228 / 360) * box.height);
  await expect(page.getByTestId('drawing-handle')).toHaveCount(2);
  await page.mouse.move(box.x + (520 / 640) * box.width, box.y + (228 / 360) * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + 0.9 * box.width, box.y + 0.85 * box.height, { steps: 8 });
  await page.mouse.up();

  // Your own line from this frame on: it wins there, and the search starts again from it.
  await expect(page.getByTestId('boat-line')).toHaveCount(1);
  await expect(page.getByTestId('boat-line-here')).toContainText(/frame 0/);
  await expect(page.locator('[data-testid=drawing-layer] g.drawing--boat')).toHaveCount(1);
  await expect(auto).toHaveCount(0);
});
