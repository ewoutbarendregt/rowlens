import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'notes-test-code';

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
const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) =>
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
const list = (videoId: string) =>
  app.inject({ url: `${BASE}/api/videos/${videoId}/annotations`, headers: { cookie } });

describe('notes pinned to a frame', () => {
  it('create, list in frame order, edit, delete', async () => {
    const v = await videoIn(pilot);
    const late = await send('POST', `/api/videos/${v}/annotations`, {
      frame: 120,
      body: ' Blade enters late ',
      authorName: ' Coach Anna ',
    });
    expect(late.statusCode).toBe(201);
    expect(late.json()).toMatchObject({
      frame: 120,
      kind: 'note',
      body: 'Blade enters late',
      authorName: 'Coach Anna',
      shape: null,
    });
    await send('POST', `/api/videos/${v}/annotations`, {
      frame: 7,
      body: 'Catch',
      authorName: 'R',
    });

    const listed = await list(v);
    expect(listed.headers['cache-control']).toBe('private, no-store');
    expect(
      listed.json<{ annotations: { frame: number }[] }>().annotations.map((a) => a.frame),
    ).toEqual([7, 120]);

    const id = late.json<{ id: string }>().id;
    const edited = await send('PATCH', `/api/annotations/${id}`, {
      body: 'Blade enters 2 frames late',
    });
    expect(edited.json()).toMatchObject({ body: 'Blade enters 2 frames late', frame: 120 });
    expect((await send('DELETE', `/api/annotations/${id}`)).statusCode).toBe(204);
    expect((await list(v)).json<{ annotations: unknown[] }>().annotations).toHaveLength(1);
    expect((await send('DELETE', `/api/annotations/${id}`)).statusCode).toBe(404);
  });

  it('refuses empty, too long, nameless notes and frames outside the video', async () => {
    const v = await videoIn(pilot, 'ready', 240);
    for (const body of [
      { frame: 1, body: '   ', authorName: 'A' },
      { frame: 1, body: 'x'.repeat(2001), authorName: 'A' },
      { frame: 1, body: 'ok', authorName: '' },
      { frame: -1, body: 'ok', authorName: 'A' },
      { frame: 1.5, body: 'ok', authorName: 'A' },
    ]) {
      expect((await send('POST', `/api/videos/${v}/annotations`, body)).statusCode).toBe(400);
    }
    const past = await send('POST', `/api/videos/${v}/annotations`, {
      frame: 240,
      body: 'ok',
      authorName: 'A',
    });
    expect([past.statusCode, past.json()]).toEqual([400, { error: 'frame_out_of_range' }]);
    expect(
      (
        await send('POST', `/api/videos/${v}/annotations`, {
          frame: 239,
          body: 'ok',
          authorName: 'A',
        })
      ).statusCode,
    ).toBe(201);
  });

  it('needs a processed video: frames exist only in the CFR renditions', async () => {
    const v = await videoIn(pilot, 'processing', null);
    const res = await send('POST', `/api/videos/${v}/annotations`, {
      frame: 0,
      body: 'x',
      authorName: 'A',
    });
    expect([res.statusCode, res.json()]).toEqual([409, { error: 'video_not_ready' }]);
  });

  it('notes go when their video is deleted', async () => {
    const v = await videoIn(pilot);
    await send('POST', `/api/videos/${v}/annotations`, { frame: 3, body: 'x', authorName: 'A' });
    expect((await send('DELETE', `/api/videos/${v}`)).statusCode).toBe(204);
    expect(await asOwner('select id from annotation where video_id = $1', [v])).toEqual([]);
  });

  it("another club's video and notes are a 404, and stay unchanged", async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('n-' || gen_random_uuid(), 'Other') returning id`,
    );
    const v = await videoIn(other?.id ?? '');
    const [note] = await asOwner<{ id: string }>(
      `insert into annotation (club_id, video_id, frame, body, author_name) values ($1, $2, 5, 'theirs', 'B') returning id`,
      [other?.id, v],
    );
    expect((await list(v)).statusCode).toBe(404);
    expect(
      (await send('POST', `/api/videos/${v}/annotations`, { frame: 1, body: 'x', authorName: 'A' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await send('PATCH', `/api/annotations/${note?.id ?? ''}`, { body: 'hacked' })).statusCode,
    ).toBe(404);
    expect((await send('DELETE', `/api/annotations/${note?.id ?? ''}`)).statusCode).toBe(404);
    expect(await asOwner('select body from annotation where id = $1', [note?.id])).toEqual([
      { body: 'theirs' },
    ]);
  });

  it('a note can only point at a video of its own club (database key)', async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('k-' || gen_random_uuid(), 'Other') returning id`,
    );
    const theirs = await videoIn(other?.id ?? '');
    await expect(
      asOwner(
        `insert into annotation (club_id, video_id, frame, body, author_name) values ($1, $2, 1, 'x', 'A')`,
        [pilot, theirs],
      ),
    ).rejects.toThrow(/annotation_video_fk/);
  });
});
