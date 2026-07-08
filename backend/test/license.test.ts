import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../src/index";
import { Env } from "../src/env";

const WEBHOOK_SECRET = "test-lemonsqueezy-whsec";
const SELLER_ID = "test-gumroad-seller";

// A throwaway P-256 keypair generated at test runtime — the private half is
// handed to the Worker (as it would hold the real secret), the public half
// stands in for the extension's bundled verifier. Verifying a Worker-issued key
// against this public key proves byte-compatibility with the extension.
//
// Bindings can't be mutated onto the `SELF` worker instance from a test, so we
// invoke the Worker's fetch directly with an env that carries the DB/KV
// bindings (reused from the test env) plus the licensing secrets.
let publicKey: CryptoKey;
let licenseEnv: Env;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  publicKey = pair.publicKey;
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

  licenseEnv = {
    ...env,
    LICENSE_PRIVATE_KEY_JWK: JSON.stringify(privateJwk),
    LEMONSQUEEZY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    GUMROAD_SELLER_ID: SELLER_ID,
  } as unknown as Env;
});

const encoder = new TextEncoder();

function fetchWorker(request: Request, overrideEnv: Env = licenseEnv): Promise<Response> {
  return worker.fetch(request, overrideEnv);
}

/** Lowercase-hex HMAC-SHA256 — mirrors the LemonSqueezy signing the Worker verifies. */
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

function b64urlDecode(text: string): Uint8Array {
  let s = text.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Verifies a Worker-issued key exactly as the extension would, returning its payload. */
async function verifyKey(key: string): Promise<{ email: string; tier: string; iat: number }> {
  const [payloadSeg, sigSeg] = key.split(".");
  expect(payloadSeg).toBeTruthy();
  expect(sigSeg).toBeTruthy();
  const payloadBytes = b64urlDecode(payloadSeg);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    b64urlDecode(sigSeg),
    payloadBytes,
  );
  expect(ok).toBe(true);
  return JSON.parse(new TextDecoder().decode(payloadBytes));
}

function lemonBody(orderId: string, email: string): string {
  return JSON.stringify({ data: { id: orderId, attributes: { user_email: email } } });
}

function postLemon(body: string, signature: string): Promise<Response> {
  return fetchWorker(
    new Request("https://x/license/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": signature },
      body,
    }),
  );
}

describe("POST /license/webhook", () => {
  it("issues a key on a valid LemonSqueezy signature that verifies against the public key", async () => {
    const body = lemonBody("ls-order-1", "Buyer@Example.com");
    const res = await postLemon(body, await hmacHex(WEBHOOK_SECRET, body));
    expect(res.status).toBe(200);
    const { ok, license_key } = (await res.json()) as { ok: boolean; license_key: string };
    expect(ok).toBe(true);

    // The returned key verifies (byte-compatible with the extension)...
    const payload = await verifyKey(license_key);
    expect(payload.email).toBe("buyer@example.com"); // normalised to lowercase
    expect(payload.tier).toBe("pro");
    expect(typeof payload.iat).toBe("number");

    // ...and the same key is what got persisted.
    const row = await env.DB.prepare("SELECT license_key, email, provider FROM licenses WHERE order_id = ?")
      .bind("ls-order-1")
      .first<{ license_key: string; email: string; provider: string }>();
    expect(row?.license_key).toBe(license_key);
    expect(row?.email).toBe("buyer@example.com");
    expect(row?.provider).toBe("lemonsqueezy");
  });

  it("rejects a bad LemonSqueezy signature with 401", async () => {
    const body = lemonBody("ls-order-bad", "attacker@example.com");
    const res = await postLemon(body, "deadbeefdeadbeef");
    expect(res.status).toBe(401);
    const row = await env.DB.prepare("SELECT order_id FROM licenses WHERE order_id = ?")
      .bind("ls-order-bad")
      .first();
    expect(row).toBeNull(); // nothing issued
  });

  it("is idempotent: the same order id returns the same key and one D1 row", async () => {
    const body = lemonBody("ls-order-dup", "dup@example.com");
    const sig = await hmacHex(WEBHOOK_SECRET, body);

    const first = (await (await postLemon(body, sig)).json()) as { license_key: string };
    const second = (await (await postLemon(body, sig)).json()) as { license_key: string };
    expect(second.license_key).toBe(first.license_key);

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM licenses WHERE order_id = ?")
      .bind("ls-order-dup")
      .first<{ n: number }>();
    expect(count?.n).toBe(1);
  });

  it("accepts Gumroad by seller_id and issues a verifiable key (provider-agnostic)", async () => {
    const form = new URLSearchParams({
      seller_id: SELLER_ID,
      sale_id: "gum-order-1",
      email: "gumbuyer@example.com",
    });
    const res = await fetchWorker(
      new Request("https://x/license/webhook", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }),
    );
    expect(res.status).toBe(200);
    const { license_key } = (await res.json()) as { license_key: string };
    const payload = await verifyKey(license_key);
    expect(payload.email).toBe("gumbuyer@example.com");
    expect(payload.tier).toBe("pro");
  });

  it("rejects a Gumroad ping with the wrong seller_id", async () => {
    const form = new URLSearchParams({
      seller_id: "not-the-seller",
      sale_id: "gum-order-bad",
      email: "x@example.com",
    });
    const res = await fetchWorker(
      new Request("https://x/license/webhook", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when LICENSE_PRIVATE_KEY_JWK is not configured", async () => {
    const noKeyEnv = { ...licenseEnv, LICENSE_PRIVATE_KEY_JWK: undefined } as unknown as Env;
    const body = lemonBody("ls-order-503", "nokey@example.com");
    const res = await fetchWorker(
      new Request("https://x/license/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-signature": await hmacHex(WEBHOOK_SECRET, body) },
        body,
      }),
      noKeyEnv,
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("licensing_not_configured");
  });
});

describe("POST /license/resend", () => {
  it("re-emails the most recent license for a known e-mail", async () => {
    const body = lemonBody("ls-order-resend", "resend@example.com");
    await postLemon(body, await hmacHex(WEBHOOK_SECRET, body));

    const res = await fetchWorker(
      new Request("https://x/license/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "resend@example.com" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });

  it("404s for an e-mail with no license", async () => {
    const res = await fetchWorker(
      new Request("https://x/license/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
