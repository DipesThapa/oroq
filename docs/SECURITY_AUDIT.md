# OroQ Security Audit

**Date:** 2026-06-24
**Commit audited:** `f371863` (working tree; uncommitted `FamilyConfig.kt` change and untracked `src/release`/`src/debug` noted where relevant)
**Scope:** Android client (`android/app`) + Cloudflare Worker backend (`backend/`) — authentication, device pairing, the encrypted sync + parent→child command channel, end-to-end crypto, and on-device enforcement durability.
**Method:** Five independent audit passes (backend authz/IDOR, E2E crypto & keys, pairing & command integrity, Android platform security, monitoring-bypass & client trust). All Critical/High findings were re-verified by reading the cited code directly.

---

## Bottom line

The **foundations are good**: genuine end-to-end encryption (Tink HPKE X25519 / AES-256-GCM, server only ever holds ciphertext), parameterized SQL everywhere, thorough Google ID-token verification, correct JWT + ownership checks on the *parent* read/write paths, clean component-export hygiene, immutable `PendingIntent`s, no WebView.

The **gaps** are concentrated in two themes that together undermine the product's central promise — *a child cannot disable monitoring, and a parent sees the truth*:

1. **The child holds no credential.** The backend treats the random `pairingId` as a de-facto secret, but also hands it out as a public path param and via an unauthenticated endpoint. → Critical C1, Medium M1, and the replay half of H2.
2. **Enforcement durability is thin.** A reboot or a Settings visit silently drops protection. → Critical C2 and Highs H3/H4 / Medium M3.

None of these are committed *shipping* regressions, but several are committed *code* gaps.

---

## Findings

Severity reflects calibrated impact for a child-safety product. "Verified" = the cited code was read and the behaviour confirmed during this audit.

| # | Severity | Finding | Status | Location |
|---|----------|---------|--------|----------|
| C1 | **Critical** | Unauthenticated child channel | ✅ **Fixed** | `backend/src/cmd.ts:57-71`, `backend/src/sync.ts:20-44` |
| C2 | **Critical** | No `BOOT_COMPLETED` receiver — protection off after reboot | ✅ **Fixed** | `android/app/src/main/AndroidManifest.xml` (absent) |
| H1 | **High** | OTP brute-forceable → account takeover | ✅ **Fixed** | `backend/src/auth.ts:40-50` |
| H2 | **High** | No replay protection / empty AEAD AAD + child-controlled freshness | 🟡 **Partial** | `FamilyCrypto.kt:52,60`, `FamilySyncWorker.kt:49`, `DeviceDetailScreen.kt:293` |
| H3 | **High** | Parent PIN is dead code; no device-admin | ✅ **Resolved** (Option A: detect-and-alert; dead code removed) | `ConfigRepository.kt:62-95` (no callers) |
| H4 | **High** | Wall-clock schedule/limit bypass | ✅ **Fixed** | `AppMonitorService.kt:55,66`, `BlockDecision.kt:47`, `UsageReader.kt:54` |
| M1 | Medium | Commands encrypted but not sender-authenticated | ⬜ Open | `CommandSync.kt:26-92`, `FamilyCrypto.kt:52` |
| M2 | Medium | Rate limiter non-atomic on eventually-consistent KV | ⬜ Open (H1 partly mitigates) | `backend/src/ratelimit.ts:16-20` |
| M3 | Medium | Fail-open + silent on permission revocation | ✅ **Fixed** | `AppMonitorService.kt:51`, `OroQVpnService.kt:63` |
| M4 | Medium | Default-deny race (~1s window) for new installs | ✅ **Fixed** (install alert; ~1s race inherent) | `AppMonitorService.kt:49-101` |
| M5 | Medium | Child DNS browsing history logged to logcat in release | ✅ **Fixed** | `OroQVpnService.kt:106-141`, `proguard-rules.pro` |
| L1 | Low | Private keyset stored unencrypted at rest | 🟡 **Partial** (cloud-backup closed; keystore-wrap open) | `FamilyStore.kt:40,71` |
| L2 | Low | SAS is 6-digit (~20-bit) and self-attested, not typed/scanned | ⬜ Open | `FamilyCrypto.kt:68-76` |
| L3 | Low | `pairJoin` has no per-code attempt cap (~39-bit code) | ✅ **Fixed** | `backend/src/pairing.ts:62-93` |
| L4 | Low | IPv4 IHL not lower-bounded before UDP parse (no crash) | ✅ **Fixed** | `vpn/Ipv4Packet.kt:16`, `vpn/UdpPacket.kt:22-31` |
| L5 | Low | Dev-mode OTP `console.log` when Resend unconfigured | ✅ **Fixed** | `backend/src/email.ts:9` |
| L6 | Low | No ciphertext version tag (future-migration brittleness) | ⬜ Open (bundle with H2 AEAD hardening — both change ciphertext format) | `FamilyCrypto.kt:23` |

