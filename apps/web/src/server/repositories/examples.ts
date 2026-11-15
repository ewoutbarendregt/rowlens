import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import {
  club,
  rowingSession,
  video,
  strokeMark,
  angleMeasure,
  videoBoatLine,
  videoAutoBoatLine,
} from '../db/schema.ts';
import { lineupOf } from '../api/lineups.ts';

/** Discovery returns no content, identity or staff authority. Each subsequent read uses tenant RLS. */
export async function exampleContext(
  db: Database,
  actor: TenantContext,
  id: string,
): Promise<TenantContext | null> {
  const ids = await withTenant(
    db,
    actor,
    async (tx) =>
      (await tx.execute<{ id: string; club_id: string }>(sql`select * from rowlens_examples()`))
        .rows,
  );
  const found = ids.find((s) => s.id === id);
  return found
    ? {
        clubId: found.club_id,
        userId: actor.userId,
        roles: ['rower'],
        unifiedUsers: true,
        exampleSessionId: id,
      }
    : null;
}
export async function listExamples(db: Database, actor: TenantContext) {
  const ids = await withTenant(
    db,
    actor,
    async (tx) =>
      (await tx.execute<{ id: string; club_id: string }>(sql`select * from rowlens_examples()`))
        .rows,
  );
  const result = [];
  for (const id of ids) {
    const row = await withTenant(
      db,
      {
        clubId: id.club_id,
        userId: actor.userId,
        roles: ['rower'],
        unifiedUsers: true,
        exampleSessionId: id.id,
      },
      async (tx) => {
        const [s] = await tx
          .select({
            id: rowingSession.id,
            title: rowingSession.title,
            date: rowingSession.sessionDate,
            clubName: club.name,
          })
          .from(rowingSession)
          .innerJoin(club, eq(club.id, rowingSession.clubId))
          .where(eq(rowingSession.id, id.id));
        return s;
      },
    );
    if (row) result.push(row);
  }
  return result;
}
/** Explicit safe projection: no emails, private feedback, authors, original filenames or media keys. */
export async function readExample(db: Database, scope: TenantContext, id: string) {
  return withTenant(db, scope, async (tx) => {
    const [s] = await tx
      .select({
        id: rowingSession.id,
        title: rowingSession.title,
        date: rowingSession.sessionDate,
        boatType: rowingSession.boatType,
      })
      .from(rowingSession)
      .where(eq(rowingSession.id, id));
    if (!s) return null;
    const videos = await tx
      .select({
        id: video.id,
        seq: video.seq,
        status: video.status,
        fpsNum: video.fpsNum,
        fpsDen: video.fpsDen,
        width: video.width,
        height: video.height,
        perspective: video.perspective,
        renditions: video.renditions,
      })
      .from(video)
      .where(eq(video.sessionId, id))
      .orderBy(asc(video.createdAt));
    const clips = [];
    for (const v of videos) {
      const marks = await tx
        .select({ frame: strokeMark.frame, kind: strokeMark.kind })
        .from(strokeMark)
        .where(eq(strokeMark.videoId, v.id))
        .orderBy(asc(strokeMark.frame));
      const measures = await tx
        .select({
          id: angleMeasure.id,
          frame: angleMeasure.frame,
          rowerId: angleMeasure.rowerId,
          joint: angleMeasure.joint,
          points: angleMeasure.points,
        })
        .from(angleMeasure)
        .where(eq(angleMeasure.videoId, v.id));
      const boatLines = await tx
        .select({ frame: videoBoatLine.frame, points: videoBoatLine.points })
        .from(videoBoatLine)
        .where(eq(videoBoatLine.videoId, v.id))
        .orderBy(asc(videoBoatLine.frame));
      const [auto] = await tx
        .select({
          status: videoAutoBoatLine.status,
          frames: videoAutoBoatLine.frames,
          bowSide: videoAutoBoatLine.bowSide,
        })
        .from(videoAutoBoatLine)
        .where(eq(videoAutoBoatLine.videoId, v.id));
      clips.push({
        ...v,
        renditions: ((v.renditions ?? []) as { name: string }[])
          .map((r) => r.name)
          .filter((n) => n === 'play-540' || n === 'play-1080'),
        marks,
        measures,
        boatLines,
        auto: auto ?? null,
      });
    }
    return { ...s, clubId: scope.clubId, lineup: await lineupOf(tx, id), videos: clips };
  });
}
