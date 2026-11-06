import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { STROKE_MARK_KINDS } from '../../shared/strokes.ts';
import { can } from '../auth/can.ts';
import { strokeMark, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const frameParams = z.object({ id: z.uuid(), frame: z.coerce.number().int().min(0) });
const markBody = z.object({ kind: z.enum(STROKE_MARK_KINDS) });

/**
 * Stroke marks (#85, ADR-0016): catch, finish and half slide for the whole boat, one per frame.
 * Everyone who sees the video reads them; coaches of the session and the admin set them (`can`
 * here, restrictive RLS policies underneath). Strokes are computed from them in the client.
 */
export const strokeRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.get('/api/videos/:id/strokes', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const marks = await withTenant(db, tenantOf(req), async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      return tx
        .select({ frame: strokeMark.frame, kind: strokeMark.kind })
        .from(strokeMark)
        .where(eq(strokeMark.videoId, v.id))
        .orderBy(asc(strokeMark.frame));
    });
    return marks === null ? notFound(reply) : { marks };
  });

  // Sets the mark at a frame, or changes its kind: one mark per frame.
  app.put('/api/videos/:id/strokes/:frame', { preHandler: guard }, async (req, reply) => {
    const params = frameParams.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = markBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_mark' });
    const tenant = tenantOf(req);
    if (
      !can(
        { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId },
        { kind: 'mark_strokes' },
      )
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx
        .select({ id: video.id, status: video.status, frameCount: video.frameCount })
        .from(video)
        .where(eq(video.id, params.data.id));
      if (v === undefined) return 'not_found' as const;
      // Frames exist only once the worker has made the CFR renditions (ADR-0007).
      if (v.status !== 'ready' || v.frameCount === null) return 'not_ready' as const;
      if (params.data.frame >= v.frameCount) return 'bad_frame' as const;
      const [row] = await tx
        .insert(strokeMark)
        .values({
          clubId: tenant.clubId,
          videoId: v.id,
          frame: params.data.frame,
          kind: body.data.kind,
          createdByUserId: tenant.userId,
        })
        .onConflictDoUpdate({
          target: [strokeMark.videoId, strokeMark.frame],
          set: { kind: body.data.kind, updatedAt: new Date() },
        })
        .returning({ frame: strokeMark.frame, kind: strokeMark.kind });
      return row ?? ('not_found' as const);
    });
    if (result === 'not_found') return notFound(reply);
    if (result === 'not_ready') return reply.code(409).send({ error: 'video_not_ready' });
    if (result === 'bad_frame') return reply.code(400).send({ error: 'frame_out_of_range' });
    return result;
  });

  app.delete('/api/videos/:id/strokes/:frame', { preHandler: guard }, async (req, reply) => {
    const params = frameParams.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    if (
      !can(
        { roles: tenant.roles, role: tenant.role ?? null, userId: tenant.userId },
        { kind: 'mark_strokes' },
      )
    ) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const gone = await withTenant(db, tenant, (tx) =>
      tx
        .delete(strokeMark)
        .where(and(eq(strokeMark.videoId, params.data.id), eq(strokeMark.frame, params.data.frame)))
        .returning({ frame: strokeMark.frame }),
    );
    return gone.length === 0 ? notFound(reply) : reply.code(204).send();
  });

  done();
};
