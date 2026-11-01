import { expect, test } from '@playwright/test';
import { edgeUrl, expectedVersion } from './env.ts';

// Runs only against the local Caddy stack (`pnpm e2e:edge`), which uses the exact route proposed for
// trustable.nl (infra/caddy/rowlens.caddy). Checks that the route works and leaves the other apps alone.
test.skip(edgeUrl === undefined, 'needs the edge stack: pnpm edge:up');

const MB = 1024 * 1024;

test.describe('route for /projects/rowlens', () => {
  test('redirects the bare path to the trailing-slash form', async ({ request }) => {
    const res = await request.get('/projects/rowlens', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers()['location']).toBe('/projects/rowlens/');
  });

  test('forwards the path unchanged to rowlens-web', async ({ request }) => {
    // Only reachable if Caddy kept the prefix: the app answers nothing outside /projects/rowlens.
    const res = await request.get('/projects/rowlens/health/live');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: expectedVersion });
    expect(res.headers()['x-request-id']).toBeTruthy();
  });

  test('keeps our CSP and adds the site-wide headers', async ({ request }) => {
    const res = await request.get('/projects/rowlens/', { headers: { accept: 'text/html' } });
    const headers = res.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['strict-transport-security']).toContain('max-age=31536000');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['server']).toBeUndefined();
  });

  test('lets a 16 MB tus chunk through to the app', async ({ request }) => {
    // `request_body max_size 64MB` is only a backstop: Caddy enforces it while the upstream reads the
    // body, so an endpoint that answers without reading (like this 404) never sees a 413. The tus
    // endpoint (#45/#46) must enforce chunk and upload sizes itself.
    const res = await request.post('/projects/rowlens/api/does-not-exist', {
      data: Buffer.alloc(16 * MB),
      // Browsers send Origin on POST; the app refuses state-changing requests without ours.
      headers: {
        'content-type': 'application/offset+octet-stream',
        origin: new URL(edgeUrl ?? 'http://localhost').origin,
      },
    });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(res.headers()['x-request-id']).toBeTruthy();
  });
});

test.describe('other apps on the same Caddy are unaffected', () => {
  test('AudioScribe still gets its prefix stripped', async ({ request }) => {
    const res = await request.get('/projects/audioscribe/health');
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe('audioscribe stand-in saw /health');
  });

  test('the trustable.nl site still gets everything else', async ({ request }) => {
    for (const path of ['/', '/radar/some-post', '/projects/rowlensclub', '/projects/']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
      expect(await res.text(), path).toBe(`trustable stand-in saw ${path}`);
    }
  });
});
