import { Env } from "./env";
import { json, readJson } from "./http";
import { verifyJwt } from "./crypto";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export interface ServiceAccount {
  client_email: string;
  private_key: string; // PEM PKCS8
  token_uri: string;
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

/** A signed RS256 service-account assertion for the Google token endpoint. */
export async function buildServiceAccountJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(
    new TextEncoder().encode(
      JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud: sa.token_uri, iat: nowSec, exp: nowSec + 3600 }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  return `${header}.${claims}.${b64url(sig)}`;
}

/** The FCM v1 message — generic body, IDs + childLabel only, never threat content. */
export function buildFcmMessage(token: string, pairingId: string, childLabel: string) {
  const name = childLabel.trim() || "your child";
  return {
    message: {
      token,
      notification: {
        title: "OroQ",
        body: `OroQ blocked something on ${name}'s phone — tap to view.`,
      },
      data: { pairingId, childLabel },
    },
  };
}
