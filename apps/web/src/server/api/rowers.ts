import { and, asc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import { similarNames } from '../../shared/names.ts';
import type { Tx } from '../db/client.ts';
import { rower } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { mergeLineupSeats } from './lineups.ts';
import { mergeMomentRowers } from './moments.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const displayName = z.string().trim().min(1).max(60);
// Empty string clears the address; otherwise stored lower-case (the unique key is per club).
const email = z
  .string()
  .trim()
  .max(254)
  .transform((value) => value.toLowerCase())
  .pipe(z.union([z.literal(''), z.email()]))
  .transform((value) => (value === '' ? null : value));
const newRower = z.object({
  displayName,
  email: email.optional(),
  /** Set after the coach answered "no, a new rower" to the similar-name question. */
  confirmNew: z.boolean().default(false),
});
const editRower = z
  .object({ displayName: displayName.optional(), email: email.optional(), archived: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0);
const listQuery = z.object({ archived: z.enum(['include', 'only']).optional() });
const mergeBody = z.object({ into: z.uuid() });

export const rowerColumns = {
  id: rower.id,
  displayName: rower.displayName,
  email: rower.email,
  archivedAt: rower.archivedAt,
  createdAt: rower.createdAt,
};

/** Turns Postgres' unique_violation on the per-club e-mail key into a value; rethrows the rest. */
function emailTaken(error: unknown): 'email_taken' {
  const pg = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  if (pg.code === '23505' && pg.constraint === 'rower_club_email_unique') return 'email_taken';
  throw error;
}

/**
 * Moves everything that points at `from` to `into`, then removes `from`: lineups (#103) and note
 * assignments (#105); whatever points at a rower later adds its step here, so a merge loses nothing.
 */
async function mergeRowers(tx: Tx, clubId: string, from: string, into: string): Promise<void> {
  await mergeLineupSeats(tx, from, into);
  await mergeMomentRowers(tx, from, into);
  const [source] = await tx
    .select({ email: rower.email, userId: rower.userId })
    .from(rower)
    .where(and(eq(rower.id, from), eq(rower.clubId, clubId)));
  await tx.delete(rower).where(and(eq(rower.id, from), eq(rower.clubId, clubId)));
  // The kept entry inherits an e-mail or account link it didn't have yet.
  if (source?.email != null || source?.userId != null) {
    const [target] = await tx
      .select({ email: rower.email, userId: rower.userId })
      .from(rower)
      .where(eq(rower.id, into));
    await tx
      .update(rower)
      .set({
        email: target?.email ?? source.email,
        userId: target?.userId ?? source.userId,
        updatedAt: new Date(),
      })
      .where(eq(rower.id, into));
  }
}

/**
 * The club roster (#104): rowers and coxes, with or without an account. Behind the guard and RLS
 * like everything in a club; during the one-club phase every signed-in member may edit it (roles: #40).
 */
export const rowerRoutes: FastifyPluginCallback<ClubRouteOptions> = (app, opts, done) => {
  const { db, guard } = opts;

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  app.get('/api/rowers', { preHandler: guard }, async (req) => {
    const query = listQuery.safeParse(req.query);
    const archived = query.success ? query.data.archived : undefined;
    const rows = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .select(rowerColumns)
        .from(rower)
        .where(
          archived === 'include'
            ? undefined
            : archived === 'only'
              ? isNotNull(rower.archivedAt)
              : isNull(rower.archivedAt),
        )
        .orderBy(asc(rower.displayName)),
    );
    return { rowers: rows };
  });

  app.post('/api/rowers', { preHandler: guard }, async (req, reply) => {
    const body = newRower.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_rower' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      if (!body.data.confirmNew) {
        const existing = await tx.select(rowerColumns).from(rower);
        const candidates = existing.filter((r) =>
          similarNames(r.displayName, body.data.displayName),
        );
        if (candidates.length > 0) return { candidates };
      }
      const [row] = await tx
        .insert(rower)
        .values({
          clubId: tenant.clubId,
          displayName: body.data.displayName,
          email: body.data.email ?? null,
        })
        .returning(rowerColumns);
      return { row };
    }).catch(emailTaken);
    if (result === 'email_taken') return reply.code(409).send({ error: 'email_taken' });
    if ('candidates' in result) {
      return reply.code(409).send({ error: 'similar', candidates: result.candidates });
    }
    return reply.code(201).send(result.row);
  });

  app.patch('/api/rowers/:id', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = editRower.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_rower' });
    const { archived, ...fields } = body.data;
    const result = await withTenant(db, tenantOf(req), (tx) =>
      tx
        .update(rower)
        .set({
          ...fields,
          ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
          updatedAt: new Date(),
        })
        .where(eq(rower.id, params.data.id))
        .returning(rowerColumns),
    ).catch(emailTaken);
    if (result === 'email_taken') return reply.code(409).send({ error: 'email_taken' });
    return result[0] ?? notFound(reply);
  });

  /** Two entries for one person: keep `into`, move everything of `:id` to it, remove `:id`. */
  app.post('/api/rowers/:id/merge', { preHandler: guard }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = mergeBody.safeParse(req.body);
    if (!body.success || body.data.into === params.data.id) {
      return reply.code(400).send({ error: 'invalid_merge' });
    }
    const tenant = tenantOf(req);
    const into = body.data.into;
    const result = await withTenant(db, tenant, async (tx) => {
      // Both must be this club's; locking them keeps a parallel merge from crossing this one.
      const found = await tx
        .select({ id: rower.id })
        .from(rower)
        .where(and(eq(rower.clubId, tenant.clubId), inArray(rower.id, [params.data.id, into])))
        .for('update');
      const ids = new Set(found.map((r) => r.id));
      if (!ids.has(params.data.id) || !ids.has(into)) return null;
      await mergeRowers(tx, tenant.clubId, params.data.id, into);
      const [row] = await tx.select(rowerColumns).from(rower).where(eq(rower.id, into));
      return row ?? null;
    });
    return result ?? notFound(reply);
  });

  done();
};
