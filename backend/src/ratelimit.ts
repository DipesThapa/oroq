import { Env } from "./env";

/**
 * Fixed-window rate limit. Returns true if the action is allowed, false if the
 * count for [key] has reached [limit] within the [windowSec] window.
 *
 * Note: each call refreshes the KV TTL, so a steady stream of requests keeps
 * the window sliding — acceptable for coarse abuse protection.
 */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const k = `rl:${key}`;
  const current = parseInt((await env.KV.get(k)) ?? "0", 10);
  if (current >= limit) return false;
  await env.KV.put(k, String(current + 1), { expirationTtl: windowSec });
  return true;
}
