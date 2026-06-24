# OroQ — Architecture & Engineering Guide

> A privacy-first parental-control system: on-device web filtering, app blocking,
> and screen-time limits on a child's phone, viewed and controlled from a parent's
> phone — with the child's activity **end-to-end encrypted** so the servers can
> never read it.

Built and maintained by **CyberHeroez CIC**. Package `uk.co.cyberheroez.oroq`.

| Doc | What it covers |
|-----|----------------|
| **README.md** (this file) | Overview, tech stack, repo map, core concepts |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, components, layering |
| [FLOWS.md](FLOWS.md) | Flowcharts: auth, pairing, sync, commands, enforcement |
| [DATA_MODEL.md](DATA_MODEL.md) | D1 tables, KV keys, on-device storage |
| [API.md](API.md) | Backend endpoint reference |
| [SECURITY.md](SECURITY.md) | Crypto, tokens, threat model |

Related: [../SECURITY_AUDIT.md](../SECURITY_AUDIT.md) · [../BACKEND_DEPLOYMENT.md](../BACKEND_DEPLOYMENT.md) · [../PLAY_CONSOLE_CHECKLIST.md](../PLAY_CONSOLE_CHECKLIST.md)

---

## 1. What it is

OroQ is **one Android app** that runs in one of two roles, chosen at first launch:

- **Child device** — enforces protection locally: a `VpnService` filters DNS
  (blocks adult/malware/phishing/gambling/… categories), a foreground service
  blocks unapproved apps and enforces screen-time limits and per-app schedules,
  and the device shows it's protected (never covert).
- **Parent device** — a dashboard: pair child devices, see a Cyber-Confidence
  score, blocked-threat activity, screen time, and remotely change settings
  (toggle protection, approve apps, set limits, grant extra time).

A **Cloudflare Worker** (+ D1 + KV) is the relay between them. It stores only
**ciphertext** for activity and commands — it is a zero-knowledge transport for
the family's data. The parent's account (email) is the only plaintext PII.

## 2. Tech stack (ground truth)

| Layer | Tech |
|-------|------|
| Mobile | **Kotlin** + **Jetpack Compose** (single APK, parent + child roles) |
| Min / target SDK | 26 / 36 · versionName `1.0` |
| On-device crypto | **Google Tink** — HPKE (X25519 + HKDF-SHA256 + AES-256-GCM) |
| On-device storage | Jetpack **DataStore** (Preferences) |
| Background work | **WorkManager** (sync, blocklist updates) + foreground services |
| Web filtering | **VpnService** (local DNS interception, on-device resolver) |
| Push | **Firebase Cloud Messaging** (parent alerts) |
| Backend | **Cloudflare Worker** (TypeScript), `compatibility_date 2025-09-06` |
| Database | **D1** (SQLite) — `oroq-family` |
| Ephemeral store | **KV** — OTPs, pairing codes, encrypted summaries, command queue |
| Email | **Resend** (OTP login codes) |
| Tests | **JUnit** (Android unit) + **Vitest** w/ `@cloudflare/vitest-pool-workers` |

## 3. Repository map

```
android/app/src/main/java/uk/co/cyberheroez/oroq/
  MainActivity.kt        Entry point; routes by role (welcome / child / parent)
  boot/                  BootReceiver — restarts child protection after reboot
  config/                ConfigRepository (child settings), Categories
  family/                Pairing, sync, command channel, E2E crypto, FamilyStore   (17 files)
  filter/                DnsFilter, blocklist repository + DNS message parsing      (7)
  monitor/               AppMonitorService, BlockDecision, ClockGuard, SystemApps   (6)
  parent/                ParentViewModel, ParentRepository, dashboard screens       (16)
  push/                  FCM messaging service + token registration                (2)
  ui/                    Activities (Welcome, RolePicker, Block), child screens     (20)
  update/                Blocklist update worker                                    (3)
  vpn/                   OroQVpnService + IPv4/UDP packet build/parse               (3)

backend/
  src/
    index.ts             Router (validates env, dispatches by path)
    auth.ts              Email-OTP + Google sign-in → session JWT
    pairing.ts           Child-led pairing (create / join / get / delete)
    sync.ts              Encrypted activity-summary upload (child) / fetch (parent)
    cmd.ts               Parent→child command queue (send / fetch / ack)
    account.ts           Account deletion (cascade)
    push.ts              FCM v1 send (parent alerts)
    crypto.ts            JWT (HS256), SHA-256, random codes/tokens, constant-time eq
    childauth.ts         Per-pairing child-token guard for child endpoints
    ratelimit.ts         Atomic fixed-window limiter (D1-backed)
    email.ts             Resend OTP delivery
    env.ts, http.ts, googletoken.ts
  migrations/            0001_init … 0005_rate_limits (human-applied to prod)
  test/                  10 vitest suites

site/                    Static marketing + privacy pages (hostable)
assets/store/android/    Play store icon, feature graphic, screenshots
docs/                    This guide + audit + deployment + Play submission docs
```

## 4. Core concepts

- **Roles.** Device role (CHILD / PARENT) is chosen once and stored on-device.
  The child enforces; the parent observes and commands. The same backend serves
  both, distinguished by credential type (see Security).
- **Child-led pairing.** The *child* creates the pairing and shows a code/QR; the
  *parent* joins by code. Both compute a 6-digit **SAS** from the two public keys
  and compare it aloud to defeat a key-swapping relay.
- **Zero-knowledge relay.** Activity summaries and commands are encrypted
  **on the device** for the peer's public key. The Worker stores/relays only
  ciphertext; it can't read content.
- **Two credentials.** The **parent** authenticates with a session **JWT**
  (HS256) from email-OTP or Google. The **child** holds no account — it
  authenticates child-side calls with a per-pairing **bearer token** (only its
  hash is stored server-side).
- **Defense in depth on enforcement.** Default-deny app access, monotonic-clock
  guard against time tampering, fail-loud on permission loss, boot-restart, and
  the home launcher / system UI are never blocked.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the component diagram and
[FLOWS.md](FLOWS.md) for the step-by-step flowcharts.

## 5. Build & run (quick reference)

```
# Android
cd android && ./gradlew assembleDebug        # debug APK
./gradlew bundleRelease                       # signed release AAB (needs keystore.properties)
./gradlew testDebugUnitTest                   # unit tests

# Backend
cd backend && npx wrangler dev                # local worker
npx vitest run                                # tests (applies migrations in-memory)
npx wrangler d1 migrations apply oroq-family --remote   # apply migrations (operator)
npx wrangler deploy                           # deploy worker
```
