import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  sessionSharingSchema,
  sharingMembersSchema,
  type SharingBody,
} from '../../shared/session-sharing.ts';
import type { Database } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
const resultSchema = z
  .union([sessionSharingSchema, z.object({ error: z.enum(['conflict', 'invalid_recipients']) })])
  .nullable();
export async function sessionSharing(db: Database, tenant: TenantContext, id: string) {
  return withTenant(db, tenant, async (tx) => {
    const r = await tx.execute<{ value: unknown }>(
      sql`select rowlens_session_sharing(${id}::uuid) as value`,
    );
    return sessionSharingSchema.nullable().parse(r.rows[0]?.value ?? null);
  });
}
export async function saveSessionSharing(
  db: Database,
  tenant: TenantContext,
  id: string,
  body: SharingBody,
) {
  return withTenant(db, tenant, async (tx) => {
    const r = await tx.execute<{ value: unknown }>(
      sql`select rowlens_set_session_sharing(${id}::uuid,${body.clubWide},${JSON.stringify(body.userIds)}::jsonb,${body.revision}) as value`,
    );
    return resultSchema.parse(r.rows[0]?.value ?? null);
  });
}
export async function sessionShareMembers(
  db: Database,
  tenant: TenantContext,
  id: string,
  query: string,
) {
  return withTenant(db, tenant, async (tx) => {
    const r = await tx.execute<{ value: unknown }>(
      sql`select rowlens_session_share_members(${id}::uuid,${query}) as value`,
    );
    return sharingMembersSchema.nullable().parse(r.rows[0]?.value ?? null);
  });
}
