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
    });
  });

  it('normalises BASE_PATH and coerces PORT', () => {
    const config = loadConfig({ BASE_PATH: 'projects/rowlens/', PORT: '8080' });
    expect(config.basePath).toBe('/projects/rowlens');
    expect(config.port).toBe(8080);
  });

  it('requires PUBLIC_ORIGIN in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/PUBLIC_ORIGIN is required/);
    expect(
      loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://trustable.nl' }).publicOrigin,
    ).toBe('https://trustable.nl');
  });

  it.each([
    [{ PUBLIC_ORIGIN: 'https://trustable.nl/projects' }, /without a path/],
    [{ PUBLIC_ORIGIN: 'javascript:alert(1)' }, /Invalid configuration/],
    [{ PORT: '99999' }, /Invalid configuration/],
    [{ BASE_PATH: '/projects/../etc' }, /Invalid BASE_PATH/],
    [{ LOG_LEVEL: 'loud' }, /Invalid configuration/],
  ])('rejects %j', (env, message) => {
    expect(() => loadConfig(env)).toThrow(message);
  });
});
