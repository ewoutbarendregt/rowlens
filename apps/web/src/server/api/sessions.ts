import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { rowingSession, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { videoKey } from '../media/store.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const newSession = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.iso.date(),
});
const idParam = z.object({ id: z.uuid() });

/** Sessions and their videos (#44, minimal for the pilot); every query runs through withTenant + RLS. */
export const sessionRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard, media } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.get('/api/sessions', { preHandler: guard }, async (req) => {
    const rows = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .select({
          id: rowingSession.id,
          title: rowingSession.title,
          date: rowingSession.sessionDate,
          videoCount: count(video.id),
        })
        .from(rowingSession)
        .leftJoin(video, eq(video.sessionId, rowingSession.id))
        .groupBy(rowingSession.id)
        .orderBy(desc(rowingSession.sessionDate), desc(rowingSession.createdAt)),
    );
    return { sessions: rows };
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
        })
        .returning({ id: rowingSession.id }),
    );
    return reply.code(201).send(row);
  });

  app.get('/api/sessions/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const result = await withTenant(db, tenantOf(req), async (tx) => {
      const [session] = await tx
        .select({
          id: rowingSession.id,
          title: rowingSession.title,
          date: rowingSession.sessionDate,
        })
        .from(rowingSession)
        .where(eq(rowingSession.id, params.data.id));
      if (session === undefined) return null;
      const videos = await tx
        .select({
          id: video.id,
          filename: video.originalFilename,
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
      return { ...session, videos };
    });
    return result ?? notFound(reply);
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
