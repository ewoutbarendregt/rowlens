import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.ts';

describe('loadConfig', () => {
  it('applies defaults for local development', () => {
    expect(loadConfig({})).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3000,
      basePath: '/projects/rowlens',
      publicOrigin: 'http://localhost:3000',
      version: 'dev',
      logLevel: 'info',
      clientDir: undefined,
      databaseUrl: undefined,
      media: {
        dir: null,
        capBytes: 30 * 1024 ** 3,
        maxUploadBytes: 4 * 1024 ** 3,
        diskPauseRatio: 0.85,
      },
      pilot: null,
      auth: null,
    });
  });

  it('takes API_PORT over PORT (dev tools set PORT for the front end)', () => {
    expect(loadConfig({ PORT: '5174', API_PORT: '3100' }).port).toBe(3100);
    expect(loadConfig({ PORT: '5174' }).port).toBe(5174);
  });

  it('normalises BASE_PATH and coerces PORT', () => {
    const config = loadConfig({ BASE_PATH: 'projects/rowlens/', PORT: '8080' });
    expect(config.basePath).toBe('/projects/rowlens');
    expect(config.port).toBe(8080);
  });

  it('requires PUBLIC_ORIGIN and DATABASE_URL in production', () => {
    const DATABASE_URL = 'postgres://rowlens_app:secret@db:5432/rowlens';
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL })).toThrow(
      /PUBLIC_ORIGIN is required/,
    );
    expect(() =>
      loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://trustable.nl' }),
    ).toThrow(/DATABASE_URL is required/);
    const config = loadConfig({
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://trustable.nl',
      DATABASE_URL,
    });
    expect(config.publicOrigin).toBe('https://trustable.nl');
    expect(config.databaseUrl).toBe(DATABASE_URL);
  });

  it.each([
    [{ PUBLIC_ORIGIN: 'https://trustable.nl/projects' }, /without a path/],
    [{ PUBLIC_ORIGIN: 'javascript:alert(1)' }, /Invalid configuration/],
    [{ PORT: '99999' }, /Invalid configuration/],
    [{ BASE_PATH: '/projects/../etc' }, /Invalid BASE_PATH/],
    [{ LOG_LEVEL: 'loud' }, /Invalid configuration/],
    [{ DATABASE_URL: 'mysql://db/rowlens' }, /Invalid configuration/],
  ])('rejects %j', (env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });

  it('normalises the one-club email allowlist and SMTP configuration', () => {
    const config = loadConfig({
      AUTH_ALLOWED_EMAILS: ' Coach@Example.com, rower@example.com ',
      OTP_PEPPER: 'a'.repeat(64),
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '465',
      SMTP_USER: 'rowlens',
      SMTP_PASSWORD: 'secret',
      MAIL_FROM: 'RowLens <login@example.com>',
    });
    expect(config.auth).toEqual({
      allowedEmails: new Set(['coach@example.com', 'rower@example.com']),
      adminEmails: new Set(),
      otpPepper: 'a'.repeat(64),
      clubSlug: 'pilot',
      testCode: null,
      limits: { otpPerEmail15m: 3, otpPerIpHour: 10, verifyPerIp15m: 10 },
      smtp: {
        host: 'smtp.example.com',
        port: 465,
        user: 'rowlens',
        password: 'secret',
        from: 'RowLens <login@example.com>',
      },
    });
  });

  it('requires an OTP pepper, complete SMTP settings and production mail delivery', () => {
    const production = {
      NODE_ENV: 'production',
      PUBLIC_ORIGIN: 'https://trustable.nl',
      DATABASE_URL: 'postgres://rowlens_app:secret@db:5432/rowlens',
    };
    expect(() => loadConfig({ AUTH_ALLOWED_EMAILS: 'coach@example.com' })).toThrow(/OTP_PEPPER/);
    expect(() => loadConfig({ SMTP_HOST: 'smtp.example.com', SMTP_USER: 'rowlens' })).toThrow(
      /belong together/,
    );
    expect(() =>
      loadConfig({
        ...production,
        AUTH_ALLOWED_EMAILS: 'coach@example.com',
        OTP_PEPPER: 'a'.repeat(64),
      }),
    ).toThrow(/SMTP is required/);
    expect(() => loadConfig({ NODE_ENV: 'development', AUTH_TEST_CODE: '123456' })).toThrow(
      /NODE_ENV=test/,
    );
  });
});
