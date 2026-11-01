import { describe, expect, it } from 'vitest';
import { absoluteUrl, normalizeBasePath, stripBasePath, withBasePath } from './base-path.ts';

describe('normalizeBasePath', () => {
  it.each([
    [undefined, ''],
    ['', ''],
    ['/', ''],
    ['  /  ', ''],
    ['projects/rowlens', '/projects/rowlens'],
    ['/projects/rowlens/', '/projects/rowlens'],
    ['//projects//rowlens//', '/projects/rowlens'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it.each(['/projects/../etc', '/projects/./rowing', '/with space', '/a?b', '/a#b'])(
    'rejects %j',
    (input) => {
      expect(() => normalizeBasePath(input)).toThrow(/Invalid BASE_PATH/);
    },
  );
});

describe('withBasePath', () => {
  it('prefixes app paths', () => {
    expect(withBasePath('/projects/rowlens', '/api/health')).toBe('/projects/rowlens/api/health');
    expect(withBasePath('', '/api/health')).toBe('/api/health');
  });

  it('rejects relative and protocol-relative paths', () => {
    expect(() => withBasePath('/projects/rowlens', 'api')).toThrow();
    expect(() => withBasePath('/projects/rowlens', '//evil.example')).toThrow();
  });
});

describe('absoluteUrl', () => {
  it('builds e-mail links under the base path', () => {
    expect(absoluteUrl('https://trustable.nl', '/projects/rowlens', '/login?code=1')).toBe(
      'https://trustable.nl/projects/rowlens/login?code=1',
    );
  });

  it('rejects an origin that carries a path', () => {
    expect(() => absoluteUrl('https://trustable.nl/projects', '/rowing', '/')).toThrow(
      /PUBLIC_ORIGIN/,
    );
  });
});

describe('stripBasePath', () => {
  it('maps paths inside the base path and rejects the rest', () => {
    expect(stripBasePath('/projects/rowlens', '/projects/rowlens')).toBe('/');
    expect(stripBasePath('/projects/rowlens', '/projects/rowlens/api')).toBe('/api');
    expect(stripBasePath('/projects/rowlens', '/projects/rowlensclub')).toBeNull();
    expect(stripBasePath('/projects/rowlens', '/projects/audioscribe/')).toBeNull();
    expect(stripBasePath('', '/x')).toBe('/x');
  });
});
