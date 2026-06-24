# OroQ Backend / Android — Deployment & Launch Readiness

Covers the **Cloudflare Worker backend** (`backend/`, deployed as `oroq-family`)
and the **Android app**. (The Chrome-extension rollout is the separate, older
[DEPLOYMENT.md](DEPLOYMENT.md).)

_Last cutover: 2026-06-24 — merged `main` deployed to prod; D1 migrated 0001→0005._

---

## 1. Current production state (verified 2026-06-24)

**Worker:** `oroq-family` → `https://oroq-family.cyberheroez.workers.dev`
(account `dipes.thapa07@gmail.com`). Deployed from `main` @ `d74af69`.

**D1 (`oroq-family`, id `6ff2b5f1-…`):** migrations `0001`–`0005` applied; tracker
consistent; tables `accounts`, `pairings`, `push_tokens`, `rate_limits`. Started
empty after the test-data reset.

**KV (`b101d3dc…`):** OTPs, pairing codes, summaries, command queue.

**Verified live:**
- `GET /health` → `200 {"ok":true}`
- `GET /cmd/<uuid>` with no token → `401` (C1 child-token enforcement is live)
- `POST /auth/request` → `200` (email-OTP send path is wired)

### Config matrix

| Key | Source | Prod | Purpose |
|-----|--------|------|---------|
| `DB` / `KV` | bindings | ✅ | D1 + KV |
| `JWT_SECRET` | secret | ✅ | session tokens (boot-required) |
| `GOOGLE_CLIENT_ID` | var (`wrangler.toml`) | ✅ | Google sign-in (matches app's `GOOGLE_WEB_CLIENT_ID`) |
| `FCM_PROJECT_ID` | var | ✅ | FCM v1 push |
| `FCM_SERVICE_ACCOUNT` | secret | ✅ | FCM push auth |
| `RESEND_API_KEY` | secret | ✅ | email OTP send |
| `RESEND_FROM` | secret | ⚠️ `OroQ <onboarding@resend.dev>` (sandbox) | email OTP "from" |
| `DEV` | — | unset (correct) | gates dev OTP logging (audit L5) |

---

## 2. ⚠️ Before real-user launch

1. **Verify a real Resend domain.** `RESEND_FROM` is currently Resend's sandbox
   sender `onboarding@resend.dev`, which **only delivers to the Resend account
   owner's own email**. Real parents will not receive login codes until you:
   - Resend dashboard → Domains → add your domain → add the DNS records.
   - Re-set the secret: `cd backend && npx wrangler secret put RESEND_FROM`
     (e.g. `OroQ <noreply@yourdomain>`). No redeploy needed.
   - Until then, email login works only for your own address; **Google sign-in
     works for everyone** already.
2. **Ship the Android app.** C1 + crypto phase-1 is a breaking pairing change —
   any pre-existing dev pairings must re-pair (prod data was reset, so n/a).
3. Confirm `FamilyConfig.kt` `WORKER_BASE_URL` is the `https://…workers.dev`
   value (not a LAN dev URL) in the release build. A CI guard for this is a
   recommended follow-up (see audit release-hygiene note).

---

## 3. Routine ops (tracker is now clean)

**Deploy the Worker:**
```
cd backend && npx wrangler deploy
```

**Apply a new migration to prod** (operator-run per CLAUDE.md §13; the tracker is
consistent, so this is now a normal apply):
```
cd backend && npx wrangler d1 migrations apply oroq-family --remote
```

**Set/rotate a secret:**
```
cd backend && npx wrangler secret put <NAME>
```

**Smoke test after deploy:**
```
curl -s https://oroq-family.cyberheroez.workers.dev/health            # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" \
  https://oroq-family.cyberheroez.workers.dev/cmd/00000000-0000-0000-0000-000000000000  # 401
```

---

## 4. Security posture (see [SECURITY_AUDIT.md](SECURITY_AUDIT.md))

15 of 17 audit findings resolved and live as of the 2026-06-24 cutover (PRs
#15–#18 merged). Outstanding, non-blocking, tracked:

- **M1** — e2e command *sender authentication*. Scoped in
  [m1-command-signing-brief.md](m1-command-signing-brief.md). Phase 2; needs a
  per-device signing keypair + pairing-handshake change.
- **L2** — SAS UX (type/scan the 6 digits rather than self-attest).
- **L1 (keystore-wrap)** — wrap the on-device keyset with Android Keystore. The
  cloud-backup exposure was already closed.
- **Device Owner / managed-device** uninstall-prevention is parked as a future
  B2B/schools SKU (the H3 decision was Option A: consumer detect-and-alert).
