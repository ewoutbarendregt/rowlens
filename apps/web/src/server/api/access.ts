import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { absoluteUrl } from '../../shared/base-path.ts';
import { primaryRole, rolesSchema, type Role } from '../../shared/roles.ts';
import type { DeliverInvite } from '../auth/mail.ts';
import type { AppConfig } from '../config.ts';
import type { Tx } from '../db/client.ts';
import { club, clubAccess, clubAccessLog, membership, userSettingsAudit } from '../db/schema.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const idParam = z.object({ id: z.uuid() });
const email = z
  .string()
  .trim()
  .max(254)
  .transform((v) => v.toLowerCase())
  .pipe(z.email());
const addBody = z.object({ email, roles: rolesSchema }).strict();
const roleBody = z.object({ roles: rolesSchema, expectedRoles: rolesSchema.optional() }).strict();
export interface AccessEntry {
  id: string | null;
  userId: string | null;
  email: string;
  roles: Role[];
  /** Read-only compatibility for already-open older clients. */
  role: Role;
  source: 'app' | 'server';
  joinedAt: string | null;
  lastSeenAt: string | null;
  firstName: string | null;
  lastName: string | null;
}
interface AccessRouteOptions extends ClubRouteOptions {
  auth: NonNullable<AppConfig['auth']>;
  publicOrigin: string;
  deliverInvite?: DeliverInvite;
}
type Member = {
  user_id: string;
  email: string;
  roles: Role[];
  joined_at: string | Date;
  last_seen_at: string | Date | null;
  first_name: string | null;
  last_name: string | null;
};
const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());
async function members(tx: Tx): Promise<Map<string, Member>> {
  const result = await tx.execute<Member>(sql`select * from rowlens_club_members()`);
  return new Map(result.rows.map((m) => [m.email, m]));
}

