import { and, eq } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { video } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { exampleContext, listExamples, readExample } from '../repositories/examples.ts';
import { streamVideoMedia } from './videos.ts';
import { notFound, tenantOf, type ClubRouteOptions } from './route-helpers.ts';
const params = z.object({ id: z.uuid() });
export const exampleRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard, media } = opts;
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });
  app.get('/api/examples', { preHandler: guard }, async (req) => ({
    examples: await listExamples(db, tenantOf(req)),
  }));
  app.get('/api/examples/:id', { preHandler: guard }, async (req, reply) => {
    const p = params.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const scope = await exampleContext(db, tenantOf(req), p.data.id);
    if (!scope) return notFound(reply);
    return (await readExample(db, scope, p.data.id)) ?? notFound(reply);
  });
  app.get(
    '/api/examples/:id/videos/:videoId/media/:name',
    { preHandler: guard },
    async (req, reply) => {
      const p = params
        .extend({ videoId: z.uuid(), name: z.enum(['poster', 'play-540', 'play-1080']) })
        .safeParse(req.params);
      if (!p.success || !media) return notFound(reply);
      const scope = await exampleContext(db, tenantOf(req), p.data.id);
      if (!scope) return notFound(reply);
      const [v] = await withTenant(db, scope, (tx) =>
        tx
          .select({
            id: video.id,
            assetId: video.assetId,
            status: video.status,
            renditions: video.renditions,
          })
          .from(video)
          .where(and(eq(video.id, p.data.videoId), eq(video.sessionId, p.data.id))),
      );
      if (v?.status !== 'ready') return notFound(reply);
      return streamVideoMedia(req, reply, media, scope.clubId, v, p.data.name);
    },
  );
  done();
};
