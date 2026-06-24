import { Env } from "./env";

/**
 * Atomic fixed-window rate limit, backed by D1 (migration 0005). Returns true if
 * the action is allowed, false once [key] has reached [limit] within [windowSec].
 *
 * A single upsert does the work atomically: it inserts a fresh counter, or — on
 * conflict — increments it, resetting to 1 (with a new expiry) when the previous
 * window has elapsed. This fixes the prior KV implementation, which was a
 * non-atomic read-modify-write on eventually-consistent storage (concurrent
 * requests all passed) and refreshed the TTL on every call (sliding the window
 * forever). The window here is fixed: expiry only moves when the window resets.
 */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const now = Date.now();
  const newExpiry = now + windowSec * 1000;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.expires_at < ? THEN 1 ELSE rate_limits.count + 1 END,
       expires_at = CASE WHEN rate_limits.expires_at < ? THEN ? ELSE rate_limits.expires_at END
     RETURNING count`,
  )
    .bind(`rl:${key}`, newExpiry, now, now, newExpiry)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}
