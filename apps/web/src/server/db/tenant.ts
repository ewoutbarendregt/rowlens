import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { primaryRole, rolesSchema, type Role } from '../../shared/roles.ts';
import type { Database, Tx } from './client.ts';

/** Who is acting, in which club, as what (ADR-0005, ADR-0013). */
export interface TenantContext {
  clubId: string;
  /** Authenticated user; `null` only for the legacy pilot-code rollback path. */
  userId: string | null;
  /**
   * All assigned roles. Restrictive RLS reads app.roles; only explicit unauthenticated service
   * contexts (worker/pilot) see the club without membership roles.
   */
  roles?: readonly Role[];
  role?: Role | null;
}

const contextSchema = z.object({
  clubId: z.uuid(),
  userId: z.uuid().nullable(),
  roles: rolesSchema.optional(),
  role: z.enum(['rower', 'coach', 'admin']).nullable().optional(),
});

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
  const { clubId, userId, role, roles: assigned } = contextSchema.parse(ctx);
  const roles = assigned ?? (role == null ? [] : [role]);
  const service = userId === null && role == null && assigned === undefined;
  // Fixed server capability, never request input: only handlers with pre-media write checks
  // opt into the new read/write split. Older images retain their aligned legacy scope (ADR-0020).
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.club_id', ${clubId}, true), set_config('app.user_id', ${userId ?? ''}, true), set_config('app.role', ${roles.length ? primaryRole(roles) : ''}, true), set_config('app.roles', ${JSON.stringify(roles)}, true), set_config('app.service', ${service ? 'true' : 'false'}, true), set_config('app.training_permissions', 'owner-or-staff', true)`,
    );
    return fn(tx);
  });
}
