// The server Playwright tests against (playwright.config.ts → webServer): a throwaway Postgres 16
// (Testcontainers; removed when this process exits), migrated like production, then the built app
// (`dist/server/main.js`) connected as rowlens_app. Needs Docker and `pnpm build`.
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { migrateDatabase } from '../src/server/db/migrate.ts';

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

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void db.stop().finally(() => process.exit(0));
  });
}

// @ts-expect-error -- built output, no types; exists after `pnpm build`.
await import('../dist/server/main.js');
