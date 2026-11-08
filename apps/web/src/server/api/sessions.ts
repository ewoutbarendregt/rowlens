import { listSessions, members, nameOf } from '../repositories/session-list.ts';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { BOAT_CLASS_NAMES } from '../../shared/boats.ts';
import { lockEditableSession, lockEditableVideo } from '../repositories/training-access.ts';
import { can } from '../auth/can.ts';
import { rowingSession, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { videoKey } from '../media/store.ts';
import { lineupOf } from './lineups.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const title = z.string().trim().min(1).max(120);
const newSession = z.object({
  title,
  date: z.iso.date(),
  /** The boat to start the lineup with: the member's default boat (2026-11-03). */
  boatType: z.enum(BOAT_CLASS_NAMES).nullable().optional(),
});
const idParam = z.object({ id: z.uuid() });
const creatorBody = z.object({ userId: z.uuid().nullable() });
const renameBody = z.object({ title });

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
    const sessions = await listSessions(db, tenant);
    return { sessions };
  });

  /** Admin only: who made a session, so sessions without a maker can be given to a coach (#108). */
  app.patch('/api/sessions/:id/creator', { preHandler: guard }, async (req, reply) => {
    const tenant = tenantOf(req);
    if (
      !can(
        { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId },
        { kind: 'assign_session_creator' },
      )
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
          boatType: body.data.boatType ?? null,
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
          canEdit: sql<boolean>`rowlens_can_edit_session(${rowingSession.id})`,
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
      const club = await members(tx);
      const viewer = { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId };
      // Only the admin sees and sets who made it (and the coaches to choose from).
      const admin = can(
        { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId },
        { kind: 'assign_session_creator' },
      );
      const creator = admin
        ? {
            creatorUserId: createdByUserId,
            coaches: [...club.values()]
              .filter((m) => m.roles.includes('coach') || m.roles.includes('admin'))
              .map((m) => ({ userId: m.user_id, email: m.email }))
              .sort((a, b) => a.email.localeCompare(b.email)),
          }
        : {};
      return {
        ...rest,
        ...creator,
        creatorName: createdByUserId === null ? null : nameOf(club.get(createdByUserId)),
        canRename: session.canEdit && can(viewer, { kind: 'rename_session', createdByUserId }),
        lineup,
        videos,
      };
    });
    return result ?? notFound(reply);
  });

  /** Renames a session: its coaches, the admin and whoever made it (2026-11-03). */
  app.patch('/api/sessions/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = renameBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_title' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [session] = await tx
        .select({ createdByUserId: rowingSession.createdByUserId })
        .from(rowingSession)
        .where(eq(rowingSession.id, params.data.id));
      if (session === undefined) return 'not_found' as const;
      const viewer = { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId };
      if (!can(viewer, { kind: 'rename_session', createdByUserId: session.createdByUserId })) {
        return 'forbidden' as const;
      }
      const [row] = await tx
        .update(rowingSession)
        .set({ title: body.data.title })
        .where(eq(rowingSession.id, params.data.id))
        .returning({ id: rowingSession.id, title: rowingSession.title });
      return row ?? ('not_found' as const);
    });
    if (result === 'not_found') return notFound(reply);
    if (result === 'forbidden') return reply.code(403).send({ error: 'forbidden' });
    return result;
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
      if (!(await lockEditableSession(tx, params.data.id))) return null;
      // The parent lock also blocks new uploads until its media keys are collected.
      const session = { id: params.data.id };
      const rows = await tx
        .select({ id: video.id })
        .from(video)
        .where(and(eq(video.sessionId, session.id), eq(video.clubId, tenant.clubId)));
      const deleted = await tx
        .delete(rowingSession)
        .where(and(eq(rowingSession.id, session.id), eq(rowingSession.clubId, tenant.clubId)))
        .returning({ id: rowingSession.id });
      if (deleted.length === 0) return null;
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
    const deleted = await withTenant(db, tenant, async (tx) => {
      if (!(await lockEditableVideo(tx, params.data.id))) return [];
      return tx
        .delete(video)
        .where(and(eq(video.id, params.data.id), eq(video.clubId, tenant.clubId)))
        .returning({ id: video.id });
    });
    if (deleted.length === 0) return notFound(reply);
    await media?.remove(videoKey(tenant.clubId, params.data.id));
    req.log.info({ videoId: params.data.id }, 'video deleted');
    return reply.code(204).send();
  });

  done();
};
