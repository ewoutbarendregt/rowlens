import { describe, expect, inject, it } from 'vitest';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { connectDatabase } from './client.ts';

async function ready(databaseUrl: string) {
  const database = connectDatabase(databaseUrl);
  const app = await buildApp({
    config: loadConfig({}),
    clientDir: null,
    readinessChecks: [database.readiness],
    logger: false,
  });
  try {
    const res = await app.inject({ url: '/projects/rowlens/health/ready' });
    return { status: res.statusCode, body: res.json<{ checks: unknown[] }>() };
  } finally {
    await app.close();
    await database.close();
  }
}

describe('/health/ready with the database', () => {
  it('is ready when Postgres answers', async () => {
    const res = await ready(inject('appUrl'));
    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual([{ name: 'db', ok: true }]);
  });

  it('answers 503 quickly when Postgres is unreachable', async () => {
    const started = Date.now();
    const res = await ready('postgres://rowlens_app:x@127.0.0.1:1/rowlens');
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual([{ name: 'db', ok: false }]);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('answers 503 when the password is wrong', async () => {
    const url = new URL(inject('appUrl'));
    url.password = 'wrong';
    expect((await ready(url.toString())).status).toBe(503);
  });
});
