import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { examplePublishBodySchema } from '../../shared/example-management.ts';
import { exampleCandidates, publishExample } from '../repositories/example-management.ts';
import { notFound, tenantOf, type ClubRouteOptions } from './route-helpers.ts';
const params = z.object({ id: z.uuid() });
const query = z
  .object({
    q: z.string().trim().max(120).default(''),
    before: z.uuid().optional(),
    club: z.uuid().optional(),
  })
  .strict();
export const exampleManagementRoutes: FastifyPluginCallback<ClubRouteOptions> = (
  app,
  opts,
  done,
) => {
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });
  app.get('/api/example-management/candidates', { preHandler: opts.guard }, async (req, reply) => {
    const actor = tenantOf(req);
    if (!actor.platformAdmin) return notFound(reply);
    const q = query.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    return (await exampleCandidates(opts.db, actor, q.data.q, q.data.before)) ?? notFound(reply);
  });
  app.post(
    '/api/example-management/:id/publish',
    { preHandler: opts.guard },
    async (req, reply) => {
      const actor = tenantOf(req);
      if (!actor.platformAdmin) return notFound(reply);
      const p = params.safeParse(req.params);
      if (!p.success) return notFound(reply);
      if (!examplePublishBodySchema.safeParse(req.body).success)
        return reply.code(400).send({ error: 'confirmation_required' });
      return (await publishExample(opts.db, actor, p.data.id)) ?? notFound(reply);
    },
  );
  done();
};
