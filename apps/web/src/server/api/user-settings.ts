import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { preferenceSchema, settingsPatchSchema } from '../../shared/user-settings.ts';
import { readSettings, writeSettings } from '../repositories/user-settings.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z
  .object({
    revision: z.int().nonnegative(),
    changes: settingsPatchSchema,
    importLegacy: z.boolean().optional(),
  })
  .strict();
const preferences = preferenceSchema
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0);
export const userSettingsRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });
  const admin = async (req: FastifyRequest, reply: FastifyReply) =>
    req.roles?.includes('admin') === true ? undefined : notFound(reply);
  app.get('/api/me/settings', { preHandler: guard }, async (req, reply) => {
    const tenant = tenantOf(req);
    if (tenant.userId === null) return notFound(reply);
    return (await readSettings(db, tenant, tenant.userId)) ?? notFound(reply);
  });
  app.patch('/api/me/settings', { preHandler: guard }, async (req, reply) => {
    const body = bodySchema.safeParse(req.body);
    if (!body.success || !preferences.safeParse(body.data.changes).success)
      return reply.code(400).send({ error: 'invalid_settings' });
    const tenant = tenantOf(req);
    if (tenant.userId === null) return notFound(reply);
    const result = await writeSettings(
      db,
      tenant,
      tenant.userId,
      body.data.changes,
      body.data.revision,
      body.data.importLegacy ?? false,
    );
    if (result === null) return notFound(reply);
    if ('conflict' in result) return reply.code(409).send({ error: 'settings_changed' });
    return result;
  });
  const preHandler = [guard, admin];
  app.get('/api/admin/users/:id/settings', { preHandler }, async (req, reply) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return notFound(reply);
    return (await readSettings(db, tenantOf(req), params.data.id)) ?? notFound(reply);
  });
  app.patch('/api/admin/users/:id/settings', { preHandler }, async (req, reply) => {
    const params = paramsSchema.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = bodySchema.safeParse(req.body);
    if (!body.success || body.data.importLegacy === true)
      return reply.code(400).send({ error: 'invalid_settings' });
    const result = await writeSettings(
      db,
      tenantOf(req),
      params.data.id,
      body.data.changes,
      body.data.revision,
    );
    if (result === null) return notFound(reply);
    if ('conflict' in result) return reply.code(409).send({ error: 'settings_changed' });
    return result;
  });
  done();
};
