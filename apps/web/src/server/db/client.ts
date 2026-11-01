import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { ReadinessCheck } from '../health.ts';
import * as schema from './schema.ts';

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle; repositories receive one from `withTenant`, never the pool. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DatabaseHandle {
  db: Database;
  readiness: ReadinessCheck;
  close: () => Promise<void>;
}

/** Connects as `rowlens_app`. Only the server's wiring calls this; route code gets repositories. */
export function connectDatabase(url: string, poolSize = 10): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: poolSize,
    connectionTimeoutMillis: 2_000,
    idleTimeoutMillis: 30_000,
    // A runaway query must not hold a connection (and its tenant transaction) forever.
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 15_000,
    application_name: 'rowlens-web',
  });
  // An idle client losing its connection (DB restart) emits here; without a listener it crashes the process.
  pool.on('error', () => undefined);
  return {
    db: drizzle({ client: pool, schema }),
    readiness: {
      name: 'db',
      check: async () => {
        await pool.query('select 1');
      },
    },
    close: () => pool.end(),
  };
}
