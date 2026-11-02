import { and, eq, sql } from 'drizzle-orm';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Role } from '../auth/gate.ts';
import type { DeliverInvite } from '../auth/mail.ts';
import type { AppConfig } from '../config.ts';
import type { Tx } from '../db/client.ts';
import { club, clubAccess, clubAccessLog, membership } from '../db/schema.ts';
import { withTenant } from '../db/tenant.ts';
import { type ClubRouteOptions, notFound, tenantOf } from './route-helpers.ts';

const ROLES = ['rower', 'coach', 'admin'] as const;
const idParam = z.object({ id: z.uuid() });
const email = z
  .string()
  .trim()
  .max(254)
  .transform((v) => v.toLowerCase())
  .pipe(z.email());
const addBody = z.object({ email, role: z.enum(ROLES) });
const roleBody = z.object({ role: z.enum(ROLES) });

export interface AccessEntry {
  /** null for addresses the server settings manage. */
  id: string | null;
  email: string;
  role: Role;
  source: 'app' | 'server';
  joinedAt: string | null;
  lastSeenAt: string | null;
}

interface AccessRouteOptions extends ClubRouteOptions {
  auth: NonNullable<AppConfig['auth']>;
  publicOrigin: string;
  deliverInvite?: DeliverInvite;
}

type Member = {
  user_id: string;
  email: string;
  role: string;
  joined_at: string | Date;
  last_seen_at: string | Date | null;
};

const iso = (value: string | Date | null) =>
  value === null ? null : new Date(value).toISOString();

async function members(tx: Tx): Promise<Map<string, Member>> {
  const result = await tx.execute<Member>(sql`select * from rowlens_club_members()`);
  return new Map(result.rows.map((m) => [m.email, m]));
}

/**
 * Admins decide who may log in and as what (#42). Admin-only (404 for everyone else, as for an
 * unknown route); every change is logged. Server-managed addresses are listed but can't be changed
 * here: admins from AUTH_ADMIN_EMAILS stay admin, so the club can never lock itself out.
 */
