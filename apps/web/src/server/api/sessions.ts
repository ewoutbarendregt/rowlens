import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { can } from '../auth/can.ts';
import type { Tx } from '../db/client.ts';
import { rower, rowingSession, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { videoKey } from '../media/store.ts';
import { lineupOf, lineupsOf } from './lineups.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const newSession = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.iso.date(),
});
const idParam = z.object({ id: z.uuid() });
const creatorBody = z.object({ userId: z.uuid().nullable() });

/** This club's members by user id (rowlens_club_members only sees the current club). */
async function members(tx: Tx) {
  const result = await tx.execute<{ user_id: string; email: string; role: string }>(
    sql`select user_id, email, role from rowlens_club_members()`,
  );
  return new Map(result.rows.map((m) => [m.user_id, m]));
}

/**
 * Per session: the notes meant for the viewer (assigned or shared to their linked roster entry, or
 * shared with a crew they rowed in). One grouped query for the whole list (#108).
 */
async function notesForMe(tx: Tx, mine: string[]): Promise<Map<string, number>> {
  if (mine.length === 0) return new Map();
  const ids = sql`array[${sql.join(
    mine.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  const result = await tx.execute<{ session_id: string; n: number }>(sql`
    select v.session_id, count(distinct m.id)::int as n
    from moment m
    join video v on v.id = m.video_id
    where exists (select 1 from moment_rower mr where mr.moment_id = m.id and mr.rower_id = any(${ids}))
       or exists (select 1 from moment_share s where s.moment_id = m.id and s.scope = 'rower'
                  and s.rower_id = any(${ids}))
       or exists (select 1 from moment_share s join lineup_seat ls on ls.session_id = v.session_id
                  where s.moment_id = m.id and s.scope = 'crew' and ls.rower_id = any(${ids}))
    group by v.session_id`);
  return new Map(result.rows.map((r) => [r.session_id, r.n]));
}

/** Sessions and their videos (#44, minimal for the pilot); every query runs through withTenant + RLS. */
export const sessionRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard, media } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  /**
   * The sessions the viewer may see (RLS: the admin all, others their own), with what the list
   * filters and sorts on (#108): lineup, the viewer's seat and the notes meant for them.
   */
  app.get('/api/sessions', { preHandler: guard }, async (req) => {
    const tenant = tenantOf(req);
    const sessions = await withTenant(db, tenant, async (tx) => {
      const rows = await tx
        .select({
          id: rowingSession.id,
          title: rowingSession.title,
          date: rowingSession.sessionDate,
          createdAt: rowingSession.createdAt,
          boatType: rowingSession.boatType,
          videoCount: count(video.id),
        })
        .from(rowingSession)
        .leftJoin(video, eq(video.sessionId, rowingSession.id))
        .groupBy(rowingSession.id)
        .orderBy(desc(rowingSession.sessionDate), desc(rowingSession.createdAt));
      const mine =
        tenant.userId === null
          ? []
          : (
              await tx.select({ id: rower.id }).from(rower).where(eq(rower.userId, tenant.userId))
            ).map((r) => r.id);
      const lineups = await lineupsOf(
        tx,
        rows.map((r) => r.id),
      );
      const forMe = await notesForMe(tx, mine);
      return rows.map((r) => {
        const lineup = lineups.get(r.id) ?? [];
        return {
          ...r,
          lineup: lineup.map((s) => ({
            seat: s.seat,
            rowerId: s.rower.id,
            displayName: s.rower.displayName,
          })),
          mySeat: lineup.find((s) => mine.includes(s.rower.id))?.seat ?? null,
          notesForMe: forMe.get(r.id) ?? 0,
        };
      });
    });
    return { sessions };
  });

  /** Admin only: who made a session, so sessions without a maker can be given to a coach (#108). */
  app.patch('/api/sessions/:id/creator', { preHandler: guard }, async (req, reply) => {
    const tenant = tenantOf(req);
    if (
      !can({ role: tenant.role ?? null, userId: tenant.userId }, { kind: 'assign_session_creator' })
    ) {
      return notFound(reply);
    }
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = creatorBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_creator' });
    const result = await withTenant(db, tenant, async (tx) => {
      if (body.data.userId !== null && !(await members(tx)).has(body.data.userId)) {
        return 'not_member' as const;
      }
      const updated = await tx
        .update(rowingSession)
        .set({ createdByUserId: body.data.userId })
        .where(eq(rowingSession.id, params.data.id))
        .returning({ id: rowingSession.id });
      return updated.length === 0 ? null : ('ok' as const);
    });
    if (result === null) return notFound(reply);
    if (result === 'not_member') return reply.code(400).send({ error: result });
    return reply.code(204).send();
  });

  app.post('/api/sessions', { preHandler: guard }, async (req, reply) => {
    const body = newSession.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_session' });
    const [row] = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .insert(rowingSession)
        .values({
          clubId: tenantOf(req).clubId,
          title: body.data.title,
          sessionDate: body.data.date,
          createdByUserId: tenantOf(req).userId,
        })
        .returning({ id: rowingSession.id }),
    );
    return reply.code(201).send(row);
  });

  app.get('/api/sessions/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [session] = await tx
        .select({
          id: rowingSession.id,
          title: rowingSession.title,
          date: rowingSession.sessionDate,
          createdAt: rowingSession.createdAt,
          boatType: rowingSession.boatType,
          createdByUserId: rowingSession.createdByUserId,
        })
        .from(rowingSession)
        .where(eq(rowingSession.id, params.data.id));
      if (session === undefined) return null;
      const lineup = await lineupOf(tx, session.id);
      const videos = await tx
        .select({
          id: video.id,
          filename: video.originalFilename,
          seq: video.seq,
          recordedAt: video.recordedAt,
          perspective: video.perspective,
          status: video.status,
          statusReason: video.statusReason,
          processingProgress: video.processingProgress,
          fpsNum: video.fpsNum,
          fpsDen: video.fpsDen,
          width: video.width,
          height: video.height,
          durationMs: video.durationMs,
          sizeBytes: video.sizeBytes,
          uploadedBytes: video.uploadedBytes,
          createdAt: video.createdAt,
        })
        .from(video)
        .where(eq(video.sessionId, session.id))
        .orderBy(video.createdAt);
      const { createdByUserId, ...rest } = session;
      // Only the admin sees and sets who made it (and the coaches to choose from).
      const admin = can(
        { role: tenant.role ?? null, userId: tenant.userId },
        { kind: 'assign_session_creator' },
      );
      const creator = admin
        ? {
            creatorUserId: createdByUserId,
            coaches: [...(await members(tx)).values()]
              .filter((m) => m.role !== 'rower')
              .map((m) => ({ userId: m.user_id, email: m.email }))
              .sort((a, b) => a.email.localeCompare(b.email)),
          }
        : {};
      return { ...rest, ...creator, lineup, videos };
    });
    return result ?? notFound(reply);
  });

  /**
   * Deletes a whole session. The database cascades from session → videos → annotations; we keep
   * the video ids so their original files, renditions and posters can be removed afterwards too.
   */
  app.delete('/api/sessions/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    const videoIds = await withTenant(db, tenant, async (tx) => {
      // Block new videos for this session while we collect every existing media key.
      const [session] = await tx
        .select({ id: rowingSession.id })
        .from(rowingSession)
        .where(and(eq(rowingSession.id, params.data.id), eq(rowingSession.clubId, tenant.clubId)))
        .for('update');
      if (session === undefined) return null;
      const rows = await tx
        .select({ id: video.id })
        .from(video)
        .where(and(eq(video.sessionId, session.id), eq(video.clubId, tenant.clubId)));
      await tx
        .delete(rowingSession)
        .where(and(eq(rowingSession.id, session.id), eq(rowingSession.clubId, tenant.clubId)));
      return rows.map((row) => row.id);
    });
    if (videoIds === null) return notFound(reply);
    if (media !== null) {
      await Promise.all(videoIds.map((videoId) => media.remove(videoKey(tenant.clubId, videoId))));
    }
    req.log.info(
      { sessionId: params.data.id, videoCount: videoIds.length },
      'session and media deleted',
    );
    return reply.code(204).send();
  });

  /** Hard delete (#50): the row and every byte under the video's key. Also ends an unfinished upload. */
  app.delete('/api/videos/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    const deleted = await withTenant(db, tenant, (tx) =>
      tx
        .delete(video)
        .where(and(eq(video.id, params.data.id), eq(video.clubId, tenant.clubId)))
        .returning({ id: video.id }),
    );
    if (deleted.length === 0) return notFound(reply);
    await media?.remove(videoKey(tenant.clubId, params.data.id));
    req.log.info({ videoId: params.data.id }, 'video deleted');
    return reply.code(204).send();
  });

  done();
};
