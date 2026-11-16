import { and, count, desc, eq, sql } from 'drizzle-orm';
import {
  exampleCandidatesSchema,
  examplePublishResultSchema,
} from '../../shared/example-management.ts';
import type { Database } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { rowingSession, video } from '../db/schema.ts';

export async function exampleCandidates(
  db: Database,
  actor: TenantContext,
  query: string,
  before?: string,
) {
  return withTenant(db, actor, async (tx) => {
    const auth = await tx.execute<{ allowed: boolean }>(
      sql`select rowlens_example_manager() as allowed`,
    );
    if (!auth.rows[0]?.allowed) return null;
    const rows = await tx
      .select({
        id: rowingSession.id,
        title: rowingSession.title,
        date: rowingSession.sessionDate,
        boatType: rowingSession.boatType,
        videoCount: count(video.id),
      })
      .from(rowingSession)
      .leftJoin(video, eq(video.sessionId, rowingSession.id))
      .where(
        and(
          sql`rowlens_example_manager()`,
          eq(rowingSession.isExample, false),
          sql`position(lower(${query}) in lower(${rowingSession.title})) > 0`,
          before
            ? sql`(${rowingSession.sessionDate},${rowingSession.createdAt},${rowingSession.id}) < (select c.session_date,c.created_at,c.id from rowing_session c where c.id=${before}::uuid and c.club_id=${actor.clubId}::uuid)`
            : undefined,
        ),
      )
      .groupBy(rowingSession.id)
      .orderBy(
        desc(rowingSession.sessionDate),
        desc(rowingSession.createdAt),
        desc(rowingSession.id),
      )
      .limit(21);
    const sessions = rows.slice(0, 20);
    return exampleCandidatesSchema.parse({
      sessions,
      nextCursor: rows.length > 20 ? (sessions.at(-1)?.id ?? null) : null,
    });
  });
}
export async function publishExample(db: Database, actor: TenantContext, id: string) {
  return withTenant(db, actor, async (tx) => {
    const result = await tx.execute<{ value: unknown }>(
      sql`select rowlens_publish_example(${id}::uuid) as value`,
    );
    return examplePublishResultSchema.nullable().parse(result.rows[0]?.value ?? null);
  });
}