export const accessRoutes: FastifyPluginCallback<AccessRouteOptions> = (app, opts, done) => {
  const { db, guard, auth } = opts;

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.role !== 'admin') return notFound(reply);
    return undefined;
  };
  const preHandler = [guard, requireAdmin];

  app.addHook('onSend', async (_req, reply) => {
    void reply.header('cache-control', 'private, no-store');
  });

  /** Would `email` stop being an admin leave none? Checked before the change is made. */
  const lastAdmin = async (tx: Tx, email: string) => {
    const rows = await tx
      .select({ email: clubAccess.email })
      .from(clubAccess)
      .where(eq(clubAccess.role, 'admin'));
    const others = new Set([...auth.adminEmails, ...rows.map((r) => r.email)]);
    others.delete(email);
    return others.size === 0;
  };

  const log = (
    tx: Tx,
    clubId: string,
    entry: { email: string; action: 'added' | 'role_changed' | 'removed'; role: Role | null },
    byUserId: string | null,
  ) => tx.insert(clubAccessLog).values({ clubId, ...entry, byUserId });

  app.get('/api/admin/access', { preHandler }, async (req) => {
    const entries = await withTenant(db, tenantOf(req), async (tx) => {
      const listed = await tx.select().from(clubAccess).orderBy(clubAccess.email);
      const seen = await members(tx);
      const out: AccessEntry[] = [];
      const add = (e: Omit<AccessEntry, 'joinedAt' | 'lastSeenAt'>) => {
        const m = seen.get(e.email);
        out.push({
          ...e,
          joinedAt: m === undefined ? null : iso(m.joined_at),
          lastSeenAt: m === undefined ? null : iso(m.last_seen_at),
        });
      };
      for (const e of auth.adminEmails)
        add({ id: null, email: e, role: 'admin', source: 'server' });
      for (const row of listed) {
        if (auth.adminEmails.has(row.email)) continue;
        add({ id: row.id, email: row.email, role: row.role as Role, source: 'app' });
      }
      const inApp = new Set(listed.map((r) => r.email));
      for (const e of auth.allowedEmails) {
        if (!auth.adminEmails.has(e) && !inApp.has(e)) {
          add({ id: null, email: e, role: 'coach', source: 'server' });
        }
      }
      return out.sort((a, b) => a.email.localeCompare(b.email));
    });
    return { entries };
  });

  app.post('/api/admin/access', { preHandler }, async (req, reply) => {
    const body = addBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_access' });
    const { email: address, role } = body.data;
    if (auth.adminEmails.has(address)) return reply.code(409).send({ error: 'server_managed' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const inserted = await tx
        .insert(clubAccess)
        .values({ clubId: tenant.clubId, email: address, role, addedByUserId: tenant.userId })
        .onConflictDoNothing()
        .returning({ id: clubAccess.id });
      const row = inserted[0];
      if (row === undefined) return null;
      // Someone who already logged in (a server-listed coach) gets the new role straight away.
      const member = (await members(tx)).get(address);
      if (member !== undefined) {
        await tx
          .update(membership)
          .set({ role })
          .where(and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)));
      }
      await log(tx, tenant.clubId, { email: address, action: 'added', role }, tenant.userId);
      const [c] = await tx.select({ name: club.name }).from(club);
      return { id: row.id, clubName: c?.name ?? 'RowLens' };
    });
    if (result === null) return reply.code(409).send({ error: 'exists' });

    let invited = false;
    if (opts.deliverInvite !== undefined) {
      try {
        await opts.deliverInvite({
          email: address,
          clubName: result.clubName,
          loginUrl: `${opts.publicOrigin}${opts.basePath}/`,
        });
        invited = true;
      } catch (error) {
        req.log.error({ error }, 'invitation mail failed');
      }
    } else {
      req.log.info({ email: address }, 'development invitation (no SMTP)');
    }
    return reply.code(201).send({ id: result.id, invited });
  });

  app.patch('/api/admin/access/:id', { preHandler }, async (req, reply) => {
    const params = idParam.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const body = roleBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_access' });
    const tenant = tenantOf(req);
    const result = await withTenant(db, tenant, async (tx) => {
      const [row] = await tx
        .select()
        .from(clubAccess)
        .where(eq(clubAccess.id, params.data.id))
        .for('update');
      if (row === undefined) return 'not_found' as const;
      const member = (await members(tx)).get(row.email);
      if (member !== undefined && member.user_id === tenant.userId) return 'self' as const;
      if (row.role === 'admin' && body.data.role !== 'admin' && (await lastAdmin(tx, row.email))) {
        return 'last_admin' as const;
      }
      await tx
        .update(clubAccess)
        .set({ role: body.data.role, updatedAt: new Date() })
        .where(eq(clubAccess.id, row.id));
      if (member !== undefined) {
        await tx
          .update(membership)
          .set({ role: body.data.role })
          .where(and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)));
      }
      await log(
        tx,
        tenant.clubId,
        { email: row.email, action: 'role_changed', role: body.data.role },
        tenant.userId,
      );
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
      const [row] = await tx
        .select()
        .from(clubAccess)
        .where(eq(clubAccess.id, params.data.id))
        .for('update');
      if (row === undefined) return 'not_found' as const;
      const member = (await members(tx)).get(row.email);
      if (member !== undefined && member.user_id === tenant.userId) return 'self' as const;
      if (row.role === 'admin' && (await lastAdmin(tx, row.email))) return 'last_admin' as const;
      await tx.delete(clubAccess).where(eq(clubAccess.id, row.id));
      // Removing the membership ends their sessions and open login codes (cascade). A coach the
      // server also lists can still log in: that list is the server's, not the app's.
      if (member !== undefined && !auth.allowedEmails.has(row.email)) {
        await tx
          .delete(membership)
          .where(and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)));
      } else if (member !== undefined) {
        await tx
          .update(membership)
          .set({ role: 'coach' })
          .where(and(eq(membership.clubId, tenant.clubId), eq(membership.userId, member.user_id)));
      }
      await log(
        tx,
        tenant.clubId,
        { email: row.email, action: 'removed', role: null },
        tenant.userId,
      );
      return 'ok' as const;
    });
    if (result === 'not_found') return notFound(reply);
    if (result !== 'ok') return reply.code(409).send({ error: result });
    return reply.code(204).send();
  });

  done();
};
