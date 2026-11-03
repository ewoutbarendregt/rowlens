import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'angles-test-code';

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
const send = (method: 'PUT' | 'DELETE' | 'POST', url: string, body?: unknown) =>
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
const get = (videoId: string) =>
  app.inject({ url: `${BASE}/api/videos/${videoId}/angles`, headers: { cookie } });

async function rowerIn(clubId: string, archived = false) {
  const [row] = await asOwner<{ id: string }>(
    `insert into rower (club_id, display_name, archived_at)
     values ($1, 'R ' || gen_random_uuid(), case when $2 then now() end) returning id`,
    [clubId, archived],
  );
  return row?.id ?? '';
}

async function markAt(clubId: string, videoId: string, frame: number, kind = 'catch') {
  await asOwner(
    `insert into stroke_mark (club_id, video_id, frame, kind) values ($1, $2, $3, $4)`,
    [clubId, videoId, frame, kind],
  );
}

const knee = (frame: number, rowerId: string, x = 0.5) => ({
  frame,
  rowerId,
  joint: 'knee',
  points: [
    [0.2, 0.2],
    [0.2, 0.5],
    [x, 0.5],
  ],
});

describe('angle measurements (ADR-0017)', () => {
  it('measures on a marked frame and replaces a second measurement of the same joint', async () => {
    const v = await videoIn(pilot);
    const anna = await rowerIn(pilot);
    await markAt(pilot, v, 10);
    const first = await send('PUT', `/api/videos/${v}/angles`, knee(10, anna));
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ frame: 10, rowerId: anna, joint: 'knee' });
    const again = await send('PUT', `/api/videos/${v}/angles`, knee(10, anna, 0.6));
    expect(again.json<{ id: string }>().id).toBe(first.json<{ id: string }>().id);

    const listed = await get(v);
    expect(listed.headers['cache-control']).toBe('private, no-store');
    const body = listed.json<{ measures: { points: number[][] }[]; boatLine: unknown }>();
    expect(body.measures).toHaveLength(1);
    expect(body.measures[0]?.points[2]).toEqual([0.6, 0.5]);
    expect(body.boatLine).toBeNull();

    const id = first.json<{ id: string }>().id;
    expect((await send('DELETE', `/api/angles/${id}`)).statusCode).toBe(204);
    expect((await send('DELETE', `/api/angles/${id}`)).statusCode).toBe(404);
  });

  it('refuses frames without a mark, wrong points, and rowers outside the club or archived', async () => {
    const v = await videoIn(pilot, 'ready', 240);
    const anna = await rowerIn(pilot);
    await markAt(pilot, v, 10);
    const noMark = await send('PUT', `/api/videos/${v}/angles`, knee(11, anna));
    expect([noMark.statusCode, noMark.json()]).toEqual([409, { error: 'no_stroke_mark' }]);
    // A knee takes three points, the upper body two.
    const bad = {
      ...knee(10, anna),
      points: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    };
    expect((await send('PUT', `/api/videos/${v}/angles`, bad)).statusCode).toBe(400);
    const trunk3 = { ...knee(10, anna), joint: 'trunk' };
    expect((await send('PUT', `/api/videos/${v}/angles`, trunk3)).statusCode).toBe(400);
    expect(
      (
        await send('PUT', `/api/videos/${v}/angles`, {
          ...knee(10, anna),
          points: [
            [2, 0],
            [0, 0],
            [0, 1],
          ],
        })
      ).statusCode,
    ).toBe(400);
    const past = await send('PUT', `/api/videos/${v}/angles`, knee(240, anna));
    expect([past.statusCode, past.json()]).toEqual([400, { error: 'frame_out_of_range' }]);

    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('a-' || gen_random_uuid(), 'Other') returning id`,
    );
    for (const rowerId of [await rowerIn(other?.id ?? ''), await rowerIn(pilot, true)]) {
      const res = await send('PUT', `/api/videos/${v}/angles`, knee(10, rowerId));
      expect([res.statusCode, res.json()]).toEqual([400, { error: 'unknown_rower' }]);
    }
  });

  it('sets, replaces and removes the boat line', async () => {
    const v = await videoIn(pilot);
    const line = {
      points: [
        [0.1, 0.5],
        [0.9, 0.55],
      ],
    };
    const set = await send('PUT', `/api/videos/${v}/boat-line`, line);
    expect(set.json()).toEqual({ boatLine: line.points });
    await send('PUT', `/api/videos/${v}/boat-line`, {
      points: [
        [0.9, 0.5],
        [0.1, 0.5],
      ],
    });
    expect((await get(v)).json<{ boatLine: unknown }>().boatLine).toEqual([
      [0.9, 0.5],
      [0.1, 0.5],
    ]);
    expect(
      (await send('PUT', `/api/videos/${v}/boat-line`, { points: [[0.1, 0.5]] })).statusCode,
    ).toBe(400);
    expect((await send('DELETE', `/api/videos/${v}/boat-line`)).statusCode).toBe(204);
    expect((await get(v)).json<{ boatLine: unknown }>().boatLine).toBeNull();
  });

  it("another club's video is a 404, and measurements go with their video", async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('b-' || gen_random_uuid(), 'Other') returning id`,
    );
    const theirs = await videoIn(other?.id ?? '');
    expect((await get(theirs)).statusCode).toBe(404);
    expect(
      (
        await send('PUT', `/api/videos/${theirs}/boat-line`, {
          points: [
            [0, 0],
            [1, 1],
          ],
        })
      ).statusCode,
    ).toBe(404);

    const v = await videoIn(pilot);
    const anna = await rowerIn(pilot);
    await markAt(pilot, v, 3);
    await send('PUT', `/api/videos/${v}/angles`, knee(3, anna));
    await send('PUT', `/api/videos/${v}/boat-line`, {
      points: [
        [0, 0.5],
        [1, 0.5],
      ],
    });
    await asOwner(`delete from video where id = $1`, [v]);
    expect(await asOwner(`select 1 from angle_measure where video_id = $1`, [v])).toEqual([]);
    expect(await asOwner(`select 1 from video_boat_line where video_id = $1`, [v])).toEqual([]);
  });

  it('merging two roster entries moves the measurements; the kept one wins a clash', async () => {
    const v = await videoIn(pilot);
    const [from, into] = [await rowerIn(pilot), await rowerIn(pilot)];
    await markAt(pilot, v, 10);
    await markAt(pilot, v, 20, 'finish');
    await send('PUT', `/api/videos/${v}/angles`, knee(10, from, 0.6)); // clashes with into's
    await send('PUT', `/api/videos/${v}/angles`, knee(10, into, 0.5));
    await send('PUT', `/api/videos/${v}/angles`, knee(20, from));
    const merged = await send('POST', `/api/rowers/${from}/merge`, { into });
    expect(merged.statusCode).toBe(200);
    const rows = await asOwner<{ frame: number; rower_id: string; points: number[][] }>(
      `select frame, rower_id, points from angle_measure where video_id = $1 order by frame`,
      [v],
    );
    expect(rows.map((r) => [r.frame, r.rower_id])).toEqual([
      [10, into],
      [20, into],
    ]);
    expect(rows[0]?.points[2]).toEqual([0.5, 0.5]);
  });
});
