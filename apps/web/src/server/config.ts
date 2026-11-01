import { z } from 'zod';
import { normalizeBasePath } from '../shared/base-path.ts';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BASE_PATH: z.string().default('/projects/rowlens'),
  PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
  APP_VERSION: z.string().min(1).default('dev'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CLIENT_DIR: z.string().min(1).optional(),
  /** The app's own role, `rowlens_app` (ADR-0005); never the owner. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  /** Normalised: `''` or `/a/b` (ADR-0003). */
  basePath: string;
  /** Origin only, e.g. `https://trustable.nl`; used for absolute links in e-mails and redirects. */
  publicOrigin: string;
  version: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  clientDir: string | undefined;
  /** Without it (local UI work, unit tests) the server runs without a database. */
  databaseUrl: string | undefined;
}

/** Parses and validates the environment once at startup; throws with every problem listed. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;

  if (e.NODE_ENV === 'production' && e.PUBLIC_ORIGIN === undefined) {
    throw new Error('Invalid configuration: PUBLIC_ORIGIN is required in production');
  }
  if (e.NODE_ENV === 'production' && e.DATABASE_URL === undefined) {
    throw new Error('Invalid configuration: DATABASE_URL is required in production');
  }
  const publicOrigin = new URL(e.PUBLIC_ORIGIN ?? `http://localhost:${String(e.PORT)}`);
  if (publicOrigin.pathname !== '/' || publicOrigin.search !== '' || publicOrigin.hash !== '') {
    throw new Error('Invalid configuration: PUBLIC_ORIGIN must be an origin without a path');
  }

  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    basePath: normalizeBasePath(e.BASE_PATH),
    publicOrigin: publicOrigin.origin,
    version: e.APP_VERSION,
    logLevel: e.LOG_LEVEL,
    clientDir: e.CLIENT_DIR,
    databaseUrl: e.DATABASE_URL,
  };
}
