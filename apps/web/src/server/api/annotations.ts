import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { annotation, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { dropEmptyMoments, momentRowersOf } from './moments.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const frameParams = z.object({ id: z.uuid(), frame: z.coerce.number().int().min(0) });
const text = z.string().trim().min(1).max(2000);
const author = z.string().trim().min(1).max(60);
/** A point as a fraction of the picture (0–1 from the left and from the top), #60. */
const point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const newAnnotation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), frame: z.int().min(0), body: text, authorName: author }),
  z.object({
    kind: z.enum(['line', 'arrow']),
    frame: z.int().min(0),
    points: z.tuple([point, point]),
    body: z.string().trim().max(2000).default(''),
    authorName: author,
  }),
  z.object({
    kind: z.literal('angle'),
    frame: z.int().min(0),
    // Arm, vertex, arm: the angle is measured at the middle point.
    points: z.tuple([point, point, point]),
    body: z.string().trim().max(2000).default(''),
    authorName: author,
  }),
]);
const editNote = z.object({ body: text });

const columns = {
  id: annotation.id,
  frame: annotation.frame,
  kind: annotation.kind,
  body: annotation.body,
  shape: annotation.shape,
  authorName: annotation.authorName,
  createdAt: annotation.createdAt,
  updatedAt: annotation.updatedAt,
};

/**
 * Notes (#59) and drawings (#60) pinned to a frame, behind the guard and RLS like everything in a
 * club. During the one-club phase every signed-in member may edit or delete them; author-only
 * permissions can be added when roles and crews become part of the product flow.
 */
export const annotationRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.get('/api/videos/:id/annotations', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    const rows = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx.select({ id: video.id }).from(video).where(eq(video.id, params.data.id));
      if (v === undefined) return null;
      const annotations = await tx
        .select(columns)
        .from(annotation)
        .where(eq(annotation.videoId, v.id))
        .orderBy(asc(annotation.frame), asc(annotation.createdAt));
      return { annotations, moments: await momentRowersOf(tx, v.id) };
    });
    return rows ?? notFound(reply);
  });

  app.post('/api/videos/:id/annotations', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    // Older clients send notes without a kind.
    const raw: unknown = req.body;
    const withKind =
      typeof raw === 'object' && raw !== null && !('kind' in raw) ? { ...raw, kind: 'note' } : raw;
    const body = newAnnotation.safeParse(withKind);
    if (!body.success) return reply.code(400).send({ error: 'invalid_annotation' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [v] = await tx
        .select({ id: video.id, status: video.status, frameCount: video.frameCount })
        .from(video)
        .where(eq(video.id, params.data.id));
      if (v === undefined) return 'not_found' as const;
      // Frames exist only once the worker has made the CFR renditions (ADR-0007).
      if (v.status !== 'ready' || v.frameCount === null) return 'not_ready' as const;
      if (body.data.frame >= v.frameCount) return 'bad_frame' as const;
      const [row] = await tx
        .insert(annotation)
        .values({
          clubId: tenant.clubId,
          videoId: v.id,
          frame: body.data.frame,
          kind: body.data.kind,
          body: body.data.body,
          shape: body.data.kind === 'note' ? null : { points: body.data.points },
          authorName: body.data.authorName,
        })
        .returning(columns);
      return row;
    });
    if (result === 'not_found' || result === undefined) return notFound(reply);
    if (result === 'not_ready') return reply.code(409).send({ error: 'video_not_ready' });
    if (result === 'bad_frame') return reply.code(400).send({ error: 'frame_out_of_range' });
    return reply.code(201).send(result);
  });

  app.patch('/api/annotations/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = editNote.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_note' });
    const tenant = tenantOf(req);
    const [row] = await withTenant(db, tenant, (tx) =>
      tx
        .update(annotation)
        .set({ body: body.data.body, updatedAt: new Date() })
        .where(and(eq(annotation.id, params.data.id), eq(annotation.kind, 'note')))
        .returning(columns),
    );
    return row ?? notFound(reply);
  });

  // A whole moment (Ewout: one note per frame): every drawing and remark at that frame, in one
  // transaction, so it never half-disappears.
  app.delete(
    '/api/videos/:id/frames/:frame/annotations',
    { preHandler: guard },
    async (req, reply) => {
      const params = frameParams.safeParse(req.params);
      if (!params.success) return notFound(reply);
      const deleted = await withTenant(db, tenantOf(req), async (tx) => {
        const [v] = await tx
          .select({ id: video.id })
          .from(video)
          .where(eq(video.id, params.data.id));
        if (v === undefined) return null;
        const gone = await tx
          .delete(annotation)
          .where(and(eq(annotation.videoId, v.id), eq(annotation.frame, params.data.frame)))
          .returning({ id: annotation.id });
        // The note's rowers go with it (#105).
        await dropEmptyMoments(tx, v.id, params.data.frame);
        return gone;
      });
      if (deleted === null || deleted.length === 0) return notFound(reply);
      req.log.info(
        { videoId: params.data.id, frame: params.data.frame, count: deleted.length },
        'moment deleted',
      );
      return reply.code(204).send();
    },
  );

  app.delete('/api/annotations/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const deleted = await withTenant(db, tenantOf(req), async (tx) => {
      const gone = await tx
        .delete(annotation)
        .where(eq(annotation.id, params.data.id))
        .returning({ videoId: annotation.videoId, frame: annotation.frame });
      // The last drawing or remark at a frame takes the note (and its rowers) with it.
      for (const g of gone) await dropEmptyMoments(tx, g.videoId, g.frame);
      return gone;
    });
    if (deleted.length === 0) return notFound(reply);
    return reply.code(204).send();
  });

  done();
};
