import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { MediaStore, originalKey } from '../media/store.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'upload-test-code';
// A minimal MP4 start (ftyp box) followed by filler: enough for the magic-byte check.
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypmp42'),
  Buffer.alloc(40, 7),
]);

class FakeDiskStore extends MediaStore {
  used = 0.5;
  override diskUsedRatio(): Promise<number> {
    return Promise.resolve(this.used);
  }
}

let handle: DatabaseHandle;
let mediaDir = '';
let media: FakeDiskStore;
let app: FastifyInstance;
let cookie = '';
let pilotClubId = '';

async function start(env: Record<string, string> = {}) {
  return buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'e'.repeat(64),
      UPLOAD_MAX_BYTES: '1000',
      ...env,
    }),
    clientDir: null,
    database: handle.db,
    media,
    logger: false,
  });
}

async function signIn(server: FastifyInstance) {
  const res = await server.inject({
    method: 'POST',
    url: `${BASE}/api/pilot/access`,
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: CODE }),
  });
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 4);
  mediaDir = await mkdtemp(join(tmpdir(), 'rowlens-uploads-'));
  media = new FakeDiskStore(mediaDir);
  app = await start();
  cookie = await signIn(app);
  const [pilot] = await asOwner<{ id: string }>(`select id from club where slug = 'pilot'`);
  pilotClubId = pilot?.id ?? '';
});

afterAll(async () => {
  await app.close();
  await handle.close();
  await rm(mediaDir, { recursive: true, force: true });
});

const headers = (extra: Record<string, string> = {}) => ({
  origin: ORIGIN,
  cookie,
  'tus-resumable': '1.0.0',
  ...extra,
});
const b64 = (s: string) => Buffer.from(s).toString('base64');
const metadata = (sessionId: string, filename = 'IMG_0001.MOV', type = 'video/quicktime') =>
  `filename ${b64(filename)},filetype ${b64(type)},sessionId ${b64(sessionId)},perspective ${b64('boat')}`;

