export interface RetryOptions {
  attempts?: number;
  delayMs?: number;
  factor?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/** Wait for the requested duration, with optional abort support. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isFinite(ms) || ms < 0) return Promise.reject(new RangeError("ms must be a finite non-negative number"));
  if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Aborted"));
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(signal?.reason ?? new Error("Aborted")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Retry an async operation with bounded exponential backoff. */
export async function retry<T>(operation: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 150;
  const factor = options.factor ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 5000;

  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError("attempts must be an integer >= 1");
  if (
    !Number.isFinite(delayMs) || delayMs < 0 ||
    !Number.isFinite(factor) || factor < 1 ||
    !Number.isFinite(maxDelayMs) || maxDelayMs < 0
  ) {
    throw new RangeError("delayMs and maxDelayMs must be finite non-negative numbers; factor must be finite and >= 1");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || (options.shouldRetry && !options.shouldRetry(error, attempt))) throw error;
      await sleep(Math.min(delayMs * factor ** (attempt - 1), maxDelayMs));
    }
  }
  throw lastError;
}

/** Calls made while an operation is running share the same promise. */
export function dedupeAsync<Args extends unknown[], Result>(fn: (...args: Args) => Promise<Result>): (...args: Args) => Promise<Result> {
  let pending: Promise<Result> | undefined;
  return (...args: Args) => {
    if (pending) return pending;
    pending = Promise.resolve().then(() => fn(...args)).finally(() => { pending = undefined; });
    return pending;
  };
}

/** Race an operation against a timeout. */
export async function withTimeout<T>(operation: Promise<T>, ms: number, message = "Operation timed out"): Promise<T> {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError("ms must be a finite non-negative number");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
