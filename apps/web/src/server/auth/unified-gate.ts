import { listSessions } from '../repositories/session-list.ts';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest, FastifyPluginCallback } from 'fastify';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { absoluteUrl, withBasePath } from '../../shared/base-path.ts';
import { LANGUAGES } from '../../shared/languages.ts';
import { primaryRole, rolesSchema } from '../../shared/roles.ts';
import type { Database } from '../db/client.ts';
import { withTenant, type TenantContext } from '../db/tenant.ts';
import type { AppConfig } from '../config.ts';
import { hmac, newCode, newToken, safeEqual, sha256 } from './crypto.ts';
import type { DeliverLoginCode } from './mail.ts';
import { notFound, tenantOf } from '../api/route-helpers.ts';
import type { AuthGate } from './gate.ts';
import { accountManagement, managementRoutes } from './account-management.ts';

/** Account-only context cannot match an actual club; protected self-profile functions still work. */
const NO_CLUB = '00000000-0000-0000-0000-000000000000';
const emailBody = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  language: z.enum(LANGUAGES).optional(),
});
const verifyBody = emailBody.extend({ code: z.string().regex(/^\d{6}$/) });
const accountSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  locale: z.enum(['nl', 'en']),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  defaultBoatType: z.string().nullable(),
  csrfHash: z.string(),
  platformAdmin: z.boolean(),
});
const clubsSchema = z.array(
  z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    roles: rolesSchema,
    member: z.boolean(),
  }),
);
type Account = z.infer<typeof accountSchema>;
type Club = z.infer<typeof clubsSchema>[number];
const cookie = (req: FastifyRequest, name: string) =>
  (req.headers.cookie ?? '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createUnifiedGate(opts: {
  db: Database;
  auth: NonNullable<AppConfig['auth']>;
  basePath: string;
  publicOrigin: string;
  deliver?: DeliverLoginCode;
  generateCode?: () => string;
}): AuthGate {
  const { db, auth } = opts;
  const sid = opts.publicOrigin.startsWith('https:') ? '__Secure-rowlens_sid' : 'rowlens_sid';
  const cookies = (reply: FastifyReply, token: string, csrf: string, age = 30 * 86400) => {
    const suffix = `; Path=${opts.basePath || '/'}; Max-Age=${String(age)}; SameSite=Lax${sid.startsWith('__Secure') ? '; Secure' : ''}`;
    void reply.header('set-cookie', [
      `${sid}=${token}${suffix}; HttpOnly`,
      `rowlens_csrf=${csrf}${suffix}`,
    ]);
  };
  const value = async <T>(query: Parameters<Database['execute']>[0]): Promise<T> => {
    const result = await db.execute<{ value: T }>(query);
    return result.rows[0]?.value as T;
  };
  const hit = async (kind: string, key: string, seconds: number, limit: number) =>
    await value<boolean>(
      sql`select rowlens_auth_rate_hit(${kind},${hmac(auth.otpPepper, `rate:${kind}`, key)},${seconds},${limit}) as value`,
    );
  const session = async (req: FastifyRequest): Promise<Account | null> => {
    const token = cookie(req, sid);
    if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
    let data = await value<unknown>(sql`select rowlens_account_session(${sha256(token)}) as value`);
    // Existing club sessions survive the additive migration; no upgrade grants platform authority.
    if (data === null) {
      await db.execute(sql`select rowlens_adopt_legacy_session(${sha256(token)})`);
      data = await value<unknown>(sql`select rowlens_account_session(${sha256(token)}) as value`);
    }
    const parsed = accountSchema.safeParse(data);
    if (!parsed.success) return null;
    const csrf = cookie(req, 'rowlens_csrf');
    if (!csrf || !safeEqual(sha256(csrf), parsed.data.csrfHash)) return null;
    return parsed.data;
  };
  const context = (a: Account, c?: Club): TenantContext => ({
    unifiedUsers: true,
    platformAdmin: a.platformAdmin,
    userId: a.id,
    clubId: c?.id ?? NO_CLUB,
    roles: a.platformAdmin ? ['admin'] : (c?.roles ?? ['rower']),
  });
  const clubs = async (a: Account) =>
    clubsSchema.parse(
      await withTenant(db, context(a), async (tx) => {
        const r = await tx.execute<{ value: unknown }>(
          sql`select rowlens_account_clubs() as value`,
        );
        return r.rows[0]?.value;
      }),
    );
  const selected = async (
    req: FastifyRequest,
    a: Account,
    requireChoice = false,
  ): Promise<Club | undefined> => {
    const all = await clubs(a);
    const q = z.object({ club: z.uuid().optional() }).safeParse(req.query);
    const header = req.headers['x-rowlens-club'];
    if (!q.success || (typeof header === 'string' && q.data.club && q.data.club !== header))
      return undefined;
    const id = typeof header === 'string' ? header : q.data.club;
    if (id === undefined && requireChoice && all.length > 1) return undefined;
    return id === undefined ? all[0] : all.find((c) => c.id === id);
  };
  const authenticate = async (
    req: FastifyRequest,
    reply: FastifyReply,
    accountOnly = false,
    platformAccount = false,
  ) => {
    const a = await session(req);
    if (!a) {
      reply.callNotFound();
      return reply;
    }
    if (unsafe.has(req.method) && req.headers['x-csrf-token'] !== cookie(req, 'rowlens_csrf'))
      return reply.code(403).send({ error: 'invalid_csrf' });
    const globalSettings = platformAccount && a.platformAdmin;
    accountOnly ||= globalSettings;
    const c = globalSettings ? undefined : await selected(req, a, !accountOnly);
    if (!accountOnly && !c) {
      reply.callNotFound();
      return reply;
    }
    req.tenant = context(a, c);
    req.roles = [...(req.tenant.roles ?? [])];
    req.role = primaryRole(req.roles);
    req.accountName = a.displayName;
    const resource = z.object({ id: z.uuid().optional() }).safeParse(req.params);
    const resourceId = resource.success ? (resource.data.id ?? '') : '';
    if (a.platformAdmin && c)
      await withTenant(db, req.tenant, (tx) =>
        tx.execute(
          sql`select rowlens_audit_platform(${req.method},${c.id + ':' + (req.routeOptions.url ?? '') + ':' + resourceId})`,
        ),
      );
    cookies(reply, cookie(req, sid) ?? '', cookie(req, 'rowlens_csrf') ?? '');
    return undefined;
  };
  const accountGuard = (req: FastifyRequest, reply: FastifyReply) => authenticate(req, reply, true);
  const guard = (req: FastifyRequest, reply: FastifyReply) =>
    authenticate(
      req,
      reply,
      (req.routeOptions.url ?? '').startsWith(withBasePath(opts.basePath, '/api/me/')),
      req.routeOptions.url === withBasePath(opts.basePath, '/api/admin/users/:id/settings') ||
        managementRoutes.some((path) => req.routeOptions.url === withBasePath(opts.basePath, path)),
    );
  const run = async <T>(req: FastifyRequest, query: Parameters<Database['execute']>[0]) =>
    withTenant(db, tenantOf(req), async (tx) => {
      const r = await tx.execute<{ value: T }>(query);
      return r.rows[0]?.value;
    });
  const adminGuard = async (req: FastifyRequest, reply: FastifyReply) => {
    await guard(req, reply);
    if (reply.sent) return;
    return req.roles?.includes('admin') ? undefined : notFound(reply);
  };
  const platformGuard = async (req: FastifyRequest, reply: FastifyReply) => {
    await accountGuard(req, reply);
    if (reply.sent) return;
    return (await run<boolean>(req, sql`select rowlens_platform_admin() as value`))
      ? undefined
      : notFound(reply);
  };
  const routes: FastifyPluginCallback = (app, _o, done) => {
    app.addHook('onSend', async (_req, reply) => {
      void reply.header('cache-control', 'private, no-store');
    });
    app.get('/api/auth/status', async (req) => {
      const a = await session(req);
      if (!a) return { enabled: true, access: false, unified: true };
      const all = await clubs(a);
      const c = await selected(req, a);
      const user = accountSchema.omit({ csrfHash: true }).parse(a);
      return {
        enabled: true,
        access: true,
        unified: true,
        clubs: all,
        club: c ?? null,
        user: {
          ...user,
          roles: a.platformAdmin ? ['admin'] : (c?.roles ?? ['rower']),
          role: a.platformAdmin ? 'admin' : c ? primaryRole(c.roles) : 'rower',
          authorName: a.displayName,
          linked: true,
        },
      };
    });
    app.get('/api/auth/registration/clubs', async (req, reply) => {
      if (!(await hit('registration-directory-ip', req.ip, 60, 30)))
        return reply.code(429).send({ error: 'too_many' });
      return value(sql`select rowlens_registration_clubs() as value`);
    });
    for (const [registration, otpPath, verifyPath] of [
      [false, '/api/auth/otp', '/api/auth/verify'],
      [true, '/api/auth/registration/otp', '/api/auth/registration/verify'],
    ] as const) {
      app.post(otpPath, async (req, reply) => {
        const requestId = randomUUID();
        const accepted = { accepted: true, ...(registration ? { requestId } : {}) };
        const b = (
          registration ? emailBody.extend({ clubId: z.uuid().nullable() }).strict() : emailBody
        ).safeParse(req.body);
        if (!b.success || !(await hit('otp-ip', req.ip, 3600, auth.limits.otpPerIpHour)))
          return reply.code(202).send(accepted);
        if (!(await hit('otp-email', b.data.email, 900, auth.limits.otpPerEmail15m)))
          return reply.code(202).send(accepted);
        const code = opts.generateCode?.() ?? newCode();
        const locale = b.data.language ?? 'nl';
        const hash = hmac(
          auth.otpPepper,
          registration
            ? `registration-otp:${b.data.email}:${requestId}`
            : `account-otp:${b.data.email}`,
          code,
        );
        const issued = await value<boolean>(
          registration
            ? sql`select rowlens_registration_issue(${b.data.email},${hash},${locale},${requestId}::uuid,${'clubId' in b.data ? b.data.clubId : null}::uuid) as value`
            : sql`select rowlens_login_issue(${b.data.email},${hash},${locale}) as value`,
        );
        if (!issued)
          return registration
            ? reply.code(409).send({ error: 'club_unavailable' })
            : reply.code(202).send(accepted);
        if (opts.deliver)
          await opts
            .deliver({
              email: b.data.email,
              code,
              locale,
              loginUrl: absoluteUrl(opts.publicOrigin, opts.basePath, '/'),
              ...(registration ? { purpose: 'registration' as const } : {}),
            })
            .catch((error: unknown) => {
              req.log.error({ error }, 'OTP mail failed');
            });
        else req.log.info({ email: b.data.email, code }, 'development OTP code');
        return reply.code(202).send(accepted);
      });
      app.post(verifyPath, async (req, reply) => {
        const b = (
          registration ? verifyBody.extend({ requestId: z.uuid() }).strict() : verifyBody
        ).safeParse(req.body);
        if (!b.success) return reply.code(400).send({ error: 'invalid_code' });
        if (!(await hit('verify-ip', req.ip, 900, auth.limits.verifyPerIp15m)))
          return reply.code(429).send({ error: 'invalid_code' });
        const token = newToken(),
          csrf = newToken();
        const requestId = 'requestId' in b.data ? b.data.requestId : null;
        const hash = hmac(
          auth.otpPepper,
          registration
            ? `registration-otp:${b.data.email}:${String(requestId)}`
            : `account-otp:${b.data.email}`,
          b.data.code,
        );
        const result = registration
          ? await value<string>(
              sql`select rowlens_registration_verify(${b.data.email},${hash},${requestId}::uuid,${sha256(token)},${sha256(csrf)}) as value`,
            )
          : (await value<boolean>(
                sql`select rowlens_account_verify(${b.data.email},${hash},${sha256(token)},${sha256(csrf)}) as value`,
              ))
            ? 'ok'
            : 'invalid';
        if (result !== 'ok')
          return reply.code(result === 'club_unavailable' ? 409 : 403).send({ error: result });
        // Honor existing pilot invitations/allowlists only after proving ownership of the address.
        const server = auth.adminEmails.has(b.data.email)
          ? ['admin']
          : auth.allowedEmails.has(b.data.email)
            ? ['coach']
            : [];
        const grant = await db.execute<{ roles: string[] | null }>(
          sql`select rowlens_auth_access(${b.data.email},${auth.clubSlug}) as roles`,
        );
        if (server.length || grant.rows[0]?.roles)
          await db.execute(
            sql`select * from rowlens_auth_ensure_user(${b.data.email},${''},${'nl'},${auth.clubSlug},${`{${server.join(',')}}`}::text[])`,
          );
        cookies(reply, token, csrf);
        return reply.code(204).send();
      });
    }
    for (const others of [false, true])
      app.post(
        others ? '/api/auth/logout-others' : '/api/auth/logout',
        { preHandler: accountGuard },
        async (req, reply) => {
          const token = cookie(req, sid) ?? '';
          await db.execute(sql`select rowlens_account_logout(${sha256(token)},${others})`);
          // Also revoke an existing legacy session when it is the token used for this request.
          await run(req, sql`select rowlens_legacy_logout(${sha256(token)},${others}) as value`);
          if (!others) cookies(reply, '', '', 0);
          return reply.code(204).send();
        },
      );
    app.get('/api/account/clubs', { preHandler: accountGuard }, (req) =>
      run(
        req,
        sql`select jsonb_build_object('clubs',rowlens_club_directory(),'applications',rowlens_my_applications(),'registration',rowlens_my_registration(),'admission',rowlens_my_admission()) as value`,
      ),
    );
    app.get('/api/account/sessions', { preHandler: accountGuard }, async (req, reply) => {
      const q = z.object({ cursor: z.string().max(1024).optional() }).safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: 'invalid_cursor' });
      let before: { date: string; createdAt: string; id: string } | undefined;
      try {
        if (q.data.cursor)
          before = z
            .object({
              date: z.iso.date(),
              createdAt: z.iso.datetime({ offset: true }),
              id: z.uuid(),
            })
            .strict()
            .parse(JSON.parse(Buffer.from(q.data.cursor, 'base64url').toString()));
      } catch {
        return reply.code(400).send({ error: 'invalid_cursor' });
      }
      const a = await session(req);
      if (!a) return notFound(reply);
      const all = await clubs(a);
      const rows = [];
      for (const c of all) {
        const list = await listSessions(db, context(a, c), 101, before);
        rows.push(...list.map((row) => ({ ...row, clubId: c.id, clubName: c.name })));
      }
      rows.sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.cursorCreatedAt.localeCompare(a.cursorCreatedAt) ||
          b.id.localeCompare(a.id),
      );
      const page = rows.slice(0, 100),
        last = page.at(-1);
      const next =
        rows.length > 100 && last
          ? Buffer.from(
              JSON.stringify({ date: last.date, createdAt: last.cursorCreatedAt, id: last.id }),
            ).toString('base64url')
          : null;
      return { sessions: page, next };
    });
    app.post('/api/account/clubless', { preHandler: accountGuard }, async (req, reply) => {
      return (await run<boolean>(req, sql`select rowlens_request_clubless() as value`))
        ? reply.code(201).send()
        : reply.code(409).send({ error: 'application_unavailable' });
    });
    app.get('/api/account/clubless-requests', { preHandler: accountGuard }, (req) =>
      run(req, sql`select rowlens_clubless_requests() as value`),
    );
    app.get('/api/account/admission/:id', { preHandler: accountGuard }, async (req, reply) => {
      const b = z.object({ id: z.uuid() }).safeParse(req.params);
      const q = z
        .object({ global: z.enum(['true', 'false']), club: z.uuid().optional() })
        .safeParse(req.query);
      if (!b.success || !q.success) return notFound(reply);
      const a = await session(req);
      if (!a) return notFound(reply);
      const c =
        q.data.global === 'true' ? undefined : (await clubs(a)).find((c) => c.id === q.data.club);
      if (q.data.global !== 'true' && !c) return notFound(reply);
      const data = await withTenant(
        db,
        context(a, c),
        async (tx) =>
          (
            await tx.execute<{ value: unknown }>(
              sql`select rowlens_review_application(${b.data.id},${q.data.global === 'true'}) as value`,
            )
          ).rows[0]?.value,
      );
      return data ?? notFound(reply);
    });
    app.post(
      '/api/account/clubless-requests/:id',
      { preHandler: platformGuard },
      async (req, reply) => {
        const p = z.object({ id: z.uuid() }).safeParse(req.params),
          b = z.object({ approve: z.boolean() }).strict().safeParse(req.body);
        if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_application' });
        return (await run<boolean>(
          req,
          sql`select rowlens_decide_clubless(${p.data.id},${b.data.approve}) as value`,
        ))
          ? reply.code(204).send()
          : reply.code(409).send({ error: 'application_unavailable' });
      },
    );
    app.post('/api/account/applications', { preHandler: accountGuard }, async (req, reply) => {
      const b = z.object({ clubId: z.uuid() }).strict().safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'invalid_application' });
      if (!(await hit('application-user', tenantOf(req).userId ?? '', 3600, 10)))
        return reply.code(429).send({ error: 'too_many' });
      return (await run(req, sql`select rowlens_apply_to_club(${b.data.clubId}) as value`))
        ? reply.code(201).send()
        : reply.code(409).send({ error: 'application_unavailable' });
    });
    app.post(
      '/api/account/applications/:id/cancel',
      { preHandler: accountGuard },
      async (req, reply) => {
        const b = z.object({ id: z.uuid() }).safeParse(req.params);
        return b.success &&
          (await run(req, sql`select rowlens_cancel_application(${b.data.id}) as value`))
          ? reply.code(204).send()
          : reply.code(404).send();
      },
    );
    app.get('/api/admin/applications', { preHandler: adminGuard }, (req) =>
      run(req, sql`select rowlens_admission_list() as value`),
    );
    app.post('/api/admin/applications/:id', { preHandler: adminGuard }, async (req, reply) => {
      const p = z.object({ id: z.uuid() }).safeParse(req.params),
        b = z.object({ approve: z.boolean() }).strict().safeParse(req.body);
      return p.success &&
        b.success &&
        (await run(
          req,
          sql`select rowlens_decide_application(${p.data.id},${b.data.approve}) as value`,
        ))
        ? reply.code(204).send()
        : reply.code(404).send();
    });
    app.get('/api/admin/legacy-people', { preHandler: adminGuard }, (req) =>
      run(
        req,
        sql`select jsonb_build_object('people',rowlens_legacy_people(),'users',rowlens_admitted_accounts()) as value`,
      ),
    );
    app.post('/api/admin/legacy-people/:id', { preHandler: adminGuard }, async (req, reply) => {
      const p = z.object({ id: z.uuid() }).safeParse(req.params),
        b = z.object({ userId: z.uuid() }).strict().safeParse(req.body);
      return p.success &&
        b.success &&
        (await run(
          req,
          sql`select rowlens_link_legacy_person(${p.data.id},${b.data.userId}) as value`,
        ))
        ? reply.code(204).send()
        : reply.code(409).send({ error: 'mapping_conflict' });
    });
    app.get('/api/platform/audit', { preHandler: platformGuard }, (req) =>
      run(req, sql`select rowlens_platform_audit_log() as value`),
    );
    app.get('/api/platform/users', { preHandler: platformGuard }, (req) =>
      run(req, sql`select rowlens_platform_users() as value`),
    );
    app.get('/api/platform/clubs', { preHandler: platformGuard }, (req) =>
      run(req, sql`select rowlens_platform_clubs() as value`),
    );
    app.post(
      '/api/platform/clubs/:id/archive',
      { preHandler: platformGuard },
      async (req, reply) => {
        const p = z.object({ id: z.uuid() }).safeParse(req.params);
        const b = z.object({ archived: z.boolean() }).strict().safeParse(req.body);
        if (!p.success || !b.success) return reply.code(400).send({ error: 'invalid_club' });
        return (await run(
          req,
          sql`select rowlens_archive_club(${p.data.id},${b.data.archived}) as value`,
        ))
          ? reply.code(204).send()
          : reply.code(404).send();
      },
    );
    app.post('/api/platform/clubs', { preHandler: platformGuard }, async (req, reply) => {
      const b = z
        .object({
          id: z.uuid().nullable().default(null),
          slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
          name: z.string().trim().min(1).max(80),
          adminId: z.uuid().nullable().default(null),
        })
        .strict()
        .safeParse(req.body);
      if (!b.success) return reply.code(400).send({ error: 'invalid_club' });
      const id = await run(
        req,
        sql`select rowlens_manage_club(${b.data.id},${b.data.slug},${b.data.name},${b.data.adminId}) as value`,
      );
      return id ? { id } : reply.code(404).send();
    });
    accountManagement(app, {
      db,
      guard,
      pepper: auth.otpPepper,
      reserved: [...new Set([...auth.adminEmails, ...auth.allowedEmails])],
      ...(opts.deliver ? { deliver: opts.deliver } : {}),
      ...(opts.generateCode ? { generateCode: opts.generateCode } : {}),
      origin: opts.publicOrigin,
      basePath: opts.basePath,
      accountGuard,
      hit,
    });
    done();
  };
  return { routes, guard };
}
