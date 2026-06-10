# Instant Threat Alerts (FCM Push) — Design

**Date:** 2026-06-10
**Goal:** When a child's device blocks a *threat*, the parent gets a push notification within seconds — even with the app closed — without exposing threat content to Google and without giving the child any Google push identifier.

## Decisions (resolved 2026-06-10)

| Question | Decision |
|---|---|
| What triggers a push | **Threats only** — block categories `phishing`, `malware`, `scam`, `adult`. Routine app/category blocks stay in the dashboard, no push. |
| Lock-screen text | **Child name, no specifics:** "OroQ blocked something on {childLabel}'s phone — tap to view." Never the domain or category. |
| Push mechanism | **FCM HTTP v1**, worker authenticates with a Google service-account access token minted via WebCrypto (no new backend deps, same technique as `googletoken.ts`). |
| Firebase project | **Reuse the existing `oroq` GCP project** (Firebase projects are GCP projects). |
| Child privacy | **Firebase auto-init disabled**; messaging enabled programmatically only on the parent role. The child never obtains an FCM token or Firebase installation id. |
| Token storage | New D1 table `push_tokens` (multiple devices per account, dedupable). |
| Content privacy | The activity summary stays end-to-end encrypted; FCM payload carries only `pairingId` + `childLabel`. The worker never reads summary content. |

## Architecture / flow

1. **Child blocks a threat.** In `OroQVpnService`, when `decision.category` ∈ threat set, enqueue an **expedited** one-time `FamilySyncWorker` with input `notify=true` (uses `setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)` so it runs promptly but degrades gracefully under quota). Non-threat blocks do nothing new — the 15-min periodic sync still carries them.
2. **Child uploads.** `FamilySyncWorker.doWork` reads its `notify` input and passes it to `FamilyApi.syncUpload(pairingId, ciphertext, notify)`. The summary is the same E2E-encrypted blob.
3. **Worker stores + notifies.** `syncUpload` stores the blob (unchanged), and when `notify` is true, looks up the pairing → `account_id` → that account's rows in `push_tokens`, and calls `sendFcm` for each. Payload: data message `{pairingId, childLabel}` + a generic notification body. Failures are swallowed (a missed push must never fail the sync).
4. **Parent receives.** `OroqMessagingService` (a `FirebaseMessagingService`) posts a system notification on the "Alerts" channel; tapping opens `ParentActivity` (lands on Home; the bell/Notifications already shows the synced detail). The real content is fetched and decrypted on open, exactly as today.

## Components

### Backend
- **`push.ts`** (new):
  - `POST /push/register` — authed (Bearer session JWT, same `verifyJwt` pattern). Body `{token}`. Upserts `(account_id, token)` into `push_tokens`. Returns `{ok:true}`.
  - `sendFcm(env, token, pairingId, childLabel)` — mints/caches a service-account OAuth access token (RS256 JWT signed with WebCrypto from `env.FCM_SERVICE_ACCOUNT` JSON → `https://oauth2.googleapis.com/token`), POSTs to `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`. Stale tokens (404/`UNREGISTERED`) are deleted from `push_tokens`.
  - `mintAccessToken` split out as a pure-ish unit (service-account JSON + signer injectable for tests).
- **`sync.ts`** — `syncUpload` accepts optional `notify: boolean`; on true, after storing, fan out `sendFcm` to the account's tokens (best-effort, errors logged not thrown).
- **`env.ts`** — add `FCM_SERVICE_ACCOUNT?: string` (secret, JSON) and `FCM_PROJECT_ID?: string` (var). When unset, `/push/register` still works but `sendFcm` no-ops (feature dormant until configured — same guard style as Google sign-in).
- **migration `0002_push_tokens.sql`:** `CREATE TABLE push_tokens (account_id TEXT NOT NULL, token TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (account_id, token))`. Human-applied per CLAUDE.md §13 — generate the file, do not apply.

### Android
- Gradle: `com.google.firebase:firebase-messaging` (via Firebase BoM) + `com.google.gms.google-services` plugin; `google-services.json` in `app/`.
- **Manifest:** `<meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false"/>` and the analytics-collection-disabled flag — so nothing initializes on the child.
- **`OroqMessagingService`** (parent push receiver) + an "Alerts" notification channel; tap intent → `ParentActivity`.
- **`PushRegistration`** helper: when role == PARENT and signed in, `FirebaseMessaging.setAutoInitEnabled(true)`, fetch token, `FamilyApi.pushRegister(token)`; `onNewToken` re-registers. Never called on the child.
- **`FamilyApi.pushRegister(token): Boolean`** → `POST /push/register`.
- **`FamilyApi.syncUpload(pairingId, ciphertextB64, notify=false)`** — add the flag (default false keeps every existing caller intact).
- **`OroQVpnService`** — on a threat-category block, enqueue the expedited notify sync (new `scheduleImmediateSync(context, notify=true)` in `FamilySyncWorker.kt`).

## Error handling
- Push send is best-effort: any FCM/token error is logged and swallowed; the child's upload always returns success on a stored blob.
- Unregistered/expired FCM tokens are pruned from `push_tokens` on send failure.
- Feature is fully dormant until `FCM_SERVICE_ACCOUNT` + `google-services.json` exist — the app still runs, just no pushes (mirrors the Google-signin blank-id guard).
- Notification permission (`POST_NOTIFICATIONS`, already requested) — if denied, pushes silently don't show; no crash.

## Testing
- **Worker unit (vitest):** `/push/register` authed→stores, unauthed→401, bad body→400; `mintAccessToken` with a local RSA key + faked token endpoint; `syncUpload` with `notify=true` calls the (faked) `sendFcm` once per token and `notify=false`/absent calls it zero times; stale-token pruning on a faked 404.
- **Android:** `FamilyApiTest` covers `pushRegister` and `syncUpload(notify=true)` body shape via the existing fake transport; build green.
- **Manual E2E (needs owner's Firebase setup):** parent signs in → token registered; child visits a known phishing test domain → parent phone buzzes within seconds with the child-name notification; tapping opens the app to the detail.

## Owner's one-time setup (~10 min)
1. Firebase console → add Firebase to the existing **`oroq`** GCP project.
2. Add an Android app `uk.co.cyberheroez.oroq` → download **`google-services.json`** → into `android/app/`.
3. Project settings → Service accounts → generate a private key (JSON) → set as worker secret: `cd backend && npx wrangler secret put FCM_SERVICE_ACCOUNT` (paste JSON). Set `FCM_PROJECT_ID` in `wrangler.toml [vars]`.
4. Apply the migration to production D1 (operator-applied).

## Risks
- **R1 — service-account JWT in a Worker:** minting an OAuth token via WebCrypto RS256 is proven (we already do RS256 verify for Google sign-in); the access-token cache must respect the ~1h expiry. Tested with an injected signer.
- **R2 — child Firebase init leak:** auto-init disabled is the guard; verify with a network capture in the manual pass that the child registers no FCM token.
- **R3 — expedited work quota:** Android may throttle expedited jobs; the `RUN_AS_NON_EXPEDITED` fallback means worst case it behaves like today (15-min). Acceptable degradation.
- **R4 — feature dormant without secrets:** intended; guards prevent a broken push path before setup.

## Out of scope
- iOS/web push. Per-category alert preferences (settings UI). Quiet hours. Grouping/coalescing beyond one-push-per-block (the "threats only" filter already bounds volume).
