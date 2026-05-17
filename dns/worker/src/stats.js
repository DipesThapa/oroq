/**
 * Compute a privacy-preserving hash of (ip, salt, level).
 * Returns the first 48 bits of the SHA-256 as a 12-char hex string.
 */
export async function hashClientIp(ip, salt, level) {
  const data = new TextEncoder().encode(`${ip}:${salt}:${level}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const view = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < 6; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Format a Date as a UTC YYYY-MM-DD key (used in KV stats keys).
 */
export function dateKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
