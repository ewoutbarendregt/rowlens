// The server Playwright tests against (playwright.config.ts → webServer): a throwaway Postgres 16
// (Testcontainers; removed when this process exits), migrated like production, then the built app
// (`dist/server/main.js`) connected as rowlens_app. Needs Docker and `pnpm build`.
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrateDatabase } from '../src/server/db/migrate.ts';
import { hashAccessCode } from '../src/server/pilot/code.ts';
import { pilotCode } from './env.ts';

const APP_PASSWORD = 'e2e_app_password_only';

const db = await new PostgreSqlContainer('postgres:16-alpine')
  .withDatabase('rowlens')
  .withUsername('rowlens_owner')
  .withPassword('e2e_owner_password_only')
  .start();
const ownerUrl = db.getConnectionUri();
await migrateDatabase({ ownerUrl, appPassword: APP_PASSWORD });

const appUrl = new URL(ownerUrl);
appUrl.username = 'rowlens_app';
appUrl.password = APP_PASSWORD;
process.env['DATABASE_URL'] = appUrl.toString();
process.env['PILOT_ACCESS_CODE_HASH'] = await hashAccessCode(pilotCode);
process.env['SESSION_SECRET'] = randomBytes(32).toString('hex');
// Every test signs in; the browser projects share one IP.
process.env['PILOT_ATTEMPTS_PER_MINUTE'] = '100';
const media = await mkdtemp(join(tmpdir(), 'rowlens-e2e-media-'));
process.env['MEDIA_DIR'] = media;

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void Promise.allSettled([db.stop(), rm(media, { recursive: true, force: true })]).finally(() =>
      process.exit(0),
    );
  });
}

// @ts-expect-error -- built output, no types; exists after `pnpm build`.
await import('../dist/server/main.js');
