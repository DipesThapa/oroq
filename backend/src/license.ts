import { Env } from "./env";
import { json, readJson } from "./http";
import { constantTimeEqual } from "./crypto";
import { sendLicenseEmail } from "./email";
import { rateLimit } from "./ratelimit";

const encoder = new TextEncoder();

/**
 * Routes the /license/* paths — the OroQ Pro fulfilment surface.
 *
 * The whole feature is gated on LICENSE_PRIVATE_KEY_JWK: the Worker must still
 * boot for the family features without it (see env.ts), so instead of failing
 * validateEnv we return a clear 503 here when it isn't configured.
 */
export async function handleLicense(req: Request, env: Env, path: string): Promise<Response> {
  const privateJwk = loadPrivateJwk(env);
  if (!privateJwk) return json({ error: "licensing_not_configured" }, 503);

  if (path === "/license/webhook" && req.method === "POST") return webhook(req, env, privateJwk);
  if (path === "/license/resend" && req.method === "POST") return resend(req, env);
  if (path === "/license/claim" && req.method === "GET") return claim(req, env);
  return json({ error: "not_found" }, 404);
}

/**
 * Post-purchase claim page. Gumroad redirects the buyer here after payment with
 * ?sale_id=… (and usually &email=…). We look up the key the webhook just minted
 * and render it — no email needed. If the webhook hasn't landed yet (redirect can
 * race it), we show a self-refreshing "finishing up" page for a few attempts.
 *
 * The page also carries the key in a hidden, extension-readable node
 * (#oroq-license-key[data-oroq-key]) so the installed OroQ extension can
 * auto-activate Pro without the user copy-pasting.
 */
