import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import { hashAccessCode } from '../pilot/code.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'test-code-only';
let handle: DatabaseHandle;
let app: FastifyInstance;
let cookie = '';

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: await hashAccessCode(CODE),
      SESSION_SECRET: 'd'.repeat(64),
    }),
    clientDir: null,
    database: handle.db,
    logger: false,
  });
  const res = await app.inject({
    method: 'POST',
    url: `${BASE}/api/pilot/access`,
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: CODE }),
  });
  cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

describe('GET /api/club behind the pilot gate', () => {
  it('is the same 404 as an unknown route without the cookie', async () => {
    const res = await app.inject({ url: `${BASE}/api/club` });
    const unknown = await app.inject({ url: `${BASE}/api/nope` });
    expect([res.statusCode, res.json()]).toEqual([unknown.statusCode, unknown.json()]);
    expect(res.statusCode).toBe(404);
  });

  it('answers 404 for a forged cookie', async () => {
    const forged = cookie.replace(/\.[\w-]{43}$/, `.${'A'.repeat(43)}`);
    expect(
      (await app.inject({ url: `${BASE}/api/club`, headers: { cookie: forged } })).statusCode,
    ).toBe(404);
  });

  it('returns the pilot club, read through RLS', async () => {
    const res = await app.inject({ url: `${BASE}/api/club`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ slug: 'pilot', name: 'Pilot' });
    expect(res.headers['cache-control']).toBe('private, no-store');
  });
});

describe('rowlens_club_id()', () => {
  it('resolves an exact slug only and is the only way the app sees clubs without context', async () => {
    const [pilot] = await asOwner<{ id: string }>(`select id from club where slug = 'pilot'`);
    const lookup = async (slug: string) =>
      (await handle.db.execute<{ id: string | null }>(sql`select rowlens_club_id(${slug}) as id`))
        .rows[0]?.id;
    expect(await lookup('pilot')).toBe(pilot?.id);
    expect(await lookup('PILOT')).toBeNull();
    expect(await lookup('%')).toBeNull();
    expect((await handle.db.execute(sql`select * from club`)).rows).toEqual([]);
  });

  it('runs with a pinned search_path', async () => {
    const [fn] = await asOwner<{ prosecdef: boolean; proconfig: string[] }>(
      `select prosecdef, proconfig from pg_proc where proname = 'rowlens_club_id'`,
    );
    expect(fn).toEqual({ prosecdef: true, proconfig: ['search_path=public, pg_temp'] });
  });
});
