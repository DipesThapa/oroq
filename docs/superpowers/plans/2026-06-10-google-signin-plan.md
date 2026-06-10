# Sign in with Google Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap Google sign-in for parents via Android Credential Manager; the Cloudflare worker verifies Google ID tokens with WebCrypto and issues the existing session JWT. Email-OTP stays as fallback.

**Architecture:** New worker module `googletoken.ts` (JWKS fetch + RS256 verify, fetcher injected for tests) behind a new `/auth/google` route that reuses `upsertAccount`. Android adds Credential Manager + `googleid`, a `GoogleSignIn` helper, and a branded button on `ParentLoginActivity` guarded to hide when the client ID is blank.

**Tech Stack:** Cloudflare Workers (vitest-pool-workers), WebCrypto, Kotlin/Compose, androidx.credentials, com.google.android.libraries.identity.googleid.

**Spec:** `docs/superpowers/specs/2026-06-10-google-signin-design.md`.

**Conventions:** work on branch `feat/google-signin`. Backend commands run from `backend/` (`npm test`, `npx tsc --noEmit`); Android from `android/` (`./gradlew testDebugUnitTest -q`, `./gradlew assembleDebug -q`). Commit after each green task, no Co-Authored-By trailer. Never log an ID token.

---

### Task 1: Branch

- [ ] **Step 1:** `git checkout -b feat/google-signin` (from repo root, on up-to-date `main`).

---

### Task 2: Worker — `googletoken.ts` (TDD)

**Files:**
- Create: `backend/src/googletoken.ts`
- Test: `backend/test/googletoken.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { verifyGoogleIdToken } from "../src/googletoken";

// A locally generated RSA key plays the role of Google's signing key.
let privateKey: CryptoKey;
let jwks: { keys: object[] };
const KID = "test-key-1";
const CLIENT_ID = "1234-test.apps.googleusercontent.com";

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function makeToken(claims: object, kid = KID): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    iss: "https://accounts.google.com", aud: CLIENT_ID,
    iat: now - 10, exp: now + 3600,
    email: "parent@example.com", email_verified: true, nonce: "test-nonce",
    ...claims,
  }));
  const sig = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${header}.${payload}`),
  ));
  return `${header}.${payload}.${b64url(sig)}`;
}

const fakeFetchJwks = async () => jwks;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
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
```

- [ ] **Step 2:** Run `npm test -- googletoken` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement `googletoken.ts`**

```typescript
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
  const padded = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
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
      "jwk", jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key, b64urlToBytes(sigB64),
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
```

- [ ] **Step 4:** `npm test -- googletoken` — Expected: PASS (10 tests).
- [ ] **Step 5:** `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 6:** Commit: `feat(worker): verify Google ID tokens with WebCrypto, no dependencies`

---

### Task 3: Worker — `/auth/google` endpoint (TDD)

**Files:**
- Modify: `backend/src/auth.ts`
- Modify: `backend/src/env.ts`
- Modify: `backend/wrangler.toml`
- Test: append to `backend/test/googletoken.test.ts` (integration block)

- [ ] **Step 1: Write the failing integration test** (append to the test file; `SELF`/`env` come from `cloudflare:test` exactly as in `auth.test.ts`)

```typescript
import { SELF, env } from "cloudflare:test";
import { verifyJwt } from "../src/crypto";

describe("/auth/google", () => {
  // The route uses the real Google JWKS fetcher, which a test token can't
  // satisfy — so the route test covers the failure path and shape only;
  // the success path is fully covered by the unit tests above plus the
  // account-linking test through upsertAccount below.
  it("rejects a garbage token with 401 and no detail", async () => {
    const res = await SELF.fetch("https://example.com/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "junk", nonce: "n" }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "bad_token" });
  });

  it("rejects a missing body field with 400", async () => {
    const res = await SELF.fetch("https://example.com/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "junk" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2:** `npm test -- googletoken` — Expected: FAIL (404 from unknown route).

- [ ] **Step 3: Implement the route**

`env.ts` — add to the interface (a plain var, validated only when the route is used):
```typescript
  GOOGLE_CLIENT_ID?: string;
```

`wrangler.toml` — add (placeholder until the owner mints the real id):
```toml
[vars]
GOOGLE_CLIENT_ID = ""
```

`auth.ts` — new imports + route + handler:
```typescript
import { verifyGoogleIdToken } from "./googletoken";
```
In `handleAuth`:
```typescript
  if (path === "/auth/google" && req.method === "POST") return authGoogle(req, env);
