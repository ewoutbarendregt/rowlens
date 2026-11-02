import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.ts';
import type { Database } from '../db/client.ts';
import { loginCode, userSession } from '../db/schema.ts';
import type { TenantContext } from '../db/tenant.ts';
import { withTenant } from '../db/tenant.ts';
import { hmac, newCode, newToken, safeEqual, sha256 } from './crypto.ts';
import type { DeliverLoginCode } from './mail.ts';

export type Role = 'rower' | 'coach' | 'admin';

declare module 'fastify' {
  interface FastifyRequest {
    tenant: TenantContext | null;
    /** The member's role in the club; null on the pilot-code path, which has no user. */
    role: Role | null;
  }
}

const asRole = (value: unknown): Role | null =>
  value === 'rower' || value === 'coach' || value === 'admin' ? value : null;

const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const requestBody = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
});
const verifyBody = z.object({
  email: z
    .email()
    .max(254)
    .transform((v) => v.trim().toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
});
const unsafe = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface Identity {
  userId: string;
  clubId: string;
  email: string;
  displayName: string;
  locale: 'nl' | 'en';
}

interface SessionIdentity extends Identity {
  sessionId: string;
  csrfHash: string;
  role: Role;
}

export interface AuthGate {
  routes: FastifyPluginCallback;
  guard: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
}

export function createAuthGate(opts: {
  db: Database;
  auth: AppConfig['auth'];
  basePath: string;
  publicOrigin: string;
  deliver?: DeliverLoginCode;
  generateCode?: () => string;
  now?: () => number;
}): AuthGate {
  const now = opts.now ?? Date.now;
  const secure = new URL(opts.publicOrigin).protocol === 'https:';
  const sessionCookie = secure ? '__Secure-rowlens_sid' : 'rowlens_sid';
  const csrfCookie = 'rowlens_csrf';
  const cookiePath = opts.basePath === '' ? '/' : opts.basePath;

  const cookie = (name: string, value: string, maxAge: number, httpOnly: boolean) =>
    `${name}=${value}; Path=${cookiePath}; Max-Age=${String(maxAge)}; SameSite=Lax${httpOnly ? '; HttpOnly' : ''}${secure ? '; Secure' : ''}`;
  const setSessionCookies = (reply: FastifyReply, token: string, csrf: string) => {
    const age = SESSION_DAYS * 24 * 60 * 60;
    void reply.header('set-cookie', [
      cookie(sessionCookie, token, age, true),
      cookie(csrfCookie, csrf, age, false),
    ]);
  };
  const clearCookies = (reply: FastifyReply) => {
    void reply.header('set-cookie', [
      cookie(sessionCookie, '', 0, true),
      cookie(csrfCookie, '', 0, false),
    ]);
  };

  /**
   * Who may log in, and as what (#42): server admins are always admin; otherwise the app's access
   * list decides; the server's coach list is the fallback. Anyone else gets nothing.
   */
  const roleFor = async (email: string): Promise<Role | null> => {
    const auth = opts.auth;
    if (auth === null) return null;
    if (auth.adminEmails.has(email)) return 'admin';
    const result = await opts.db.execute<{ role: string | null }>(
      sql`select rowlens_auth_access(${email}, ${auth.clubSlug}) as role`,
    );
    const listed = asRole(result.rows[0]?.role);
    if (listed !== null) return listed;
    return auth.allowedEmails.has(email) ? 'coach' : null;
  };

  const identityFor = async (email: string, ensure: boolean, locale: 'nl' | 'en') => {
    if (opts.auth === null) return null;
    const role = await roleFor(email);
    if (role === null) return null;
    const name =
      email
        .slice(0, email.indexOf('@'))
        .replace(/[._-]+/g, ' ')
        .trim() || 'Roeier';
    const query = ensure
      ? sql`select * from rowlens_auth_ensure_user(${email}, ${name}, ${locale}, ${opts.auth.clubSlug}, ${role})`
      : sql`select * from rowlens_auth_identity(${email})`;
    const result = await opts.db.execute<{
      user_id: string;
      club_id: string;
      email: string;
      display_name: string;
      locale: string;
    }>(query);
    const row = result.rows[0];
    return row === undefined
      ? null
      : ({
          userId: row.user_id,
          clubId: row.club_id,
          email: row.email,
          displayName: row.display_name,
          locale: row.locale === 'en' ? 'en' : 'nl',
        } satisfies Identity);
  };

  const rateHit = async (kind: string, key: string, seconds: number, limit: number) => {
    if (opts.auth === null) return false;
    const hash = hmac(opts.auth.otpPepper, `rate:${kind}`, key);
    const result = await opts.db.execute<{ allowed: boolean }>(
      sql`select rowlens_auth_rate_hit(${kind}, ${hash}, ${seconds}, ${limit}) as allowed`,
    );
    return result.rows[0]?.allowed === true;
  };

  const resolveSession = async (req: FastifyRequest): Promise<SessionIdentity | null> => {
    const token = readCookie(req, sessionCookie);
    if (token === undefined || !/^[0-9a-f]{64}$/.test(token)) return null;
    const result = await opts.db.execute<{
      session_id: string;
      user_id: string;
      club_id: string;
      csrf_hash: string;
      email: string;
      display_name: string;
      locale: string;
      role: string;
    }>(sql`select * from rowlens_auth_session(${sha256(token)})`);
    const row = result.rows[0];
    const role = asRole(row?.role);
    return row === undefined || role === null
      ? null
      : {
          role,
          sessionId: row.session_id,
          userId: row.user_id,
          clubId: row.club_id,
          csrfHash: row.csrf_hash,
          email: row.email,
          displayName: row.display_name,
          locale: row.locale === 'en' ? 'en' : 'nl',
        };
  };

  const validCsrf = (req: FastifyRequest, session: SessionIdentity) => {
    if (!unsafe.has(req.method)) return true;
    const header = req.headers['x-csrf-token'];
    const value = readCookie(req, csrfCookie);
    return (
      typeof header === 'string' &&
      value !== undefined &&
      header === value &&
      safeEqual(sha256(value), session.csrfHash)
    );
  };

  const hasSessionCookies = (req: FastifyRequest, session: SessionIdentity) => {
    const csrf = readCookie(req, csrfCookie);
    return csrf !== undefined && safeEqual(sha256(csrf), session.csrfHash);
  };

  const routes: FastifyPluginCallback = (app, _routeOpts, done) => {
    app.get('/api/auth/status', async (req, reply) => {
      void reply.header('cache-control', 'no-store');
      const session = opts.auth === null ? null : await resolveSession(req);
      if (session === null || !hasSessionCookies(req, session)) {
        if (session !== null) clearCookies(reply);
        return { enabled: opts.auth !== null, access: false };
      }
      setSessionCookies(
        reply,
        readCookie(req, sessionCookie) ?? '',
        readCookie(req, csrfCookie) ?? '',
      );
      // Whether the account is linked to a roster entry (#40): a rower sees nothing until it is.
      const linked = await withTenant(opts.db, session, (tx) =>
        tx.execute<{ n: number }>(
          sql`select count(*)::int as n from rower where user_id = ${session.userId}`,
        ),
      );
      return {
        enabled: true,
        access: true,
        user: {
          email: session.email,
          displayName: session.displayName,
          locale: session.locale,
          role: session.role,
          linked: (linked.rows[0]?.n ?? 0) > 0,
        },
      };
    });

    app.post('/api/auth/otp', async (req, reply) => {
      void reply.header('cache-control', 'no-store');
      const auth = opts.auth;
      if (auth === null) {
        reply.callNotFound();
        return reply;
      }
      const body = requestBody.safeParse(req.body);
      // Same status/body for malformed, unknown, limited and known addresses.
      if (!body.success || !(await rateHit('otp-ip', req.ip, 3600, auth.limits.otpPerIpHour))) {
        return reply.code(202).send({ accepted: true });
      }
      const locale: 'nl' | 'en' = req.headers['accept-language']?.toLowerCase().startsWith('en')
        ? 'en'
        : 'nl';
      const identity = await identityFor(body.data.email, true, locale);
      if (identity === null) return reply.code(202).send({ accepted: true });
      if (!(await rateHit('otp-email', identity.email, 15 * 60, auth.limits.otpPerEmail15m))) {
        return reply.code(202).send({ accepted: true });
      }
      const code = opts.generateCode?.() ?? newCode();
      const created = await withTenant(opts.db, identity, async (tx) => {
        await tx
          .update(loginCode)
          .set({ usedAt: new Date(now()) })
          .where(and(eq(loginCode.userId, identity.userId), isNull(loginCode.usedAt)));
        await tx.insert(loginCode).values({
          clubId: identity.clubId,
          userId: identity.userId,
          codeHash: hmac(auth.otpPepper, `otp:${identity.userId}`, code),
          requestIpHash: hmac(auth.otpPepper, 'request-ip', req.ip),
          expiresAt: new Date(now() + CODE_MINUTES * 60_000),
        });
        return true;
      });
      if (created) {
        const loginUrl = `${opts.publicOrigin}${opts.basePath}/`;
        if (opts.deliver === undefined) {
          req.log.info({ email: identity.email, code }, 'development OTP code');
        } else {
          void opts
            .deliver({ email: identity.email, code, locale: identity.locale, loginUrl })
            .catch((error: unknown) => {
              req.log.error({ error }, 'OTP mail failed');
            });
        }
      }
      return reply.code(202).send({ accepted: true });
    });

    app.post('/api/auth/verify', async (req, reply) => {
      void reply.header('cache-control', 'no-store');
      const auth = opts.auth;
      if (auth === null) {
        reply.callNotFound();
        return reply;
      }
      const body = verifyBody.safeParse(req.body);
      if (
        !body.success ||
        !(await rateHit('verify-ip', req.ip, 15 * 60, auth.limits.verifyPerIp15m))
      ) {
        return reply.code(body.success ? 429 : 400).send({ error: 'invalid_code' });
      }
      const identity = await identityFor(body.data.email, false, 'nl');
      if (identity === null) return reply.code(403).send({ error: 'invalid_code' });
      const token = newToken();
      const csrf = newToken();
      const ok = await withTenant(opts.db, identity, async (tx) => {
        const [row] = await tx
          .select()
          .from(loginCode)
          .where(and(eq(loginCode.userId, identity.userId), isNull(loginCode.usedAt)))
          .orderBy(desc(loginCode.createdAt))
          .limit(1)
          .for('update');
        if (row === undefined || row.expiresAt.getTime() <= now() || row.attempts >= 5)
          return false;
        const expected = hmac(auth.otpPepper, `otp:${identity.userId}`, body.data.code);
        if (!safeEqual(expected, row.codeHash)) {
          const attempts = row.attempts + 1;
          await tx
            .update(loginCode)
            .set({ attempts, usedAt: attempts >= 5 ? new Date(now()) : null })
            .where(eq(loginCode.id, row.id));
          return false;
        }
        await tx
          .update(loginCode)
          .set({ usedAt: new Date(now()) })
          .where(eq(loginCode.id, row.id));
        await tx.insert(userSession).values({
          clubId: identity.clubId,
          userId: identity.userId,
          tokenHash: sha256(token),
          csrfHash: sha256(csrf),
          expiresAt: new Date(now() + SESSION_DAYS * 24 * 60 * 60_000),
        });
        return true;
      });
      if (!ok) return reply.code(403).send({ error: 'invalid_code' });
      setSessionCookies(reply, token, csrf);
      return reply.code(204).send();
    });

    app.post('/api/auth/logout', async (req, reply) => {
      const session = await resolveSession(req);
      if (session !== null && validCsrf(req, session)) {
        await withTenant(opts.db, session, (tx) =>
          tx
            .update(userSession)
            .set({ revokedAt: new Date(now()) })
            .where(eq(userSession.id, session.sessionId)),
        );
      }
      clearCookies(reply);
      return reply.code(204).header('cache-control', 'no-store').send();
    });

    app.post('/api/auth/logout-others', async (req, reply) => {
      const session = await resolveSession(req);
      if (session === null) {
        reply.callNotFound();
        return reply;
      }
      if (!validCsrf(req, session)) return reply.code(403).send({ error: 'invalid_csrf' });
      await withTenant(opts.db, session, (tx) =>
        tx
          .update(userSession)
          .set({ revokedAt: new Date(now()) })
          .where(
            and(
              eq(userSession.userId, session.userId),
              sql`${userSession.id} <> ${session.sessionId}`,
              isNull(userSession.revokedAt),
            ),
          ),
      );
      return reply.code(204).send();
    });
    done();
  };

  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    const session = opts.auth === null ? null : await resolveSession(req);
    if (session === null || !hasSessionCookies(req, session)) {
      if (session !== null) clearCookies(reply);
      reply.callNotFound();
      return reply;
    }
    if (!validCsrf(req, session)) return reply.code(403).send({ error: 'invalid_csrf' });
    req.tenant = { clubId: session.clubId, userId: session.userId, role: session.role };
    req.role = session.role;
    setSessionCookies(
      reply,
      readCookie(req, sessionCookie) ?? '',
      readCookie(req, csrfCookie) ?? '',
    );
    return undefined;
  };

  return { routes, guard };
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}
