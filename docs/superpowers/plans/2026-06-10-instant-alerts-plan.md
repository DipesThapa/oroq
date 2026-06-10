# Instant Threat Alerts (FCM Push) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a child blocks a threat, the parent gets an FCM push within seconds — worker triggered by a `notify` flag it can't see content behind, payload is IDs+childLabel only, summary stays E2E-encrypted, and the child never gets a Google push identifier.

**Architecture:** Worker gains a `push.ts` (token register + FCM v1 send via a WebCrypto-signed service-account token) and a `notify` branch in `sync.ts`. Android gains `FamilyApi.pushRegister` / `syncUpload(notify)`, a child-side expedited "notify" sync on threat blocks, and parent-only Firebase Messaging wiring that no-ops until `google-services.json` exists.

**Tech Stack:** Cloudflare Workers (vitest-pool-workers, WebCrypto, D1), FCM HTTP v1, Firebase Messaging SDK (parent only), Kotlin/Compose.

**Spec:** `docs/superpowers/specs/2026-06-10-instant-alerts-design.md`.

**Conventions:** branch `feat/instant-alerts`; backend from `backend/` (`npm test`, `npx tsc --noEmit`), Android from `android/` (`./gradlew testDebugUnitTest assembleDebug -q`). Commit per task, no Co-Authored-By trailer. Never log an FCM/service-account token or a threat domain. Migrations are generated only, never applied (CLAUDE.md §13).

---

### Task 1: Branch + push_tokens migration

**Files:**
- Create: `backend/migrations/0002_push_tokens.sql`

- [ ] **Step 1:** `git checkout -b feat/instant-alerts` from up-to-date `main`.

- [ ] **Step 2: Write the migration** (generated only — do not apply):
```sql
-- Push tokens for parent devices. One account can have several devices.
CREATE TABLE push_tokens (
  account_id  TEXT NOT NULL,
  token       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (account_id, token)
);
CREATE INDEX idx_push_tokens_account ON push_tokens (account_id);
```

- [ ] **Step 3:** Confirm the test harness auto-applies it — `backend/test/apply-migrations.ts` uses `env.TEST_MIGRATIONS`, which the vitest-pool-workers config loads from `migrations/`. Run `npm test -- health` and expect it still passes (migrations apply cleanly).

- [ ] **Step 4:** Commit: `feat(worker): push_tokens migration for parent device tokens`

---

### Task 2: Worker — service-account token + FCM message builders (TDD)

**Files:**
- Create: `backend/src/push.ts`
- Test: `backend/test/push.test.ts`

- [ ] **Step 1: Write the failing test** for the two pure-ish units — the JWT assertion builder and the FCM message body.

```typescript
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
    true, ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
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
    const msg = buildFcmMessage("device-token-1", "pair-123", "Aarav") as {
      message: { token: string; notification: { title: string; body: string }; data: Record<string, string> };
    };
    expect(msg.message.token).toBe("device-token-1");
    expect(msg.message.data).toEqual({ pairingId: "pair-123", childLabel: "Aarav" });
    expect(msg.message.notification.body).toContain("Aarav");
    // No domain/category anywhere in the serialized payload.
    expect(JSON.stringify(msg)).not.toMatch(/phishing|malware|\.com|\.example/);
  });
});
```

- [ ] **Step 2:** `npm test -- push` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `push.ts` (builders only for now)**

```typescript
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
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email, scope: FCM_SCOPE, aud: sa.token_uri,
    iat: nowSec, exp: nowSec + 3600,
  })));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`),
  ));
  return `${header}.${claims}.${b64url(sig)}`;
}

