import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, migrateDatabase } from './migrate.ts';

it('upgrades existing singleton roles and keeps accounts, active sessions and old audit history', async () => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withUsername('rowlens_owner')
    .withPassword('upgrade_test_password')
    .start();
  const folder = await mkdtemp(join(tmpdir(), 'rowlens-upgrade-'));
  const client = new pg.Client({ connectionString: container.getConnectionUri() });
  try {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { idx: number }[];
    };
    journal.entries = journal.entries.filter((entry) => entry.idx < 18);
    await writeFile(journalPath, JSON.stringify(journal));
    const options = {
      ownerUrl: container.getConnectionUri(),
      appPassword: 'test_app_password_only',
    };
    await migrateDatabase({ ...options, migrationsFolder: folder });
    await client.connect();
    const {
      rows: [club],
    } = await client.query<{ id: string }>(
      "insert into club(slug,name) values('upgrade','Upgrade') returning id",
    );
    for (const role of ['rower', 'coach', 'admin']) {
      await client.query(
        "insert into app_user(email,display_name,first_name,last_name,default_boat_type) values($1,'Old member','Old','Member','C2x')",
        [`${role}@example.com`],
      );
      await client.query(
        'insert into membership(club_id,user_id,role) select $1,id,$2 from app_user where email=$3',
        [club?.id, role, `${role}@example.com`],
      );
      await client.query('insert into club_access(club_id,email,role) values($1,$2,$3)', [
        club?.id,
        `${role}@example.com`,
        role,
      ]);
    }
    // A real pre-upgrade bearer session must still resolve through the replaced function.
    await client.query(
      "insert into user_session(club_id,token_hash,csrf_hash,user_id,expires_at) select $1,'upgrade-token','upgrade-csrf',id,now()+interval '1 day' from app_user where email='rower@example.com'",
      [club?.id],
    );
    await client.query(
      "insert into club_access_log(club_id,email,action,role) values($1,'rower@example.com','added','rower')",
      [club?.id],
    );
    await migrateDatabase(options);
    const memberships = await client.query<{ roles: string[] }>(
      'select roles from membership order by roles::text',
    );
    expect(memberships.rows.map((r) => r.roles)).toEqual([['admin'], ['coach'], ['rower']]);
    expect((await client.query('select roles from club_access order by roles::text')).rows).toEqual(
      memberships.rows,
    );
    expect(
      (
        await client.query(
          "select first_name,last_name,default_boat_type,theme,language,notes_visible,note_hold_seconds,drive_middle,settings_revision from app_user where email='rower@example.com'",
        )
      ).rows[0],
    ).toEqual({
      first_name: 'Old',
      last_name: 'Member',
      default_boat_type: 'C2x',
      theme: null,
      language: null,
      notes_visible: null,
      note_hold_seconds: null,
      drive_middle: null,
      settings_revision: 0,
    });
    expect(
      (await client.query("select roles from rowlens_auth_session('upgrade-token')")).rows,
    ).toEqual([{ roles: ['rower'] }]);
    expect((await client.query('select role,roles from club_access_log')).rows).toEqual([
      { role: 'rower', roles: null },
    ]);
    // Idempotent deploy retries do not replay the backfill over later multi-role edits.
    await client.query(
      "update membership set roles=ARRAY['rower','coach'] where roles=ARRAY['rower']",
    );
    await migrateDatabase(options);
    expect(
      (await client.query("select roles from rowlens_auth_session('upgrade-token')")).rows,
    ).toEqual([{ roles: ['rower', 'coach'] }]);
  } finally {
    await client.end();
    await container.stop();
    await rm(folder, { recursive: true, force: true });
  }
}, 120_000);
