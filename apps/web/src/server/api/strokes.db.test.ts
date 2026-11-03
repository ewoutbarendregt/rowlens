import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'strokes-test-code';

let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie = '';
let pilot = '';

async function videoIn(clubId: string, status = 'ready', frameCount: number | null = 240) {
  const [session] = await asOwner<{ id: string }>(
    `insert into rowing_session (club_id, title, session_date) values ($1, 'S', '2026-11-01') returning id`,
    [clubId],
  );
  const [row] = await asOwner<{ id: string }>(
    `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes, status, frame_count)
     values ($1, $2, 'clip.mov', 'video/quicktime', 'boat', 1000, $3, $4) returning id`,
    [clubId, session?.id, status, frameCount],
  );
  return row?.id ?? '';
}

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'a1'.repeat(32),
    }),
    clientDir: null,
    database: handle.db,
    media: null,
    logger: false,
  });
  const res = await app.inject({
    method: 'POST',
    url: `${BASE}/api/pilot/access`,
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: CODE }),
  });
  cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  const [row] = await asOwner<{ id: string }>(`select id from club where slug = 'pilot'`);
  pilot = row?.id ?? '';
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

// Like the browser client: a content type only when there is a body.
const send = (method: 'PUT' | 'DELETE', url: string, body?: unknown) =>
  app.inject({
    method,
    url: `${BASE}${url}`,
    headers: {
      origin: ORIGIN,
      cookie,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
const marks = async (videoId: string) =>
  (await app.inject({ url: `${BASE}/api/videos/${videoId}/strokes`, headers: { cookie } })).json<{
    marks: { frame: number; kind: string }[];
  }>().marks;

describe('stroke marks (#85)', () => {
  it('sets, changes and removes marks, one per frame, in frame order', async () => {
    const v = await videoIn(pilot);
    for (const [frame, kind] of [
      [70, 'catch'],
      [10, 'catch'],
      [30, 'finish'],
    ] as const) {
      const res = await send('PUT', `/api/videos/${v}/strokes/${String(frame)}`, { kind });
      expect([res.statusCode, res.json()]).toEqual([200, { frame, kind }]);
    }
    const listed = await app.inject({
      url: `${BASE}/api/videos/${v}/strokes`,
      headers: { cookie },
    });
    expect(listed.headers['cache-control']).toBe('private, no-store');
    expect(await marks(v)).toEqual([
      { frame: 10, kind: 'catch' },
      { frame: 30, kind: 'finish' },
      { frame: 70, kind: 'catch' },
    ]);

    // The same frame again changes the kind instead of adding a second mark.
    await send('PUT', `/api/videos/${v}/strokes/30`, { kind: 'half_slide' });
    expect((await marks(v)).filter((m) => m.frame === 30)).toEqual([
      { frame: 30, kind: 'half_slide' },
    ]);

    expect((await send('DELETE', `/api/videos/${v}/strokes/30`)).statusCode).toBe(204);
    expect((await send('DELETE', `/api/videos/${v}/strokes/30`)).statusCode).toBe(404);
    expect((await marks(v)).map((m) => m.frame)).toEqual([10, 70]);
  });

  it('refuses unknown kinds, frames outside the video and videos not ready', async () => {
    const v = await videoIn(pilot, 'ready', 240);
    expect((await send('PUT', `/api/videos/${v}/strokes/5`, { kind: 'entry' })).statusCode).toBe(
      400,
    );
    expect((await send('PUT', `/api/videos/${v}/strokes/5`, {})).statusCode).toBe(400);
    expect((await send('PUT', `/api/videos/${v}/strokes/-1`, { kind: 'catch' })).statusCode).toBe(
      404,
    );
    const past = await send('PUT', `/api/videos/${v}/strokes/240`, { kind: 'catch' });
    expect([past.statusCode, past.json()]).toEqual([400, { error: 'frame_out_of_range' }]);
    expect((await send('PUT', `/api/videos/${v}/strokes/239`, { kind: 'catch' })).statusCode).toBe(
      200,
    );
    const waiting = await videoIn(pilot, 'processing', null);
    expect(
      (await send('PUT', `/api/videos/${waiting}/strokes/1`, { kind: 'catch' })).statusCode,
    ).toBe(409);
  });

  it("another club's video is a 404, and its marks stay unchanged", async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('s-' || gen_random_uuid(), 'Other') returning id`,
    );
    const theirs = await videoIn(other?.id ?? '');
    await asOwner(
      `insert into stroke_mark (club_id, video_id, frame, kind) values ($1, $2, 5, 'catch')`,
      [other?.id, theirs],
    );
    expect(
      (await app.inject({ url: `${BASE}/api/videos/${theirs}/strokes`, headers: { cookie } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await send('PUT', `/api/videos/${theirs}/strokes/9`, { kind: 'catch' })).statusCode,
    ).toBe(404);
    expect((await send('DELETE', `/api/videos/${theirs}/strokes/5`)).statusCode).toBe(404);
    const kept = await asOwner<{ frame: number }>(
      `select frame from stroke_mark where video_id = $1`,
      [theirs],
    );
    expect(kept).toEqual([{ frame: 5 }]);
  });

  it('go with their video', async () => {
    const v = await videoIn(pilot);
    await send('PUT', `/api/videos/${v}/strokes/3`, { kind: 'catch' });
    await asOwner(`delete from video where id = $1`, [v]);
    expect(await asOwner(`select 1 from stroke_mark where video_id = $1`, [v])).toEqual([]);
  });
});