async function newSession(server = app, c = cookie) {
  const res = await server.inject({
    method: 'POST',
    url: `${BASE}/api/sessions`,
    headers: { origin: ORIGIN, cookie: c, 'content-type': 'application/json' },
    payload: JSON.stringify({ title: 'Ochtendtraining', date: '2026-10-31' }),
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

async function create(sessionId: string, length: number, meta = metadata(sessionId), server = app) {
  return server.inject({
    method: 'POST',
    url: `${BASE}/api/uploads`,
    headers: headers({ 'upload-length': String(length), 'upload-metadata': meta }),
  });
}

const patch = (location: string, offset: number, body: Buffer, server = app) =>
  server.inject({
    method: 'PATCH',
    url: location,
    headers: headers({
      'content-type': 'application/offset+octet-stream',
      'upload-offset': String(offset),
    }),
    payload: body,
  });

const head = (location: string) =>
  app.inject({ method: 'HEAD', url: location, headers: headers() });

describe('sessions', () => {
  it('creates and lists sessions with their video count', async () => {
    const id = await newSession();
    const list = await app.inject({ url: `${BASE}/api/sessions`, headers: { cookie } });
    expect(list.headers['cache-control']).toBe('private, no-store');
    expect(list.json<{ sessions: unknown[] }>().sessions).toContainEqual({
      id,
      title: 'Ochtendtraining',
      date: '2026-10-31',
      videoCount: 0,
    });
  });

  it('rejects invalid sessions', async () => {
    for (const payload of [
      { title: '', date: '2026-10-31' },
      { title: 'x', date: '31-10-2026' },
    ]) {
      const res = await app.inject({
        method: 'POST',
        url: `${BASE}/api/sessions`,
        headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
        payload: JSON.stringify(payload),
      });
      expect(res.statusCode).toBe(400);
    }
  });
});

describe('tus upload', () => {
  it('creates, resumes after a broken chunk, completes and lists the video', async () => {
    const sessionId = await newSession();
    const created = await create(sessionId, MP4.length);
    expect(created.statusCode).toBe(201);
    expect(created.headers['tus-resumable']).toBe('1.0.0');
    const location = String(created.headers['location']);
    expect(location).toMatch(new RegExp(`^${BASE}/api/uploads/[0-9a-f-]{36}$`));

    expect((await head(location)).headers['upload-offset']).toBe('0');
    const first = await patch(location, 0, MP4.subarray(0, 20));
    expect([first.statusCode, first.headers['upload-offset']]).toEqual([204, '20']);

    // A client that lost its connection asks where to continue, then sends the rest.
    expect((await head(location)).headers).toMatchObject({
      'upload-offset': '20',
      'upload-length': String(MP4.length),
    });
    const wrongOffset = await patch(location, 10, MP4.subarray(10));
    expect([wrongOffset.statusCode, wrongOffset.headers['upload-offset']]).toEqual([409, '20']);
    const rest = await patch(location, 20, MP4.subarray(20));
    expect([rest.statusCode, rest.headers['upload-offset']]).toEqual([204, String(MP4.length)]);

    const id = location.split('/').at(-1) ?? '';
    expect(await media.size(originalKey(pilotClubId, id))).toBe(MP4.length);
    // Completion enqueued exactly one processing job for the worker (#47).
    expect(
      await asOwner('select type, payload, status from job where idempotency_key = $1', [
        `video.process:${id}`,
      ]),
    ).toEqual([{ type: 'video.process', payload: { videoId: id }, status: 'queued' }]);
    const session = await app.inject({
      url: `${BASE}/api/sessions/${sessionId}`,
      headers: { cookie },
    });
    expect(session.json<{ videos: unknown[] }>().videos).toEqual([
      expect.objectContaining({
        id,
        filename: 'IMG_0001.MOV',
        perspective: 'boat',
        status: 'uploaded',
        sizeBytes: MP4.length,
        uploadedBytes: MP4.length,
      }),
    ]);
    // A finished upload takes no more bytes.
    expect((await patch(location, MP4.length, Buffer.from('x'))).statusCode).toBe(409);
  });

  it('rejects a complete upload that is not a video and deletes its bytes', async () => {
    const sessionId = await newSession();
    const pdf = Buffer.from('%PDF-1.7 pretending to be a movie');
    const location = String((await create(sessionId, pdf.length)).headers['location']);
    const res = await patch(location, 0, pdf);
    expect([res.statusCode, res.json()]).toEqual([415, { error: 'not_a_video' }]);
    const id = location.split('/').at(-1) ?? '';
    expect(await media.size(originalKey(pilotClubId, id))).toBe(0);
    const [row] = await asOwner<{ status: string }>('select status from video where id = $1', [id]);
    expect(row?.status).toBe('rejected');
  });

  it('refuses before accepting bytes: size, type, metadata, tus version', async () => {
    const sessionId = await newSession();
    expect((await create(sessionId, 1001)).statusCode).toBe(413);
    expect((await create(sessionId, 0)).statusCode).toBe(400);
    expect(
      (await create(sessionId, 10, metadata(sessionId, 'notes.pdf', 'application/pdf'))).statusCode,
    ).toBe(415);
    expect((await create(sessionId, 10, 'filename eA==')).statusCode).toBe(400);
    const noVersion = await app.inject({
      method: 'POST',
      url: `${BASE}/api/uploads`,
      headers: {
        origin: ORIGIN,
        cookie,
        'upload-length': '10',
        'upload-metadata': metadata(sessionId),
      },
    });
    expect(noVersion.statusCode).toBe(412);
  });

  it('refuses chunks over 64 MB, beyond the declared length, or of the wrong type', async () => {
    const sessionId = await newSession();
    const location = String((await create(sessionId, 10)).headers['location']);
    const huge = await app.inject({
      method: 'PATCH',
      url: location,
      headers: headers({
        'content-type': 'application/offset+octet-stream',
        'upload-offset': '0',
        'content-length': String(64 * 1024 * 1024 + 1),
      }),
      payload: Buffer.alloc(0),
    });
    expect(huge.statusCode).toBe(413);
    expect((await patch(location, 0, Buffer.alloc(11))).statusCode).toBe(413);
    const wrongType = await app.inject({
      method: 'PATCH',
      url: location,
      headers: headers({ 'content-type': 'application/json', 'upload-offset': '0' }),
      payload: '{}',
    });
    expect(wrongType.statusCode).toBe(415);
  });

  it('pauses uploads when the shared disk is 85 % full', async () => {
    const sessionId = await newSession();
    const location = String((await create(sessionId, 10)).headers['location']);
    media.used = 0.86;
    try {
      expect((await create(sessionId, 10)).json()).toEqual({ error: 'disk_full' });
      expect((await patch(location, 0, Buffer.alloc(5))).statusCode).toBe(507);
    } finally {
      media.used = 0.5;
    }
  });

  it('enforces the global media cap, counting reserved bytes of unfinished uploads', async () => {
    const [used] = await asOwner<{ bytes: string }>(
      `select coalesce(sum(size_bytes), 0) as bytes from video where status <> 'rejected'`,
    );
    const capped = await start({ MEDIA_CAP_BYTES: String(Number(used?.bytes) + 100) });
    try {
      const c = await signIn(capped);
      const sessionId = await newSession(capped, c);
      const create2 = (length: number) =>
        capped.inject({
          method: 'POST',
          url: `${BASE}/api/uploads`,
          headers: {
            ...headers(),
            cookie: c,
            'upload-length': String(length),
            'upload-metadata': metadata(sessionId),
          },
        });
      expect((await create2(60)).statusCode).toBe(201);
      const over = await create2(60);
      expect([over.statusCode, over.json()]).toEqual([507, { error: 'media_cap' }]);
      expect((await create2(40)).statusCode).toBe(201);
    } finally {
      await capped.close();
    }
  });

  it('terminates and deletes uploads and their bytes', async () => {
    const sessionId = await newSession();
    const location = String((await create(sessionId, MP4.length)).headers['location']);
    await patch(location, 0, MP4.subarray(0, 10));
    const id = location.split('/').at(-1) ?? '';
    const res = await app.inject({ method: 'DELETE', url: location, headers: headers() });
    expect(res.statusCode).toBe(204);
    expect(await media.size(originalKey(pilotClubId, id))).toBe(0);
    expect((await head(location)).statusCode).toBe(404);

    const done = String((await create(sessionId, MP4.length)).headers['location']);
    await patch(done, 0, MP4);
    const videoId = done.split('/').at(-1) ?? '';
    const del = await app.inject({
      method: 'DELETE',
      url: `${BASE}/api/videos/${videoId}`,
      headers: { origin: ORIGIN, cookie },
    });
    expect(del.statusCode).toBe(204);
    expect(await media.size(originalKey(pilotClubId, videoId))).toBe(0);
  });
});

describe('another club’s sessions and videos are invisible (ADR-0005)', () => {
  it('answers 404 for every route, and changes nothing', async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('other-' || gen_random_uuid(), 'Other') returning id`,
    );
    const [session] = await asOwner<{ id: string }>(
      `insert into rowing_session (club_id, title, session_date) values ($1, 'Theirs', '2026-10-30') returning id`,
      [other?.id],
    );
    const [theirs] = await asOwner<{ id: string }>(
      `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes)
       values ($1, $2, 'theirs.mp4', 'video/mp4', 'bank', 100) returning id`,
      [other?.id, session?.id],
    );
    const upload = `${BASE}/api/uploads/${theirs?.id ?? ''}`;

    expect(
      (await app.inject({ url: `${BASE}/api/sessions/${session?.id ?? ''}`, headers: { cookie } }))
        .statusCode,
    ).toBe(404);
    const list = await app.inject({ url: `${BASE}/api/sessions`, headers: { cookie } });
    expect(JSON.stringify(list.json())).not.toContain('Theirs');
    expect((await head(upload)).statusCode).toBe(404);
    expect((await patch(upload, 0, Buffer.alloc(5))).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'DELETE', url: upload, headers: headers() })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `${BASE}/api/videos/${theirs?.id ?? ''}`,
          headers: { origin: ORIGIN, cookie },
        })
      ).statusCode,
    ).toBe(404);
    // Uploading into their session is refused, too.
    expect((await create(session?.id ?? '', 10)).statusCode).toBe(404);

    const [still] = await asOwner<{ n: string }>('select count(*) as n from video where id = $1', [
      theirs?.id,
    ]);
    expect(still?.n).toBe('1');
  });

  it('every route is a 404 without the pilot cookie', async () => {
    const sessionId = await newSession();
    for (const [method, url] of [
      ['GET', `${BASE}/api/sessions`],
      ['GET', `${BASE}/api/sessions/${sessionId}`],
      ['POST', `${BASE}/api/uploads`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        headers: { origin: ORIGIN, 'tus-resumable': '1.0.0' },
      });
      expect(res.statusCode).toBe(404);
    }
  });
});
