# Security remediation — PR descriptions

Ready-to-paste descriptions for the three security branches from the 2026-06-24
audit pass (see [SECURITY_AUDIT.md](SECURITY_AUDIT.md)). All branches are local;
nothing has been pushed.

Merge order doesn't strictly matter. PR 1 and PR 3 both touch
`backend/src/pairing.ts` but in different functions (`pairCreate` vs `pairJoin`),
so expect a trivial auto-merge. PR 1 + PR 2 touch different files entirely.

---

## PR 1 — `security/c1-child-channel-auth` → `main`

**Title:** `Secure the child sync/command channel (audit C1 + H2)`

Closes audit findings **C1** (Critical) and **H2** (High, staleness portion). Two commits.

### What
- **C1 — per-pairing child token.** `POST /pair/create` now mints a high-entropy bearer token, returns it to the child once, and stores only its SHA-256 hash (migration `0004_child_token.sql`). The previously-unauthenticated child endpoints — `POST /sync` upload, `GET /cmd` fetch, `POST /cmd/:id/ack` — now require it via the `x-child-token` header (constant-time compared; always 401 on failure, no existence oracle). The Android child persists the token at pairing and sends it on every sync/command call.
- **H2 — server-stamped staleness.** The server stamps `receivedAt` on summary upload and returns it from `GET /sync`. The parent UI ("Offline/Active • last seen", protection banner) now judges staleness off this server time instead of the child-supplied `ts` inside the encrypted blob. Backward-compatible: legacy blobs (no `receivedAt`) fall back to the in-blob `ts`.

### Why
- C1: the `pairingId` is **not secret** — it's in request URLs and returned by the unauthenticated `GET /pair/:id`. Anyone who learned one could read the command queue, **ack-and-drop the parent's pending commands** before the child applied them, or overwrite the summary blob. No defense-in-depth existed.
- H2: staleness driven by a child-written timestamp can be spoofed by a tampered app sending a future-dated `ts` to keep the dashboard showing "last seen just now" while protection is off. Server-stamped time can't be forged by the child.

### Risk
- **Breaking wire/API change.** Pre-launch (versionCode 1, no installed base), so acceptable — but **existing dev pairings must re-pair** to obtain a token.
- **Requires migration `0004_child_token.sql` applied to prod before this deploys** (human-applied per CLAUDE.md §13). It adds a nullable `child_token_hash` column — harmless if the code isn't live yet.
- Scope limit: H2 closes the staleness-spoof vector. It does **not** make a rooted/repackaged child honest about `protectionOn`/`permissionsOk` content (inherent — needs Play Integrity). The remaining H2 hardening (bind pairingId + monotonic counter into the AEAD; per-command anti-replay) is deferred and tracked in `docs/SECURITY_AUDIT.md`.

### How tested
- Backend: 55/55 vitest, incl. new no-token / wrong-token rejection tests on fetch/ack/upload, create-mints-token, and `receivedAt` round-trip. `tsc --noEmit` clean.
- Android: 18/18 `FamilyApiTest` (asserts the token is transmitted + `receivedAt` parsing), `compileDebugKotlin` + unit suite green.

### Rollback
`git revert` the two commits. Migration 0004 leaves a nullable column that is harmless if unused.

### Deploy order
1. Apply `0004_child_token.sql` to prod.
2. Deploy the Worker.
3. Ship the app; dev devices re-pair.

---

## PR 2 — `security/h1-otp-attempt-cap` → `main`

**Title:** `Stop OTP brute-force on /auth/verify (audit H1)`

Closes audit finding **H1** (High).

### What
- Per-email failed-attempt counter that **burns the stored OTP after 5 wrong guesses** (forcing a fresh, IP-rate-limited request).
- Resets the counter when a new code is issued.
- Throttles `POST /auth/verify` by IP (10 / 10 min).

### Why
`/auth/verify` had no attempt cap and did **not** consume the OTP on a wrong guess, so all 10⁶ values of the 6-digit code were guessable within its 10-minute lifetime. A hit yields a 30-day session JWT = full account takeover.

### Risk
- Low for legitimate users (a real user needs 1–2 tries).
- The attempt counter is KV read-modify-write, so a concurrent burst can squeeze a few extra guesses past the cap (audit **M2**) — bounded, not exact; the per-IP throttle is the second layer. An atomic counter (Durable Object / D1) is the M2 follow-up.

### How tested
Backend 52/52 vitest, incl. new "burns the OTP after too many wrong guesses" and "resets the attempt budget on new request". `tsc --noEmit` clean.

### Rollback
`git revert` the commit.

---

## PR 3 — `security/backend-hardening` → `main`

**Title:** `Backend hardening: pair/join throttle + dev-OTP log gate (audit L3, L5)`

Closes audit findings **L3** and **L5** (Low). Two commits.

### What
- **L3** — per-IP rate limit (10 / 10 min) on `POST /pair/join`.
- **L5** — the dev OTP is echoed to logs only when `env.DEV === "true"`, instead of whenever Resend is unconfigured. Adds `DEV` to the `Env` type.

### Why
- L3: only `pair/create` was throttled; `pair/join` had none, so the ~39-bit pairing code could be guessed against (a hijack vector, ultimately caught by the SAS but better stopped earlier).
- L5: a misconfigured production (missing `RESEND_API_KEY`) would otherwise log plaintext login codes to Worker logs.

### Risk
- L3: 10 joins/10 min/IP is far above legitimate use (a parent joins once).
- L5: none — tests/local dev read the OTP from KV, not logs; prod never sets `DEV`.

### How tested
Backend 51/51 vitest, incl. new "rate-limits repeated join attempts". The `[dev] OTP` line no longer appears in test output. `tsc --noEmit` clean.

### Rollback
`git revert` the two commits.
