import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '../db/client.ts';
import { club } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';

interface ClubRouteOptions {
  db: Database;
  guard: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
}

/** `GET /api/club`: the club the request acts in, read through RLS like every tenant query. */
export const clubRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, { db, guard }, done) => {
  app.get('/api/club', { preHandler: guard }, async (req, reply) => {
    const tenant = req.tenant;
    if (tenant === null) {
      reply.callNotFound();
      return reply;
    }
    const [row] = await withTenant(db, tenant, (tx) =>
      tx.select({ slug: club.slug, name: club.name }).from(club),
    );
    if (row === undefined) {
      reply.callNotFound();
      return reply;
    }
    void reply.header('cache-control', 'private, no-store');
    return row;
  });
  done();
};
