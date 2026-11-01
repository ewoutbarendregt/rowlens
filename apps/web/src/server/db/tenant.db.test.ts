import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { connectDatabase, type DatabaseHandle } from './client.ts';
import { withTenant } from './tenant.ts';
import { asOwner, createTwoClubs } from './test/fixtures.ts';

// A tenant table like the real ones (club_id + the standard policy), private to this file.
const PROBE = 'tenant_probe';

let handle: DatabaseHandle;
let clubs: { a: string; b: string };

const rows = (result: { rows: unknown[] }) => result.rows as { note: string }[];
// Drizzle wraps driver errors ("Failed query: …"); Postgres' own message is the cause.
const RLS_VIOLATION = {
  cause: { message: expect.stringMatching(/row-level security/) as unknown },
};

beforeAll(async () => {
  clubs = await createTwoClubs();
  await asOwner(`
    create table ${PROBE} (id serial primary key, club_id uuid not null references club(id), note text not null);
    alter table ${PROBE} enable row level security;
    create policy ${PROBE}_tenant on ${PROBE} for all to rowlens_app
      using (club_id = nullif(current_setting('app.club_id', true), '')::uuid)
      with check (club_id = nullif(current_setting('app.club_id', true), '')::uuid);`);
  await asOwner(`insert into ${PROBE} (club_id, note) values ($1, 'a1'), ($1, 'a2'), ($2, 'b1')`, [
    clubs.a,
    clubs.b,
  ]);
  // One connection: every test reuses the connection the previous transaction ran on.
  handle = connectDatabase(inject('appUrl'), 1);
});

afterAll(async () => {
  await handle.close();
  await asOwner(`drop table ${PROBE}`);
});

const inClub = (clubId: string) => ({ clubId, userId: null });

describe('withTenant', () => {
  it('sets the club and user for the transaction', async () => {
    const userId = '6f1c2a5e-1d7b-4c0e-9a8f-3b2d1e0c9f8a';
    const settings = await withTenant(handle.db, { clubId: clubs.a, userId }, async (tx) => {
      const r = await tx.execute(
        sql`select current_setting('app.club_id') as club, current_setting('app.user_id') as "user"`,
      );
      return r.rows[0];
    });
    expect(settings).toEqual({ club: clubs.a, user: userId });
  });

  it('leaves nothing behind on the pooled connection after commit or rollback', async () => {
    await withTenant(handle.db, inClub(clubs.a), () => Promise.resolve());
    await expect(
      withTenant(handle.db, inClub(clubs.a), () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    const r = await handle.db.execute(sql`select current_setting('app.club_id', true) as club`);
    expect(r.rows[0]?.['club'] ?? '').toBe('');
    expect(rows(await handle.db.execute(sql.raw(`select note from ${PROBE}`)))).toEqual([]);
  });

  it('only reads rows of its own club', async () => {
    const notes = await withTenant(handle.db, inClub(clubs.a), async (tx) =>
      rows(await tx.execute(sql.raw(`select note from ${PROBE} order by note`))).map((r) => r.note),
    );
    expect(notes).toEqual(['a1', 'a2']);
  });

  it("can't write into another club, or change or delete its rows", async () => {
    await expect(
      withTenant(handle.db, inClub(clubs.a), (tx) =>
        tx.execute(sql`insert into ${sql.raw(PROBE)} (club_id, note) values (${clubs.b}, 'x')`),
      ),
    ).rejects.toMatchObject(RLS_VIOLATION);

    const changed = await withTenant(handle.db, inClub(clubs.a), async (tx) => {
      const u = await tx.execute(sql.raw(`update ${PROBE} set note = 'hacked' where note = 'b1'`));
      const d = await tx.execute(sql.raw(`delete from ${PROBE} where note = 'b1'`));
      return [u.rowCount, d.rowCount];
    });
    expect(changed).toEqual([0, 0]);
    expect(await asOwner(`select note from ${PROBE} where club_id = $1`, [clubs.b])).toEqual([
      { note: 'b1' },
    ]);
  });

  it("can't move a row to another club", async () => {
    await expect(
      withTenant(handle.db, inClub(clubs.a), (tx) =>
        tx.execute(sql`update ${sql.raw(PROBE)} set club_id = ${clubs.b} where note = 'a1'`),
      ),
    ).rejects.toMatchObject(RLS_VIOLATION);
  });

  it('sees only its own club in the club table', async () => {
    const seen = await withTenant(handle.db, inClub(clubs.b), async (tx) =>
      (await tx.execute(sql`select id from club`)).rows.map((r) => r['id']),
    );
    expect(seen).toEqual([clubs.b]);
  });

  it('rejects a malformed context before touching the database', async () => {
    await expect(
      withTenant(handle.db, { clubId: "x' or true --", userId: null }, () => Promise.resolve()),
    ).rejects.toThrow();
  });
});