async function claim(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const saleId = stringOrNull(url.searchParams.get("sale_id"));
  const email = normalizeEmail(url.searchParams.get("email"));
  const attempt = Math.max(0, parseInt(url.searchParams.get("t") || "0", 10) || 0);

  let key: string | null = null;
  if (saleId) {
    const row = await env.DB.prepare("SELECT license_key FROM licenses WHERE order_id = ?")
      .bind(saleId)
      .first<{ license_key: string }>();
    key = row?.license_key ?? null;
  }
  if (!key && email) {
    const row = await env.DB.prepare(
      "SELECT license_key FROM licenses WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(email)
      .first<{ license_key: string }>();
    key = row?.license_key ?? null;
  }

  const headers = { "content-type": "text/html; charset=utf-8" };
  if (key) return new Response(renderClaimPage(key), { headers });
  // Not found yet: retry a few times (webhook may still be in flight), then stop.
  if (attempt < 5) {
    const next = new URL(url);
    next.searchParams.set("t", String(attempt + 1));
    return new Response(renderPendingPage(next.toString()), { headers });
  }
  return new Response(renderPendingPage(null), { headers });
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

const PAGE_HEAD = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>OroQ Pro</title>
<style>*{box-sizing:border-box;margin:0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;
background:linear-gradient(135deg,#2b3f8f,#3a5bd0 45%,#2e8b7f);padding:24px;color:#fff}
.card{width:100%;max-width:520px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.2);
border-radius:20px;padding:32px;backdrop-filter:blur(8px)}
h1{font-size:26px;margin-bottom:6px}p{opacity:.92;line-height:1.5;margin-bottom:14px}
.key{display:block;width:100%;background:#0b1020;color:#cfe0ff;border-radius:12px;padding:14px;
font-family:ui-monospace,Menlo,monospace;font-size:13px;word-break:break-all;user-select:all;margin:12px 0}
button{font-size:15px;font-weight:700;padding:12px 18px;border-radius:12px;border:none;cursor:pointer}
.copy{background:#fff;color:#101426}.ok{display:none;margin-top:14px;font-weight:700;color:#c7f9d8}
.steps{font-size:14px;opacity:.9;margin-top:16px}.steps li{margin:4px 0}</style></head><body><div class="card">`;
const PAGE_FOOT = `</div></body></html>`;

function renderClaimPage(key: string): string {
  const k = esc(key);
  return `${PAGE_HEAD}
<h1>🎉 OroQ Pro is yours</h1>
<p>If you have the OroQ extension installed, Pro unlocks automatically — you'll see a confirmation below in a second. Otherwise, copy your key and paste it into the extension.</p>
<div id="oroq-license-key" data-oroq-key="${k}" hidden></div>
<code class="key" id="k">${k}</code>
<button class="copy" onclick="navigator.clipboard.writeText(document.getElementById('k').textContent).then(()=>{this.textContent='Copied ✓'})">Copy key</button>
<div class="ok" id="ok">✓ Activated automatically by your OroQ extension.</div>
<ol class="steps"><li>Click the OroQ icon in Chrome.</li><li>Open <b>OroQ Pro → Enter license key</b>.</li><li>Paste the key and press <b>Activate</b>.</li></ol>
${PAGE_FOOT}`;
}

function renderPendingPage(refreshUrl: string | null): string {
  const meta = refreshUrl ? `<meta http-equiv="refresh" content="2;url=${esc(refreshUrl)}">` : "";
  const body = refreshUrl
    ? `<h1>Finishing your purchase…</h1><p>Preparing your OroQ Pro license. This page refreshes automatically.</p>`
    : `<h1>Almost there</h1><p>Your license is taking a moment longer than usual. Refresh this page in a minute — if it still doesn't appear, reply to your Gumroad receipt and we'll sort it out.</p>`;
  return `${PAGE_HEAD.replace("<title>", meta + "<title>")}${body}${PAGE_FOOT}`;
}

/** Parses the private signing JWK from the secret; null if unset or malformed. */
function loadPrivateJwk(env: Env): JsonWebKey | null {
  if (!env.LICENSE_PRIVATE_KEY_JWK) return null;
  try {
    const jwk = JSON.parse(env.LICENSE_PRIVATE_KEY_JWK);
    return jwk && typeof jwk === "object" ? (jwk as JsonWebKey) : null;
  } catch {
    return null;
  }
}

/**
 * The purchase webhook. Provider is detected by which signal is present:
 *   - an `X-Signature` header  → LemonSqueezy (hex HMAC-SHA256 of the raw body
 *     under LEMONSQUEEZY_WEBHOOK_SECRET; constant-time compared).
 *   - otherwise                → Gumroad (form-urlencoded, `seller_id` must
 *     equal GUMROAD_SELLER_ID).
 * Either provider works — the owner can wire up whichever they sell through.
 *
 * On success we sign an offline license key for the buyer's e-mail, store it
 * keyed by the provider's order id (idempotent — a redelivered webhook returns
 * the same key without issuing a second one), e-mail it, and return ok.
 */
async function webhook(req: Request, env: Env, privateJwk: JsonWebKey): Promise<Response> {
  const rawBody = await req.text();

  let email: string | null;
  let orderId: string | null;
  let provider: string;

  const sigHeader = req.headers.get("x-signature");
  if (sigHeader !== null) {
    // LemonSqueezy: verify the raw body against the shared webhook secret.
    if (!env.LEMONSQUEEZY_WEBHOOK_SECRET) return json({ error: "unauthorized" }, 401);
    const expected = await hmacHex(env.LEMONSQUEEZY_WEBHOOK_SECRET, rawBody);
    if (!constantTimeEqual(expected, sigHeader.trim().toLowerCase())) {
      return json({ error: "unauthorized" }, 401);
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawBody);
    } catch {
      return json({ error: "bad_payload" }, 400);
    }
    const attrs = (data.data as Record<string, unknown>)?.attributes as Record<string, unknown>;
    email = normalizeEmail(attrs?.user_email);
    orderId = stringOrNull((data.data as Record<string, unknown>)?.id);
    provider = "lemonsqueezy";
  } else {
    // Gumroad: form-urlencoded ping; authenticity is the seller_id match.
    const form = new URLSearchParams(rawBody);
    const sellerId = form.get("seller_id");
    // Bootstrap: if GUMROAD_SELLER_ID isn't set yet, log the incoming id so the
    // owner can read it from `wrangler tail`, then set the secret and redeploy.
    // No key is issued until the secret is set (still returns 401) — safe.
    if (!env.GUMROAD_SELLER_ID) {
      console.log(`[oroq] Gumroad ping received. seller_id=${sellerId ?? "(none)"} — set this as the GUMROAD_SELLER_ID secret.`);
      return json({ error: "seller_id_not_configured", seller_id_seen: sellerId }, 401);
    }
    if (!sellerId || !constantTimeEqual(sellerId, env.GUMROAD_SELLER_ID)) {
      return json({ error: "unauthorized" }, 401);
    }
    email = normalizeEmail(form.get("email"));
    orderId = stringOrNull(form.get("sale_id"));
    provider = "gumroad";
  }

  if (!email || !orderId) return json({ error: "bad_payload" }, 400);

  // Idempotency: a redelivered webhook for the same order returns the stored key.
  const existing = await env.DB.prepare("SELECT license_key FROM licenses WHERE order_id = ?")
    .bind(orderId)
    .first<{ license_key: string }>();
  if (existing) return json({ ok: true, license_key: existing.license_key });

  const licenseKey = await signLicense(email, privateJwk);
  await env.DB.prepare(
    "INSERT INTO licenses (order_id, email, license_key, provider, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(orderId, email, licenseKey, provider, Date.now())
    .run();
  await sendLicenseEmail(env, email, licenseKey);
  return json({ ok: true, license_key: licenseKey });
}

/** Re-emails the most recent license for an e-mail — a lost-key convenience. */
async function resend(req: Request, env: Env): Promise<Response> {
  const email = normalizeEmail((await readJson(req)).email);
  if (!email) return json({ error: "bad_email" }, 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `license-resend:${ip}`, 5, 3600))) {
    return json({ error: "rate_limited" }, 429);
  }

  const row = await env.DB.prepare(
    "SELECT license_key FROM licenses WHERE email = ? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(email)
    .first<{ license_key: string }>();
  if (!row) return json({ error: "not_found" }, 404);

  await sendLicenseEmail(env, email, row.license_key);
  return json({ ok: true });
}

/**
 * Signs an offline OroQ Pro license key the browser extension verifies against
 * the matching PUBLIC key — this format is byte-compatible and MUST NOT drift:
 *   key      = base64url(payloadJson) "." base64url(signature)   (no padding)
 *   payload  = {"email":<buyer>,"tier":"pro","iat":<unixSeconds>} (this key order)
 *   signature= ECDSA P-256 / SHA-256 over the exact payload JSON UTF-8 bytes
 */
export async function signLicense(email: string, privateJwk: JsonWebKey): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const payloadJson = JSON.stringify({ email, tier: "pro", iat });
  const payloadBytes = encoder.encode(payloadJson);

  const key = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, payloadBytes);
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Lowercase-hex HMAC-SHA256 of [body] under [secret] — the LemonSqueezy scheme. */
async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function stringOrNull(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** Standard base64url with no padding — matches Node's Buffer.toString("base64url"). */
function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
