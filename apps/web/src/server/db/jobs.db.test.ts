import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { asOwner, createTwoClubs } from './test/fixtures.ts';

// The queue contract the Python worker relies on (ADR-0008), exercised as rowlens_app.
let app: pg.Client;
let clubs: { a: string; b: string };
// Unique per run: other db test files share the database.
const TYPE = `test.job.${String(Date.now())}`;

const claim = async (worker = 'w1', types = [TYPE], lease = 60) =>
  (
    await app.query<{
      id: string;
      club_id: string;
      type: string;
      payload: unknown;
      attempts: number;
    }>('select * from rowlens_claim_job($1, $2, $3)', [worker, types, lease])
  ).rows;

beforeAll(async () => {
  clubs = await createTwoClubs();
  app = new pg.Client({ connectionString: inject('appUrl') });
  await app.connect();
});

afterAll(async () => {
  await app.end();
});

beforeEach(async () => {
  await asOwner('delete from job where type = $1', [TYPE]);
});

const enqueue = (clubId: string, opts: { maxAttempts?: number; delayed?: boolean } = {}) =>
  asOwner<{ id: string }>(
    `insert into job (club_id, type, payload, max_attempts, run_after)
     values ($1, $2, '{"n":1}', $3, now() + ($4 || ' seconds')::interval) returning id`,
    [clubId, TYPE, opts.maxAttempts ?? 3, opts.delayed === true ? '3600' : '0'],
  );

describe('rowlens_claim_job', () => {
  it('claims one queued job of the requested types across clubs, once', async () => {
    const [a] = await enqueue(clubs.a);
    const [b] = await enqueue(clubs.b);
    const first = await claim();
    const second = await claim('w2');
    expect([first[0]?.id, second[0]?.id].sort()).toEqual([a?.id, b?.id].sort());
    expect(first[0]).toMatchObject({ type: TYPE, payload: { n: 1 }, attempts: 1 });
    expect(await claim('w3')).toEqual([]);
    expect(await claim('w1', ['other.type'])).toEqual([]);
  });

  it('waits for run_after', async () => {
    await enqueue(clubs.a, { delayed: true });
    expect(await claim()).toEqual([]);
  });

  it('takes over a job whose lease expired, and marks it dead after the last attempt', async () => {
    const [j] = await enqueue(clubs.a, { maxAttempts: 2 });
    expect((await claim('w1', [TYPE], 0))[0]?.attempts).toBe(1);
    // Lease 0 s: expired immediately, as if the worker died.
    expect((await claim('w2', [TYPE], 0))[0]?.attempts).toBe(2);
    expect(await claim('w3')).toEqual([]);
    const [row] = await asOwner<{ status: string; last_error: string }>(
      'select status, last_error from job where id = $1',
      [j?.id],
    );
    expect(row).toEqual({ status: 'dead', last_error: 'lease expired on the last attempt' });
  });

  it('a claimed job is then only visible inside its own club (RLS)', async () => {
    await enqueue(clubs.a);
    const [claimed] = await claim();
    await app.query('begin');
    await app.query("select set_config('app.club_id', $1, true)", [clubs.b]);
    expect((await app.query('select id from job where id = $1', [claimed?.id])).rows).toEqual([]);
    await app.query("select set_config('app.club_id', $1, true)", [clubs.a]);
    expect((await app.query('select id from job where id = $1', [claimed?.id])).rowCount).toBe(1);
    await app.query('rollback');
  });

  it('notifies listeners on insert', async () => {
    const listener = new pg.Client({ connectionString: inject('appUrl') });
    await listener.connect();
    try {
      await listener.query('listen rowlens_jobs');
      const got = new Promise<string | undefined>((resolve) => {
        listener.on('notification', (n) => {
          if (n.payload === TYPE) resolve(n.payload);
        });
      });
      await enqueue(clubs.a);
      expect(await got).toBe(TYPE);
    } finally {
      await listener.end();
    }
  });
});
