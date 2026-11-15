import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, migrateDatabase } from './migrate.ts';
it('classifies existing platform-created trainings without promoting club-admin or unknown creators', async () => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withUsername('rowlens_owner')
    .withPassword('upgrade_test_password')
    .start();
  const folder = await mkdtemp(join(tmpdir(), 'rowlens-visibility-upgrade-'));
  const client = new pg.Client({ connectionString: container.getConnectionUri() });
  const options = { ownerUrl: container.getConnectionUri(), appPassword: 'test_app_password_only' };
  try {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { idx: number }[];
    };
    journal.entries = journal.entries.filter((e) => e.idx < 28);
    await writeFile(journalPath, JSON.stringify(journal));
    await migrateDatabase({ ...options, migrationsFolder: folder });
    await client.connect();
    await client.query(
      "insert into app_user(email,display_name,verified_at) values('platform.upgrade@example.test','Synthetic platform',now()),('clubadmin.upgrade@example.test','Synthetic club admin',now())",
    );
    await client.query(
      "insert into platform_admin(user_id) select id from app_user where email='platform.upgrade@example.test'",
    );
    await client.query(
      "insert into membership(club_id,user_id,roles) select c.id,u.id,ARRAY['admin'] from club c cross join app_user u where c.slug='pilot'",
    );
    await client.query(
      "insert into rowing_session(club_id,title,session_date,created_by_user_id) select c.id,u.email,'2026-11-15',u.id from club c cross join app_user u where c.slug='pilot'",
    );
    await client.query(
      "insert into rowing_session(club_id,title,session_date) select id,'Ownerless','2026-11-15' from club where slug='pilot'",
    );
    await migrateDatabase(options);
    expect(
      (await client.query('select title,is_example from rowing_session order by title')).rows,
    ).toEqual([
      { title: 'Ownerless', is_example: false },
      { title: 'clubadmin.upgrade@example.test', is_example: false },
      { title: 'platform.upgrade@example.test', is_example: true },
    ]);
    await client.query('update rowing_session set created_by_user_id=null where is_example');
    await client.query('delete from platform_admin');
    await migrateDatabase(options);
    expect(
      (await client.query('select count(*)::int n from rowing_session where is_example')).rows,
    ).toEqual([{ n: 1 }]);
    expect(
      (await client.query('select count(*)::int n from app_user where primary_club_id is not null'))
        .rows,
    ).toEqual([{ n: 0 }]);
  } finally {
    await client.end();
    await container.stop();
    await rm(folder, { recursive: true, force: true });
  }
}, 120_000);
