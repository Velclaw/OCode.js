type AttemptState = { count: number; resetAt: number };

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 8;
const MAX_TRACKED_KEYS = 4096;
const CLEANUP_EVERY_OPERATIONS = 64;

/**
 * Process-local best-effort throttling for the single-process demo runtime.
 * Entries are bounded so arbitrary client-supplied proxy headers cannot grow
 * this map without limit. This is not a substitute for shared rate limiting
 * behind a trusted proxy in a multi-instance/public deployment.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();
  private operations = 0;

  constructor(
    private readonly maxAttempts = LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    private readonly windowMs = LOGIN_RATE_LIMIT_WINDOW_MS,
    private readonly maxEntries = MAX_TRACKED_KEYS,
  ) {
    if (maxAttempts < 1 || windowMs < 1 || maxEntries < 1) {
      throw new RangeError("Rate limiter limits must be positive.");
    }
  }

  isBlocked(key: string, now = Date.now()): boolean {
    this.maintain(now);
    const state = this.attempts.get(key);
    if (!state) return false;
    if (state.resetAt <= now) {
      this.attempts.delete(key);
      return false;
    }
    return state.count >= this.maxAttempts;
  }

  recordFailure(key: string, now = Date.now()): boolean {
    this.maintain(now);
    const previous = this.attempts.get(key);
    const active = previous && previous.resetAt > now ? previous : undefined;

    if (!active && this.attempts.size >= this.maxEntries) {
      const oldestKey = this.attempts.keys().next().value;
      if (oldestKey !== undefined) this.attempts.delete(oldestKey);
    }

    const next: AttemptState = active
      ? { count: active.count + 1, resetAt: active.resetAt }
      : { count: 1, resetAt: now + this.windowMs };

    // Refresh insertion order so capacity pressure evicts least-recently-used
    // keys rather than allowing the map to grow beyond its configured bound.
    this.attempts.delete(key);
    this.attempts.set(key, next);
    return next.count >= this.maxAttempts;
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }

  private maintain(now: number): void {
    this.operations += 1;
    if (this.operations % CLEANUP_EVERY_OPERATIONS !== 0 && this.attempts.size < this.maxEntries) {
      return;
    }
    for (const [key, state] of this.attempts) {
      if (state.resetAt <= now) this.attempts.delete(key);
    }
  }
}

export const loginRateLimiter = new LoginRateLimiter();
