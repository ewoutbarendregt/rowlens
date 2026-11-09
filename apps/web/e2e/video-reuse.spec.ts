import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers.ts';
import { withBasePath } from '../src/shared/base-path.ts';
test.skip(process.env['E2E_VIDEO_REUSE'] !== 'true', 'run pnpm --filter @rowlens/web e2e:reuse');

async function mutate(page: Page, method: string, path: string, data?: unknown) {
  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === 'rowlens_csrf')?.value ?? '';
  return page.request.fetch(withBasePath('/projects/rowlens', path), {
    method,
    headers: {
      origin: new URL(page.url()).origin,
      'x-csrf-token': csrf,
      'sec-fetch-site': 'same-origin',
    },
    ...(data === undefined ? {} : { data }),
  });
}
async function ownTraining(page: Page, title: string) {
  const r = await mutate(page, 'POST', '/api/sessions', { title, date: '2026-11-09' });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}
async function source(page: Page) {
  const rows = (await (await page.request.get('./api/sessions')).json()) as {
    sessions: { id: string; title: string }[];
  };
  const s = rows.sessions.find((s) => s.title === 'Source video reuse fixture');
  if (!s) throw new Error('Missing source fixture');
  const detail = (await (await page.request.get(`./api/sessions/${s.id}`)).json()) as {
    videos: { id: string }[];
  };
  return { sessionId: s.id, videoId: detail.videos[0]?.id ?? '' };
}

test('creator filter stays distinct from participation and survives reload', async ({
  page,
}, info) => {
  await signIn(page);
  const title = `Own training ${info.project.name} ${String(Date.now())}`;
  await ownTraining(page, title);
  await page.goto('./sessions');
  await page.getByTestId('filters').evaluate((node: HTMLDetailsElement) => {
    node.open = true;
  });
  await page.getByLabel(/^(Created by me|Door mij aangemaakt)$/).check();
  await expect(page).toHaveURL(/created=1/);
  await expect(page.getByTestId('session-list')).toContainText(title);
  await expect(page.getByTestId('session-list')).not.toContainText('Source video reuse fixture');
  await page.reload();
  await expect(page.getByLabel(/^(Created by me|Door mij aangemaakt)$/)).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('creator-filter.png'), fullPage: true });
});

test('reuse and selected source layers preserve attribution, own notes and per-viewer toggles', async ({
  page,
}, info) => {
  await signIn(page);
  const original = await source(page);
  const target = await ownTraining(
    page,
    `Independent analysis ${info.project.name} ${String(Date.now())}`,
  );
  await page.goto(`./sessions/${target}`);
  await page
    .getByRole('button', { name: /^(Add existing video|Bestaande video toevoegen)$/ })
    .click();
  const picker = page.getByTestId('existing-video-picker');
  await picker.getByRole('searchbox').fill('Source video reuse fixture');
  await picker
    .getByRole('button', { name: /^(Add to this training|Aan deze training toevoegen)$/ })
    .first()
    .click();
  await expect(page.getByTestId('video')).toHaveCount(1);
  await page.getByTestId('video').getByRole('link').last().click();
  const videoId = page.url().split('/').at(-1) ?? '';
  expect(videoId).not.toBe(original.videoId);
  const panel = page.getByTestId('source-annotations');
  await panel.locator('summary').click();
  await expect(panel).toContainText('Original technique note');
  await expect(panel).toContainText('Source Coach');
  const note = panel
    .getByTestId('source-annotation')
    .filter({ hasText: 'Original technique note' });
  await note.getByRole('button', { name: /^(Add annotation|Annotatie toevoegen)$/ }).click();
  const overlay = page.getByTestId('video-note-overlay');
  await expect(overlay).toContainText('Original technique note');
  await expect(overlay).toContainText('Source Coach · Source video reuse fixture');
  const layer = panel.getByTestId('source-layer').filter({
    has: page.getByRole('heading', {
      name: 'Source Coach · Source video reuse fixture',
      exact: true,
    }),
  });
  const toggle = layer.getByRole('checkbox');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(overlay).toHaveCount(0);
  await page.reload();
  await panel.locator('summary').click();
  await expect(toggle).not.toBeChecked();
  await expect(overlay).toHaveCount(0);
  await toggle.check();
  await expect(overlay).toContainText('Original technique note');
  const line = panel.getByTestId('source-annotation').filter({ hasText: /Frame 0 · (Line|Lijn)/ });
  await line.getByRole('button', { name: /^(Add annotation|Annotatie toevoegen)$/ }).click();
  await expect(page.locator('[data-testid=drawing-layer] g[data-kind]')).toHaveCount(1);
  await expect(page.getByTestId('drawing-handle')).toHaveCount(0);
  expect(
    (
      await mutate(page, 'POST', `/api/videos/${videoId}/annotations`, {
        kind: 'note',
        frame: 0,
        body: 'Independent local feedback',
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  await expect(page.getByTestId('moment')).toContainText('Independent local feedback');
  await expect(page.getByTestId('moment')).not.toContainText('Original technique note');
  const originalNotes = (await (
    await page.request.get(
      withBasePath('/projects/rowlens', `/api/videos/${original.videoId}/annotations`),
    )
  ).json()) as { annotations: { body: string }[] };
  expect(originalNotes.annotations.map((a) => a.body)).toContain('Original technique note');
  expect(originalNotes.annotations.map((a) => a.body)).not.toContain('Independent local feedback');
  await panel.locator('summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const targetSize = await toggle.locator('..').boundingBox();
  expect(targetSize?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('independent-layers.png'), fullPage: true });
});

test('deleting a reused training leaves the original playable', async ({ page }, info) => {
  await signIn(page);
  const original = await source(page);
  const target = await ownTraining(page, `Delete clone ${info.project.name}`);
  const created = await mutate(page, 'POST', `/api/sessions/${target}/reuse-video`, {
    sourceVideoId: original.videoId,
  });
  expect(created.status()).toBe(201);
  expect((await mutate(page, 'DELETE', `/api/sessions/${target}`)).status()).toBe(204);
  expect(
    (
      await page.request.get(
        withBasePath('/projects/rowlens', `/api/videos/${original.videoId}/media/play-540`),
      )
    ).status(),
  ).toBe(200);
});
