import { describe, expect, it } from 'vitest';
import {
  generateAccessCode,
  hashAccessCode,
  hashFingerprint,
  isStoredHash,
  normalizeAccessCode,
  verifyAccessCode,
} from './code.ts';

describe('pilot access code', () => {
  it('generates readable codes without ambiguous characters', () => {
    const codes = new Set(Array.from({ length: 200 }, generateAccessCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
  });

  it('verifies the code regardless of case, spaces and dashes', async () => {
    const stored = await hashAccessCode('k7pq-3mxa-9rtd-wv2e');
    expect(isStoredHash(stored)).toBe(true);
    expect(await verifyAccessCode('k7pq-3mxa-9rtd-wv2e', stored)).toBe(true);
    expect(await verifyAccessCode(' K7PQ 3MXA 9RTD WV2E ', stored)).toBe(true);
    expect(await verifyAccessCode('k7pq-3mxa-9rtd-wv2f', stored)).toBe(false);
    expect(await verifyAccessCode('', stored)).toBe(false);
  });

  it('salts every hash, so equal codes hash differently', async () => {
    const a = await hashAccessCode('same-code');
    const b = await hashAccessCode('same-code');
    expect(a).not.toBe(b);
    expect(hashFingerprint(a)).not.toBe(hashFingerprint(b));
  });

  it('rejects malformed stored hashes instead of throwing', async () => {
    expect(isStoredHash('plaintext')).toBe(false);
    expect(await verifyAccessCode('x', 'scrypt.15.8.1.short.short')).toBe(false);
    expect(isStoredHash((await hashAccessCode('some-code')).replaceAll('.', '$'))).toBe(false);
  });

  it('normalises input', () => {
    expect(normalizeAccessCode('Ab-Cd ef')).toBe('abcdef');
  });
});
