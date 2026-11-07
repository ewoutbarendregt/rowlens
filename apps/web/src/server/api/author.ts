import { eq, sql } from 'drizzle-orm';
import { rower } from '../db/schema.ts';
import type { Tx } from '../db/client.ts';

/**
 * Who a note is by, for a signed-in account: the name the club knows them by in the roster when the
 * account is linked (#40), else the account's own name. Never what the client sends.
 */
export async function accountAuthor(
  tx: Tx,
  userId: string,
  accountName: string | null,
): Promise<string | null> {
  const mode = await tx.execute<{ unified: boolean }>(
    sql`select current_setting('app.unified_users',true)='true' as unified`,
  );
  if (mode.rows[0]?.unified) return accountName?.slice(0, 60) ?? null;
  const [linked] = await tx
    .select({ name: rower.displayName })
    .from(rower)
    .where(eq(rower.userId, userId))
    .limit(1);
  return linked?.name ?? accountName;
}
