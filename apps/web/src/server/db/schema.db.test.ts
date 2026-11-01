import pg from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { migrateDatabase } from './migrate.ts';
import { asOwner } from './test/fixtures.ts';

async function asApp(text: string): Promise<unknown[]> {
  const client = new pg.Client({ connectionString: inject('appUrl') });
  await client.connect();
  try {
    return (await client.query<Record<string, unknown>>(text)).rows;
  } finally {
    await client.end();
  }
}

describe('database roles (ADR-0005)', () => {
  it('the app role is no superuser, cannot bypass RLS and owns nothing', async () => {
    const [role] = await asOwner(
      `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = 'rowlens_app'`,
    );
    expect(role).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
    });
    const owned = await asOwner(
      `select relname from pg_class where relowner = (select oid from pg_roles where rolname = 'rowlens_app')`,
    );
    expect(owned).toEqual([]);
  });

  it('the app role cannot create or alter tables', async () => {
    await expect(asApp('create table sneaky (id int)')).rejects.toThrow(/permission denied/);
    await expect(asApp('alter table club disable row level security')).rejects.toThrow(
      /must be owner/,
    );
  });

  it('the app role cannot read the migrations journal', async () => {
    await expect(asApp('select * from drizzle.__drizzle_migrations')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('migrating again is a no-op that keeps the app role working', async () => {
    const appPassword = new URL(inject('appUrl')).password;
    await migrateDatabase({ ownerUrl: inject('ownerUrl'), appPassword });
    await expect(asApp('select 1 as ok')).resolves.toEqual([{ ok: 1 }]);
  });

  it('refuses an app password that is unsafe to inline', async () => {
    await expect(
      migrateDatabase({ ownerUrl: inject('ownerUrl'), appPassword: "x'; drop table club; --" }),
    ).rejects.toThrow(/ROWLENS_APP_DB_PASSWORD/);
  });
});

describe('schema invariants', () => {
  it('every table with a club_id column has RLS enabled and at least one policy', async () => {
    const unprotected = await asOwner(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and (exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'club_id' and not a.attisdropped)
             or c.relname = 'club')
        and (not c.relrowsecurity or not exists (select 1 from pg_policy p where p.polrelid = c.oid))`);
    expect(unprotected).toEqual([]);
  });
});
