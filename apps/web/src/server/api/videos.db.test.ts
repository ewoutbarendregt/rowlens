import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { MediaStore, videoKey } from '../media/store.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'videos-test-code';
const BODY = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

let handle: DatabaseHandle;
let mediaDir = '';
let app: FastifyInstance;
let cookie = '';
let pilot = '';

async function videoIn(clubId: string, status: string, renditions: unknown[]) {
  const [session] = await asOwner<{ id: string }>(
    `insert into rowing_session (club_id, title, session_date) values ($1, 'S', '2026-11-01') returning id`,
    [clubId],
  );
  const [row] = await asOwner<{ id: string }>(
    `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes,
       status, fps_num, fps_den, width, height, duration_ms, frame_count, renditions)
     values ($1, $2, 'clip.mov', 'video/quicktime', 'bank', 1000, $3, 60000, 1001, 1920, 1080, 4000, 240, $4)
     returning id`,
    [clubId, session?.id, status, JSON.stringify(renditions)],
  );
  return { id: row?.id ?? '', sessionId: session?.id ?? '' };
}

const rendition = (clubId: string, id: string, name: string) => ({
  name,
  key: `${videoKey(clubId, id)}/renditions/${name}`,
  width: 960,
  height: 540,
  bytes: BODY.length,
  contentType: 'video/mp4',
});

async function writeMedia(key: string, body: Buffer) {
  const path = join(mediaDir, key);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body);
}

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  mediaDir = await mkdtemp(join(tmpdir(), 'rowlens-videos-'));
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'f'.repeat(64),
    }),
    clientDir: null,
    database: handle.db,
    media: new MediaStore(mediaDir),
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
  await rm(mediaDir, { recursive: true, force: true });
});

const get = (url: string, headers: Record<string, string> = {}) =>
  app.inject({ url: `${BASE}${url}`, headers: { cookie, ...headers } });

describe('GET /api/videos/:id', () => {
  it('returns the facts the player needs, without storage keys', async () => {
    const v = await videoIn(pilot, 'ready', []);
    await asOwner('update video set renditions = $1 where id = $2', [
      JSON.stringify([rendition(pilot, v.id, 'play-540')]),
      v.id,
    ]);
    const res = await get(`/api/videos/${v.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: v.id,
      sessionId: v.sessionId,
      sessionTitle: 'S',
      status: 'ready',
      fpsNum: 60000,
      fpsDen: 1001,
      frameCount: 240,
      renditions: [{ name: 'play-540', width: 960, height: 540 }],
    });
    expect(res.body).not.toContain('clubs/');
  });
});

describe('GET /api/videos/:id/media/:name', () => {
  it('streams a rendition whole or by byte range', async () => {
    const v = await videoIn(pilot, 'ready', []);
    const r = rendition(pilot, v.id, 'play-540');
    await asOwner('update video set renditions = $1 where id = $2', [JSON.stringify([r]), v.id]);
    await writeMedia(r.key, BODY);

    const whole = await get(`/api/videos/${v.id}/media/play-540`);
    expect(whole.statusCode).toBe(200);
    expect(whole.rawPayload.equals(BODY)).toBe(true);
    expect(whole.headers).toMatchObject({
      'content-type': 'video/mp4',
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
      'content-length': '1000',
    });

    const part = await get(`/api/videos/${v.id}/media/play-540`, { range: 'bytes=100-199' });
    expect(part.statusCode).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 100-199/1000');
    expect(part.rawPayload.equals(BODY.subarray(100, 200))).toBe(true);

    const tail = await get(`/api/videos/${v.id}/media/play-540`, { range: 'bytes=-10' });
    expect(tail.rawPayload.equals(BODY.subarray(990))).toBe(true);

    const bad = await get(`/api/videos/${v.id}/media/play-540`, { range: 'bytes=5000-' });
    expect([bad.statusCode, bad.headers['content-range']]).toEqual([416, 'bytes */1000']);
  });

  it('serves the poster as JPEG', async () => {
    const v = await videoIn(pilot, 'ready', []);
    await writeMedia(`${videoKey(pilot, v.id)}/poster`, Buffer.from([0xff, 0xd8, 0xff]));
    const res = await get(`/api/videos/${v.id}/media/poster`);
    expect([res.statusCode, res.headers['content-type']]).toEqual([200, 'image/jpeg']);
  });

  it('is a 404 for: no cookie, not ready, missing rendition, unknown name, foreign key', async () => {
    const ready = await videoIn(pilot, 'ready', []);
    const r = rendition(pilot, ready.id, 'play-540');
    await asOwner('update video set renditions = $1 where id = $2', [
      JSON.stringify([r]),
      ready.id,
    ]);
    await writeMedia(r.key, BODY);
    const processing = await videoIn(pilot, 'processing', []);

    const noCookie = await app.inject({ url: `${BASE}/api/videos/${ready.id}/media/play-540` });
    expect(noCookie.statusCode).toBe(404);
    expect((await get(`/api/videos/${processing.id}/media/play-540`)).statusCode).toBe(404);
    expect((await get(`/api/videos/${ready.id}/media/play-1080`)).statusCode).toBe(404);
    expect((await get(`/api/videos/${ready.id}/media/original`)).statusCode).toBe(404);

    // A rendition record pointing outside the video's own folder is never followed.
    const sneaky = await videoIn(pilot, 'ready', []);
    await asOwner('update video set renditions = $1 where id = $2', [
      JSON.stringify([{ ...r, name: 'play-1080' }]),
      sneaky.id,
    ]);
    expect((await get(`/api/videos/${sneaky.id}/media/play-1080`)).statusCode).toBe(404);
  });

  it("another club's video and media are a 404", async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('v-' || gen_random_uuid(), 'Other') returning id`,
    );
    const otherId = other?.id ?? '';
    const v = await videoIn(otherId, 'ready', []);
    const r = rendition(otherId, v.id, 'play-540');
    await asOwner('update video set renditions = $1 where id = $2', [JSON.stringify([r]), v.id]);
    await writeMedia(r.key, BODY);
    expect((await get(`/api/videos/${v.id}`)).statusCode).toBe(404);
    expect((await get(`/api/videos/${v.id}/media/play-540`)).statusCode).toBe(404);
    expect((await get(`/api/videos/${v.id}/media/poster`)).statusCode).toBe(404);
  });
});
