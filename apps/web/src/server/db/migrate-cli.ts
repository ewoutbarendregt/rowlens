// Entry point of the `migrate` Compose service (`node dist/server/db/migrate-cli.js`) and `pnpm db:migrate`.
import { migrateDatabase } from './migrate.ts';

const ownerUrl = process.env['DATABASE_OWNER_URL'];
const appPassword = process.env['ROWLENS_APP_DB_PASSWORD'];
if (ownerUrl === undefined || appPassword === undefined) {
  console.error('DATABASE_OWNER_URL and ROWLENS_APP_DB_PASSWORD are required');
  process.exit(64);
}

await migrateDatabase({ ownerUrl, appPassword });
console.log('migrations applied');
