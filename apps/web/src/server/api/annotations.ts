import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { annotation, video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const text = z.string().trim().min(1).max(2000);
const newNote = z.object({
  frame: z.int().min(0),
  body: text,
  authorName: z.string().trim().min(1).max(60),
});
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
 * Notes pinned to a frame (#59), behind the guard and RLS like everything in a club. While the
 * pilot has no accounts, everyone with the code may edit or delete any note (the pilot notice
 * says so); with login (#28) that becomes the author only.
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
      return tx
        .select(columns)
        .from(annotation)
        .where(eq(annotation.videoId, v.id))
        .orderBy(asc(annotation.frame), asc(annotation.createdAt));
    });
    return rows === null ? notFound(reply) : { annotations: rows };
  });

  app.post('/api/videos/:id/annotations', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = newNote.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_note' });
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
          kind: 'note',
          body: body.data.body,
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

  app.delete('/api/annotations/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const deleted = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .delete(annotation)
        .where(eq(annotation.id, params.data.id))
        .returning({ id: annotation.id }),
    );
    if (deleted.length === 0) return notFound(reply);
    return reply.code(204).send();
  });

  done();
};
