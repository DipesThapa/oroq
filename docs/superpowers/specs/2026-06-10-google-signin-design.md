# Sign in with Google (Parent Login) — Design

**Date:** 2026-06-10
**Goal:** One-tap Google sign-in for parents via Android Credential Manager — no Firebase SDK — with the Cloudflare worker verifying Google ID tokens directly. Email-OTP remains as the fallback for non-Google parents.

## Decisions

| Question | Decision |
|---|---|
| Identity SDK | **Credential Manager + `googleid` library**, not Firebase Auth. Smallest dependency surface; no Google SDK initialisation in the child role; preserves the privacy-first posture. |
| OAuth host project | **New `oroq` Google Cloud project** (owner creates; consent screen shows "OroQ"). The old `safebrowse-5b028` project is not reused. |
| Account model | **Link by verified email.** `/auth/google` feeds the same `upsertAccount(email)` as OTP — one account regardless of sign-in method. No schema change. |
| OTP flow | Unchanged, kept as fallback. (Separately: `RESEND_API_KEY`/`RESEND_FROM` secrets must be set on the worker for OTP emails to actually deliver — operational task, not part of this feature.) |
| Token verification | In-worker WebCrypto RS256 against Google's JWKS. **Zero new backend dependencies**, matching the backend's dependency-free style. |

## Android — parent app

**Dependencies (pinned via `libs.versions.toml`):**
- `androidx.credentials:credentials`
- `androidx.credentials:credentials-play-services-auth`
- `com.google.android.libraries.identity.googleid:googleid`

**Login screen (`ParentLoginActivity`):** a `GoogleSignInButton` composable above the email card, then an "or" divider, then the existing email/OTP form. The button follows Google's dark-theme branding rules (their dark "Continue with Google" treatment sits well on `BgSurface`).

**Flow (`GoogleSignIn.kt`, new file in `parent/`):**
1. Generate a random nonce (16 bytes, base64url).
2. `GetGoogleIdOption` with `serverClientId = FamilyConfig.GOOGLE_WEB_CLIENT_ID`, `setNonce(nonce)`, first attempt `filterByAuthorizedAccounts(true)` + `setAutoSelectEnabled(true)` (instant for returning parents); on `NoCredentialException`, retry once with `filterByAuthorizedAccounts(false)` (account picker for first-timers).
3. On success: `POST /auth/google {"idToken": …, "nonce": …}` via the existing `FamilyApi` transport → store returned session token in `FamilyStore` → `ParentActivity`. Identical post-login path to OTP.
4. Errors: user cancellation → silently return to the login screen (email form is the fallback, no nagging). No Google account / Play Services absent → hide nothing, show inline caption "Google sign-in isn't available on this device" once, email form still primary. Network or worker rejection → existing inline error style.

`GOOGLE_WEB_CLIENT_ID` is a constant in `FamilyConfig` (OAuth client IDs are public identifiers, not secrets).

**Never log the ID token.**

## Worker — `POST /auth/google`

New handler in `auth.ts`, same router. Request: `{ idToken: string, nonce: string }`.

1. Rate limit: same policy as `/auth/request` (5 per 10 min per IP).
2. Decode the JWT header; fetch Google's JWKS (`https://www.googleapis.com/oauth2/v3/certs`) with caching (Cloudflare `caches.default`, honouring Google's `Cache-Control`, ~6 h typical). Unknown `kid` after a cache refetch → reject.
3. Verify with WebCrypto (`RSASSA-PKCS1-v1_5`, SHA-256):
   - signature valid against the JWKS key with matching `kid`
   - `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}
   - `aud` == `env.GOOGLE_CLIENT_ID` (new worker var — plain var, not secret)
   - `exp` in the future and `iat` in the past, ±300 s clock-skew tolerance
   - `nonce` claim equals the request's `nonce`
   - `email_verified === true` and `email` present
4. `normalizeEmail(email)` → `upsertAccount(env, email)` → sign the existing 30-day JWT → `{ token }`. Failure modes return `401 {error: "bad_token"}` without detail (no oracle).

New module `googletoken.ts` owns steps 2–3 (pure-ish, JWKS fetch injected for tests); `auth.ts` stays thin.

## Owner's one-time console setup (~10 min)

1. console.cloud.google.com → New project `oroq`.
2. **OAuth consent screen:** External; app name `OroQ`; support email; scopes `openid`, `email`, `profile`; publish (no verification needed for these basic scopes).
3. **Credentials → Create OAuth client ID,** twice:
   - Type **Web application**, name `oroq-worker` → this client ID goes into both `FamilyConfig.GOOGLE_WEB_CLIENT_ID` and the worker's `GOOGLE_CLIENT_ID` var.
   - Type **Android**, package `uk.co.cyberheroez.oroq`, plus the SHA-1 of the debug keystore now and the release keystore before launch (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1`).
4. `cd backend && npx wrangler deploy` after the worker change, and set the var in `wrangler.toml` (`[vars] GOOGLE_CLIENT_ID = "…"`).

## Testing

- **Worker (vitest, existing harness):** `googletoken.ts` tested with a locally generated RSA keypair serving as fake JWKS — cases: valid token; bad signature; expired; wrong `aud`; wrong `iss`; nonce mismatch; `email_verified=false`; unknown `kid`. `/auth/google` integration: valid → token issued for correct account id; second sign-in same email → same account id (the OTP-created account links).
- **Android (JUnit/Compose):** login screen renders both paths; nonce generator shape; ID-token never appears in any log call (greppable convention, no `Log.*` in `GoogleSignIn.kt`).
- **Manual E2E (needs owner's client ID):** fresh device parent → Google one-tap → dashboard; OTP account → Google with same Gmail → same children visible.

## Out of scope

- iOS / web portal sign-in (portal is sub-project 2).
- Account unlinking/deletion UI.
- Replacing OTP — it stays indefinitely for non-Google parents.

## Risks

- **R1 — Play Services variance:** Credential Manager needs Play Services for Google credentials; devices without it (rare for parents, common on emulators without GMS) fall back to email-OTP gracefully. Our emulator has GMS, so E2E is testable.
- **R2 — Client ID availability:** code lands with a placeholder constant; sign-in is dead (button hidden when the constant is blank) until the owner mints the real client ID. The blank-ID guard prevents shipping a broken button.
