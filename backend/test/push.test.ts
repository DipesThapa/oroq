import { describe, it, expect, beforeAll } from "vitest";
import { buildServiceAccountJwt, buildFcmMessage } from "../src/push";

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
  it("carries only token, generic body, and IDs — never threat content", () => {
    const msg = buildFcmMessage("device-token-1", "pair-123", "Aarav");
    expect(msg.message.token).toBe("device-token-1");
    expect(msg.message.data).toEqual({ pairingId: "pair-123", childLabel: "Aarav" });
    expect(msg.message.notification.body).toContain("Aarav");
    expect(JSON.stringify(msg)).not.toMatch(/phishing|malware|\.com|\.example/);
  });

  it("falls back to a generic name when the label is blank", () => {
    const msg = buildFcmMessage("t", "p", "  ");
    expect(msg.message.notification.body).toContain("your child");
  });
});
