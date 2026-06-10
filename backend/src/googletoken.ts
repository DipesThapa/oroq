/**
 * Verification of Google ID tokens (Sign in with Google) with WebCrypto —
 * no dependencies. The JWKS fetcher is injectable so tests can supply a
 * locally generated key in place of Google's.
 */

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const CLOCK_SKEW_SEC = 300;

type Jwks = { keys: Array<Record<string, unknown>> };
export type JwksFetcher = () => Promise<Jwks>;

/** Fetches Google's JWKS through the Cloudflare cache (honours Cache-Control). */
export async function fetchGoogleJwks(): Promise<Jwks> {
  const res = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
  return (await res.json()) as Jwks;
}

function b64urlToBytes(text: string): Uint8Array {
  const padded = text
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(text.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Returns the verified e-mail for a genuine, unexpired Google ID token whose
 * audience is [clientId] and whose nonce claim equals [expectedNonce] — or
 * null for anything else. Never throws on bad input.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce: string,
  fetchJwks: JwksFetcher = fetchGoogleJwks,
): Promise<{ email: string } | null> {
  try {
    const [headerB64, payloadB64, sigB64] = idToken.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

    const jwks = await fetchJwks();
    const jwk = jwks.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as unknown as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com") return null;
    if (claims.aud !== clientId) return null;
    if (typeof claims.exp !== "number" || claims.exp < now - CLOCK_SKEW_SEC) return null;
    if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SEC) return null;
    if (claims.nonce !== expectedNonce) return null;
    if (claims.email_verified !== true || typeof claims.email !== "string") return null;
    return { email: claims.email };
  } catch {
    return null;
  }
}