---

## Remediation log (2026-06-24)

Seven findings addressed the same day. Direct-to-`main` commits and two PR branches (auth/API changes per `CLAUDE.md` §11):

| # | Resolution | Commit / branch |
|---|------------|-----------------|
| C1 | Per-pairing child bearer token (`x-child-token`); required on `/sync` upload + `/cmd` fetch/ack; only its hash stored. **Needs migration `0004_child_token.sql` applied to prod.** | branch `security/c1-child-channel-auth` |
| H2 | *(partial)* Server now stamps `receivedAt`; parent judges staleness off it, not the child-supplied `ts`. **Deferred:** AEAD pairingId+counter binding, per-command anti-replay counter. Bounded by the rooted-child reality (full integrity needs Play Integrity attestation). | branch `security/c1-child-channel-auth` |
| H1 | Per-email failed-attempt cap burns the OTP after 5 wrong guesses; per-IP throttle on `/auth/verify`. | branch `security/h1-otp-attempt-cap` |
| C2 | `BootReceiver` restarts child enforcement after reboot. | `main` |
| H4 | `ClockGuard` projects trusted time from a monotonic anchor; schedule decisions ignore wall-clock tampering; parent alerted on detection. | `main` |
| M3 | Loud fail-open: expedited parent push + degraded notification when Usage Access / VPN is lost. | `main` |
| M5 | R8 strips `Log.v`/`Log.d` (DNS domains) from release. | `main` |
| L1 | *(partial)* Cloud-backup of the keyset DataStore excluded (`backup_rules.xml` / `data_extraction_rules.xml`). Keystore-wrapping the keyset remains open. | `main` |
| M4 | Runtime `PACKAGE_ADDED` receiver fires an expedited parent alert on a new install. The ~1s foreground poll race before the block screen is inherent to the poll model (needs UsageStats event callbacks). | `main` |
| L4 | `parseUdp` rejects IHL < 20 (RFC 791 minimum). | `main` |
| L3 | Per-IP rate limit (10/10min) on `POST /pair/join`. | branch `security/backend-hardening` |
| L5 | Dev OTP log gated behind `env.DEV === "true"` (was: whenever Resend unconfigured). | branch `security/backend-hardening` |
| H3 | **Decision: Option A (detect-and-alert).** Removed the dead PinHasher + ConfigRepository PIN/onboarding code. A local PIN can't gate the real vectors (revoke/force-stop/clear-data/uninstall all live in Settings, not the app UI); OroQ's consumer posture is fast loud detection (M3 + offline banner). True prevention (uninstall-block) needs Device Owner — a future managed-device / schools SKU, not this product. | `main` |

**Still open:** M1 (command sender-auth), M2 (atomic rate limiter), L2 (SAS UX), L6 (ciphertext version tag), the keystore-wrap half of L1, and the deferred H2 hardening (AEAD binding + command anti-replay). L6 + H2 hardening both change the ciphertext format and should land together. **Device Owner / managed-device prevention** is parked as a separate B2B/schools SKU (see H3).

---

### C1 — Critical — Unauthenticated child channel

`GET /cmd/:pairingId`, `POST /cmd/:pairingId/ack`, and `POST /sync/:pairingId` perform **no caller authentication** — only IP rate-limiting. By contrast, `cmdSend` (parent enqueue) and `syncFetch` (parent read) correctly verify the JWT and `account_id` ownership.