/** One user register; multiple additive roles, with serialized and audited access changes. */
export const accessRoutes: FastifyPluginCallback<AccessRouteOptions> = (app, opts, done) => {
  const { db, guard, auth } = opts;
  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) =>
    req.roles?.includes('admin') === true ? undefined : notFound(reply);
  const preHandler = [guard, requireAdmin];
  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });
  const lock = async (tx: Tx, tenant: TenantContext) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'rowlens-access:' + tenant.clubId},0))`,
    );
    const checked = await tx.execute<{ ok: boolean }>(sql`select rowlens_admin_member() as ok`);
    return checked.rows[0]?.ok === true;
  };
  const lastAdmin = async (tx: Tx, address: string) => {
    const rows = await tx.select().from(clubAccess);
    return ![
      ...auth.adminEmails,
      ...rows.filter((r) => r.roles.includes('admin')).map((r) => r.email),
    ].some((e) => e !== address);
  };
  const log = async (
    tx: Tx,
    tenant: TenantContext,
    address: string,
    action: 'added' | 'role_changed' | 'removed',
    roles: Role[] | null,
    member?: Member,
  ) => {
    await tx.insert(clubAccessLog).values({
      clubId: tenant.clubId,
      email: address,
      action,
      role: roles?.length === 1 ? roles[0] : null,
      roles,
      byUserId: tenant.userId,
    });
    if (member !== undefined && tenant.userId !== null)
      await tx.insert(userSettingsAudit).values({
        clubId: tenant.clubId,
        actorUserId: tenant.userId,
        subjectUserId: member.user_id,
        changedKeys: [action === 'removed' ? 'access' : 'roles'],
        roles,
      });
  };
  const list = async (req: FastifyRequest) => {
    const entries = await withTenant(db, tenantOf(req), async (tx) => {
      const listed = await tx.select().from(clubAccess).orderBy(clubAccess.email);
      const seen = await members(tx);
      const out: AccessEntry[] = [];
      const addresses = new Set([
        ...auth.adminEmails,
        ...auth.allowedEmails,
        ...listed.map((r) => r.email),
        ...seen.keys(),
      ]);
      for (const address of addresses) {
        const row = listed.find((r) => r.email === address);
        const member = seen.get(address);
        const root = auth.adminEmails.has(address);
        const selected = rolesSchema.parse([
          ...new Set([
            ...(row?.roles ?? member?.roles ?? (root ? [] : ['coach'])),
            ...(root ? ['admin'] : []),
          ]),
        ]);
        out.push({
          id: row?.id ?? null,
          userId: member?.user_id ?? null,
          email: address,
          roles: selected,
          role: primaryRole(selected),
          source: root || row === undefined ? 'server' : 'app',
          joinedAt: member === undefined ? null : iso(member.joined_at),
          lastSeenAt: member === undefined ? null : iso(member.last_seen_at),
          firstName: member?.first_name ?? null,
          lastName: member?.last_name ?? null,
        });
      }
      return out.sort((a, b) => a.email.localeCompare(b.email));
    });
    return { entries };
  };
  app.get('/api/admin/access', { preHandler }, list);
  app.get('/api/admin/users', { preHandler }, list);

  app.post('/api/admin/access', { preHandler }, async (req, reply) => {
    const body = addBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_access' });
    const { email: address, roles } = body.data;
    const root = auth.adminEmails.has(address);
    if (root && !roles.includes('admin')) return reply.code(409).send({ error: 'server_managed' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      if (!(await lock(tx, tenant))) return 'not_found' as const;
      const inserted = await tx
        .insert(clubAccess)
        .values({ clubId: tenant.clubId, email: address, roles, addedByUserId: tenant.userId })
        .onConflictDoNothing()
        .returning({ id: clubAccess.id });
      const row = inserted[0];
      if (row === undefined) return null;
      const member = (await members(tx)).get(address);
      if (member !== undefined)
        await tx
          .update(membership)
          .set({ roles })
          .where(and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)));
      await log(tx, tenant, address, 'added', roles, member);
      const [c] = await tx.select({ name: club.name }).from(club);
      return { id: row.id, clubName: c?.name ?? 'RowLens' };
    });
    if (result === 'not_found') return notFound(reply);
    if (result === null) return reply.code(409).send({ error: 'exists' });
    let invited = false;
    if (!root && opts.deliverInvite !== undefined) {
      try {
        await opts.deliverInvite({
          email: address,
          clubName: result.clubName,
          loginUrl: absoluteUrl(opts.publicOrigin, opts.basePath, '/'),
        });
        invited = true;
      } catch (error) {
        req.log.error({ error }, 'invitation mail failed');
      }
    }
    return reply.code(201).send({ id: result.id, invited });
  });

  app.patch('/api/admin/access/:id', { preHandler }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = roleBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_access' });
    const roles = body.data.roles;
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      if (!(await lock(tx, tenant))) return 'not_found' as const;
      const [row] = await tx
        .select()
        .from(clubAccess)
        .where(eq(clubAccess.id, params.data.id))
        .for('update');
      if (row === undefined) return 'not_found' as const;
      const member = (await members(tx)).get(row.email);
      if (
        body.data.expectedRoles !== undefined &&
        JSON.stringify([...body.data.expectedRoles].sort()) !==
          JSON.stringify([...row.roles].sort())
      )
        return 'access_changed' as const;
      if (auth.adminEmails.has(row.email) && !roles.includes('admin'))
        return 'server_managed' as const;
      if (member?.user_id === tenant.userId && !roles.includes('admin')) return 'self' as const;
      if (
        row.roles.includes('admin') &&
        !roles.includes('admin') &&
        (await lastAdmin(tx, row.email))
      )
        return 'last_admin' as const;
      await tx
        .update(clubAccess)
        .set({ roles, updatedAt: new Date() })
        .where(eq(clubAccess.id, row.id));
      if (member !== undefined)
        await tx
          .update(membership)
          .set({ roles })
          .where(and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)));
      await log(tx, tenant, row.email, 'role_changed', roles, member);
      return 'ok' as const;
    });
    if (result === 'not_found') return notFound(reply);
    if (result !== 'ok') return reply.code(409).send({ error: result });
    return reply.code(204).send();
  });
  app.delete('/api/admin/access/:id', { preHandler }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      if (!(await lock(tx, tenant))) return 'not_found' as const;
      const [row] = await tx
        .select()
        .from(clubAccess)
        .where(eq(clubAccess.id, params.data.id))
        .for('update');
      if (row === undefined) return 'not_found' as const;
      const member = (await members(tx)).get(row.email);
      if (auth.adminEmails.has(row.email)) return 'server_managed' as const;
      if (member?.user_id === tenant.userId) return 'self' as const;
      if (row.roles.includes('admin') && (await lastAdmin(tx, row.email)))
        return 'last_admin' as const;
      await log(tx, tenant, row.email, 'removed', null, member);
      await tx.delete(clubAccess).where(eq(clubAccess.id, row.id));
      if (member !== undefined) {
        if (auth.allowedEmails.has(row.email))
          await tx
            .update(membership)
            .set({ roles: ['coach'] })
            .where(
              and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)),
            );
        else
          await tx
            .delete(membership)
            .where(
              and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)),
            );
      }
      return 'ok' as const;
    });
    if (result === 'not_found') return notFound(reply);
    if (result !== 'ok') return reply.code(409).send({ error: result });
    return reply.code(204).send();
  });
  done();
};
