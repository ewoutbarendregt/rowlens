import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { TenantContext } from '../db/tenant.ts';
import { RateLimiter } from '../rate-limit.ts';
import { hashFingerprint, verifyAccessCode } from './code.ts';
import { issueToken, type TokenKeys, verifyToken } from './token.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the pilot guard (later: by login) on routes that act within a club. */
    tenant: TenantContext | null;
  }
}

export const PILOT_COOKIE = 'rowlens_pilot';
const MAX_AGE_S = 30 * 24 * 60 * 60;

export interface PilotGateOptions {
  basePath: string;
  /** Cookies are `Secure` when the public origin is https. */
  publicOrigin: string;
  /** `null`: the gate is closed (no code configured, or no database), and guarded routes are 404. */
  secrets: { codeHash: string; sessionSecret: string } | null;
  /** The pilot club's id, or `null` if it doesn't exist (yet). */
  resolveClubId: () => Promise<string | null>;
  now?: () => number;
}

export interface PilotGate {
  /** `/api/pilot/{status,access,logout}`; register with the base path as prefix. */
  routes: FastifyPluginCallback;
  /** preHandler for club routes: no valid cookie → the same 404 as an unknown route. */
  guard: (req: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
}

const accessBody = z.object({ code: z.string().min(1).max(100) });

/**
 * Stand-in for login during the pilot (#84): one shared code for the pilot club. Without a valid
 * cookie, club routes answer exactly like routes that don't exist, so nothing leaks (ADR-0005).
 */
export function createPilotGate(opts: PilotGateOptions): PilotGate {
  const now = opts.now ?? Date.now;
  const keys: TokenKeys | null =
    opts.secrets === null
      ? null
      : {
          secret: opts.secrets.sessionSecret,
          codeFingerprint: hashFingerprint(opts.secrets.codeHash),
        };
  const secure = new URL(opts.publicOrigin).protocol === 'https:';
  const cookiePath = `${opts.basePath}/`;
  const perIp = new RateLimiter(5, 60_000);
  const overall = new RateLimiter(30, 60_000);
  let clubId: string | null = null;

  const hasAccess = (req: FastifyRequest) =>
    keys !== null && verifyToken(keys, readCookie(req, PILOT_COOKIE), now());

  const setCookie = (reply: FastifyReply, value: string, maxAge: number) =>
    reply.header(
      'set-cookie',
      `${PILOT_COOKIE}=${value}; Path=${cookiePath}; Max-Age=${String(maxAge)}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`,
    );

  const routes: FastifyPluginCallback = (app, _opts, done) => {
    app.get('/api/pilot/status', async (req, reply) => {
      void reply.header('cache-control', 'no-store');
      return { enabled: keys !== null, access: hasAccess(req) };
    });

    app.post('/api/pilot/access', async (req, reply) => {
      void reply.header('cache-control', 'no-store');
      if (keys === null || opts.secrets === null) {
        reply.callNotFound();
        return reply;
      }
      for (const limit of [perIp.hit(req.ip), overall.hit('all')]) {
        if (!limit.allowed) {
          return reply
            .code(429)
            .header('retry-after', String(limit.retryAfterS))
            .send({ error: 'too_many_attempts' });
        }
      }
      const body = accessBody.safeParse(req.body);
      if (!body.success || !(await verifyAccessCode(body.data.code, opts.secrets.codeHash))) {
        req.log.info({ ip: req.ip }, 'pilot access code rejected');
        return reply.code(403).send({ error: 'invalid_code' });
      }
      setCookie(reply, issueToken(keys, now() + MAX_AGE_S * 1000), MAX_AGE_S);
      return reply.code(204).send();
    });

    app.post('/api/pilot/logout', async (_req, reply) => {
      setCookie(reply, '', 0);
      return reply.code(204).header('cache-control', 'no-store').send();
    });
    done();
  };

  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!hasAccess(req)) {
      reply.callNotFound();
      return reply;
    }
    clubId ??= await opts.resolveClubId();
    if (clubId === null) {
      req.log.error('pilot club not found; run the migrations');
      reply.callNotFound();
      return reply;
    }
    req.tenant = { clubId, userId: null };
    return undefined;
  };

  return { routes, guard };
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}
