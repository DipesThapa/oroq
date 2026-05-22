const encoder = new TextEncoder();

/** Lowercase-hex SHA-256 of a string. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Crockford-style alphabet with no I, L, O, 0 or 1 — unambiguous when read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A random pairing code from an unambiguous uppercase alphabet. */
export function randomCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** A random zero-padded 6-digit OTP. */
export function randomOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array {
  let s = text.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs a payload as a compact HS256 JWT. */
export async function signJwt(payload: object, secret: string): Promise<string> {
  const head = b64urlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verifies an HS256 JWT; returns its payload, or null if invalid or expired. */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    b64urlDecode(parts[2]),
    encoder.encode(data),
  );
  if (!ok) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
