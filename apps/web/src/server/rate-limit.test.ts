import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit.ts';

describe('RateLimiter', () => {
  it('allows max hits per window and key, then says when to retry', () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.hit('a', 0).allowed).toBe(true);
    expect(limiter.hit('a', 1).allowed).toBe(true);
    expect(limiter.hit('a', 30_000)).toEqual({ allowed: false, retryAfterS: 30 });
    expect(limiter.hit('b', 30_000).allowed).toBe(true);
    expect(limiter.hit('a', 60_000).allowed).toBe(true);
  });
});
