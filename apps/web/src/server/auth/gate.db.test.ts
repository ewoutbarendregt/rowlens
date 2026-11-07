import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase, type DatabaseHandle } from '../db/client.ts';
import { asOwner } from '../db/test/fixtures.ts';
import type { LoginMail } from './mail.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const EMAIL = `coach-${randomUUID()}@example.com`;
const UNKNOWN = `unknown-${randomUUID()}@example.com`;
let app: FastifyInstance;
let handle: DatabaseHandle;
let delivered: LoginMail[] = [];
let testIp = 0;

beforeAll(async () => {
  handle = connectDatabase(inject('appUrl'), 2);
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      AUTH_ALLOWED_EMAILS: EMAIL,
      OTP_PEPPER: 'a'.repeat(64),
    }),
    clientDir: null,
    database: handle.db,
    logger: false,
    deliverLoginCode: (mail) => {
      delivered.push(mail);
      return Promise.resolve();
    },
  });
});

afterAll(async () => {
  await app.close();
  await handle.close();
});

beforeEach(async () => {
  testIp += 1;
  delivered = [];
  await asOwner(`delete from app_user where email = $1`, [EMAIL]);
  await asOwner(`delete from auth_event`);
});

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: `${BASE}${path}`,
    headers: {
      origin: ORIGIN,
      'sec-fetch-site': 'same-origin',
      'x-forwarded-for': `198.51.100.${String(testIp)}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });

function cookieHeader(response: Awaited<ReturnType<typeof post>>): string {
  return response.cookies.map((item) => `${item.name}=${item.value}`).join('; ');
}

function cookieValue(cookies: string, name: string): string {
  return (
    cookies
      .split('; ')
      .find((part) => part.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ''
  );
}

async function requestCode(email = EMAIL): Promise<string | undefined> {
  delivered = [];
  const response = await post('/api/auth/otp', { email });
  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual({ accepted: true });
  return delivered[0]?.code;
}

async function signIn(): Promise<string> {
  const code = await requestCode();
  expect(code).toMatch(/^\d{6}$/);
  const response = await post('/api/auth/verify', { email: EMAIL, code });
  expect(response.statusCode).toBe(204);
  return cookieHeader(response);
}

describe('email OTP authentication', () => {
  it('keeps global identities and rate events behind pinned definer functions', async () => {
    await expect(handle.db.execute(sql`select * from app_user`)).rejects.toMatchObject({
      cause: { code: '42501' },
    });
    await expect(handle.db.execute(sql`select * from auth_event`)).rejects.toMatchObject({
      cause: { code: '42501' },
    });
    const functions = await asOwner<{ proname: string; prosecdef: boolean; proconfig: string[] }>(`
      select proname, prosecdef, proconfig
      from pg_proc
      where proname like 'rowlens_auth_%'
      order by proname`);
    expect(functions.map((fn) => fn.proname)).toEqual([
      'rowlens_auth_access',
      'rowlens_auth_ensure_user',
      'rowlens_auth_identity',
      'rowlens_auth_identity_for_club',
      'rowlens_auth_rate_hit',
      'rowlens_auth_session',
    ]);
    for (const fn of functions) {
      expect(fn).toMatchObject({ prosecdef: true, proconfig: ['search_path=public, pg_temp'] });
    }
  });

  it('reports an enabled but locked gate without a session', async () => {
    const response = await app.inject({ url: `${BASE}/api/auth/status` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: true, access: false });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not disclose whether an email is allowlisted', async () => {
    delivered = [];
    const known = await post('/api/auth/otp', { email: EMAIL });
    const knownMail = delivered[0];
    delivered = [];
    const unknown = await post('/api/auth/otp', { email: UNKNOWN });
    expect([known.statusCode, known.json()]).toEqual([unknown.statusCode, unknown.json()]);
    expect(knownMail?.email).toBe(EMAIL);
    expect(delivered).toEqual([]);
  });

  it('sends the code mail in the language on screen, Dutch by default', async () => {
    const languageOf = async (body: Record<string, string>) => {
      delivered = [];
      // Four requests are over the per-address limit; that limit has its own test.
      await asOwner(`delete from auth_event`);
      await post('/api/auth/otp', { email: EMAIL, ...body }, { 'accept-language': 'en-US' });
      return delivered[0]?.locale;
    };
    // The browser's language doesn't decide; the switch does.
    expect(await languageOf({})).toBe('nl');
    expect(await languageOf({ language: 'en' })).toBe('en');
    expect(await languageOf({ language: 'nl' })).toBe('nl');
    expect(await languageOf({ language: 'xx' })).toBe('nl');
  });

  it('stores only HMACs, expires codes and never stores the plaintext code', async () => {
    const code = await requestCode();
    const [row] = await asOwner<{
      code_hash: string;
      request_ip_hash: string;
      expires_in: number;
    }>(
      `select lc.code_hash, lc.request_ip_hash,
              extract(epoch from (lc.expires_at - lc.created_at))::int as expires_in
       from login_code lc join app_user u on u.id = lc.user_id
       where u.email = $1 order by lc.created_at desc limit 1`,
      [EMAIL],
    );
    expect(row?.code_hash).not.toBe(code);
    expect(row?.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.request_ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.expires_in).toBe(600);
  });

  it('limits code requests per email and per IP without changing the public response', async () => {
    delivered = [];
    for (let request = 0; request < 4; request += 1) {
      const response = await post('/api/auth/otp', { email: EMAIL });
      expect([response.statusCode, response.json()]).toEqual([202, { accepted: true }]);
    }
    expect(delivered).toHaveLength(3);

    await asOwner(`delete from auth_event`);
    for (let request = 0; request < 11; request += 1) {
      const response = await post('/api/auth/otp', { email: UNKNOWN });
      expect([response.statusCode, response.json()]).toEqual([202, { accepted: true }]);
    }
    const [events] = await asOwner<{ count: number }>(
      `select count(*)::int as count from auth_event where kind = 'otp-ip'`,
    );
    expect(events?.count).toBe(10);
  });

  it('locks a code after five failures and consumes a successful code once', async () => {
    const code = await requestCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await post('/api/auth/verify', { email: EMAIL, code: '000000' })).statusCode).toBe(
        403,
      );
    }
    expect((await post('/api/auth/verify', { email: EMAIL, code })).statusCode).toBe(403);

    const nextCode = await requestCode();
    const success = await post('/api/auth/verify', { email: EMAIL, code: nextCode });
    expect(success.statusCode).toBe(204);
    expect((await post('/api/auth/verify', { email: EMAIL, code: nextCode })).statusCode).toBe(403);
  });

  it('sets secure scoped cookies and requires the matching CSRF token', async () => {
    const cookies = await signIn();
    const code = await requestCode();
    const login = await post('/api/auth/verify', { email: EMAIL, code });
    const setCookie = String(login.headers['set-cookie']);
    expect(setCookie).toContain('__Secure-rowlens_sid=');
    expect(setCookie).toContain('rowlens_csrf=');
    expect(setCookie).toContain(`Path=${BASE}`);
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');

    const noCsrf = await post('/api/auth/logout-others', undefined, { cookie: cookies });
    expect([noCsrf.statusCode, noCsrf.json()]).toEqual([403, { error: 'invalid_csrf' }]);
    const csrf = cookieValue(cookies, 'rowlens_csrf');
    const ok = await post('/api/auth/logout-others', undefined, {
      cookie: cookies,
      'x-csrf-token': csrf,
    });
    expect(ok.statusCode).toBe(204);
  });

  it('opens only the session club and revokes the current session on logout', async () => {
    const cookies = await signIn();
    const club = await app.inject({ url: `${BASE}/api/club`, headers: { cookie: cookies } });
    expect(club.statusCode).toBe(200);
    expect(club.json()).toEqual({ slug: 'pilot', name: 'WVIJburg' });

    const csrf = cookieValue(cookies, 'rowlens_csrf');
    const logout = await post('/api/auth/logout', undefined, {
      cookie: cookies,
      'x-csrf-token': csrf,
    });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');
    expect(
      (await app.inject({ url: `${BASE}/api/club`, headers: { cookie: cookies } })).statusCode,
    ).toBe(404);
  });

  it('can revoke every other session while retaining the current device', async () => {
    const first = await signIn();
    const second = await signIn();
    const csrf = cookieValue(second, 'rowlens_csrf');
    expect(
      (
        await post('/api/auth/logout-others', undefined, {
          cookie: second,
          'x-csrf-token': csrf,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: `${BASE}/api/club`, headers: { cookie: first } })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `${BASE}/api/club`, headers: { cookie: second } })).statusCode,
    ).toBe(200);
  });

  it('limits code verification per IP and rejects cross-site mutations', async () => {
    const code = await requestCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await post('/api/auth/verify', { email: EMAIL, code: '000000' })).statusCode).toBe(
        403,
      );
    }
    expect((await post('/api/auth/verify', { email: EMAIL, code })).statusCode).toBe(429);

    const crossSite = await app.inject({
      method: 'POST',
      url: `${BASE}/api/auth/otp`,
      headers: {
        origin: ORIGIN,
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ email: EMAIL }),
    });
    expect([crossSite.statusCode, crossSite.json()]).toEqual([403, { error: 'forbidden_site' }]);
  });
});