```ts
// backend/src/cmd.ts:57
async function cmdFetch(env: Env, pairingId: string): Promise<Response> {
  return json({ commands: await readQueue(env, pairingId) });   // no auth
}
// backend/src/cmd.ts:62  (ack — only IP rate-limit, no ownership)
const queue = (await readQueue(env, pairingId)).filter((c) => !remove.has(c.id));
await writeQueue(env, pairingId, queue);
```

The `pairingId` is a 122-bit `crypto.randomUUID()` (not enumerable), **but it is not secret**: it is returned by the unauthenticated `GET /pair/:id`, embedded in the pairing/QR flow, stored in the child's datastore, and travels in every request URL.

**Impact (for anyone who learns a pairingId):**
- `POST /cmd/:id/ack` → **delete the parent's pending commands before the child applies them** (e.g. silently drop "turn protection on"). Denial-of-control.
- `POST /sync/:id` → overwrite the stored summary (DoS / corruption), or replay a captured valid blob (see H2), and trigger parent push spam via `notify:true`.
- `GET /cmd/:id` → read command queue metadata (timing/counts; content stays encrypted).

There is **no defense-in-depth**: a single pairingId leak = full control of that family's child channel.

**Fix:** Mint a per-pairing child bearer secret at `pair/create`, return it once to the child, store only its hash on the pairing row, and require it on `/sync` POST and `/cmd` fetch/ack.

---

### C2 — Critical — No `BOOT_COMPLETED` receiver

There is no `<receiver>` and no `RECEIVE_BOOT_COMPLETED` permission anywhere in the app. The VPN and `AppMonitorService` are `START_STICKY`, but Android does **not** auto-restart sticky services across a reboot. Both are started only when the child opens `MainActivity` / finishes onboarding.

**Impact:** After any reboot (or battery-die + recharge), web/DNS filtering, app blocking, schedules, screen-time limits, and default-deny are **all off** until the child voluntarily reopens OroQ. A power cycle silently defeats every layer at once.

**Fix:** Add a `BootReceiver` (`RECEIVE_BOOT_COMPLETED` + `LOCKED_BOOT_COMPLETED`) that restarts the services and re-arms WorkManager when the device role is CHILD, and have the existing 15-min worker re-assert the services if they're down. (Note Android's stopped-state FGS-start restriction — pair the receiver with the periodic worker.)

---

### H1 — High — OTP brute-forceable → account takeover

`/auth/verify` has **no attempt cap and no rate limit** (the limiter is only on `/auth/request`), and a wrong guess does **not** delete the stored OTP:

```ts
// backend/src/auth.ts:46
const stored = await env.KV.get(`otp:${email}`);
if (!stored || stored !== (await sha256Hex(otp))) {
  return json({ error: "bad_otp" }, 401);   // OTP NOT consumed on failure
}
await env.KV.delete(`otp:${email}`);          // deleted only on success
```

The code is 6 digits (10⁶ space) with a 600 s TTL. An attacker who knows the target email triggers one request, then hammers verify; all 10⁶ guesses remain valid for the full 10 minutes. A single hit yields a 30-day session JWT — full access to that family's pairings, summaries, and command control.

