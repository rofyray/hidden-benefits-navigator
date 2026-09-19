/**
 * Coarse in-process request limits.
 *
 * These protect one server instance from a runaway client; they are not a
 * distributed quota, and the edge runtime may hold several instances. Keys are
 * hashed and truncated so no address is retained in memory.
 */

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_CONCURRENT = 4;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let inFlight = 0;

/** Non-reversible short key: enough to separate callers, not to identify one. */
export function clientKey(request: Request): string {
  const raw =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export type LimitOutcome = { ok: true } | { ok: false; reason: "rate_limited" | "busy" };

export function acquire(key: string, now = Date.now()): LimitOutcome {
  for (const [id, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(id);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, reason: "rate_limited" };
  } else {
    bucket.count += 1;
  }

  if (inFlight >= MAX_CONCURRENT) return { ok: false, reason: "busy" };
  inFlight += 1;
  return { ok: true };
}

export function release(): void {
  inFlight = Math.max(0, inFlight - 1);
}

/** Test seam only. */
export function resetLimits(): void {
  buckets.clear();
  inFlight = 0;
}

export const LIMIT_SETTINGS = { WINDOW_MS, MAX_REQUESTS_PER_WINDOW, MAX_CONCURRENT } as const;