/** The FCM v1 message — generic body, IDs + childLabel only. */
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
```

- [ ] **Step 4:** `npm test -- push` and `npx tsc --noEmit` — Expected: PASS, clean.

- [ ] **Step 5:** Commit: `feat(worker): FCM service-account JWT + message builders`

---

### Task 3: Worker — access token, sendFcm, /push/register (TDD)

**Files:**
- Modify: `backend/src/push.ts`
- Modify: `backend/src/env.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/wrangler.toml`
- Test: append to `backend/test/push.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```typescript
import { SELF, env } from "cloudflare:test";
import { signJwt } from "../src/crypto";

async function accountToken(sub = "acc-push"): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

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
      method: "POST", headers: { "content-type": "application/json" },
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
```

- [ ] **Step 2:** `npm test -- push` — Expected: the new `/push/register` tests FAIL (404 unknown route).

- [ ] **Step 3: Implement registration + send + routing.**

`env.ts` — add:
```typescript
  FCM_SERVICE_ACCOUNT?: string; // service-account JSON (secret)
  FCM_PROJECT_ID?: string;      // var
```

`wrangler.toml` `[vars]` — add `FCM_PROJECT_ID = ""` next to `GOOGLE_CLIENT_ID`.

`index.ts` — add route (before the 404):
```typescript
      if (path.startsWith("/push/")) return await handlePush(req, env, path);
```

`push.ts` — append:
```typescript
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
  env: Env, fcmToken: string, pairingId: string, childLabel: string,
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
  env: Env, accountId: string, pairingId: string, childLabel: string,
): Promise<void> {
  const rows = await env.DB.prepare("SELECT token FROM push_tokens WHERE account_id = ?")
    .bind(accountId).all<{ token: string }>();
  for (const r of rows.results ?? []) await sendFcm(env, r.token, pairingId, childLabel);
}

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
  ).bind(accountId, token, Date.now()).run();
  return json({ ok: true });
}
```

- [ ] **Step 4:** `npm test -- push` and `npx tsc --noEmit` — Expected: PASS, clean.
- [ ] **Step 5:** Commit: `feat(worker): /push/register + FCM send with cached service-account token`

---

### Task 4: Worker — notify flag fans out on sync upload (TDD)

**Files:**
- Modify: `backend/src/sync.ts`
- Test: `backend/test/sync.test.ts`

- [ ] **Step 1: Write the failing test.** A real FCM send can't run in tests, so assert the *decision* to notify by spying through the DB: with a registered token and `notify:true`, the path must look up the account; we verify by checking that an unregistered/410 doesn't throw and that `notify:false` leaves no trace. The cleanest deterministic seam: export `notifyAccount` and have `syncUpload` call it; test that `notify:true` with **no** tokens is a 200 no-op and `notify:true` is accepted in the body. (Full send is covered by Task 3 unit tests + manual E2E.)

```typescript
// in sync.test.ts — uses the existing pairing setup helper pattern
it("accepts a notify flag on upload without failing the sync", async () => {
  // existing helper creates a paired pairingId; reuse it
  const pairingId = await createPairedPairing(); // see file's existing helper
  const res = await SELF.fetch(`https://example.com/sync/${pairingId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ciphertext: "QUJD", notify: true }),
  });
  expect(res.status).toBe(200);
});
```
(If `sync.test.ts` has no reusable paired-pairing helper, inline the create+join the way `pairing.test.ts` does, then upload.)

- [ ] **Step 2:** `npm test -- sync` — Expected: PASS already if the flag is simply ignored; to make it a real TDD step, first assert the worker reads `account_id` — change the test to register a token and assert no throw. Practically: implement Step 3, then confirm all sync tests stay green (the notify path is additive and best-effort).

- [ ] **Step 3: Implement.** In `sync.ts`, import and extend `syncUpload`:
```typescript
import { notifyAccount } from "./push";
```
Change the pairing lookup to also fetch `account_id` and `child_label`, and fan out when `notify`:
```typescript
  const body = await readJson(req);
  const ciphertext = body.ciphertext;
  const notify = body.notify === true;
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > 100_000) {
    return json({ error: "bad_request" }, 400);
  }
  const row = await env.DB.prepare(
    "SELECT account_id, child_label, child_public_key FROM pairings WHERE id = ?",
  ).bind(pairingId).first<{ account_id: string; child_label: string | null; child_public_key: string | null }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (!row.child_public_key) return json({ error: "not_paired" }, 409);

  await env.KV.put(`summary:${pairingId}`, ciphertext, { expirationTtl: SUMMARY_TTL_SEC });
  if (notify) {
    await notifyAccount(env, row.account_id, pairingId, row.child_label ?? "your child");
  }
  return json({ ok: true });