**Fix:** Per-email failed-attempt counter (invalidate the OTP after ~5 wrong tries) and rate-limit verify by both IP and email. Consider 8-digit codes. (See M2 — don't rely on the current KV limiter for this.)

---

### H2 — High — No replay protection / empty AEAD associated-data

`FamilyCrypto` encrypts and decrypts with an empty associated-data field, and nothing — pairingId, timestamp, or sequence number — is bound into the AEAD or stored alongside the blob:

```kotlin
// FamilyCrypto.kt:52 / :60
... .encrypt(plaintext, EMPTY)
... .decrypt(ciphertext, EMPTY)
```

Freshness is judged on `summary.ts`, which the **child** writes into the plaintext (`FamilySyncWorker.kt:49`), and the parent UI compares it against wall-clock (`DeviceDetailScreen.kt:293`). The backend stores summaries last-write-wins with no server timestamp.

**Impact:** A child (or anyone who captured one valid "healthy" blob) can replay a stale summary (`protectionOn=true`, `permissionsOk=true`, fresh `ts`) indefinitely. The parent dashboard shows *"Active • last seen just now"* while protection is actually off. The same applies to commands: a captured blob re-enqueued gets a fresh server id, bypassing the id-based dedup (see M1/replay).

**Fix:** Stamp `receivedAt` server-side on upload and drive staleness off that (not the child-supplied `ts`). Bind `pairingId || role || monotonic-counter` into the AEAD associated data on both sides, and have the parent reject any summary whose server `receivedAt` is not newer than the last seen. Version the wire format (this is a breaking change).

---

### H3 — High — Parent PIN is dead code; no device-admin

`PinHasher` is implemented correctly (PBKDF2-WithHmacSHA256, 100k iterations, 16-byte `SecureRandom` salt, 256-bit output) — but `verifyPin` / `completeOnboarding` / `verifyRecoveryCode` have **no callers** outside `ConfigRepository` and tests. The child onboarding flow never sets a PIN, and the app uses no `DevicePolicyManager` / device-admin.

**Impact:** On the child's own device, no local secret gates anything. The child can revoke Usage Access / overlay / VPN consent, force-stop the app, clear app data, or uninstall — none of which requires defeating a secret. The hashing machinery creates a false impression of a protection that doesn't exist at runtime.

**Fix:** Decide the model explicitly. Either wire the PIN into a gate in front of "stop protection", role-switch, and (via `DeviceAdminReceiver` + `setUninstallBlocked`) uninstall — or, if the cloud-account model is the real design, delete the dead PIN code and document that on-device tamper-resistance depends on device-admin enrollment.

---

### H4 — High — Wall-clock schedule/limit bypass

Schedules and daily limits use local wall-clock (`LocalTime.now()`, `LocalDate.now()`, `Calendar.getInstance()`); nothing uses a monotonic or server-anchored clock.

**Impact:** During an overnight blocked window the child sets the clock to noon → window no longer active → blocked app opens. Setting the date forward resets the daily-limit comparison. Changing the system clock needs no special permission for the device user.

**Fix:** Cross-check `System.currentTimeMillis()` against `SystemClock.elapsedRealtime()` (monotonic) and the server time observed at sync; if wall-clock diverges beyond tolerance, keep schedules/limits enforced and flag "clock tampering" to the parent. Read SNTP where possible. (UsageStats day-bucketing partially mitigates the limit reset but not the curfew bypass.)

---

### M1 — Medium — Commands not sender-authenticated

HPKE single-shot encryption to the child's public key provides confidentiality but **not sender authentication**, and the AAD is empty (H2). The child applies any command that decrypts and isn't already in `AppliedCommandLog`. The child's public key is itself retrievable via the unauthenticated `pairGet`.

**Impact:** Client-side safety rests entirely on the backend's `cmdSend` authz. With no e2e signature, a compromised/malicious backend — or any future authz regression (cf. C1) — can inject `SET_PROTECTION=0` and the child obeys. No defense-in-depth.

**Fix:** Sign commands with the parent's key; the child verifies against the `parentPublicKeyB64` it pinned at SAS-confirmed pairing, and rejects anything else. Bind the pairingId into the AAD.

---

### M2 — Medium — Rate limiter not race-safe

```ts
// backend/src/ratelimit.ts:16
const current = parseInt((await env.KV.get(k)) ?? "0", 10);
if (current >= limit) return false;
await env.KV.put(k, String(current + 1), { expirationTtl: windowSec });
```

Read-modify-write is non-atomic, so concurrent requests all read the same `current` and pass; Cloudflare KV is eventually consistent (read cache up to ~60 s); and every call refreshes the TTL (sliding window). Acceptable for coarse abuse, **not** a sound cap for the auth brute-force in H1.

**Fix:** For auth-critical counters use a Durable Object (atomic) or D1 `UPDATE ... SET n = n+1` with a fixed (non-refreshing) window.

---

### M3 — Medium — Fail-open + silent on permission revocation

If Usage Access is revoked, the monitor loop body is skipped every tick (blocking/schedules/limits/default-deny stop) while the foreground notification still says "limits are active". VPN establish failure stops the service with only a log line. Both fail **open** and **silent**; detection waits for the next 15-min sync's `permissionsOk`/`protectionOn` flags.

**Fix:** On `!hasUsageAccess()` or VPN establish failure, fire an expedited `scheduleNotifySync` so the parent is pushed within seconds, and change the child notification to a degraded-state message ("fail-open but loud").

---

### M4 — Medium — Default-deny race window

Default-deny is enforced by a 1-second foreground-app poll showing `BlockActivity`; there is no `PACKAGE_ADDED` listener. A newly installed app is interactive for ~1 s+ before the block screen covers it — enough for a quick single action.

**Fix:** Register a `PACKAGE_ADDED` receiver to mark new installs pending-review immediately and push the parent at install time; consider `UsageStatsManager` foreground-event callbacks. (The first-run seeding that approves pre-existing apps is correct — keep it.)

---

### M5 — Medium — Child browsing history logged in release

```kotlin
// vpn/OroQVpnService.kt:106 / :119 / :128 / :141
Log.d(TAG, "BLOCK $domain")    // every DNS query → logcat
```

These are unguarded `Log.d` calls; `proguard-rules.pro` has no `assumenosideeffects` rule, and R8 does not strip `android.util.Log` by default, so the child's full DNS history is written to logcat in release. Reachable via `READ_LOGS` (rooted/OEM), ADB, or bug-report capture. Undercuts the privacy-first promise.

**Fix:** Gate domain/PII logging behind `BuildConfig.DEBUG`, or add a ProGuard `-assumenosideeffects` rule stripping `Log.d`/`Log.v` in release.

---

### Low

- **L1 — Keyset unencrypted at rest.** Private keyset is plaintext base64 in Preferences DataStore, not Android-Keystore-wrapped (`FamilyStore.kt:40,71`). Sandboxed on a non-rooted device; exposed on rooted/forensic. The **cloud-backup vector was closed on 2026-06-24** (backup rules now exclude `datastore/family_config.preferences_pb`). Defense-in-depth: wrap with `AndroidKeysetManager` + hardware `MasterKey`.
- **L2 — SAS strength/UX.** 6-digit (~20-bit) SAS, self-attested via a "They match" tap rather than typed/scanned. Adequate because comparison is mandatory and single-shot, but require typing/scanning the digits to make confirmation prove the channel. Consider 8 digits.
- **L3 — `pairJoin` no attempt cap.** ~39-bit code, single-use + 10-min TTL + `already_paired` guard (good), but no per-code/per-account join throttle — a thin brute-force/hijack margin that grows with active-code population. Add a per-code attempt lock.
- **L4 — IPv4 IHL not lower-bounded.** `parseUdp` doesn't reject `IHL < 5`; reads ports from inside the IP header. No crash/OOB (bounds checked), local-only TUN source. Add `if (ihl < 20) return null`.
- **L5 — Dev OTP logged.** `console.log("[dev] OTP ...")` fires when Resend is unconfigured (`email.ts:9`); risk is a misconfigured prod leaking OTPs to Worker logs. Gate behind an explicit `env.DEV` flag, not absence of the mail key.
- **L6 — No ciphertext version tag.** No format byte on ciphertext; future algorithm migration has no clean handshake. Prepend a 1-byte version now while pre-launch.

---

## Release-hygiene note (not a committed bug)

A `http://192.168.0.33:8787` base URL and a `usesCleartextTraffic="true"` manifest exist **only in local working state**, not in committed shipping code:

- `FamilyConfig.kt` is modified in the working tree; `HEAD` is `https://oroq-family.cyberheroez.workers.dev`.
- `android/app/src/release/` and `android/app/src/debug/` are **untracked** (the release overlay even says "Do NOT ship: production is HTTPS").

**Action:** Never build a release from the current working tree; add a CI guard that fails the release build if `WORKER_BASE_URL` is non-HTTPS or `usesCleartextTraffic="true"` is present in a release variant.

---

## Verified-solid (do not regress)

- **True end-to-end encryption** — Tink HPKE `DHKEM_X25519_HKDF_SHA256 … AES_256_GCM`; server holds only public keys + ciphertext; private keyset never leaves the device.
- **Google ID-token verification** — RS256 against Google JWKS by `kid`; checks `iss`, `aud`, `exp` (300 s skew), `iat`, **`nonce`** (replay), `email_verified`; rejects non-RS256 (`alg:none` / algorithm-confusion).
- **Parameterized SQL everywhere** — `.prepare(...).bind(...)`; no string-concatenated SQL; path params constrained by `[0-9a-f-]{36}` regex.
- **Parent-path authz is correct** — `cmdSend`, `syncFetch`, `pairDelete` all verify JWT + `account_id` ownership (tests cover the 403 path).
- **Pairing code lifecycle** — single-use (`KV.delete` on join), 10-min TTL, `already_paired` 409 guard; `pairDelete` cleans `summary:`/`cmds:` KV traces.
- **Android component hygiene** — only `MainActivity` exported; VPN locked to `BIND_VPN_SERVICE`; `BlockActivity` non-exported, `excludeFromRecents` + `singleTask`, ignores foreign Intent extras; all `PendingIntent`s `FLAG_IMMUTABLE`; no WebView.
- **FCM push is display-only** — a forged/attacker push cannot trigger commands, unpair, or wipe; command application is the decoupled `/cmd` poll. Auto-init off, analytics off.
- **SAS exists** to detect a key-swapping relay (the right primitive for an untrusted backend).
- **Robust parsing** — DNS/VPN parsing fails closed-to-Allow rather than crashing; rejects DNS compression pointers; bounds reads by `MAX_PACKET`; malformed remote schedule JSON is `runCatching`-guarded.
- **Default-deny seeding** approves only pre-existing apps so the gate targets new installs; schedule wrap-around handles overnight curfews correctly.
- **PIN hashing** is cryptographically sound (just unused — H3).
- **Cloud backup of the secret keyset** excluded (fixed 2026-06-24).

---

## Recommended fix order

1. ~~**C1 + H2 (backend cluster)** — child bearer token on `/sync` + `/cmd`; server `receivedAt`; AAD binding + monotonic counter.~~ ✅ C1 + H2-staleness done (branch `security/c1-child-channel-auth`). 🟡 AAD binding + monotonic counter still deferred.
2. ~~**C2** — boot receiver + worker re-assertion.~~ ✅ done (`main`).
3. ~~**H1** — OTP attempt cap + verify rate-limit~~ ✅ done (branch `security/h1-otp-attempt-cap`). M2 (atomic counter) still open.
4. **H3 / H4 / M3** — enforcement durability: ✅ H3 resolved (Option A — detect-and-alert; dead PIN code removed); ✅ H4 (clock-tamper) done; ✅ M3 (loud fail-open) done.
5. ~~**M5** — strip release domain logging.~~ ✅ done (`main`).
6. **Lows + M4** as cleanup (M4 default-deny `PACKAGE_ADDED`, L3 `pairJoin` cap, L4 IHL bound, L5 dev-OTP log, L6 version tag, L1 keystore-wrap, L2 SAS UX); add the CI release-hygiene guard.

### Outstanding operator actions
- Push and open PRs for `security/c1-child-channel-auth` (C1 + H2), `security/h1-otp-attempt-cap` (H1), and `security/backend-hardening` (L3 + L5).
- Apply migration `backend/migrations/0004_child_token.sql` to prod before the C1 PR deploys (existing dev pairings must re-pair).
- Revert the local `FamilyConfig.kt` http/LAN change to the `https://…workers.dev` URL before any release build. *(done 2026-06-24)*
- ~~Decide the H3 tamper model~~ — decided: Option A (detect-and-alert); dead PIN code removed.

> All migrations remain human-applied to production (per `CLAUDE.md` §13). Backend auth/API changes go via PR.
