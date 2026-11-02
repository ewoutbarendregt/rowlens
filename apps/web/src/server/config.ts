import { z } from 'zod';
import { normalizeBasePath } from '../shared/base-path.ts';
import { isStoredHash } from './pilot/code.ts';

const GIB = 1024 ** 3;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Wins over PORT when set: dev tools (Vite, the preview pane) set PORT for the front end. */
  API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  BASE_PATH: z.string().default('/projects/rowlens'),
  PUBLIC_ORIGIN: z.url({ protocol: /^https?$/ }).optional(),
  APP_VERSION: z.string().min(1).default('dev'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CLIENT_DIR: z.string().min(1).optional(),
  /** The app's own role, `rowlens_app` (ADR-0005); never the owner. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  /** Pilot access code (#84) as an scrypt hash from `pnpm --filter @rowlens/web pilot:code`. */
  PILOT_ACCESS_CODE_HASH: z.string().refine(isStoredHash, 'not a hash from pilot:code').optional(),
  PILOT_CLUB_SLUG: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .default('pilot'),
  /** Per IP; all IPs together get six times this. Raised only for E2E servers. */
  PILOT_ATTEMPTS_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(5),
  /** Directory for video bytes (ADR-0006); without it uploads are off. */
  MEDIA_DIR: z.string().min(1).optional(),
  MEDIA_CAP_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * GIB),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * GIB),
  DISK_PAUSE_RATIO: z.coerce.number().gt(0).max(1).default(0.85),
  /** Signs cookies; 32+ random bytes as hex (`openssl rand -hex 32`). */
  SESSION_SECRET: z
    .string()
    .regex(/^[0-9a-f]{64,}$/, 'at least 64 hex characters')
    .optional(),
  /** Comma-separated one-club pilot allowlist; invitations replace this later. */
  AUTH_ALLOWED_EMAILS: z.string().optional(),
  /** HMAC key for OTPs and rate-limit identifiers (`openssl rand -hex 32`). */
  OTP_PEPPER: z
    .string()
    .regex(/^[0-9a-f]{64,}$/, 'at least 64 hex characters')
    .optional(),
  /** Deterministic browser-test code; startup rejects it outside NODE_ENV=test. */
  AUTH_TEST_CODE: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  AUTH_OTP_PER_EMAIL_15M: z.coerce.number().int().min(1).max(1000).default(3),
  AUTH_OTP_PER_IP_HOUR: z.coerce.number().int().min(1).max(1000).default(10),
  AUTH_VERIFY_PER_IP_15M: z.coerce.number().int().min(1).max(1000).default(10),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(1).default('RowLens <rowlens@trustable.nl>'),
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
  media: {
    /** `null`: uploads are off. */
    dir: string | null;
    capBytes: number;
    maxUploadBytes: number;
    diskPauseRatio: number;
  };
  /** `null`: no access code configured, so the pilot gate stays closed. */
  pilot: {
    codeHash: string;
    sessionSecret: string;
    clubSlug: string;
    attemptsPerMinute: number;
  } | null;
  auth: {
    allowedEmails: ReadonlySet<string>;
    otpPepper: string;
    clubSlug: string;
    testCode: string | null;
    limits: {
      otpPerEmail15m: number;
      otpPerIpHour: number;
      verifyPerIp15m: number;
    };
    smtp: {
      host: string;
      port: number;
      user: string;
      password: string;
      from: string;
    } | null;
  } | null;
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
  if (e.PILOT_ACCESS_CODE_HASH !== undefined && e.SESSION_SECRET === undefined) {
    throw new Error(
      'Invalid configuration: SESSION_SECRET is required with PILOT_ACCESS_CODE_HASH',
    );
  }
  if (e.NODE_ENV === 'production' && e.DATABASE_URL === undefined) {
    throw new Error('Invalid configuration: DATABASE_URL is required in production');
  }
  const allowedEmails = (e.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== '');
  for (const email of allowedEmails) {
    if (!z.email().safeParse(email).success) {
      throw new Error(`Invalid configuration: invalid AUTH_ALLOWED_EMAILS entry ${email}`);
    }
  }
  if (allowedEmails.length > 0 && e.OTP_PEPPER === undefined) {
    throw new Error('Invalid configuration: OTP_PEPPER is required with AUTH_ALLOWED_EMAILS');
  }
  if (e.AUTH_TEST_CODE !== undefined && e.NODE_ENV !== 'test') {
    throw new Error('Invalid configuration: AUTH_TEST_CODE is allowed only in NODE_ENV=test');
  }
  const smtpParts = [e.SMTP_HOST, e.SMTP_USER, e.SMTP_PASSWORD];
  if (
    smtpParts.some((part) => part !== undefined) &&
    smtpParts.some((part) => part === undefined)
  ) {
    throw new Error(
      'Invalid configuration: SMTP_HOST, SMTP_USER and SMTP_PASSWORD belong together',
    );
  }
  const smtp =
    e.SMTP_HOST === undefined || e.SMTP_USER === undefined || e.SMTP_PASSWORD === undefined
      ? null
      : {
          host: e.SMTP_HOST,
          port: e.SMTP_PORT,
          user: e.SMTP_USER,
          password: e.SMTP_PASSWORD,
          from: e.MAIL_FROM,
        };
  if (e.NODE_ENV === 'production' && allowedEmails.length > 0 && smtp === null) {
    throw new Error('Invalid configuration: SMTP is required when authentication is enabled');
  }
  const port = e.API_PORT ?? e.PORT;
  const publicOrigin = new URL(e.PUBLIC_ORIGIN ?? `http://localhost:${String(port)}`);
  if (publicOrigin.pathname !== '/' || publicOrigin.search !== '' || publicOrigin.hash !== '') {
    throw new Error('Invalid configuration: PUBLIC_ORIGIN must be an origin without a path');
  }

  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port,
    basePath: normalizeBasePath(e.BASE_PATH),
    publicOrigin: publicOrigin.origin,
    version: e.APP_VERSION,
    logLevel: e.LOG_LEVEL,
    clientDir: e.CLIENT_DIR,
    databaseUrl: e.DATABASE_URL,
    media: {
      dir: e.MEDIA_DIR ?? null,
      capBytes: e.MEDIA_CAP_BYTES,
      maxUploadBytes: e.UPLOAD_MAX_BYTES,
      diskPauseRatio: e.DISK_PAUSE_RATIO,
    },
    pilot:
      e.PILOT_ACCESS_CODE_HASH === undefined || e.SESSION_SECRET === undefined
        ? null
        : {
            codeHash: e.PILOT_ACCESS_CODE_HASH,
            sessionSecret: e.SESSION_SECRET,
            clubSlug: e.PILOT_CLUB_SLUG,
            attemptsPerMinute: e.PILOT_ATTEMPTS_PER_MINUTE,
          },
    auth:
      allowedEmails.length === 0 || e.OTP_PEPPER === undefined
        ? null
        : {
            allowedEmails: new Set(allowedEmails),
            otpPepper: e.OTP_PEPPER,
            clubSlug: e.PILOT_CLUB_SLUG,
            testCode: e.AUTH_TEST_CODE ?? null,
            limits: {
              otpPerEmail15m: e.AUTH_OTP_PER_EMAIL_15M,
              otpPerIpHour: e.AUTH_OTP_PER_IP_HOUR,
              verifyPerIp15m: e.AUTH_VERIFY_PER_IP_15M,
            },
            smtp,
          },
  };
}
