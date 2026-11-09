import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { edgeUrl } from './env.ts';
import { openProcessedClip } from './helpers.ts';
import { withBasePath } from '../src/shared/base-path.ts';

test.skip(edgeUrl === undefined, 'needs local Caddy and the real worker');
async function mutate(page: Page, method: string, path: string, data?: unknown) {
  const csrf = (await page.context().cookies()).find((c) => c.name === 'rowlens_csrf')?.value ?? '';
  return page.request.fetch(withBasePath('/projects/rowlens', path), {
    method,
    headers: {
      origin: new URL(page.url()).origin,
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': csrf,
    },
    ...(data === undefined ? {} : { data }),
  });
}

test('real worker analyzes reused media independently and playback survives deletion of its source training', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const fixture = fileURLToPath(new URL('../public/demo-media/e2e-30fps.webm', import.meta.url));
  await openProcessedClip(
    page,
    readFileSync(fixture),
    `Reuse worker ${info.project.name} ${String(Date.now())}`,
  );
  const original = page.url().split('/').at(-1) ?? '';
  const get = (path: string) => page.request.get(withBasePath('/projects/rowlens', path));
  const source = (await (await get(`/api/videos/${original}`)).json()) as {
    sessionId: string;
    frameCount: number;
  };
  await expect
    .poll(
      async () =>
        ((await (await get(`/api/videos/${original}/auto-boat-line`)).json()) as { status: string })
          .status,
      { timeout: 60000 },
    )
    .toBe('done');
  const sourceLine = (await (
    await get(`/api/videos/${original}/auto-boat-line`)
  ).json()) as unknown;
  const note = await mutate(page, 'POST', `/api/videos/${original}/annotations`, {
    kind: 'note',
    frame: 0,
    body: 'Original worker feedback',
  });
  expect(note.status()).toBe(201);
  const annotation = (await note.json()) as { id: string };
  const training = await mutate(page, 'POST', '/api/sessions', {
    title: 'Independent worker analysis',
    date: '2026-11-09',
  });
  const target = (await training.json()) as { id: string };
  const reused = await mutate(page, 'POST', `/api/sessions/${target.id}/reuse-video`, {
    sourceVideoId: original,
  });
  expect(reused.status()).toBe(201);
  const entry = (await reused.json()) as { id: string };
  await expect
    .poll(
      async () =>
        ((await (await get(`/api/videos/${entry.id}/auto-boat-line`)).json()) as { status: string })
          .status,
      { timeout: 60000 },
    )
    .toBe('done');
  expect(
    ((await (await get(`/api/videos/${entry.id}`)).json()) as { frameCount: number }).frameCount,
  ).toBe(source.frameCount);
  expect(
    (
      await mutate(page, 'PUT', `/api/videos/${entry.id}/annotation-references/${annotation.id}`)
    ).status(),
  ).toBe(204);
  expect(
    (
      await mutate(page, 'POST', `/api/videos/${entry.id}/annotations`, {
        kind: 'note',
        frame: 0,
        body: 'Local worker feedback',
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await mutate(page, 'PUT', `/api/videos/${entry.id}/boat-line`, {
        frame: 0,
        points: [
          [0.1, 0.5],
          [0.9, 0.5],
        ],
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(
      async () =>
        ((await (await get(`/api/videos/${entry.id}/auto-boat-line`)).json()) as { status: string })
          .status,
      { timeout: 60000 },
    )
    .toBe('done');
  expect(await (await get(`/api/videos/${original}/auto-boat-line`)).json()).toEqual(sourceLine);
  expect((await mutate(page, 'DELETE', `/api/sessions/${source.sessionId}`)).status()).toBe(204);
  const playback = await page.request.get(
    withBasePath('/projects/rowlens', `/api/videos/${entry.id}/media/play-540`),
    { headers: { range: 'bytes=0-31' } },
  );
  expect(playback.status()).toBe(206);
  expect((await playback.body()).length).toBe(32);
  const ownNotes = (await (await get(`/api/videos/${entry.id}/annotations`)).json()) as {
    annotations: { body: string }[];
  };
  expect(ownNotes.annotations.map((a) => a.body)).toEqual(['Local worker feedback']);
  const sources = (await (await get(`/api/videos/${entry.id}/source-annotations`)).json()) as {
    annotations: unknown[];
  };
  expect(sources.annotations).toEqual([]);
  expect((await mutate(page, 'DELETE', `/api/sessions/${target.id}`)).status()).toBe(204);
});
