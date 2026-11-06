import { sql } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { BOAT_CLASS_NAMES } from '../../shared/boats.ts';
import { writeSettings } from '../repositories/user-settings.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, tenantOf } from './route-helpers.ts';

const name = z.string().trim().min(1).max(60);
const profileBody = z.object({
  revision: z.int().nonnegative().optional(),
  firstName: name,
  lastName: name,
  /** The boat a new session starts with; null: C4x+. */
  defaultBoatType: z.enum(BOAT_CLASS_NAMES).nullable(),
});

/**
 * The signed-in member's own name and settings (2026-11-03), set in the account menu. Through
 * `rowlens_set_my_profile`, which reaches only the session's own user; the pilot-code path has no
 * user and gets a 403.
 */
export const profileRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.put('/api/me/profile', { preHandler: guard }, async (req, reply) => {
    const body = profileBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_profile' });
    const tenant = tenantOf(req);
    if (tenant.userId === null) return reply.code(403).send({ error: 'no_account' });
    const { revision, ...p } = body.data;
    if (revision !== undefined) {
      const result = await writeSettings(db, tenant, tenant.userId, p, revision);
      if (result === null) return reply.code(404).send({ error: 'not_found' });
      if ('conflict' in result) return reply.code(409).send({ error: 'settings_changed' });
      return p;
    }
    await withTenant(db, tenant, (tx) =>
      tx.execute(
        sql`select rowlens_set_my_profile(${p.firstName}, ${p.lastName}, ${p.defaultBoatType})`,
      ),
    );
    return p;
  });

  done();
};
