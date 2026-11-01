import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { stripBasePath } from '../shared/base-path.ts';
import type { AppConfig } from './config.ts';
import { healthRoutes, type ReadinessCheck } from './health.ts';

/** Written by the Vite build next to index.html; lets the server refuse a client built for another base path. */
export const BUILD_INFO_FILE = 'build-info.json';

export interface BuildAppOptions {
  config: AppConfig;
  /** Directory with the built SPA (`dist/client`), or `null` when Vite's dev server serves it. */
  clientDir: string | null;
  readinessChecks?: readonly ReadinessCheck[];
  /** Pino logging; off in tests. */
  logger?: boolean;
}

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
