import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @rowlens/web db:generate` writes a new SQL migration from schema.ts. Migrations are
// reviewed like code and applied by `db:migrate` (src/server/db/migrate.ts), never by drizzle-kit push.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './src/server/db/migrations',
});
