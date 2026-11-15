import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { sharingBodySchema } from '../../shared/session-sharing.ts';
import {
  sessionSharing,
  saveSessionSharing,
  sessionShareMembers,
} from '../repositories/session-sharing.ts';
import { notFound, tenantOf, type ClubRouteOptions } from './route-helpers.ts';
const idSchema = z.object({ id: z.uuid() });
export const sessionSharingRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });
  app.get('/api/sessions/:id/sharing', { preHandler: guard }, async (req, reply) => {
    const p = idSchema.safeParse(req.params);
    if (!p.success) return notFound(reply);
    return (await sessionSharing(db, tenantOf(req), p.data.id)) ?? notFound(reply);
  });
  app.get('/api/sessions/:id/sharing/members', { preHandler: guard }, async (req, reply) => {
    const p = idSchema.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const q = z
      .object({ q: z.string().trim().min(2).max(80), club: z.uuid().optional() })
      .strict()
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid_query' });
    return (await sessionShareMembers(db, tenantOf(req), p.data.id, q.data.q)) ?? notFound(reply);
  });
  app.put('/api/sessions/:id/sharing', { preHandler: guard }, async (req, reply) => {
    const p = idSchema.safeParse(req.params);
    if (!p.success) return notFound(reply);
    const body = sharingBodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_sharing' });
    const result = await saveSessionSharing(db, tenantOf(req), p.data.id, body.data);
    if (result === null) return notFound(reply);
    if ('error' in result)
      return reply
        .code(result.error === 'conflict' ? 409 : 400)
        .send({ error: result.error === 'conflict' ? 'sharing_changed' : result.error });
    return result;
  });
  done();
};
