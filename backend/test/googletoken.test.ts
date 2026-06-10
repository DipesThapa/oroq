import { describe, it, expect, beforeAll } from "vitest";
import { verifyGoogleIdToken } from "../src/googletoken";

// A locally generated RSA key plays the role of Google's signing key.
let privateKey: CryptoKey;
let jwks: { keys: Array<Record<string, unknown>> };
const KID = "test-key-1";
const CLIENT_ID = "1234-test.apps.googleusercontent.com";

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function makeToken(claims: object, kid = KID): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      iat: now - 10,
      exp: now + 3600,
      email: "parent@example.com",
      email_verified: true,
      nonce: "test-nonce",
      ...claims,
    }),
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
  return `${header}.${payload}.${b64url(sig)}`;
}

const fakeFetchJwks = async () => jwks;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  privateKey = pair.privateKey;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  jwks = { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };
});

describe("verifyGoogleIdToken", () => {
  it("accepts a valid token and returns the email", async () => {
    const result = await verifyGoogleIdToken(await makeToken({}), CLIENT_ID, "test-nonce", fakeFetchJwks);
    expect(result).toEqual({ email: "parent@example.com" });
  });

  it("rejects a tampered signature", async () => {
    const token = await makeToken({});
    const broken = token.slice(0, -4) + "AAAA";
    expect(await verifyGoogleIdToken(broken, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("rejects an expired token beyond skew", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await makeToken({ exp: now - 600 });
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("accepts a just-expired token within the 300s skew", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await makeToken({ exp: now - 100 });
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).not.toBeNull();
  });

  it("rejects the wrong audience", async () => {
    const token = await makeToken({ aud: "someone-else.apps.googleusercontent.com" });
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("rejects a non-Google issuer", async () => {
    const token = await makeToken({ iss: "https://evil.example" });
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("rejects a nonce mismatch", async () => {
    const token = await makeToken({ nonce: "other-nonce" });
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("rejects unverified email", async () => {
    const token = await makeToken({ email_verified: false });
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("rejects an unknown kid", async () => {
    const token = await makeToken({}, "unknown-kid");
    expect(await verifyGoogleIdToken(token, CLIENT_ID, "test-nonce", fakeFetchJwks)).toBeNull();
  });

  it("rejects garbage", async () => {
    expect(await verifyGoogleIdToken("not.a.jwt", CLIENT_ID, "n", fakeFetchJwks)).toBeNull();
  });
});
