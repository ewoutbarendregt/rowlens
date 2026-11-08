import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
const service: TenantContext = { clubId: '00000000-0000-0000-0000-000000000000', userId: null };
/** Narrow dispatch discovery, modeled on job claims; no general profile or table access. */
export async function claimAdmissionNotice(db: Database): Promise<unknown> {
  return withTenant(
    db,
    service,
    async (tx) =>
      (await tx.execute<{ value: unknown }>(sql`select rowlens_claim_admission_notice() as value`))
        .rows[0]?.value,
  );
}
export async function finishAdmissionNotice(
  db: Database,
  n: { id: string; global: boolean; lease: string },
  accepted: boolean,
): Promise<void> {
  await withTenant(db, service, (tx) =>
    tx.execute(
      sql`select rowlens_finish_admission_notice(${n.id},${n.global},${n.lease},${accepted})`,
    ),
  );
}
