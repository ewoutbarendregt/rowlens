import { admissionReviewUrl, type DeliverAdmission } from './auth/admission-mail.ts';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_INFO_FILE, buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { connectDatabase } from './db/client.ts';

const config = loadConfig();

// Built layout: dist/server/main.js next to dist/client/. In dev (`src/server/main.ts`) there is no
// build-info.json next to the sources, so the SPA is served by Vite's dev server instead.
const defaultClientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../client');
const clientDir = config.clientDir ?? defaultClientDir;

const database = config.databaseUrl === undefined ? null : connectDatabase(config.databaseUrl);

// Local mail previews are wired here so injected/test app instances never start a real sink.
const previewAdmission: DeliverAdmission | undefined =
  config.nodeEnv === 'development' && config.auth?.smtp === null
    ? (notice) => {
        process.stdout.write(
          JSON.stringify({
            msg: 'development admission notification',
            acceptUrl: admissionReviewUrl(notice, config.publicOrigin, config.basePath, true),
            rejectUrl: admissionReviewUrl(notice, config.publicOrigin, config.basePath, false),
          }) + '\n',
        );
        return Promise.resolve();
      }
    : undefined;

const app = await buildApp({
  config,
  ...(previewAdmission ? { deliverAdmission: previewAdmission } : {}),
  clientDir: existsSync(join(clientDir, BUILD_INFO_FILE)) ? clientDir : null,
  readinessChecks: database === null ? [] : [database.readiness],
  database: database?.db ?? null,
});
if (database !== null) app.addHook('onClose', database.close);
else app.log.warn('DATABASE_URL not set: running without a database');

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.host, port: config.port });
app.log.info({ basePath: config.basePath, version: config.version }, 'ready');
