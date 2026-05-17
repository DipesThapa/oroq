// In-Worker cache keyed by "<level>:<domain>" → { hit: boolean, expires: number }.
// 30-second TTL is short enough that updates propagate quickly but long
// enough to absorb bursts (the typical user hits the same hot domains
// hundreds of times per minute).
const CACHE = new Map();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 5_000;

export function clearCache() {
  CACHE.clear();
}

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    CACHE.delete(key);
    return undefined;
  }
  return entry.hit;
}

function cacheSet(key, hit) {
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    // Simple eviction: drop the oldest 10% by insertion order.
    const drop = Math.ceil(CACHE_MAX_ENTRIES * 0.1);
    let i = 0;
    for (const k of CACHE.keys()) {
      if (i++ >= drop) break;
      CACHE.delete(k);
    }
  }
  CACHE.set(key, { hit, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Returns true if `domain` (or any parent of it, label-aligned)
 * is in the blocklist for `level`.
 */
export async function checkBlocked(kv, level, domain) {
  const key = `${level}:${domain}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  // Build the list of candidates: full domain + each parent.
  // For "img.cdn.pornhub.com" → ["img.cdn.pornhub.com", "cdn.pornhub.com", "pornhub.com"].
  // We stop at the second-to-last label so we never check a bare TLD.
  const parts = domain.split('.');
  const candidates = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    candidates.push(parts.slice(i).join('.'));
  }

  for (const candidate of candidates) {
    const v = await kv.get(`${level}:domain:${candidate}`);
    if (v === '1') {
      cacheSet(key, true);
      return true;
    }
  }

  cacheSet(key, false);
  return false;
}
