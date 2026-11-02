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
const CODE = 'lineups-test-code';

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

async function session(clubId: string, date = '2026-11-01'): Promise<string> {
  const [row] = await asOwner<{ id: string }>(
    `insert into rowing_session (club_id, title, session_date) values ($1, $2, $3) returning id`,
    [clubId, `Lineup ${randomUUID().slice(0, 8)}`, date],
  );
  return row?.id ?? '';
}

async function rowers(clubId: string, n: number, archived = false): Promise<string[]> {
  const rows = await asOwner<{ id: string }>(
    `insert into rower (club_id, display_name, archived_at)
     select $1, 'R' || i || ' ' || $2, $3 from generate_series(1, $4) i returning id`,
    [clubId, randomUUID().slice(0, 8), archived ? new Date() : null, n],
  );
  return rows.map((r) => r.id);
}

const seat = (n: number, rowerId: string | undefined) => ({ seat: n, rowerId: rowerId ?? '' });

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'f'.repeat(64),
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
    `insert into club (slug, name) values ('lineups-' || gen_random_uuid(), 'Other') returning id`,
  );
  other = b?.id ?? '';
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

describe('session lineups', () => {
  it('saves a coastal quad with cox, returns it bow to stroke with the cox last', async () => {
    const id = await session(pilot);
    const [a, b, c, cox] = await rowers(pilot, 4);
    const res = await api('PUT', `/api/sessions/${id}/lineup`, {
      boatType: 'C4x+',
      seats: [seat(0, cox), seat(4, c), seat(1, a), seat(2, b)],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ lineup: { seat: number }[] }>().lineup.map((s) => s.seat)).toEqual([
      1, 2, 4, 0,
    ]);

    const detail = await api('GET', `/api/sessions/${id}`);
    expect(detail.json()).toMatchObject({
      boatType: 'C4x+',
      lineup: [
        { seat: 1, rower: { id: a, archived: false } },
        { seat: 2 },
        { seat: 4 },
        { seat: 0 },
      ],
    });
    const list = await api('GET', '/api/sessions');
    expect(
      list
        .json<{ sessions: { id: string; boatType: string }[] }>()
        .sessions.find((s) => s.id === id),
    ).toMatchObject({ boatType: 'C4x+' });
  });

  it('replaces the whole lineup and can clear it', async () => {
    const id = await session(pilot);
    const [a, b] = await rowers(pilot, 2);
    await api('PUT', `/api/sessions/${id}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, a), seat(2, b)],
    });
    const swapped = await api('PUT', `/api/sessions/${id}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, b)],
    });
    expect(swapped.json()).toMatchObject({ lineup: [{ seat: 1, rower: { id: b } }] });
    const cleared = await api('PUT', `/api/sessions/${id}/lineup`, { boatType: null, seats: [] });
    expect(cleared.json()).toEqual({ boatType: null, lineup: [] });
    expect(await asOwner('select * from lineup_seat where session_id = $1', [id])).toEqual([]);
  });

  it('refuses seats the boat does not have, a rower twice, and unknown boats', async () => {
    const id = await session(pilot);
    const [a, b] = await rowers(pilot, 2);
    const bad = [
      { boatType: 'C2x', seats: [seat(3, a)] }, // a double has no seat 3
      { boatType: 'C2x', seats: [seat(0, a)] }, // nor a cox
      { boatType: 'C2x', seats: [seat(1, a), seat(2, a)] },
      { boatType: 'C2x', seats: [seat(1, a), seat(1, b)] },
      { boatType: 'C3x', seats: [] },
      { boatType: null, seats: [seat(1, a)] },
    ];
    for (const payload of bad) {
      const res = await api('PUT', `/api/sessions/${id}/lineup`, payload);
      expect([payload, res.statusCode]).toEqual([payload, 400]);
    }
  });

  it('keeps an archived rower who already sat there, but never seats one anew', async () => {
    const id = await session(pilot);
    const [a, b] = await rowers(pilot, 2);
    const [gone] = await rowers(pilot, 1, true);
    const fresh = await api('PUT', `/api/sessions/${id}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, a), seat(2, gone)],
    });
    expect([fresh.statusCode, fresh.json()]).toEqual([400, { error: 'archived_rower' }]);

    await api('PUT', `/api/sessions/${id}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, a), seat(2, b)],
    });
    await asOwner('update rower set archived_at = now() where id = $1', [b]);
    const kept = await api('PUT', `/api/sessions/${id}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, b), seat(2, a)],
    });
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({
      lineup: [{ seat: 1, rower: { id: b, archived: true } }, { seat: 2 }],
    });
  });

  it('moves seats along when two roster entries are merged', async () => {
    const both = await session(pilot);
    const only = await session(pilot);
    const [keep, dup, x] = await rowers(pilot, 3);
    await api('PUT', `/api/sessions/${both}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, keep), seat(2, dup)],
    });
    await api('PUT', `/api/sessions/${only}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, x), seat(2, dup)],
    });
    const merged = await api('POST', `/api/rowers/${dup ?? ''}/merge`, { into: keep });
    expect(merged.statusCode).toBe(200);
    expect((await api('GET', `/api/sessions/${both}`)).json()).toMatchObject({
      lineup: [{ seat: 1, rower: { id: keep } }],
    });
    expect((await api('GET', `/api/sessions/${only}`)).json()).toMatchObject({
      lineup: [
        { seat: 1, rower: { id: x } },
        { seat: 2, rower: { id: keep } },
      ],
    });
  });

  it('lists recent lineups to copy from, newest first, without the current session', async () => {
    const older = await session(pilot, '2030-01-01');
    const newer = await session(pilot, '2030-01-02');
    const [a, b] = await rowers(pilot, 2);
    await api('PUT', `/api/sessions/${older}/lineup`, {
      boatType: 'C2x',
      seats: [seat(1, a), seat(2, b)],
    });
    await api('PUT', `/api/sessions/${newer}/lineup`, { boatType: 'C1x', seats: [seat(1, b)] });
    const res = await api('GET', `/api/lineups/recent?except=${newer}&limit=10`);
    const sessions = res.json<{ sessions: { id: string; lineup: unknown[] }[] }>().sessions;
    expect(sessions.some((s) => s.id === newer)).toBe(false);
    expect(sessions[0]).toMatchObject({
      id: older,
      boatType: 'C2x',
      lineup: [{ seat: 1 }, { seat: 2 }],
    });
  });

  it('removes the lineup with the session', async () => {
    const id = await session(pilot);
    const [a] = await rowers(pilot, 1);
    await api('PUT', `/api/sessions/${id}/lineup`, { boatType: 'C1x', seats: [seat(1, a)] });
    expect((await api('DELETE', `/api/sessions/${id}`)).statusCode).toBe(204);
    expect(await asOwner('select * from lineup_seat where session_id = $1', [id])).toEqual([]);
    expect(await asOwner('select id from rower where id = $1', [a])).toHaveLength(1);
  });

  it("never reads or writes another club's lineup, or seats another club's rower", async () => {
    const foreign = await session(other);
    const [theirs] = await rowers(other, 1);
    await asOwner(
      `insert into lineup_seat (club_id, session_id, seat, rower_id) values ($1, $2, 1, $3)`,
      [other, foreign, theirs],
    );
    expect(
      (await api('PUT', `/api/sessions/${foreign}/lineup`, { boatType: 'C1x', seats: [] }))
        .statusCode,
    ).toBe(404);
    expect((await api('GET', `/api/sessions/${foreign}`)).statusCode).toBe(404);
    const recent = await api('GET', '/api/lineups/recent?limit=10');
    expect(
      recent.json<{ sessions: { id: string }[] }>().sessions.some((s) => s.id === foreign),
    ).toBe(false);

    const mine = await session(pilot);
    const res = await api('PUT', `/api/sessions/${mine}/lineup`, {
      boatType: 'C1x',
      seats: [seat(1, theirs)],
    });
    expect([res.statusCode, res.json()]).toEqual([400, { error: 'unknown_rower' }]);
    expect(
      await asOwner('select * from lineup_seat where session_id = $1', [foreign]),
    ).toHaveLength(1);
  });
});
