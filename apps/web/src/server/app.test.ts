import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BUILD_INFO_FILE, buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const BASE = '/projects/rowlens';
const INDEX = '<!doctype html><title>RowLens</title><div id="root"></div>';
const HTML = { accept: 'text/html,application/xhtml+xml' };

let clientDir = '';
let app: FastifyInstance;

async function writeClient(dir: string, basePath: string): Promise<void> {
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'index.html'), INDEX);
  await writeFile(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  await writeFile(join(dir, 'favicon.svg'), '<svg/>');
  await writeFile(join(dir, BUILD_INFO_FILE), JSON.stringify({ basePath }));
}

beforeAll(async () => {
  clientDir = await mkdtemp(join(tmpdir(), 'rowlens-client-'));
  await writeClient(clientDir, BASE);
  app = await buildApp({
    config: loadConfig({ BASE_PATH: BASE, APP_VERSION: '1.2.3' }),
    clientDir,
    logger: false,
  });
});

afterAll(async () => {
  await app.close();
  await rm(clientDir, { recursive: true, force: true });
});

describe('health', () => {
  it('reports liveness under the base path, uncached', async () => {
    const res = await app.inject({ url: `${BASE}/health/live` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: '1.2.3' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('is not reachable outside the base path', async () => {
    expect((await app.inject({ url: '/health/live' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/projects/audioscribe/health/live' })).statusCode).toBe(404);
  });

  it('reports readiness per check and 503 when one fails', async () => {
    const ready = await buildApp({
      config: loadConfig({ BASE_PATH: BASE }),
      clientDir: null,
      logger: false,
      readinessChecks: [
        { name: 'db', check: async () => {} },
        { name: 'storage', check: () => Promise.reject(new Error('down')) },
      ],
    });
    const res = await ready.inject({ url: `${BASE}/health/ready` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status: 'unavailable',
      checks: [
        { name: 'db', ok: true },
        { name: 'storage', ok: false },
      ],
    });
    await ready.close();
  });
});

describe('SPA serving', () => {
  it('redirects the bare base path to its trailing-slash form', async () => {
    const res = await app.inject({ url: BASE });
    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe(`${BASE}/`);
  });

  it.each([`${BASE}/`, `${BASE}/c/club/sessions/42`, `${BASE}/login?next=%2F`])(
    'serves the app shell for page navigation to %s',
    async (url) => {
      const res = await app.inject({ url, headers: HTML });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe(INDEX);
      expect(res.headers['cache-control']).toBe('no-cache');
    },
  );

  it('does not serve the shell to non-page requests or outside the base path', async () => {
    expect((await app.inject({ url: `${BASE}/missing.js` })).statusCode).toBe(404);
    expect((await app.inject({ url: '/other/app', headers: HTML })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'POST', url: `${BASE}/somewhere`, headers: HTML })).statusCode,
    ).toBe(404);
  });

  it('answers unknown API routes with JSON, never the shell', async () => {
    const res = await app.inject({ url: `${BASE}/api/nope`, headers: HTML });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('caches fingerprinted assets forever and other files not at all', async () => {
    const asset = await app.inject({ url: `${BASE}/assets/app-abc123.js` });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const icon = await app.inject({ url: `${BASE}/favicon.svg` });
    expect(icon.headers['cache-control']).toBe('no-cache');
  });

  it('refuses to start with a client built for another base path', async () => {
    const other = await mkdtemp(join(tmpdir(), 'rowlens-client-'));
    await writeClient(other, '/projects/rowing');
    await expect(
      buildApp({ config: loadConfig({ BASE_PATH: BASE }), clientDir: other, logger: false }),
    ).rejects.toThrow(/built for BASE_PATH "\/projects\/rowing"/);
    await rm(other, { recursive: true, force: true });
  });
});

describe('security headers and request ids', () => {
  it('sets a strict CSP without inline scripts or framing', async () => {
    const res = await app.inject({ url: `${BASE}/`, headers: HTML });
    const csp = res.headers['content-security-policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('echoes a well-formed X-Request-Id and replaces a malformed one', async () => {
    const kept = await app.inject({
      url: `${BASE}/health/live`,
      headers: { 'x-request-id': 'abc-123-def-456' },
    });
    expect(kept.headers['x-request-id']).toBe('abc-123-def-456');
    const replaced = await app.inject({
      url: `${BASE}/health/live`,
      headers: { 'x-request-id': '<script>' },
    });
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
