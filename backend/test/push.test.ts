import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { buildServiceAccountJwt, buildFcmMessage } from "../src/push";
import { signJwt } from "../src/crypto";

async function accountToken(sub = "acc-push"): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

// A locally generated RSA key stands in for the service account's private key.
let pemPkcs8: string;
const CLIENT_EMAIL = "fcm@oroq.iam.gserviceaccount.com";
const TOKEN_URI = "https://oauth2.googleapis.com/token";

function b64urlToBytes(t: string): Uint8Array {
  const p = t.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer);
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  pemPkcs8 = `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
});

describe("buildServiceAccountJwt", () => {
  it("builds a signed RS256 assertion with the right claims", async () => {
    const sa = { client_email: CLIENT_EMAIL, private_key: pemPkcs8, token_uri: TOKEN_URI };
    const jwt = await buildServiceAccountJwt(sa, 1_700_000_000);
    const [, payloadB64] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    expect(claims.iss).toBe(CLIENT_EMAIL);
    expect(claims.aud).toBe(TOKEN_URI);
    expect(claims.scope).toContain("firebase.messaging");
    expect(claims.exp).toBe(1_700_000_000 + 3600);
    expect(jwt.split(".")).toHaveLength(3);
  });
});

describe("buildFcmMessage", () => {
  it("is data-only with IDs + childLabel — never threat content or body text", () => {
    const msg = buildFcmMessage("device-token-1", "pair-123", "Aarav");
    expect(msg.message.token).toBe("device-token-1");
    expect(msg.message.data).toEqual({ pairingId: "pair-123", childLabel: "Aarav" });
    expect(msg.message.android.priority).toBe("high");
    // No notification block (data-only) and no threat content anywhere.
    expect((msg.message as Record<string, unknown>).notification).toBeUndefined();
    expect(JSON.stringify(msg)).not.toMatch(/phishing|malware|\.com|\.example/);
  });
});

describe("/push/register", () => {
  it("stores a token for the authed account", async () => {
    const token = await accountToken();
    const res = await SELF.fetch("https://example.com/push/register", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: "fcm-token-abc" }),
    });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT account_id FROM push_tokens WHERE token = ?")
      .bind("fcm-token-abc").first<{ account_id: string }>();
    expect(row?.account_id).toBe("acc-push");
  });

  it("rejects without a token (401)", async () => {
    const res = await SELF.fetch("https://example.com/push/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a missing body field (400)", async () => {
    const token = await accountToken();
    const res = await SELF.fetch("https://example.com/push/register", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("upsert is idempotent on (account, token)", async () => {
    const token = await accountToken("acc-dup");
    const body = JSON.stringify({ token: "fcm-dup" });
    const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
    await SELF.fetch("https://example.com/push/register", { method: "POST", headers, body });
    await SELF.fetch("https://example.com/push/register", { method: "POST", headers, body });
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_tokens WHERE token = ?")
      .bind("fcm-dup").first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });
});
