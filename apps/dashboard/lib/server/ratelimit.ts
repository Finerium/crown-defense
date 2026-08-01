/**
 * Fixed-window in-memory rate limiter. Bounded by construction: the project forbids unbounded memory, so
 * the bucket map is capped and evicts (expired first, then oldest-inserted) rather than growing forever.
 *
 * ponytail: per-instance counters. On a multi-instance deployment each instance keeps its own window, so
 * the effective global cap is per instance. Good enough to stop a runaway demo and a live API key from
 * being drained; move to a shared KV counter if the deployment ever fans out.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_KEYS = 5000;
const buckets = new Map<string, Bucket>();

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function evict(now: number): void {
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
  // Map iterates in insertion order, so this drops the oldest keys first.
  while (buckets.size >= MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

export function limit(key: string, max: number, windowMs: number): LimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) evict(now);
    const fresh: Bucket = { count: 1, resetAt: now + windowMs };
    buckets.set(key, fresh);
    return { allowed: max >= 1, remaining: Math.max(0, max - 1), resetAt: fresh.resetAt };
  }
  existing.count++;
  return {
    allowed: existing.count <= max,
    remaining: Math.max(0, max - existing.count),
    resetAt: existing.resetAt,
  };
}

/** Read a positive integer limit from env (12-factor), falling back to the shipped default. */
export function envLimit(key: string, dflt: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
}

/** Caller key for per-IP limits. Unknown proxies collapse to one shared bucket, which fails closed. */
export function callerIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'tak-dikenal';
  return req.headers.get('x-real-ip')?.trim() || 'tak-dikenal';
}
