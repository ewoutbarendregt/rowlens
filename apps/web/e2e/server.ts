// The server Playwright tests against (playwright.config.ts → webServer): a throwaway Postgres 16
// (Testcontainers; removed when this process exits), migrated like production, then the built app
// (`dist/server/main.js`) connected as rowlens_app. Needs Docker and `pnpm build`.
import pg from 'pg';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrateDatabase } from '../src/server/db/migrate.ts';
import { adminEmail, authCode, authEmail } from './env.ts';

const APP_PASSWORD = 'e2e_app_password_only';

const db = await new PostgreSqlContainer('postgres:16-alpine')
  .withDatabase('rowlens')
  .withUsername('rowlens_owner')
  .withPassword('e2e_owner_password_only')
  .start();
const ownerUrl = db.getConnectionUri();
await migrateDatabase({ ownerUrl, appPassword: APP_PASSWORD });
if (process.env['E2E_UNIFIED'] === 'true') {
  process.env['UNIFIED_USERS'] = 'true';
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    const u = await owner.query<{ id: string }>(
      "insert into app_user(email,display_name,first_name,last_name,verified_at) values($1,'E2E Administrator','E2E','Administrator',now()) returning id",
      [adminEmail],
    );
    await owner.query('insert into platform_admin(user_id) values($1)', [u.rows[0]?.id]);
  } finally {
    await owner.end();
  }
}

const appUrl = new URL(ownerUrl);
appUrl.username = 'rowlens_app';
appUrl.password = APP_PASSWORD;
process.env['DATABASE_URL'] = appUrl.toString();
process.env['AUTH_ALLOWED_EMAILS'] = authEmail;
process.env['AUTH_ADMIN_EMAILS'] = adminEmail;
process.env['OTP_PEPPER'] = 'e'.repeat(64);
process.env['AUTH_TEST_CODE'] = authCode;
process.env['AUTH_OTP_PER_EMAIL_15M'] = '1000';
process.env['AUTH_OTP_PER_IP_HOUR'] = '1000';
// Browser projects share one synthetic client IP and directory history. Production defaults to 30.
process.env['AUTH_REGISTRATION_DIRECTORY_PER_IP_MINUTE'] = '1000';
process.env['AUTH_VERIFY_PER_IP_15M'] = '1000';
const media = await mkdtemp(join(tmpdir(), 'rowlens-e2e-media-'));
process.env['MEDIA_DIR'] = media;
// CI runners' disks are often > 85 % full; production keeps the 85 % pause (ADR-0006).
process.env['DISK_PAUSE_RATIO'] = '0.99';

if (process.env['E2E_VIDEO_REUSE'] === 'true') {
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    const user = await owner.query<{ id: string }>(
      "insert into app_user(email,display_name,first_name,last_name,verified_at) values('reuse-source@example.com','Source Coach','Source','Coach',now()) returning id",
    );
    const session = await owner.query<{ id: string }>(
      "insert into rowing_session(club_id,title,session_date,created_by_user_id) select id,'Source video reuse fixture','2026-11-09',$1 from club where slug='pilot' returning id",
      [user.rows[0]?.id],
    );
    const entry = await owner.query<{ id: string; club_id: string }>(
      "insert into video(club_id,session_id,original_filename,content_type,perspective,size_bytes,status,fps_num,fps_den,width,height,duration_ms,frame_count,seq) select club_id,id,'synthetic-reuse.webm','video/webm','bank',4,'ready',30,1,640,360,10000,300,1 from rowing_session where id=$1 returning id,club_id",
      [session.rows[0]?.id],
    );
    const v = entry.rows[0];
    if (!v) throw new Error('Missing synthetic reuse entry');
    // Use the real media-store directory convention.
    const { videoKey } = await import('../src/server/media/store.ts');
    const key = videoKey(v.club_id, v.id);
    await mkdir(join(media, key, 'renditions'), { recursive: true });
    await copyFile(
      new URL('../public/demo-media/e2e-30fps.webm', import.meta.url),
      join(media, key, 'renditions/play-540'),
    );
    await writeFile(
      join(media, key, 'poster'),
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=',
        'base64',
      ),
    );
    await owner.query('update video set renditions=$1 where id=$2', [
      JSON.stringify([
        {
          name: 'play-540',
          key: `${key}/renditions/play-540`,
          width: 640,
          height: 360,
          bytes: 4,
          contentType: 'video/webm',
        },
      ]),
      v.id,
    ]);
    await owner.query(
      "insert into annotation(club_id,video_id,frame,kind,body,author_name,author_user_id,shape) values($1,$2,0,'note','Original technique note','Source Coach',$3,null),($1,$2,0,'line','','Source Coach',$3,'{\"points\":[[0.2,0.4],[0.8,0.4]]}')",
      [v.club_id, v.id, user.rows[0]?.id],
    );
  } finally {
    await owner.end();
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void Promise.allSettled([db.stop(), rm(media, { recursive: true, force: true })]).finally(() =>
      process.exit(0),
    );
  });
}

// @ts-expect-error -- built output, no types; exists after `pnpm build`.
await import('../dist/server/main.js');
