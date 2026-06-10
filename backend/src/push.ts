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

/**
 * The FCM v1 message — **data-only**, IDs + childLabel only, never threat
 * content. Data-only routes through the app's onMessageReceived in every app
 * state (not the system tray), so the device builds and posts the alert. This
 * is both more private (no body text in the payload) and far more reliable on
 * OEMs like Vivo that suppress background notification-messages.
 */
export function buildFcmMessage(token: string, pairingId: string, childLabel: string) {
  return {
    message: {
      token,
      data: { pairingId, childLabel },
      android: { priority: "high" },
    },
  };
}

let cachedToken: { value: string; expSec: number } | null = null;

/** Returns a cached/fresh FCM access token, or null if not configured. */
export async function getAccessToken(
  env: Env,
  nowSec: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!env.FCM_SERVICE_ACCOUNT) return null;
  if (cachedToken && cachedToken.expSec - 60 > nowSec) return cachedToken.value;
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT) as ServiceAccount;
  const assertion = await buildServiceAccountJwt(sa, nowSec);
  const res = await fetchImpl(sa.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expSec: nowSec + data.expires_in };
  return data.access_token;
}

/** Sends one FCM push. Prunes the token on UNREGISTERED. Best-effort: never throws. */
export async function sendFcm(
  env: Env,
  fcmToken: string,
  pairingId: string,
  childLabel: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  try {
    if (!env.FCM_PROJECT_ID) return;
    const access = await getAccessToken(env, Math.floor(Date.now() / 1000), fetchImpl);
    if (!access) return;
    const res = await fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: JSON.stringify(buildFcmMessage(fcmToken, pairingId, childLabel)),
      },
    );
    if (res.status === 404) {
      await env.DB.prepare("DELETE FROM push_tokens WHERE token = ?").bind(fcmToken).run();
    }
  } catch {
    // best-effort; a missed push must never affect the caller
  }
}

/** Sends to every device registered for [accountId]. */
export async function notifyAccount(
  env: Env,
  accountId: string,
  pairingId: string,
  childLabel: string,
): Promise<void> {
  const rows = await env.DB.prepare("SELECT token FROM push_tokens WHERE account_id = ?")
    .bind(accountId)
    .all<{ token: string }>();
  for (const r of rows.results ?? []) await sendFcm(env, r.token, pairingId, childLabel);
}

/** Routes the /push/* paths. */
export async function handlePush(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/push/register" && req.method === "POST") return pushRegister(req, env);
  return json({ error: "not_found" }, 404);
}

async function pushRegister(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const payload = await verifyJwt(auth.slice("Bearer ".length), env.JWT_SECRET);
  const accountId = payload && typeof payload.sub === "string" ? payload.sub : null;
  if (!accountId) return json({ error: "unauthorized" }, 401);
  const body = await readJson(req);
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return json({ error: "bad_request" }, 400);
  await env.DB.prepare(
    "INSERT OR REPLACE INTO push_tokens (account_id, token, created_at) VALUES (?, ?, ?)",
  )
    .bind(accountId, token, Date.now())
    .run();
  return json({ ok: true });
}