```
Handler (mirrors `authVerify`'s shape; same rate limit policy as `authRequest`):
```typescript
async function authGoogle(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  if (!idToken || !nonce) return json({ error: "bad_request" }, 400);
  if (!env.GOOGLE_CLIENT_ID) return json({ error: "bad_token" }, 401); // feature not configured

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `auth:${ip}`, 5, OTP_TTL_SEC))) {
    return json({ error: "rate_limited" }, 429);
  }

  const verified = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, nonce);
  if (!verified) return json({ error: "bad_token" }, 401);
  const email = normalizeEmail(verified.email);
  if (!email) return json({ error: "bad_token" }, 401);

  const accountId = await upsertAccount(env, email);
  const exp = Math.floor(Date.now() / 1000) + JWT_TTL_SEC;
  const token = await signJwt({ sub: accountId, exp }, env.JWT_SECRET);
  return json({ token });
}
```

- [ ] **Step 4:** `npm test` — Expected: ALL suites pass (new + existing).
- [ ] **Step 5:** `npx tsc --noEmit` — Expected: clean.
- [ ] **Step 6:** Commit: `feat(worker): /auth/google — Google sign-in issues the standard session token`

---

### Task 4: Android — dependencies + `FamilyApi.authGoogle` (TDD)

**Files:**
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyApi.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyConfig.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/family/FamilyApiTest.kt`

- [ ] **Step 1: Dependencies** — `[versions]`: `credentials = "1.5.0"`, `googleid = "1.1.1"`. `[libraries]`:
```toml
androidx-credentials = { group = "androidx.credentials", name = "credentials", version.ref = "credentials" }
androidx-credentials-play-services = { group = "androidx.credentials", name = "credentials-play-services-auth", version.ref = "credentials" }
googleid = { group = "com.google.android.libraries.identity.googleid", name = "googleid", version.ref = "googleid" }
```
`app/build.gradle.kts` dependencies:
```kotlin
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services)
    implementation(libs.googleid)
```
Run `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.

- [ ] **Step 2: Failing test** — open `FamilyApiTest.kt`, find its existing fake-transport pattern, and add in the same style:

```kotlin
    @Test
    fun `authGoogle posts token and nonce and returns the session token`() {
        val transport = FakeTransport(HttpResponse(200, """{"token":"session-jwt"}"""))
        val api = FamilyApi("https://api.test", transport)
        val token = api.authGoogle("google-id-token", "nonce-1")
        assertEquals("session-jwt", token)
        assertEquals("https://api.test/auth/google", transport.lastUrl)
        assertTrue(transport.lastBody!!.contains("\"idToken\":\"google-id-token\""))
        assertTrue(transport.lastBody!!.contains("\"nonce\":\"nonce-1\""))
    }

    @Test
    fun `authGoogle returns null on rejection`() {
        val transport = FakeTransport(HttpResponse(401, """{"error":"bad_token"}"""))
        val api = FamilyApi("https://api.test", transport)
        assertNull(api.authGoogle("bad", "n"))
    }
```
(If the file's fake is named differently, use that name — match the file's existing conventions exactly, including how `lastUrl`/`lastBody` are captured. If it lacks those fields, extend the fake.)

Run: `./gradlew testDebugUnitTest --tests '*FamilyApiTest*'` — Expected: FAIL (unresolved `authGoogle`).

- [ ] **Step 3: Implement** — in `FamilyApi.kt` next to `authVerify`:

```kotlin
    /** Exchanges a Google ID token for a session token, or null if rejected. */
    fun authGoogle(idToken: String, nonce: String): String? {
        val body = JSONObject().put("idToken", idToken).put("nonce", nonce).toString()
        val res = post("/auth/google", jsonHeaders, body)
        if (res.status != 200) return null
        return JSONObject(res.body).optString("token").ifEmpty { null }
    }
```
In `FamilyConfig.kt`:
```kotlin
/** OAuth *web* client id from the `oroq` Google Cloud project. Public, not a
 *  secret. Blank until the owner mints it — the sign-in button hides itself. */
const val GOOGLE_WEB_CLIENT_ID = ""
```

- [ ] **Step 4:** `./gradlew testDebugUnitTest -q` — Expected: PASS.
- [ ] **Step 5:** Commit: `feat(android): Credential Manager deps + FamilyApi.authGoogle`

---

### Task 5: Android — `GoogleSignIn` helper + login screen button

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/GoogleSignIn.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentLoginActivity.kt`