```

- [ ] **Step 4:** `npm test` (full) and `npx tsc --noEmit` — Expected: all green.
- [ ] **Step 5:** Commit: `feat(worker): fan out FCM push when a sync upload sets notify`

---

### Task 5: Android — FamilyApi.pushRegister + syncUpload(notify) (TDD)

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyApi.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/family/FamilyApiTest.kt`

- [ ] **Step 1: Write the failing tests** (existing `FakeTransport` pattern):
```kotlin
    @Test fun pushRegisterPostsTokenWithAuth() {
        val transport = FakeTransport(mapOf(
            "POST $base/push/register" to HttpResponse(200, """{"ok":true}"""),
        ))
        val api = FamilyApi(base, transport)
        assertTrue(api.pushRegister("session-jwt", "fcm-token-1"))
        assertTrue(transport.sent.single().contains("\"token\":\"fcm-token-1\""))
    }

    @Test fun syncUploadSendsNotifyFlagWhenSet() {
        val transport = FakeTransport(mapOf(
            "POST $base/sync/pair-1" to HttpResponse(200, """{"ok":true}"""),
        ))
        val api = FamilyApi(base, transport)
        assertTrue(api.syncUpload("pair-1", "QUJD", notify = true))
        assertTrue(transport.sent.single().contains("\"notify\":true"))
    }
```

- [ ] **Step 2:** `./gradlew testDebugUnitTest --tests '*FamilyApiTest*'` — Expected: FAIL (`pushRegister` unresolved, `syncUpload` arity).

- [ ] **Step 3: Implement** in `FamilyApi.kt`. Replace `syncUpload`:
```kotlin
    /** Uploads an encrypted summary blob; [notify] asks the server to push the parent. */
    fun syncUpload(pairingId: String, ciphertextB64: String, notify: Boolean = false): Boolean {
        val body = JSONObject().put("ciphertext", ciphertextB64).put("notify", notify).toString()
        return post("/sync/$pairingId", jsonHeaders, body).status == 200
    }

    /** Registers this parent device's FCM token. Returns true on success. */
    fun pushRegister(token: String, fcmToken: String): Boolean {
        val headers = jsonHeaders + ("authorization" to "Bearer $token")
        val body = JSONObject().put("token", fcmToken).toString()
        return post("/push/register", headers, body).status == 200
    }
```

- [ ] **Step 4:** `./gradlew testDebugUnitTest -q` — Expected: PASS (existing `syncUpload` caller still compiles via the `notify=false` default).
- [ ] **Step 5:** Commit: `feat(android): FamilyApi.pushRegister + syncUpload notify flag`

---

### Task 6: Android — child fires an expedited notify sync on threat blocks

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySyncWorker.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt`

- [ ] **Step 1: Worker reads a `notify` input and passes it through.** In `FamilySyncWorker.doWork`, replace the upload call:
```kotlin
        val notify = inputData.getBoolean("notify", false)
        val uploaded = familyApi().syncUpload(
            link.pairingId, Base64.getEncoder().encodeToString(ciphertext), notify,
        )
