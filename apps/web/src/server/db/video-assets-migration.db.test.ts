import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import { expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, migrateDatabase } from './migrate.ts';

it('backfills existing media without changing paths or feedback and supports old-image upload/worker writes', async () => {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('rowlens')
    .withUsername('rowlens_owner')
    .withPassword('test_owner_password')
    .start();
  const folder = await mkdtemp(join(tmpdir(), 'rowlens-pre-assets-'));
  const owner = new pg.Client({ connectionString: container.getConnectionUri() });
  const password = 'test_app_password_only';
  try {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
    const journalPath = join(folder, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.filter((e) => e.tag !== '0028_training_video_reuse');
    await writeFile(journalPath, JSON.stringify(journal));
    await migrateDatabase({
      ownerUrl: container.getConnectionUri(),
      appPassword: password,
      migrationsFolder: folder,
    });
    await owner.connect();
    const club = (await owner.query<{ id: string }>("select id from club where slug='pilot'"))
      .rows[0]?.id;
    const session = (
      await owner.query<{ id: string }>(
        "insert into rowing_session(club_id,title,session_date) values($1,'Existing','2026-11-09') returning id",
        [club],
      )
    ).rows[0]?.id;
    const video = (
      await owner.query<{ id: string }>(
        "insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes,status,renditions_bytes,frame_count) values($1,$2,'existing.mp4','video/mp4','bank',42,'ready',18,300) returning id",
        [club, session],
      )
    ).rows[0]?.id;
    await owner.query(
      "insert into annotation(club_id,video_id,frame,body,author_name) values($1,$2,12,'Existing feedback','Existing author')",
      [club, video],
    );
    await migrateDatabase({ ownerUrl: container.getConnectionUri(), appPassword: password });
    expect((await owner.query('select id,asset_id from video where id=$1', [video])).rows).toEqual([
      { id: video, asset_id: video },
    ]);
    expect(
      (
        await owner.query('select size_bytes,renditions_bytes from video_asset where id=$1', [
          video,
        ])
      ).rows,
    ).toEqual([{ size_bytes: '42', renditions_bytes: '18' }]);
    expect(
      (await owner.query('select body from annotation where video_id=$1', [video])).rows,
    ).toEqual([{ body: 'Existing feedback' }]);
    const url = new URL(container.getConnectionUri());
    url.username = 'rowlens_app';
    url.password = password;
    const legacy = new pg.Client({ connectionString: url.toString() });
    await legacy.connect();
    try {
      await legacy.query('begin');
      await legacy.query(
        "select set_config('app.club_id',$1,true),set_config('app.service','true',true)",
        [club],
      );
      const uploaded = (
        await legacy.query<{ id: string }>(
          "insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes) values($1,$2,'legacy-upload.mp4','video/mp4','bank',5) returning id",
          [club, session],
        )
      ).rows[0]?.id;
      await legacy.query(
        "update video set status='ready',frame_count=30,renditions_bytes=10 where id=$1",
        [uploaded],
      );
      expect(
        (await legacy.query<{ n: string }>('select rowlens_media_bytes() as n')).rows[0]?.n,
      ).toBe('75');
      await legacy.query('delete from video where id=$1', [uploaded]);
      expect(
        (await legacy.query<{ n: string }>('select rowlens_media_bytes() as n')).rows[0]?.n,
      ).toBe('60');
      await legacy.query('commit');
    } finally {
      await legacy.end();
    }
  } finally {
    await owner.end();
    await container.stop();
    await rm(folder, { recursive: true, force: true });
  }
}, 30000);
