import { sql } from 'drizzle-orm';
import type { Tx } from '../db/client.ts';

/** Ordered locks serialize reuse, entry deletion and last-reference collection. */
export async function lockVideoAssets(tx: Tx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Narrow helper locks physical rows without exposing protected asset metadata.
  for (const id of [...new Set(ids)].sort()) {
    await tx.execute(sql`select rowlens_lock_video_asset(${id}::uuid)`);
  }
}

export async function collectUnusedAssets(tx: Tx, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx.execute<{ id: string }>(
    sql`select rowlens_collect_unused_assets(array[${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]) as id`,
  );
  return rows.rows.map((r) => r.id);
}