```

- [ ] **Step 2: Add an expedited scheduler** in `FamilySyncWorker.kt` (alongside `scheduleFamilySync`):
```kotlin
fun scheduleNotifySync(context: Context) {
    WorkManager.getInstance(context).enqueueUniqueWork(
        "family-sync-notify",
        ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<FamilySyncWorker>()
            .setInputData(Data.Builder().putBoolean("notify", true).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build(),
    )
}
```
(Imports: `androidx.work.Data`, `androidx.work.OutOfQuotaPolicy`, `androidx.work.OneTimeWorkRequestBuilder`, `androidx.work.ExistingWorkPolicy` — some already imported.)

- [ ] **Step 3: Trigger it from the VPN on a threat block.** In `OroQVpnService`, the threat set + call. Add near the top-level constants:
```kotlin
    private val threatCategories = setOf("phishing", "malware", "scam", "adult")
```
In the `Decision.Block` branch, after `blockLog.record(...)`:
```kotlin
                                if (decision.category in threatCategories) {
                                    uk.co.cyberheroez.oroq.family.scheduleNotifySync(applicationContext)
                                }
```
(Place inside the existing `if (d != lastBlockedDomain)` block so a repeated domain doesn't re-fire.)

- [ ] **Step 4:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit: `feat(android): child fires expedited notify-sync on threat blocks`

---

### Task 7: Android — parent-only Firebase Messaging (compiles; dormant until google-services.json)

**Files:**
- Modify: `android/gradle/libs.versions.toml`, `android/build.gradle.kts`, `android/app/build.gradle.kts`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/push/OroqMessagingService.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/push/PushRegistration.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentActivity.kt`

> The `com.google.gms.google-services` **plugin** requires `google-services.json` at build time, so it is NOT applied here — only the `firebase-messaging` **dependency** (which just puts SDK classes on the classpath and needs no JSON to compile). All Firebase calls are wrapped in `runCatching`, so without a configured `FirebaseApp` they no-op instead of crashing. Applying the plugin is the owner-activation step (Task 8).

- [ ] **Step 1: Dependency.** `libs.versions.toml` `[versions]`: `firebaseBom = "33.7.0"`. `[libraries]`:
```toml
firebase-bom = { group = "com.google.firebase", name = "firebase-bom", version.ref = "firebaseBom" }
firebase-messaging = { group = "com.google.firebase", name = "firebase-messaging" }
```
`app/build.gradle.kts` dependencies:
```kotlin
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)
```

- [ ] **Step 2: Manifest** — disable auto-init (keeps the child Google-free) and register the service. Inside `<application>`:
```xml
        <meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" />
        <meta-data android:name="firebase_analytics_collection_enabled" android:value="false" />
        <service
            android:name=".push.OroqMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
```

- [ ] **Step 3: `OroqMessagingService.kt`** — posts the notification; never logs payload.
```kotlin
package uk.co.cyberheroez.oroq.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.parent.ParentActivity

class OroqMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        // Re-register on rotation; safe no-op if not signed in.
        PushRegistration.register(applicationContext)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: "OroQ"
        val body = message.notification?.body ?: "New alert — tap to view."
        val manager = ContextCompat.getSystemService(this, NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Alerts", NotificationManager.IMPORTANCE_HIGH),
        )
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, ParentActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        manager.notify(
            1,
            NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title).setContentText(body)
                .setAutoCancel(true).setContentIntent(tap)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build(),
        )
    }

    companion object { private const val CHANNEL = "oroq_alerts" }
}
```

- [ ] **Step 4: `PushRegistration.kt`** — parent-only token fetch + register, all guarded.
```kotlin
package uk.co.cyberheroez.oroq.push

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.familyApi

object PushRegistration {
    /** Parent-only: enable messaging, fetch the FCM token, register it. No-op otherwise. */
    fun register(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                val store = FamilyStore(context)
                if (store.getRole() != DeviceRole.PARENT) return@runCatching
                val sessionToken = store.getParentToken() ?: return@runCatching
                FirebaseMessaging.getInstance().isAutoInitEnabled = true
                val fcmToken = FirebaseMessaging.getInstance().token.await()
                familyApi().pushRegister(sessionToken, fcmToken)
            }
        }
    }
}
```
Add the coroutines-play-services dep for `.await()`: `libs.versions.toml` lib `kotlinx-coroutines-play-services = { group = "org.jetbrains.kotlinx", name = "kotlinx-coroutines-play-services", version = "1.8.1" }`; `app/build.gradle.kts`: `implementation(libs.kotlinx.coroutines.play.services)`.

- [ ] **Step 5: Call it when a parent lands.** In `ParentActivity.onCreate`, after the token gate passes (parent confirmed signed in), add:
```kotlin
        uk.co.cyberheroez.oroq.push.PushRegistration.register(this)
```

- [ ] **Step 6:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL (compiles without `google-services.json`; runtime push dormant).
- [ ] **Step 7:** Commit: `feat(android): parent-only Firebase Messaging — dormant until google-services.json`

---

### Task 8: Full verification + owner activation

- [ ] **Step 1: Automated suites.**
```bash
cd backend && npm test && npx tsc --noEmit
cd ../android && ./gradlew testDebugUnitTest assembleDebug -q
```
Expected: all green.

- [ ] **Step 2: No-secret-logging guard.**
```bash
grep -rn 'Log\.' android/app/src/main/java/uk/co/cyberheroez/oroq/push/
```
Expected: no output.

- [ ] **Step 3 (owner-gated activation — cannot complete without these):**
  1. Firebase console → add Firebase to the existing **`oroq`** GCP project → add Android app `uk.co.cyberheroez.oroq` → download **`google-services.json`** into `android/app/`.
  2. Apply the gms plugin: `libs.versions.toml` plugin `google-services = { id = "com.google.gms.google-services", version = "4.4.2" }`; `android/build.gradle.kts` `plugins { alias(libs.plugins.google.services) apply false }`; `app/build.gradle.kts` `plugins { … alias(libs.plugins.google.services) }`.
  3. Firebase console → project settings → Service accounts → generate private key (JSON) → `cd backend && npx wrangler secret put FCM_SERVICE_ACCOUNT` (paste JSON) and set `FCM_PROJECT_ID` in `wrangler.toml [vars]` → `npx wrangler deploy`.
  4. Operator applies migration `0002_push_tokens.sql` to production D1.

- [ ] **Step 4: Manual E2E (after activation):** parent signs in (token registers — confirm a row in `push_tokens`); child visits a known phishing test domain; parent phone shows *"OroQ blocked something on {child}'s phone"* within seconds; tap opens the app. Capture a network trace on the child and confirm it registers **no** FCM token.

- [ ] **Step 5:** Final commit for any activation tweaks; branch ready for review/merge.

## Self-review notes

- **Spec coverage:** trigger=threats-only → Task 6 (`threatCategories`); notify flag end-to-end → Tasks 4–6; FCM send + IDs-only payload → Tasks 2–3 (`buildFcmMessage` asserts no content); token register table → Tasks 1,3; child-stays-tokenless → Task 7 (auto-init disabled, parent-only `register`); dormant-until-configured → Tasks 3,7 (`getAccessToken`/`sendFcm` guard on env, Firebase calls in `runCatching`); migration generated-not-applied → Task 1 + Task 8 step 3.4.
- **Type/signature consistency:** `syncUpload(pairingId, ciphertextB64, notify=false)` defined Task 5, called Task 6; `pushRegister(token, fcmToken)` Task 5 ↔ used in `PushRegistration` Task 7; `notifyAccount(env, accountId, pairingId, childLabel)` Task 3 ↔ called Task 4; `buildFcmMessage`/`buildServiceAccountJwt` Task 2 ↔ used Task 3.
- **Untestable seam:** real FCM send + service-account token exchange can't hit Google in CI — covered by unit tests with injected `fetchImpl`/local RSA key (Tasks 2–3) plus manual E2E (Task 8). Stated in Task 4 Step 1.
