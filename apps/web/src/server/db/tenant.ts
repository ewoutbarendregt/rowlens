import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database, Tx } from './client.ts';

/** Who is acting, in which club (ADR-0005). Roles are added with the permission model (#40). */
export interface TenantContext {
  clubId: string;
  /** `null` while the pilot access code (#84) stands in for login: no individual user yet. */
  userId: string | null;
}

const contextSchema = z.object({ clubId: z.uuid(), userId: z.uuid().nullable() });

/**
 * Runs `fn` in a transaction scoped to one club: RLS policies see `app.club_id` / `app.user_id`
 * through `set_config(…, is_local = true)`, which Postgres resets at commit or rollback, so a pooled
 * connection never carries one request's club into the next.
 */
export async function withTenant<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const { clubId, userId } = contextSchema.parse(ctx);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.club_id', ${clubId}, true), set_config('app.user_id', ${userId ?? ''}, true)`,
    );
    return fn(tx);
  });
}
