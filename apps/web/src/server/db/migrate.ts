import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));
export const APP_ROLE = 'rowlens_app';

// Generated on the server (`openssl rand -hex 32`); the strict format keeps it safe to inline below,
// since ALTER ROLE can't take a bind parameter.
const APP_PASSWORD = /^[A-Za-z0-9_-]{16,128}$/;

export interface MigrateOptions {
  /** Connection as the owner role (`rowlens_owner`), which owns every table. */
  ownerUrl: string;
  /** Password for `rowlens_app`; set on every run, so changing it in .env rotates it. */
  appPassword: string;
  migrationsFolder?: string;
}

/**
 * Ensures the app role and its privileges, then applies pending migrations (ADR-0005):
 * - `rowlens_app` logs in, but is no superuser, can't bypass RLS and owns nothing;
 * - it gets SELECT/INSERT/UPDATE/DELETE on tables the owner creates from now on (a migration can
 *   REVOKE per table, e.g. for an append-only audit log), and no CREATE anywhere;
 * - the migrations journal lives in schema `drizzle`, which the app can't see.
 */
export async function migrateDatabase(opts: MigrateOptions): Promise<void> {
  if (!APP_PASSWORD.test(opts.appPassword)) {
    throw new Error('ROWLENS_APP_DB_PASSWORD must be 16–128 characters of [A-Za-z0-9_-]');
  }
  const client = new pg.Client({ connectionString: opts.ownerUrl });
  await client.connect();
  try {
    const role = client.escapeIdentifier(APP_ROLE);
    const password = client.escapeLiteral(opts.appPassword);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
          CREATE ROLE ${role};
        END IF;
      END $$`);
    await client.query(
      `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${password}`,
    );
    await client.query(`
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO ${role};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role};
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${role};`);

    await migrate(drizzle({ client }), {
      migrationsFolder: opts.migrationsFolder ?? MIGRATIONS_FOLDER,
      migrationsSchema: 'drizzle',
    });
  } finally {
    await client.end();
  }
}
