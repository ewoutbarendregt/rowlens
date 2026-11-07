// The server Playwright tests against (playwright.config.ts → webServer): a throwaway Postgres 16
// (Testcontainers; removed when this process exits), migrated like production, then the built app
// (`dist/server/main.js`) connected as rowlens_app. Needs Docker and `pnpm build`.
import pg from 'pg';
import { mkdtemp, rm } from 'node:fs/promises';
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
process.env['AUTH_VERIFY_PER_IP_15M'] = '1000';
const media = await mkdtemp(join(tmpdir(), 'rowlens-e2e-media-'));
process.env['MEDIA_DIR'] = media;
// CI runners' disks are often > 85 % full; production keeps the 85 % pause (ADR-0006).
process.env['DISK_PAUSE_RATIO'] = '0.99';

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void Promise.allSettled([db.stop(), rm(media, { recursive: true, force: true })]).finally(() =>
      process.exit(0),
    );
  });
}

// @ts-expect-error -- built output, no types; exists after `pnpm build`.
await import('../dist/server/main.js');
