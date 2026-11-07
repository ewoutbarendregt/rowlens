import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { JOINT_POINTS, JOINTS } from '../../shared/angles.ts';
import { can } from '../auth/can.ts';
import {
  angleMeasure,
  rower,
  strokeMark,
  video,
  videoAutoBoatLine,
  videoBoatLine,
} from '../db/schema.ts';
import type { Tx } from '../db/client.ts';
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
const boatLineBody = z.object({ frame: z.int().min(0), points: z.tuple([point, point]) });
const frameParams = z.object({ id: z.uuid(), frame: z.coerce.number().int().min(0) });
const bowSideBody = z.object({ bowSide: z.enum(['left', 'right']) });

/**
 * Finds the boat line in every frame again (ADR-0018), now that a coach changed one: the worker
 * restarts its following from the coach's lines. One queued run per video is enough.
 */
async function requeueAutoBoatLine(tx: Tx, clubId: string, videoId: string) {
  await tx
    .insert(videoAutoBoatLine)
    .values({ clubId, videoId, status: 'queued' })
    .onConflictDoUpdate({
      target: videoAutoBoatLine.videoId,
      set: { status: 'queued', updatedAt: new Date() },
    });
  await tx.execute(sql`
    insert into job (club_id, type, payload)
    select ${clubId}, 'video.boat_line', jsonb_build_object('videoId', ${videoId}::text)
    where not exists (
      select 1 from job
      where type = 'video.boat_line' and status = 'queued' and payload->>'videoId' = ${videoId}
    )`);
}

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
    return can(
      { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId },
      { kind: 'measure_angles' },
    );
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
      // Several per video, each from its frame on (ADR-0017 addendum).
      const boatLines = await tx
        .select({ frame: videoBoatLine.frame, points: videoBoatLine.points })
        .from(videoBoatLine)
        .where(eq(videoBoatLine.videoId, v.id))
        .orderBy(asc(videoBoatLine.frame));
      return { measures, boatLines };
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
      if (opts.unifiedUsers) {
        const valid = await tx.execute<{ ok: boolean }>(
          sql`select rowlens_account_target(${m.rowerId}) as ok`,
        );
        if (!valid.rows[0]?.ok) return 'unknown_rower' as const;
      }
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

  // Sets the boat line from a frame on, or replaces the one at that frame.
  app.put('/api/videos/:id/boat-line', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = boatLineBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_boat_line' });
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx
        .select({ id: video.id, frameCount: video.frameCount })
        .from(video)
        .where(eq(video.id, params.data.id));
      if (v === undefined) return 'not_found' as const;
      if (v.frameCount !== null && body.data.frame >= v.frameCount) return 'bad_frame' as const;
      const [row] = await tx
        .insert(videoBoatLine)
        .values({
          clubId: tenant.clubId,
          videoId: v.id,
          frame: body.data.frame,
          points: body.data.points,
          createdByUserId: tenant.userId,
        })
        .onConflictDoUpdate({
          target: [videoBoatLine.videoId, videoBoatLine.frame],
          set: { points: body.data.points, updatedAt: new Date() },
        })
        .returning({ frame: videoBoatLine.frame, points: videoBoatLine.points });
      if (row === undefined) return 'not_found' as const;
      await requeueAutoBoatLine(tx, tenant.clubId, v.id);
      return row;
    });
    if (result === 'not_found') return notFound(reply);
    if (result === 'bad_frame') return reply.code(400).send({ error: 'frame_out_of_range' });
    return result;
  });

  app.delete('/api/videos/:id/boat-line/:frame', { preHandler: guard }, async (req, reply) => {
    const params = frameParams.safeParse(req.params);
    if (!params.success) return notFound(reply);
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const tenant = tenantOf(req);
    const gone = await withTenant(db, tenant, async (tx) => {
      const rows = await tx
        .delete(videoBoatLine)
        .where(
          and(
            eq(videoBoatLine.videoId, params.data.id),
            eq(videoBoatLine.frame, params.data.frame),
          ),
        )
        .returning({ frame: videoBoatLine.frame });
      if (rows.length > 0) await requeueAutoBoatLine(tx, tenant.clubId, params.data.id);
      return rows;
    });
    return gone.length === 0 ? notFound(reply) : reply.code(204).send();
  });

  // The boat line found in every frame (ADR-0018), for everyone who sees the video. Its own
  // request: one entry per frame is too much to send with every angles load.
  app.get('/api/videos/:id/auto-boat-line', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const result = await withTenant(db, tenantOf(req), async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      const [row] = await tx
        .select({
          status: videoAutoBoatLine.status,
          frames: videoAutoBoatLine.frames,
          bowSide: videoAutoBoatLine.bowSide,
        })
        .from(videoAutoBoatLine)
        .where(eq(videoAutoBoatLine.videoId, v.id));
      return row ?? { status: 'none', frames: null, bowSide: null };
    });
    return result ?? notFound(reply);
  });

  // Which end of the found line is the bow, when no coach's line says so (ADR-0018).
  app.put('/api/videos/:id/auto-boat-line/bow-side', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = bowSideBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_bow_side' });
    if (!allowed(req)) return reply.code(403).send({ error: 'forbidden' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      await tx
        .insert(videoAutoBoatLine)
        .values({ clubId: tenant.clubId, videoId: v.id, bowSide: body.data.bowSide })
        .onConflictDoUpdate({
          target: videoAutoBoatLine.videoId,
          set: { bowSide: body.data.bowSide, updatedAt: new Date() },
        });
      return { bowSide: body.data.bowSide };
    });
    return result ?? notFound(reply);
  });

  done();
};
