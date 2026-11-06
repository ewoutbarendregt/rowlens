import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { stripBasePath } from '../shared/base-path.ts';
import { accessRoutes } from './api/access.ts';
import { annotationRoutes } from './api/annotations.ts';
import { clubRoutes } from './api/club.ts';
import { lineupRoutes } from './api/lineups.ts';
import { momentRoutes } from './api/moments.ts';
import { strokeRoutes } from './api/strokes.ts';
import { angleRoutes } from './api/angles.ts';
import { profileRoutes } from './api/profile.ts';
import { userSettingsRoutes } from './api/user-settings.ts';
import { rowerRoutes } from './api/rowers.ts';
import { sessionRoutes } from './api/sessions.ts';
import { uploadRoutes } from './api/uploads.ts';
import { videoRoutes } from './api/videos.ts';
import { createAuthGate } from './auth/gate.ts';
import type { DeliverInvite, DeliverLoginCode } from './auth/mail.ts';
import { smtpDelivery, smtpInviteDelivery } from './auth/mail.ts';
import type { AppConfig } from './config.ts';
import type { Database } from './db/client.ts';
import { healthRoutes, type ReadinessCheck } from './health.ts';
import { MediaStore } from './media/store.ts';
import { createPilotGate } from './pilot/gate.ts';

/** Written by the Vite build next to index.html; lets the server refuse a client built for another base path. */
export const BUILD_INFO_FILE = 'build-info.json';

export interface BuildAppOptions {
  config: AppConfig;
  /** Directory with the built SPA (`dist/client`), or `null` when Vite's dev server serves it. */
  clientDir: string | null;
  readinessChecks?: readonly ReadinessCheck[];
  /** `rowlens_app` connection; without one, every club route is 404 and the pilot gate is closed. */
  database?: Database | null;
  /** Overrides MEDIA_DIR (tests use a fake disk). */
  media?: MediaStore | null;
  /** Tests without a database stand in for the pilot club lookup. */
  resolvePilotClubId?: () => Promise<string | null>;
  /** Test seam for OTP delivery; production derives this from the SMTP configuration. */
  deliverLoginCode?: DeliverLoginCode;
  /** Test seam for invitation mails (#42), like deliverLoginCode. */
  deliverInvite?: DeliverInvite;
  /** Pino logging; off in tests. */
  logger?: boolean;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const { config, clientDir } = opts;
  const base = config.basePath;

  const app = Fastify({
    logger: (opts.logger ?? true) && {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    // Caddy (on the docker network) is the only ingress; trust its X-Forwarded-* headers.
    trustProxy: 'loopback,uniquelocal',
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    },
  });

  app.addHook('onSend', async (req, reply) => {
    void reply.header('x-request-id', req.id);
  });

