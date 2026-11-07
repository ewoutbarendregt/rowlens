import { sql } from 'drizzle-orm';
import type { SettingsPatch, UserSettings } from '../../shared/user-settings.ts';
import type { Database } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';

export async function readSettings(
  db: Database,
  tenant: TenantContext,
  userId: string,
): Promise<UserSettings | null> {
  return withTenant(db, tenant, async (tx) => {
    const result = await tx.execute<{ settings: UserSettings | null }>(
      sql`select rowlens_user_settings(${userId}::uuid) as settings`,
    );
    const settings = result.rows[0]?.settings ?? null;
    if (tenant.platformAdmin && settings !== null)
      await tx.execute(sql`select rowlens_audit_platform('user.settings.read',${userId})`);
    return settings;
  });
}
export async function writeSettings(
  db: Database,
  tenant: TenantContext,
  userId: string,
  changes: SettingsPatch,
  revision: number,
  importLegacy = false,
): Promise<UserSettings | { conflict: true } | null> {
  return withTenant(db, tenant, async (tx) => {
    const result = await tx.execute<{ settings: UserSettings | { conflict: true } | null }>(
      sql`select rowlens_set_user_settings(${userId}::uuid,${JSON.stringify(changes)}::jsonb,${revision},${importLegacy}) as settings`,
    );
    const settings = result.rows[0]?.settings ?? null;
    if (tenant.platformAdmin && settings !== null && !('conflict' in settings))
      await tx.execute(sql`select rowlens_audit_platform('user.settings.saved',${userId})`);
    return settings;
  });
}
