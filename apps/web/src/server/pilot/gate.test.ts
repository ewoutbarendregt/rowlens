import type { FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { hashAccessCode } from './code.ts';
import { PILOT_COOKIE } from './gate.ts';

const BASE = '/projects/rowlens';
const ORIGIN = 'https://trustable.nl';
const CODE = 'k7pq-3mxa-9rtd-wv2e';
const SECRET = 'c'.repeat(64);
let codeHash = '';
let app: FastifyInstance;

beforeAll(async () => {
  codeHash = await hashAccessCode(CODE);
});

afterEach(async () => {
  await app.close();
});

async function start(env: Record<string, string> = {}) {
  app = await buildApp({
    config: loadConfig({
      PUBLIC_ORIGIN: ORIGIN,
      PILOT_ACCESS_CODE_HASH: codeHash,
      SESSION_SECRET: SECRET,
      ...env,
    }),
    clientDir: null,
    resolvePilotClubId: () => Promise.resolve('0b9f7a4e-3c2d-4e1f-8a6b-5c4d3e2f1a0b'),
    logger: false,
  });
  return app;
}

const access = (code: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: `${BASE}/api/pilot/access`,
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    payload: JSON.stringify({ code }),
  });

const status = (cookie?: string) =>
  app.inject({
    url: `${BASE}/api/pilot/status`,
    headers: cookie === undefined ? {} : { cookie },
  });

const cookieFrom = (setCookie: unknown) => String(setCookie).split(';')[0] ?? '';

describe('pilot gate', () => {
  it('reports no access without a cookie', async () => {
    await start();
    const res = await status();
    expect(res.json()).toEqual({ enabled: true, access: false });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sets a strict, HttpOnly, path-scoped, Secure cookie for the right code', async () => {
    await start();
    const res = await access(' K7PQ 3MXA 9RTD WV2E ');
    expect(res.statusCode).toBe(204);
    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(new RegExp(`^${PILOT_COOKIE}=v1\\.\\d+\\.[\\w-]{43}; `));
    expect(setCookie).toContain(`Path=${BASE}/`);
    expect(setCookie).toContain('Max-Age=2592000');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Secure');
    expect((await status(cookieFrom(setCookie))).json()).toEqual({ enabled: true, access: true });
  });

  it('refuses a wrong code without a cookie', async () => {
    await start();
    const res = await access('wrong-code');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'invalid_code' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects malformed bodies like a wrong code', async () => {
    await start();
    for (const payload of ['{}', '{"code":""}', JSON.stringify({ code: 'x'.repeat(101) })]) {
      const res = await app.inject({
        method: 'POST',
        url: `${BASE}/api/pilot/access`,
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        payload,
      });
      expect(res.statusCode).toBe(403);
    }
  });

  it('limits attempts per IP to 5 a minute, even with the right code', async () => {
    await start();
    for (let i = 0; i < 5; i++) expect((await access('wrong')).statusCode).toBe(403);
    const limited = await access(CODE);
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits attempts from all IPs together to 30 a minute', async () => {
    await start();
    // Behind Caddy, req.ip comes from X-Forwarded-For (trustProxy covers the docker network).
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `${BASE}/api/pilot/access`,
        remoteAddress: '172.18.0.2',
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          'x-forwarded-for': `203.0.113.${String(i)}`,
        },
        payload: JSON.stringify({ code: 'wrong' }),
      });
      expect(res.statusCode).toBe(403);
    }
    expect((await access(CODE)).statusCode).toBe(429);
  });

  it('logout clears the cookie', async () => {
    await start();
    const res = await app.inject({
      method: 'POST',
      url: `${BASE}/api/pilot/logout`,
      headers: { origin: ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(new RegExp(`^${PILOT_COOKIE}=; .*Max-Age=0`));
  });

  it('ignores cookies made with another code', async () => {
    await start();
    const cookie = cookieFrom((await access(CODE)).headers['set-cookie']);
    await app.close();
    await start({ PILOT_ACCESS_CODE_HASH: await hashAccessCode('another-code') });
    expect((await status(cookie)).json()).toEqual({ enabled: true, access: false });
  });

  it('is closed when no code is configured', async () => {
    app = await buildApp({
      config: loadConfig({ PUBLIC_ORIGIN: ORIGIN }),
      clientDir: null,
      logger: false,
    });
    expect((await status()).json()).toEqual({ enabled: false, access: false });
    const res = await access(CODE);
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });
});

describe('Origin check (CSRF)', () => {
  it('refuses state-changing requests from another or no origin', async () => {
    await start();
    expect((await access(CODE, { origin: 'https://evil.example' })).statusCode).toBe(403);
    const noOrigin = await app.inject({
      method: 'POST',
      url: `${BASE}/api/pilot/access`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ code: CODE }),
    });
    expect(noOrigin.statusCode).toBe(403);
    expect(noOrigin.json()).toEqual({ error: 'forbidden_origin' });
  });

  it('lets reads through without an Origin', async () => {
    await start();
    expect((await status()).statusCode).toBe(200);
  });
});
