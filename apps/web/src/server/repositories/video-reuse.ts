import { and, asc, eq, gt, ilike, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database, Tx } from '../db/client.ts';
import { annotation, job, rowingSession, video, videoAnnotationReference } from '../db/schema.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { lockEditableSession, lockEditableVideo } from './training-access.ts';
import { lockVideoAssets } from './video-assets.ts';

async function actorCurrent(tx: Tx): Promise<boolean> {
  const result = await tx.execute<{ allowed: boolean }>(
    sql`select rowlens_video_actor_current() as allowed`,
  );
  return result.rows[0]?.allowed === true;
}

export function availableVideos(
  db: Database,
  tenant: TenantContext,
  targetId: string,
  q: string,
  after?: string,
) {
  return withTenant(db, tenant, async (tx) => {
    if (!(await actorCurrent(tx))) return null;
    const [target] = await tx
      .select({ id: rowingSession.id })
      .from(rowingSession)
      .where(
        and(eq(rowingSession.id, targetId), sql`rowlens_can_edit_session(${rowingSession.id})`),
      );
    if (!target) return null;
    const rows = await tx
      .select({
        id: video.id,
        sessionId: video.sessionId,
        sessionTitle: rowingSession.title,
        filename: video.originalFilename,
        recordedAt: video.recordedAt,
        seq: video.seq,
        durationMs: video.durationMs,
        perspective: video.perspective,
      })
      .from(video)
      .innerJoin(rowingSession, eq(rowingSession.id, video.sessionId))
      .where(
        and(
          ne(video.sessionId, targetId),
          eq(video.status, 'ready'),
          after ? gt(video.id, after) : undefined,
          q
            ? or(ilike(rowingSession.title, `%${q}%`), ilike(video.originalFilename, `%${q}%`))
            : undefined,
        ),
      )
      .orderBy(asc(video.id))
      .limit(101);
    return { videos: rows.slice(0, 100), next: rows.length > 100 ? rows[99]?.id : null };
  });
}

/** Same-club media reuse creates only a new entry and its own analysis job. */
export function reuseVideo(
  db: Database,
  tenant: TenantContext,
  targetId: string,
  sourceId: string,
) {
  return withTenant(db, tenant, async (tx) => {
    if (!(await actorCurrent(tx))) return null;
    if (!(await lockEditableSession(tx, targetId))) return null;
    const [initial] = await tx
      .select({ assetId: video.assetId })
      .from(video)
      .where(eq(video.id, sourceId));
    if (!initial) return null;
    await lockVideoAssets(tx, [initial.assetId]);
    // Fresh read after waiting: deletion/permissions can have changed while the lock was held.
    const [source] = await tx
      .select()
      .from(video)
      .where(and(eq(video.id, sourceId), eq(video.status, 'ready')));
    if (!source || !(await lockEditableSession(tx, targetId))) return null;
    const [existing] = await tx
      .select({ id: video.id })
      .from(video)
      .where(and(eq(video.sessionId, targetId), eq(video.assetId, source.assetId)));
    if (existing) return existing;
    const [last] = await tx
      .select({ seq: sql<number>`coalesce(max(${video.seq}),0)::int` })
      .from(video)
      .where(eq(video.sessionId, targetId));
    const [entry] = await tx
      .insert(video)
      .values({
        clubId: tenant.clubId,
        sessionId: targetId,
        assetId: source.assetId,
        originalFilename: source.originalFilename,
        contentType: source.contentType,
        perspective: source.perspective,
        sizeBytes: source.sizeBytes,
        seq: (last?.seq ?? 0) + 1,
      })
      .returning({ id: video.id });
    if (!entry) return null;
    await tx.insert(job).values({
      clubId: tenant.clubId,
      type: 'video.boat_line',
      payload: { videoId: entry.id },
      idempotencyKey: `video.boat_line:${entry.id}`,
    });
    return entry;
  });
}

export function sourceAnnotations(db: Database, tenant: TenantContext, targetId: string) {
  return withTenant(db, tenant, async (tx) => {
    if (!(await actorCurrent(tx))) return null;
    const [target] = await tx
      .select({ assetId: video.assetId })
      .from(video)
      .where(eq(video.id, targetId));
    if (!target) return null;
    const source = alias(video, 'source');
    return tx
      .select({
        id: annotation.id,
        frame: annotation.frame,
        kind: annotation.kind,
        body: annotation.body,
        shape: annotation.shape,
        authorName: annotation.authorName,
        createdAt: annotation.createdAt,
        layerId: sql<string>`${source.id}::text || ':' || coalesce(${annotation.authorUserId}::text, md5(${annotation.authorName}))`,
        sourceVideoId: source.id,
        sourceSessionId: source.sessionId,
        sourceSessionTitle: rowingSession.title,
        linked: sql<boolean>`${videoAnnotationReference.annotationId} is not null`,
      })
      .from(annotation)
      .innerJoin(source, eq(source.id, annotation.videoId))
      .innerJoin(rowingSession, eq(rowingSession.id, source.sessionId))
      .leftJoin(
        videoAnnotationReference,
        and(
          eq(videoAnnotationReference.annotationId, annotation.id),
          eq(videoAnnotationReference.videoId, targetId),
        ),
      )
      .where(and(eq(source.assetId, target.assetId), ne(source.id, targetId)))
      .orderBy(asc(rowingSession.title), asc(annotation.frame), asc(annotation.id));
  });
}

/** Add/remove a reference; never mutate source content, assignments, sharing or authorship. */
export function linkAnnotation(
  db: Database,
  tenant: TenantContext,
  targetId: string,
  annotationId: string,
  linked: boolean,
) {
  return withTenant(db, tenant, async (tx) => {
    if (!(await actorCurrent(tx))) return false;
    if (!(await lockEditableVideo(tx, targetId))) return false;
    if (!linked) {
      // Removing a hidden/revoked reference is safe; it grants no access to its former source.
      await tx
        .delete(videoAnnotationReference)
        .where(
          and(
            eq(videoAnnotationReference.videoId, targetId),
            eq(videoAnnotationReference.annotationId, annotationId),
          ),
        );
      return true;
    }
    const result = await tx.execute<{ allowed: boolean }>(
      sql`select rowlens_can_reference_annotation(${targetId}::uuid,${annotationId}::uuid,true) as allowed`,
    );
    if (!result.rows[0]?.allowed) return false;
    await tx
      .insert(videoAnnotationReference)
      .values({
        clubId: tenant.clubId,
        videoId: targetId,
        annotationId,
        addedByUserId: tenant.userId,
      })
      .onConflictDoNothing();
    return true;
  });
}
