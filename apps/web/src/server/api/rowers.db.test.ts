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
const CODE = 'rowers-test-code';

interface Rower {
  id: string;
  displayName: string;
  email: string | null;
  archivedAt: string | null;
}

let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie = '';
let pilot = '';
let other = '';

/** A surname nobody else in this run has, so tests don't see each other's rowers as similar. */
const unique = () => `T${randomUUID().slice(0, 8)}`;

function api(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
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

async function addRower(displayName: string, email?: string): Promise<Rower> {
  const res = await api('POST', '/api/rowers', { displayName, email, confirmNew: true });
  expect(res.statusCode).toBe(201);
  return res.json<Rower>();
}

async function listed(archived?: 'include' | 'only'): Promise<Rower[]> {
  const res = await api(
    'GET',
    `/api/rowers${archived === undefined ? '' : `?archived=${archived}`}`,
  );
  expect(res.statusCode).toBe(200);
  return res.json<{ rowers: Rower[] }>().rowers;
}

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'e'.repeat(64),
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
    `insert into club (slug, name) values ('rowers-' || gen_random_uuid(), 'Other') returning id`,
  );
  other = b?.id ?? '';
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

describe('the club roster', () => {
  it('adds rowers without an account and lists them alphabetically', async () => {
    const family = unique();
    const zoe = await addRower(`Zoë ${family}`);
    const anna = await addRower(`Anna ${family}`, ' Anna@Example.COM ');
    expect(anna.email).toBe('anna@example.com');
    const names = (await listed())
      .filter((r) => r.displayName.endsWith(family))
      .map((r) => r.displayName);
    expect(names).toEqual([`Anna ${family}`, `Zoë ${family}`]);
    const [stored] = await asOwner<{ club_id: string; user_id: string | null }>(
      'select club_id, user_id from rower where id = $1',
      [zoe.id],
    );
    expect(stored).toEqual({ club_id: pilot, user_id: null });
  });

  it('asks before adding a name that looks like an existing rower', async () => {
    const family = unique();
    const jan = await addRower(`Jan ${family}`);
    const similar = await api('POST', '/api/rowers', {
      displayName: `jan  ${family.toLowerCase()}`,
    });
    expect(similar.statusCode).toBe(409);
    expect(similar.json()).toMatchObject({ error: 'similar', candidates: [{ id: jan.id }] });

    const confirmed = await api('POST', '/api/rowers', {
      displayName: `Jan ${family}`,
      confirmNew: true,
    });
    expect(confirmed.statusCode).toBe(201);
    expect((await listed()).filter((r) => r.displayName === `Jan ${family}`)).toHaveLength(2);
  });

  it('rejects bad input and a second rower with the same e-mail', async () => {
    expect((await api('POST', '/api/rowers', { displayName: '  ' })).statusCode).toBe(400);
    expect((await api('POST', '/api/rowers', { displayName: 'x'.repeat(61) })).statusCode).toBe(
      400,
    );
    expect(
      (await api('POST', '/api/rowers', { displayName: unique(), email: 'not-an-address' }))
        .statusCode,
    ).toBe(400);
    const address = `${unique().toLowerCase()}@example.com`;
    await addRower(unique(), address);
    const taken = await api('POST', '/api/rowers', {
      displayName: unique(),
      email: address.toUpperCase(),
      confirmNew: true,
    });
    expect([taken.statusCode, taken.json()]).toEqual([409, { error: 'email_taken' }]);
  });

  it('renames, sets and clears the e-mail, archives and restores', async () => {
    const rower = await addRower(unique());
    const renamed = `Piet ${unique()}`;
    const edit = await api('PATCH', `/api/rowers/${rower.id}`, {
      displayName: renamed,
      email: 'Piet@Example.com',
    });
    expect(edit.json()).toMatchObject({ displayName: renamed, email: 'piet@example.com' });
    const cleared = await api('PATCH', `/api/rowers/${rower.id}`, { email: '' });
    expect(cleared.json()).toMatchObject({ email: null });

    await api('PATCH', `/api/rowers/${rower.id}`, { archived: true });
    expect((await listed()).some((r) => r.id === rower.id)).toBe(false);
    expect((await listed('only')).some((r) => r.id === rower.id)).toBe(true);
    expect((await listed('include')).some((r) => r.id === rower.id)).toBe(true);
    await api('PATCH', `/api/rowers/${rower.id}`, { archived: false });
    expect((await listed()).some((r) => r.id === rower.id)).toBe(true);

    expect((await api('PATCH', `/api/rowers/${rower.id}`, {})).statusCode).toBe(400);
  });

  it('merges two entries for one person and keeps the e-mail', async () => {
    const family = unique();
    const keep = await addRower(`Kees ${family}`);
    const duplicate = await addRower(
      `Kees ${family} (dubbel)`,
      `${family.toLowerCase()}@example.com`,
    );
    const merged = await api('POST', `/api/rowers/${duplicate.id}/merge`, { into: keep.id });
    expect(merged.statusCode).toBe(200);
    expect(merged.json()).toMatchObject({
      id: keep.id,
      email: `${family.toLowerCase()}@example.com`,
    });
    expect(await asOwner('select id from rower where id = $1', [duplicate.id])).toEqual([]);
    expect((await api('POST', `/api/rowers/${keep.id}/merge`, { into: keep.id })).statusCode).toBe(
      400,
    );
  });

  it("never shows or changes another club's rowers", async () => {
    const [foreign] = await asOwner<{ id: string }>(
      `insert into rower (club_id, display_name) values ($1, $2) returning id`,
      [other, `Foreign ${unique()}`],
    );
    const foreignId = foreign?.id ?? '';
    const mine = await addRower(unique());

    expect((await listed('include')).some((r) => r.id === foreignId)).toBe(false);
    expect((await api('PATCH', `/api/rowers/${foreignId}`, { archived: true })).statusCode).toBe(
      404,
    );
    expect(
      (await api('POST', `/api/rowers/${foreignId}/merge`, { into: mine.id })).statusCode,
    ).toBe(404);
    expect(
      (await api('POST', `/api/rowers/${mine.id}/merge`, { into: foreignId })).statusCode,
    ).toBe(404);
    const [after] = await asOwner<{ archived_at: string | null }>(
      'select archived_at from rower where id = $1',
      [foreignId],
    );
    expect(after).toEqual({ archived_at: null });
    expect(await asOwner('select id from rower where id = $1', [mine.id])).toHaveLength(1);
  });

  it('is a 404 without access', async () => {
    const res = await app.inject({ method: 'GET', url: `${BASE}/api/rowers` });
    expect(res.statusCode).toBe(404);
  });
});
