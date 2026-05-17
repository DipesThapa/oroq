const VALID_LEVELS = new Set(['kids', 'teens', 'family']);

/**
 * Given a hostname like "kids.dns.cyberheroez.co.uk", return "kids".
 * Returns null if the hostname does not begin with a recognised level
 * followed by ".dns.".
 */
export function extractLevel(hostname) {
  if (!hostname) return null;
  const lower = hostname.toLowerCase();
  const first = lower.split('.')[0];
  if (!VALID_LEVELS.has(first)) return null;
  // Require the second label to be "dns" so we don't accidentally match
  // an unrelated subdomain shaped like "kids.something-else".
  if (!lower.startsWith(`${first}.dns.`)) return null;
  return first;
}
