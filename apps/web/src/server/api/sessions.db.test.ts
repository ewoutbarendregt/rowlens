import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { MediaStore, originalKey, videoKey } from '../media/store.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'sessions-test-code';

let handle: DatabaseHandle;
let mediaDir = '';
let media: MediaStore;
let app: FastifyInstance;
let cookie = '';
let pilot = '';

async function sessionWithVideo(clubId: string, title: string) {
  const [session] = await asOwner<{ id: string }>(
    `insert into rowing_session (club_id, title, session_date)
     values ($1, $2, '2026-11-01') returning id`,
    [clubId, title],
  );
  const [video] = await asOwner<{ id: string }>(
    `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes)
     values ($1, $2, 'clip.mov', 'video/quicktime', 'bank', 4) returning id`,
    [clubId, session?.id],
  );
  return { sessionId: session?.id ?? '', videoId: video?.id ?? '' };
}

async function writeMedia(key: string, body: string) {
  const path = join(mediaDir, key);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, body);
}

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  mediaDir = await mkdtemp(join(tmpdir(), 'rowlens-sessions-'));
  media = new MediaStore(mediaDir);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'd'.repeat(64),
    }),
    clientDir: null,
    database: handle.db,
    media,
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

describe('DELETE /api/sessions/:id', () => {
  it('deletes the session, all videos, annotations and every video media directory', async () => {
    const first = await sessionWithVideo(pilot, 'Delete all');
    const [secondVideo] = await asOwner<{ id: string }>(
      `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes)
       values ($1, $2, 'second.mp4', 'video/mp4', 'boat', 6) returning id`,
      [pilot, first.sessionId],
    );
    const secondId = secondVideo?.id ?? '';
    await asOwner(
      `insert into annotation (club_id, video_id, frame, kind, body, author_name)
       values ($1, $2, 12, 'note', 'Catch earlier', 'Coach'),
              ($1, $3, 18, 'line', '', 'Coach')`,
      [pilot, first.videoId, secondId],
    );
    await writeMedia(originalKey(pilot, first.videoId), 'clip');
    await writeMedia(`${videoKey(pilot, secondId)}/poster`, 'poster');

    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/api/sessions/${first.sessionId}`,
      headers: { cookie, origin: ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(
      await asOwner<{ id: string }>('select id from rowing_session where id = $1', [
        first.sessionId,
      ]),
    ).toEqual([]);
    expect(
      await asOwner<{ id: string }>('select id from video where session_id = $1', [
        first.sessionId,
      ]),
    ).toEqual([]);
    expect(
      await asOwner<{ id: string }>('select id from annotation where video_id = any($1::uuid[])', [
        [first.videoId, secondId],
      ]),
    ).toEqual([]);
    expect(await media.size(originalKey(pilot, first.videoId))).toBe(0);
    expect(await media.size(`${videoKey(pilot, secondId)}/poster`)).toBe(0);
  });

  it("does not reveal or delete another club's session", async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('session-' || gen_random_uuid(), 'Other') returning id`,
    );
    const foreign = await sessionWithVideo(other?.id ?? '', 'Foreign');
    await writeMedia(originalKey(other?.id ?? '', foreign.videoId), 'clip');

    const res = await app.inject({
      method: 'DELETE',
      url: `${BASE}/api/sessions/${foreign.sessionId}`,
      headers: { cookie, origin: ORIGIN },
    });
    expect(res.statusCode).toBe(404);
    expect(
      await asOwner<{ id: string }>('select id from rowing_session where id = $1', [
        foreign.sessionId,
      ]),
    ).toEqual([{ id: foreign.sessionId }]);
    expect(await media.size(originalKey(other?.id ?? '', foreign.videoId))).toBe(4);
  });
});
