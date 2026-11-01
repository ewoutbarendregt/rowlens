import type { FastifyPluginCallback } from 'fastify';

/** A dependency the app needs before it can serve traffic (database, object store, …). */
export interface ReadinessCheck {
  name: string;
  check: () => Promise<void>;
}

interface HealthOptions {
  version: string;
  readinessChecks: readonly ReadinessCheck[];
}

/**
 * `/health/live`: the process is up (used by Docker's healthcheck).
 * `/health/ready`: every dependency answers (used by the deploy health gate); 503 otherwise.
 */
export const healthRoutes: FastifyPluginCallback<HealthOptions> = (app, opts, done) => {
  app.get('/health/live', async (_req, reply) => {
    void reply.header('cache-control', 'no-store');
    return { status: 'ok', version: opts.version };
  });

  app.get('/health/ready', async (req, reply) => {
    const results = await Promise.all(
      opts.readinessChecks.map(async ({ name, check }) => {
        try {
          await check();
          return { name, ok: true };
        } catch (err) {
          req.log.warn({ err, check: name }, 'readiness check failed');
          return { name, ok: false };
        }
      }),
    );
    const ok = results.every((r) => r.ok);
    void reply.header('cache-control', 'no-store').code(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'unavailable', version: opts.version, checks: results };
  });
  done();
};
