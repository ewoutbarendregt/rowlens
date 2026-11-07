import { and, eq, sql } from 'drizzle-orm';
import { rowingSession, video } from '../db/schema.ts';
import type { Tx } from '../db/client.ts';

/** Hold the parent against owner reassignment until authorized mutations/stream writes complete. */
export async function lockEditableSession(tx: Tx, id: string): Promise<boolean> {
  const [session] = await tx
    .select({ id: rowingSession.id })
    .from(rowingSession)
    .where(and(eq(rowingSession.id, id), sql`rowlens_can_edit_session(${rowingSession.id})`))
    .for('update');
  if (session === undefined) return false;
  // A FOR UPDATE waiter may have evaluated its predicate against the pre-transfer snapshot.
  // Recheck in a fresh statement after acquiring the parent lock, before touching media.
  const result = await tx.execute<{ editable: boolean }>(
    sql`select rowlens_can_edit_session(${id}::uuid) as editable`,
  );
  return result.rows[0]?.editable === true;
}
export async function lockEditableVideo(tx: Tx, id: string): Promise<boolean> {
  const [v] = await tx.select({ sessionId: video.sessionId }).from(video).where(eq(video.id, id));
  return v !== undefined && (await lockEditableSession(tx, v.sessionId));
}