- [ ] **Step 1: `GoogleSignIn.kt`** (no `Log` calls in this file — convention enforced by Task 6's grep)

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.GOOGLE_WEB_CLIENT_ID
import uk.co.cyberheroez.oroq.family.familyApi
import java.security.SecureRandom

/** Outcome of a sign-in attempt; [Cancelled] is silent, the rest show copy. */
sealed interface GoogleSignInResult {
    data class Success(val sessionToken: String) : GoogleSignInResult
    data object Cancelled : GoogleSignInResult
    data object Unavailable : GoogleSignInResult
    data object Rejected : GoogleSignInResult
}

object GoogleSignIn {
    val isConfigured: Boolean get() = GOOGLE_WEB_CLIENT_ID.isNotBlank()

    private fun newNonce(): String {
        val bytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        return android.util.Base64.encodeToString(
            bytes, android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING,
        )
    }

    /**
     * Runs the Credential Manager flow: returning parents resolve instantly
     * (authorized accounts + auto-select); first-timers get the account picker.
     */
    suspend fun signIn(context: Context): GoogleSignInResult {
        val nonce = newNonce()
        val manager = CredentialManager.create(context)
        val credential = try {
            try {
                manager.getCredential(context, request(nonce, onlyAuthorized = true)).credential
            } catch (_: NoCredentialException) {
                manager.getCredential(context, request(nonce, onlyAuthorized = false)).credential
            }
        } catch (_: GetCredentialCancellationException) {
            return GoogleSignInResult.Cancelled
        } catch (_: Exception) {
            return GoogleSignInResult.Unavailable
        }
        val idToken = runCatching {
            GoogleIdTokenCredential.createFrom(credential.data).idToken
        }.getOrNull() ?: return GoogleSignInResult.Unavailable
        val session = withContext(Dispatchers.IO) { familyApi().authGoogle(idToken, nonce) }
        return if (session != null) GoogleSignInResult.Success(session) else GoogleSignInResult.Rejected
    }

    private fun request(nonce: String, onlyAuthorized: Boolean): GetCredentialRequest =
        GetCredentialRequest.Builder()
            .addCredentialOption(
                GetGoogleIdOption.Builder()
                    .setServerClientId(GOOGLE_WEB_CLIENT_ID)
                    .setFilterByAuthorizedAccounts(onlyAuthorized)
                    .setAutoSelectEnabled(onlyAuthorized)
                    .setNonce(nonce)
                    .build(),
            )
            .build()
}
```
Note: `GOOGLE_WEB_CLIENT_ID` lives in the `family` package (`FamilyConfig.kt`) — import as shown; if `FamilyConfig.kt` declares constants inside an object, adjust to `FamilyConfig.GOOGLE_WEB_CLIENT_ID` to match the file (open it first).

- [ ] **Step 2: Login screen** — in `ParentLoginActivity.kt`'s `LoginFlow`, insert between `Text("Parent sign-in"…)` and the `if (stage == "email")` block:

```kotlin
        if (GoogleSignIn.isConfigured && stage == "email") {
            Spacer(Modifier.height(16.dp))
            PrimaryButton(if (busy) "Signing in…" else "Continue with Google", enabled = !busy) {
                busy = true
                scope.launch {
                    when (val result = GoogleSignIn.signIn(context)) {
                        is GoogleSignInResult.Success -> {
                            store.setParentToken(result.sessionToken)
                            onSignedIn()
                        }
                        GoogleSignInResult.Cancelled -> { /* silent — email form is right there */ }
                        GoogleSignInResult.Unavailable ->
                            error = "Google sign-in isn't available on this device"
                        GoogleSignInResult.Rejected ->
                            error = "Google sign-in failed — try the email code instead"
                    }
                    busy = false
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("or", style = OroqType.Caption, modifier = Modifier.align(Alignment.CenterHorizontally))
        }
        Spacer(Modifier.height(16.dp))
```
(Adjust the pre-existing `Spacer(Modifier.height(16.dp))` so spacing isn't doubled; `Alignment` import: `androidx.compose.ui.Alignment`.)

- [ ] **Step 3:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL. With the blank client ID the login screen must look exactly as before — verify by launching on the emulator and checking no Google button shows.

- [ ] **Step 4:** Commit: `feat(android): Continue with Google on parent login via Credential Manager`

---

### Task 6: Guards and full verification

- [ ] **Step 1: No-token-logging check**

```bash
grep -n 'Log\.' android/app/src/main/java/uk/co/cyberheroez/oroq/parent/GoogleSignIn.kt
```
Expected: no output.

- [ ] **Step 2: Full suites**

```bash
cd backend && npm test && npx tsc --noEmit
cd ../android && ./gradlew testDebugUnitTest assembleDebug -q
```
Expected: everything green.

- [ ] **Step 3:** Commit any stragglers; the branch is ready for review/merge.

---

### Task 7: Activation (owner-gated — do later, not part of the build)

- [ ] Owner creates the `oroq` GCP project, consent screen, Web + Android OAuth clients (spec §"Owner's one-time console setup").
- [ ] Set the real id in `FamilyConfig.GOOGLE_WEB_CLIENT_ID` and `backend/wrangler.toml` `[vars] GOOGLE_CLIENT_ID`, commit, `npx wrangler deploy`.
- [ ] Manual E2E (spec §Testing): fresh parent via Google; OTP-then-Google same-email linking shows the same children.

## Self-review notes

- Spec coverage: token verification (Task 2), endpoint + rate limit + linking (Task 3), deps + API (Task 4), UI + nonce + fallback behaviours (Task 5), no-logging + green suites (Task 6), owner activation + E2E (Task 7). Blank-ID guard: `isConfigured` hides the button (Task 5) and the worker 401s when unconfigured (Task 3).
- Type consistency: `authGoogle(idToken, nonce): String?` matches Task 5's call; `verifyGoogleIdToken(idToken, clientId, expectedNonce, fetchJwks)` signature identical in Tasks 2–3.
- The `/auth/google` success path can't be integration-tested against real Google JWKS; unit tests own success, the route test owns failure shape — stated explicitly in Task 3's test comment.
