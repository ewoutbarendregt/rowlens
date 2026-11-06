import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import type { InviteMail, LoginMail } from '../auth/mail.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const ADMIN = `admin-${randomUUID()}@example.com`;
const SERVER_COACH = `coach-${randomUUID()}@example.com`;

let app: FastifyInstance;
let handle: DatabaseHandle;
let codes: LoginMail[] = [];
let invites: InviteMail[] = [];
let failInvite = false;
let ip = 0;
let admin = '';

const fresh = (who: string) => `${who}-${randomUUID()}@example.com`;

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      AUTH_ADMIN_EMAILS: ADMIN,
      AUTH_ALLOWED_EMAILS: SERVER_COACH,
      OTP_PEPPER: 'b'.repeat(64),
    }),
    clientDir: null,
    database: handle.db,
    logger: false,
    deliverLoginCode: (mail) => {
      codes.push(mail);
      return Promise.resolve();
    },
    deliverInvite: (mail) => {
      if (failInvite) return Promise.reject(new Error('smtp down'));
      invites.push(mail);
      return Promise.resolve();
    },
  });
  admin = await signIn(ADMIN);
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  invites = [];
  failInvite = false;
  await asOwner(`delete from auth_event`);
});

function send(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  cookies = '',
  body?: unknown,
) {
  ip += 1;
  const csrf = /rowlens_csrf=([^;]+)/.exec(cookies)?.[1] ?? '';
  return app.inject({
    method,
    url: `${BASE}${path}`,
    headers: {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': `203.0.113.${String(ip % 250)}`,
      ...(cookies === '' ? {} : { cookie: cookies, 'x-csrf-token': csrf }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}

/** Through the real OTP flow; returns the cookie header, or '' when the address has no access. */
async function signIn(email: string): Promise<string> {
  codes = [];
  expect((await send('POST', '/api/auth/otp', '', { email })).statusCode).toBe(202);
  const code = codes[0]?.code;
  if (code === undefined) return '';
  const res = await send('POST', '/api/auth/verify', '', { email, code });
  expect(res.statusCode).toBe(204);
  return res.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function roleOf(cookies: string): Promise<string | undefined> {
  const res = await send('GET', '/api/auth/status', cookies);
  return res.json<{ user?: { role: string } }>().user?.role;
}

async function entries(cookies = admin) {
  const res = await send('GET', '/api/admin/access', cookies);
  expect(res.statusCode).toBe(200);
  return res.json<{
    entries: {
      id: string | null;
      email: string;
      role: string;
      source: string;
      lastSeenAt: string | null;
    }[];
  }>().entries;
}

async function admit(email: string, role: string, cookies = admin) {
  return send('POST', '/api/admin/access', cookies, { email, roles: [role] });
}

describe('admins admit people (#42)', () => {
  it('makes the server admin an admin and lists both server lists', async () => {
    expect(await roleOf(admin)).toBe('admin');
    const list = await entries();
    expect(list.find((e) => e.email === ADMIN)).toMatchObject({
      source: 'server',
      role: 'admin',
      id: null,
    });
    expect(list.find((e) => e.email === ADMIN)?.lastSeenAt).not.toBeNull();
    expect(list.find((e) => e.email === SERVER_COACH)).toMatchObject({
      source: 'server',
      role: 'coach',
    });
  });

  it('lets an admitted address log in with the chosen role, and sends one invitation', async () => {
    const rower = fresh('Rower');
    expect(await signIn(rower)).toBe(''); // not admitted yet: no code, same 202
    const res = await admit(` ${rower.toUpperCase()} `, 'rower');
    expect([res.statusCode, res.json()]).toMatchObject([201, { invited: true }]);
    expect(invites).toHaveLength(1);
    expect(invites[0]).toMatchObject({ email: rower.toLowerCase(), loginUrl: `${ORIGIN}${BASE}/` });
    const cookies = await signIn(rower.toLowerCase());
    expect(await roleOf(cookies)).toBe('rower');
    expect((await admit(rower, 'coach')).statusCode).toBe(409);
  });

  it('keeps the access when the invitation mail fails, and says so', async () => {
    failInvite = true;
    const res = await admit(fresh('nomail'), 'coach');
    expect([res.statusCode, res.json()]).toMatchObject([201, { invited: false }]);
  });

  it('changes a role, also for someone already logged in', async () => {
    const coach = fresh('coach');
    await admit(coach, 'coach');
    const cookies = await signIn(coach);
    const id = (await entries()).find((e) => e.email === coach)?.id ?? '';
    expect(
      (await send('PATCH', `/api/admin/access/${id}`, admin, { roles: ['admin'] })).statusCode,
    ).toBe(204);
    expect(await roleOf(cookies)).toBe('admin');
    expect((await send('GET', '/api/admin/access', cookies)).statusCode).toBe(200);
  });

  it('removes access: membership and sessions end, and no new code is sent', async () => {
    const gone = fresh('gone');
    await admit(gone, 'coach');
    const cookies = await signIn(gone);
    const id = (await entries()).find((e) => e.email === gone)?.id ?? '';
    expect((await send('DELETE', `/api/admin/access/${id}`, admin)).statusCode).toBe(204);
    expect((await send('GET', '/api/sessions', cookies)).statusCode).toBe(404);
    expect(await signIn(gone)).toBe('');
    expect((await entries()).some((e) => e.email === gone)).toBe(false);
  });

  it('refuses changing your own access or removing the last app admin', async () => {
    const second = fresh('second');
    await admit(second, 'admin');
    const secondCookies = await signIn(second);
    const secondId = (await entries()).find((e) => e.email === second)?.id ?? '';
    // As that admin: their own row is off limits.
    expect((await send('DELETE', `/api/admin/access/${secondId}`, secondCookies)).json()).toEqual({
      error: 'self',
    });
    expect(
      (
        await send('PATCH', `/api/admin/access/${secondId}`, secondCookies, { roles: ['rower'] })
      ).json(),
    ).toEqual({ error: 'self' });
    // The server admin always remains, so the app admin can be removed by the server admin.
    expect((await send('DELETE', `/api/admin/access/${secondId}`, admin)).statusCode).toBe(204);
    // Server-managed admins can't be added or changed in the app.
    expect((await admit(ADMIN, 'rower')).json()).toEqual({ error: 'server_managed' });
  });

  it('is a 404 for coaches, rowers and anyone without a session', async () => {
    const coach = fresh('plain');
    await admit(coach, 'coach');
    const cookies = await signIn(coach);
    for (const [method, path] of [
      ['GET', '/api/admin/access'],
      ['POST', '/api/admin/access'],
      ['PATCH', `/api/admin/access/${randomUUID()}`],
      ['DELETE', `/api/admin/access/${randomUUID()}`],
    ] as const) {
      expect(
        (
          await send(
            method,
            path,
            cookies,
            method === 'GET' ? undefined : { roles: ['admin'], email: coach },
          )
        ).statusCode,
      ).toBe(404);
      expect((await send(method, path)).statusCode).toBe(404);
    }
  });

  it('logs every change with who did it', async () => {
    const logged = fresh('logged');
    await admit(logged, 'rower');
    const id = (await entries()).find((e) => e.email === logged)?.id ?? '';
    await send('PATCH', `/api/admin/access/${id}`, admin, { roles: ['coach'] });
    await send('DELETE', `/api/admin/access/${id}`, admin);
    const rows = await asOwner<{ action: string; role: string | null; by_user_id: string | null }>(
      `select action, role, by_user_id from club_access_log where email = $1 order by at`,
      [logged],
    );
    expect(rows.map((r) => [r.action, r.role])).toEqual([
      ['added', 'rower'],
      ['role_changed', 'coach'],
      ['removed', null],
    ]);
    expect(rows.every((r) => r.by_user_id !== null)).toBe(true);
  });

  it("never shows or changes another club's access list", async () => {
    const [other] = await asOwner<{ id: string }>(
      `insert into club (slug, name) values ('access-' || gen_random_uuid(), 'Other') returning id`,
    );
    const theirs = fresh('theirs');
    const [row] = await asOwner<{ id: string }>(
      `insert into club_access (club_id, email, roles) values ($1, $2, ARRAY['admin']) returning id`,
      [other?.id, theirs],
    );
    expect((await entries()).some((e) => e.email === theirs)).toBe(false);
    expect(
      (await send('PATCH', `/api/admin/access/${row?.id ?? ''}`, admin, { roles: ['rower'] }))
        .statusCode,
    ).toBe(404);
    expect((await send('DELETE', `/api/admin/access/${row?.id ?? ''}`, admin)).statusCode).toBe(
      404,
    );
    // Admitted in another club does not open this one.
    expect(await signIn(theirs)).toBe('');
  });
});
