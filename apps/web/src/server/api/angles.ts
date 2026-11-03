import { and, asc, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { JOINT_POINTS, JOINTS } from '../../shared/angles.ts';
import { can } from '../auth/can.ts';
import { angleMeasure, rower, strokeMark, video, videoBoatLine } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
/** A point as a fraction of the picture (0–1 from the left and from the top), as for drawings. */
const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const measureBody = z
  .object({
    frame: z.int().min(0),
    rowerId: z.uuid(),
    joint: z.enum(JOINTS),
    points: z.array(point).min(2).max(3),
  })
  .refine((m) => m.points.length === JOINT_POINTS[m.joint], { path: ['points'] });
const boatLineBody = z.object({ points: z.tuple([point, point]) });

const columns = {
  id: angleMeasure.id,
  frame: angleMeasure.frame,
  rowerId: angleMeasure.rowerId,
  joint: angleMeasure.joint,
  points: angleMeasure.points,
};

/**
 * Angle measurements per rower and phase (ADR-0017), and the boat line they use for the upper body.
 * Everyone who sees the video reads them; coaches of the session and the admin measure (`can` here,
 * restrictive RLS underneath). Only on a frame with a stroke mark, so every value has a phase.
 */
export const angleRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  const allowed = (req: Parameters<typeof tenantOf>[0]) => {
    const tenant = tenantOf(req);
    return can({ role: tenant.role ?? null, userId: tenant.userId }, { kind: 'measure_angles' });
  };

  app.get('/api/videos/:id/angles', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const result = await withTenant(db, tenantOf(req), async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      const measures = await tx
        .select(columns)
        .from(angleMeasure)
        .where(eq(angleMeasure.videoId, v.id))
        .orderBy(asc(angleMeasure.frame), asc(angleMeasure.createdAt));
      const [line] = await tx
        .select({ points: videoBoatLine.points })
        .from(videoBoatLine)
        .where(eq(videoBoatLine.videoId, v.id));
      return { measures, boatLine: line?.points ?? null };
    });
    return result ?? notFound(reply);
  });

  // Measures a rower's joint on a marked frame, or replaces that measurement.
  app.put('/api/videos/:id/angles', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = measureBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_measure' });
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const tenant = tenantOf(req);
    const m = body.data;
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx
        .select({ id: video.id, status: video.status, frameCount: video.frameCount })
        .from(video)
        .where(eq(video.id, params.data.id));
      if (v === undefined) return 'not_found' as const;
      if (v.status !== 'ready' || v.frameCount === null) return 'not_ready' as const;
      if (m.frame >= v.frameCount) return 'bad_frame' as const;
      // Only on a catch, half slide or finish: the phase comes from the mark (ADR-0017).
      const [mark] = await tx
        .select({ frame: strokeMark.frame })
        .from(strokeMark)
        .where(and(eq(strokeMark.videoId, v.id), eq(strokeMark.frame, m.frame)));
      if (mark === undefined) return 'no_mark' as const;
      const [who] = await tx
        .select({ id: rower.id })
        .from(rower)
        .where(and(eq(rower.id, m.rowerId), isNull(rower.archivedAt)));
      if (who === undefined) return 'unknown_rower' as const;
      const [row] = await tx
        .insert(angleMeasure)
        .values({
          clubId: tenant.clubId,
          videoId: v.id,
          frame: m.frame,
          rowerId: m.rowerId,
          joint: m.joint,
          points: m.points,
          createdByUserId: tenant.userId,
        })
        .onConflictDoUpdate({
          target: [
            angleMeasure.videoId,
            angleMeasure.frame,
            angleMeasure.rowerId,
            angleMeasure.joint,
          ],
          set: { points: m.points, updatedAt: new Date() },
        })
        .returning(columns);
      return row ?? ('not_found' as const);
    });
    if (result === 'not_found') return notFound(reply);
    if (result === 'not_ready') return reply.code(409).send({ error: 'video_not_ready' });
    if (result === 'no_mark') return reply.code(409).send({ error: 'no_stroke_mark' });
    if (result === 'bad_frame') return reply.code(400).send({ error: 'frame_out_of_range' });
    if (result === 'unknown_rower') return reply.code(400).send({ error: 'unknown_rower' });
    return result;
  });

  app.delete('/api/angles/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const gone = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .delete(angleMeasure)
        .where(eq(angleMeasure.id, params.data.id))
        .returning({ id: angleMeasure.id }),
    );
    return gone.length === 0 ? notFound(reply) : reply.code(204).send();
  });

  app.put('/api/videos/:id/boat-line', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = boatLineBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_boat_line' });
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      const [row] = await tx
        .insert(videoBoatLine)
        .values({
          clubId: tenant.clubId,
          videoId: v.id,
          points: body.data.points,
          createdByUserId: tenant.userId,
        })
        .onConflictDoUpdate({
          target: videoBoatLine.videoId,
          set: { points: body.data.points, updatedAt: new Date() },
        })
        .returning({ points: videoBoatLine.points });
      return row ?? null;
    });
    return result === null ? notFound(reply) : { boatLine: result.points };
  });

  app.delete('/api/videos/:id/boat-line', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const gone = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .delete(videoBoatLine)
        .where(eq(videoBoatLine.videoId, params.data.id))
        .returning({ videoId: videoBoatLine.videoId }),
    );
    return gone.length === 0 ? notFound(reply) : reply.code(204).send();
  });

  done();
};
