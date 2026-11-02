import { describe, expect, it } from 'vitest';
import { hmac, newCode, newToken, safeEqual, sha256 } from './crypto.ts';

describe('authentication crypto', () => {
  it('generates fixed-width codes and 256-bit tokens', () => {
    for (let sample = 0; sample < 100; sample += 1) expect(newCode()).toMatch(/^\d{6}$/);
    expect(newToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('separates HMAC purposes and compares digests safely', () => {
    const pepper = 'a'.repeat(64);
    const otp = hmac(pepper, 'otp:user', '123456');
    expect(otp).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac(pepper, 'rate:user', '123456')).not.toBe(otp);
    expect(safeEqual(otp, otp)).toBe(true);
    expect(safeEqual(otp, sha256('other'))).toBe(false);
    expect(safeEqual(otp, 'bad')).toBe(false);
  });
});
