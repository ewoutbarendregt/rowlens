import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import {
  availableVideos,
  linkAnnotation,
  reuseVideo,
  sourceAnnotations,
} from '../repositories/video-reuse.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const id = z.object({ id: z.uuid() });
const source = z.object({ sourceVideoId: z.uuid() });
const reference = z.object({ id: z.uuid(), annotationId: z.uuid() });
const search = z.object({ q: z.string().trim().max(120).default(''), after: z.uuid().optional() });

export const videoReuseRoutes: FastifyPluginCallback<ClubRouteOptions> = (
  app,
  { db, guard },
  done,
) => {
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });
  app.get('/api/sessions/:id/available-videos', { preHandler: guard }, async (req, reply) => {
    const params = id.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const query = search.safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: 'invalid_search' });
    return (
      (await availableVideos(db, tenantOf(req), params.data.id, query.data.q, query.data.after)) ??
      notFound(reply)
    );
  });
  app.post('/api/sessions/:id/reuse-video', { preHandler: guard }, async (req, reply) => {
    const params = id.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = source.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_video' });
    const row = await reuseVideo(db, tenantOf(req), params.data.id, body.data.sourceVideoId);
    return row ? reply.code(201).send(row) : notFound(reply);
  });
  app.get('/api/videos/:id/source-annotations', { preHandler: guard }, async (req, reply) => {
    const params = id.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const annotations = await sourceAnnotations(db, tenantOf(req), params.data.id);
    return annotations === null ? notFound(reply) : { annotations };
  });
  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      method,
      url: '/api/videos/:id/annotation-references/:annotationId',
      preHandler: guard,
      handler: async (req, reply) => {
        const params = reference.safeParse(req.params);
        if (!params.success) return notFound(reply);
        const ok = await linkAnnotation(
          db,
          tenantOf(req),
          params.data.id,
          params.data.annotationId,
          method === 'PUT',
        );
        return ok ? reply.code(204).send() : notFound(reply);
      },
    });
  }
  done();
};