  // CSRF: browsers send Origin on every state-changing request; only our own origin may make one.
  // Authenticated requests additionally use a per-session double-submit token in the auth gate.
  app.addHook('onRequest', async (req, reply) => {
    if (UNSAFE_METHODS.has(req.method) && req.headers.origin !== config.publicOrigin) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }
    const fetchSite = req.headers['sec-fetch-site'];
    if (UNSAFE_METHODS.has(req.method) && fetchSite !== undefined && fetchSite !== 'same-origin') {
      return reply.code(403).send({ error: 'forbidden_site' });
    }
  });

  app.decorateRequest('tenant', null);
  app.decorateRequest('role', null);
  app.decorateRequest('roles', null);
  app.decorateRequest('accountName', null);

  await app.register(helmet, {
    // HSTS is set once, by Caddy, for the whole trustable.nl origin.
    hsts: false,
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  await app.register(healthRoutes, {
    prefix: base,
    version: config.version,
    readinessChecks: opts.readinessChecks ?? [],
  });

  if (base !== '') {
    app.get(base, async (_req, reply) => reply.redirect(`${base}/`, 308));
  }

  const db = opts.database ?? null;
  const pilotGate = createPilotGate({
    basePath: base,
    attemptsPerMinute: config.pilot?.attemptsPerMinute ?? 5,
    publicOrigin: config.publicOrigin,
    secrets:
      config.pilot === null || (db === null && opts.resolvePilotClubId === undefined)
        ? null
        : { codeHash: config.pilot.codeHash, sessionSecret: config.pilot.sessionSecret },
    resolveClubId:
      opts.resolvePilotClubId ??
      (async () => {
        if (db === null || config.pilot === null) return null;
        const r = await db.execute<{ id: string | null }>(
          sql`select rowlens_club_id(${config.pilot.clubSlug}) as id`,
        );
        return r.rows[0]?.id ?? null;
      }),
  });
  if (config.auth === null) await app.register(pilotGate.routes, { prefix: base });
  if (db !== null) {
    let guard = pilotGate.guard;
    if (config.auth !== null) {
      const deliver =
        opts.deliverLoginCode ??
        (config.auth.smtp === null ? undefined : smtpDelivery(config.auth.smtp));
      const authGate = createAuthGate({
        db,
        auth: config.auth,
        basePath: base,
        publicOrigin: config.publicOrigin,
        ...(deliver === undefined ? {} : { deliver }),
        ...(config.auth.testCode === null
          ? {}
          : { generateCode: () => config.auth?.testCode ?? '000000' }),
      });
      await app.register(authGate.routes, { prefix: base });
      guard = authGate.guard;
    }
    await app.register(clubRoutes, { prefix: base, db, guard });
    const media =
      opts.media !== undefined
        ? opts.media
        : config.media.dir === null
          ? null
          : new MediaStore(config.media.dir);
    const clubOpts = { db, guard, media, limits: config.media, basePath: base };
    await app.register(sessionRoutes, { prefix: base, ...clubOpts });
    await app.register(uploadRoutes, { prefix: base, ...clubOpts });
    await app.register(videoRoutes, { prefix: base, ...clubOpts });
    await app.register(annotationRoutes, { prefix: base, ...clubOpts });
    await app.register(strokeRoutes, { prefix: base, ...clubOpts });
    await app.register(angleRoutes, { prefix: base, ...clubOpts });
    await app.register(profileRoutes, { prefix: base, ...clubOpts });
    await app.register(userSettingsRoutes, { prefix: base, ...clubOpts });
    await app.register(rowerRoutes, { prefix: base, ...clubOpts });
    await app.register(lineupRoutes, { prefix: base, ...clubOpts });
    await app.register(momentRoutes, { prefix: base, ...clubOpts });
    if (config.auth !== null) {
      const deliverInvite =
        opts.deliverInvite ??
        (config.auth.smtp === null ? undefined : smtpInviteDelivery(config.auth.smtp));
      await app.register(accessRoutes, {
        prefix: base,
        ...clubOpts,
        auth: config.auth,
        publicOrigin: config.publicOrigin,
        ...(deliverInvite === undefined ? {} : { deliverInvite }),
      });
    }
  }

  const indexHtml = clientDir === null ? null : await loadClient(clientDir, base);
  if (clientDir !== null) {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: `${base}/`,
      index: false,
      wildcard: true,
      setHeaders: (reply, path) => {
        // Vite fingerprints everything under assets/, so it can be cached forever.
        void reply.header(
          'cache-control',
          path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  // The shell for the app root; deeper client routes get it from the not-found fallback below.
  if (indexHtml !== null) {
    app.get(`${base}/`, async (_req, reply) => sendShell(reply, indexHtml));
  }

  app.setNotFoundHandler(async (req, reply) => {
    const path = stripBasePath(base, req.url.split('?')[0] ?? '/');
    if (path !== null && (path === '/api' || path.startsWith('/api/'))) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (path !== null && indexHtml !== null && isPageNavigation(req)) {
      // SPA fallback: client-side routes all get the app shell.
      return sendShell(reply, indexHtml);
    }
    return reply.code(404).type('text/plain; charset=utf-8').send('Not found\n');
  });

  return app;
}

function sendShell(reply: FastifyReply, indexHtml: string): FastifyReply {
  return reply
    .code(200)
    .type('text/html; charset=utf-8')
    .header('cache-control', 'no-cache')
    .send(indexHtml);
}

function isPageNavigation(req: FastifyRequest): boolean {
  return (
    (req.method === 'GET' || req.method === 'HEAD') &&
    (req.headers.accept ?? '').includes('text/html')
  );
}

async function loadClient(clientDir: string, basePath: string): Promise<string> {
  const info = JSON.parse(await readFile(join(clientDir, BUILD_INFO_FILE), 'utf8')) as {
    basePath?: unknown;
  };
  if (info.basePath !== basePath) {
    throw new Error(
      `Client in ${clientDir} was built for BASE_PATH ${JSON.stringify(info.basePath)}, ` +
        `but the server runs with ${JSON.stringify(basePath)}. Rebuild with the same BASE_PATH.`,
    );
  }
  return readFile(join(clientDir, 'index.html'), 'utf8');
}
