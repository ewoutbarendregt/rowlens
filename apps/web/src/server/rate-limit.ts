/**
 * Fixed-window counter per key, in memory (one web process). Enough for login-style endpoints;
 * replaced by a shared store if the app ever runs more than one instance.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /** Counts a hit; `retryAfterS` > 0 means refused. */
  hit(key: string, now = Date.now()): { allowed: boolean; retryAfterS: number } {
    const w = this.windows.get(key);
    if (w === undefined || now - w.start >= this.windowMs) {
      this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: true, retryAfterS: 0 };
    }
    w.count += 1;
    if (w.count <= this.max) return { allowed: true, retryAfterS: 0 };
    return { allowed: false, retryAfterS: Math.ceil((w.start + this.windowMs - now) / 1000) };
  }

  private prune(now: number): void {
    if (this.windows.size < 10_000) return;
    for (const [key, w] of this.windows) {
      if (now - w.start >= this.windowMs) this.windows.delete(key);
    }
  }
}
