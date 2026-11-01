import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppServer } from './server.ts';

const server = createAppServer({ basePath: '/projects/rowlens', version: 'test' });
let origin = '';

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

describe('placeholder server', () => {
  it('answers health checks under the base path', async () => {
    const res = await fetch(`${origin}/projects/rowlens/health/live`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: 'test' });
  });

  it('does not answer outside the base path', async () => {
    expect((await fetch(`${origin}/health/live`)).status).toBe(404);
    expect((await fetch(`${origin}/projects/audioscribe/health/live`)).status).toBe(404);
  });
});
