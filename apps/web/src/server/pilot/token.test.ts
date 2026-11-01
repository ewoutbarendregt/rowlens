import { describe, expect, it } from 'vitest';
import { issueToken, verifyToken } from './token.ts';

const keys = { secret: 'a'.repeat(64), codeFingerprint: 'fp-1' };
const NOW = 1_800_000_000_000;

describe('pilot cookie token', () => {
  it('accepts its own token until it expires', () => {
    const token = issueToken(keys, NOW + 1000);
    expect(verifyToken(keys, token, NOW)).toBe(true);
    expect(verifyToken(keys, token, NOW + 1000)).toBe(false);
  });

  it('is void after a new access code or a new secret', () => {
    const token = issueToken(keys, NOW + 1000);
    expect(verifyToken({ ...keys, codeFingerprint: 'fp-2' }, token, NOW)).toBe(false);
    expect(verifyToken({ ...keys, secret: 'b'.repeat(64) }, token, NOW)).toBe(false);
  });

  it('rejects tampering and garbage', () => {
    const token = issueToken(keys, NOW + 1000);
    const later = token.replace(String(NOW + 1000), String(NOW + 9_999_999));
    expect(verifyToken(keys, later, NOW)).toBe(false);
    for (const bad of [undefined, '', 'v1', 'v1.x.y', `${token}x`, token.replace('v1', 'v2')]) {
      expect(verifyToken(keys, bad, NOW)).toBe(false);
    }
  });
});
