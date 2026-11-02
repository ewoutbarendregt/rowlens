import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'moments-test-code';

let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie = '';
let pilot = '';
let other = '';

function api(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({
    method,
    url: `${BASE}${url}`,
    headers: {
      cookie,
      origin: ORIGIN,
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
  });
}

/** A ready video with a line at frame 10 and a remark at frame 20. */
async function videoWithNotes(clubId: string) {
  const [s] = await asOwner<{ id: string }>(
    `insert into rowing_session (club_id, title, session_date) values ($1, 'Notes', '2026-11-02') returning id`,
    [clubId],
  );
  const [v] = await asOwner<{ id: string }>(
    `insert into video (club_id, session_id, original_filename, content_type, perspective, size_bytes,
       status, frame_count, fps_num, fps_den)
     values ($1, $2, 'clip.mov', 'video/quicktime', 'boat', 4, 'ready', 300, 30, 1) returning id`,
    [clubId, s?.id],
  );
  const [line, remark] = await asOwner<{ id: string }>(
    `insert into annotation (club_id, video_id, frame, kind, body, author_name, shape)
     values ($1, $2, 10, 'line', '', 'Coach', '{"points":[[0.1,0.1],[0.2,0.2]]}'),
            ($1, $2, 20, 'note', 'Catch later', 'Coach', null)
     returning id`,
    [clubId, v?.id],
  );
  return {
    sessionId: s?.id ?? '',
    videoId: v?.id ?? '',
    lineId: line?.id ?? '',
    remarkId: remark?.id ?? '',
  };
}

async function rowers(clubId: string, n: number, archived = false): Promise<string[]> {
  const rows = await asOwner<{ id: string }>(
    `insert into rower (club_id, display_name, archived_at)
     select $1, 'M' || i || ' ' || $2, $3 from generate_series(1, $4) i returning id`,
    [clubId, randomUUID().slice(0, 8), archived ? new Date() : null, n],
  );
  return rows.map((r) => r.id);
}

const assign = (videoId: string, frame: number, rowerIds: (string | undefined)[]) =>
  api('PUT', `/api/videos/${videoId}/frames/${String(frame)}/rowers`, { rowerIds });

const assigned = async (videoId: string, frame: number) => {
  const res = await api('GET', `/api/videos/${videoId}/annotations`);
  const body = res.json<{ moments: { frame: number; rowers: { id: string }[] }[] }>();
  return (body.moments.find((m) => m.frame === frame)?.rowers ?? []).map((r) => r.id).sort();
};

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'a'.repeat(64),
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
  const [b] = await asOwner<{ id: string }>(
    `insert into club (slug, name) values ('moments-' || gen_random_uuid(), 'Other') returning id`,
  );
  other = b?.id ?? '';
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

describe('who a note is for', () => {
  it('assigns, replaces and clears the rowers of a note, and logs every change', async () => {
    const { videoId } = await videoWithNotes(pilot);
    const [a, b, c] = await rowers(pilot, 3);

    const first = await assign(videoId, 10, [a, b]);
    expect(first.statusCode).toBe(200);
    expect(first.json<{ rowers: unknown[] }>().rowers).toHaveLength(2);
    expect(await assigned(videoId, 10)).toEqual([a, b].sort());

    await assign(videoId, 10, [b, c]);
    expect(await assigned(videoId, 10)).toEqual([b, c].sort());
    await assign(videoId, 10, []);
    expect(await assigned(videoId, 10)).toEqual([]);

    const log = await asOwner<{ rower_id: string; action: string }>(
      `select l.rower_id, l.action from moment_rower_log l join moment m on m.id = l.moment_id
       where m.video_id = $1 order by l.at, l.action`,
      [videoId],
    );
    const count = (action: string) => log.filter((l) => l.action === action).length;
    expect([count('assigned'), count('unassigned')]).toEqual([3, 3]);
  });

  it('needs something drawn or written at the frame', async () => {
    const { videoId } = await videoWithNotes(pilot);
    const [a] = await rowers(pilot, 1);
    const res = await assign(videoId, 15, [a]);
    expect([res.statusCode, res.json()]).toEqual([409, { error: 'no_moment' }]);
  });

  it('refuses unknown rowers, duplicates and newly assigned archived rowers', async () => {
    const { videoId } = await videoWithNotes(pilot);
    const [a, b] = await rowers(pilot, 2);
    const [gone] = await rowers(pilot, 1, true);
    expect((await assign(videoId, 10, [randomUUID()])).json()).toEqual({ error: 'unknown_rower' });
    expect((await assign(videoId, 10, [a, a])).statusCode).toBe(400);
    expect((await assign(videoId, 10, [gone])).json()).toEqual({ error: 'archived_rower' });

    await assign(videoId, 10, [a, b]);
    await asOwner('update rower set archived_at = now() where id = $1', [b]);
    expect((await assign(videoId, 10, [a, b])).statusCode).toBe(200);
  });

  it('goes with the note: frame delete, last annotation delete, video delete', async () => {
    const { videoId, lineId, remarkId } = await videoWithNotes(pilot);
    const [a] = await rowers(pilot, 1);
    await assign(videoId, 10, [a]);
    await assign(videoId, 20, [a]);

    expect((await api('DELETE', `/api/annotations/${lineId}`)).statusCode).toBe(204);
    expect(
      await asOwner('select id from moment where video_id = $1 and frame = 10', [videoId]),
    ).toEqual([]);

    expect((await api('DELETE', `/api/videos/${videoId}/frames/20/annotations`)).statusCode).toBe(
      204,
    );
    expect(await asOwner('select id from moment where video_id = $1', [videoId])).toEqual([]);
    expect(remarkId).not.toBe('');

    const second = await videoWithNotes(pilot);
    await assign(second.videoId, 10, [a]);
    expect((await api('DELETE', `/api/videos/${second.videoId}`)).statusCode).toBe(204);
    expect(await asOwner('select id from moment where video_id = $1', [second.videoId])).toEqual(
      [],
    );
    expect(await asOwner('select id from rower where id = $1', [a])).toHaveLength(1);
  });

  it('keeps the note when one of several annotations at the frame is deleted', async () => {
    const { videoId, lineId } = await videoWithNotes(pilot);
    const [a] = await rowers(pilot, 1);
    await asOwner(
      `insert into annotation (club_id, video_id, frame, kind, body, author_name)
       values ($1, $2, 10, 'note', 'Also this', 'Coach')`,
      [pilot, videoId],
    );
    await assign(videoId, 10, [a]);
    await api('DELETE', `/api/annotations/${lineId}`);
    expect(await assigned(videoId, 10)).toEqual([a]);
  });

  it('moves notes along when two roster entries are merged', async () => {
    const { videoId } = await videoWithNotes(pilot);
    const [keep, dup] = await rowers(pilot, 2);
    await assign(videoId, 10, [keep, dup]);
    await assign(videoId, 20, [dup]);
    expect((await api('POST', `/api/rowers/${dup ?? ''}/merge`, { into: keep })).statusCode).toBe(
      200,
    );
    expect(await assigned(videoId, 10)).toEqual([keep]);
    expect(await assigned(videoId, 20)).toEqual([keep]);
  });

  it("never reads or writes another club's notes, or assigns another club's rower", async () => {
    const foreign = await videoWithNotes(other);
    const [theirs] = await rowers(other, 1);
    await asOwner(`insert into moment (club_id, video_id, frame) values ($1, $2, 10)`, [
      other,
      foreign.videoId,
    ]);
    expect((await assign(foreign.videoId, 10, [])).statusCode).toBe(404);
    expect((await api('GET', `/api/videos/${foreign.videoId}/annotations`)).statusCode).toBe(404);

    const mine = await videoWithNotes(pilot);
    const res = await assign(mine.videoId, 10, [theirs]);
    expect([res.statusCode, res.json()]).toEqual([400, { error: 'unknown_rower' }]);
    expect(
      await asOwner('select id from moment where video_id = $1', [foreign.videoId]),
    ).toHaveLength(1);
  });
});
