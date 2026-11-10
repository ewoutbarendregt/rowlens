import { describe, expect, it } from 'vitest';
import { buildReleaseVersion, isNumericVersion } from './release-version.ts';

describe('numeric release versions', () => {
  it('increments with the build sequence and remains stable on a retry', () => {
    expect(buildReleaseVersion('0.0.0', '59')).toBe('0.0.59');
    expect(buildReleaseVersion('0.0.0', '60')).toBe('0.0.60');
    expect(buildReleaseVersion('0.0.0', '59')).toBe('0.0.59');
    expect(buildReleaseVersion('1.2.0', '101')).toBe('1.2.101');
  });

  it.each(['0.0.0', '0.0.59', '1.20.301'])('accepts numeric version %s', (version) => {
    expect(isNumericVersion(version)).toBe(true);
  });

  it.each(['v1.2.3', '1.2.3+sha-1234567', 'sha-1234567', '1.2.3-beta', '01.2.3', '1.2', ''])(
    'rejects non-numeric or malformed release %s',
    (version) => {
      expect(isNumericVersion(version)).toBe(false);
      expect(() => buildReleaseVersion(version, '59')).toThrow();
    },
  );

  it.each([undefined, '', '0', '-1', '1.5', '01', 'NaN', '9007199254740992'])(
    'rejects invalid build sequence %s',
    (sequence) => {
      expect(() => buildReleaseVersion('0.0.0', sequence)).toThrow();
    },
  );
});
