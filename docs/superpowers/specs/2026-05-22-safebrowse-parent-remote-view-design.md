# SafeBrowse — Parent Remote View (Family Link) Design

> Status: approved design — 2026-05-22
> Supersedes the "v3+" placeholder in
> `2026-05-21-safebrowse-android-parental-control-design.md`.

## 1. Purpose

Today SafeBrowse is a single-device app: a parent installs it on the child's
phone and configures everything on that phone behind a PIN. There is no way to
see or manage the child's device from the parent's own phone.

This feature adds **Family Link**: a parent, from their own phone, can see the
child's protection status, screen time and blocked-attempt activity, and
remotely change the child's settings — without the child's browsing or usage
data ever being stored in a decryptable form on any server.

## 2. Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| App structure | One app, **mode-aware** — Child mode vs Parent mode |
| Pairing | **8-character short code** (no QR, no camera) |
| What the parent gets | Status + screen time + blocked-attempts feed + **remote control** (two-way) |
| Sync model | **Polling, periodic** (~15 min child upload, ~2 min parent refresh while open) |
| Parent account | **Yes** — email account, for identity / pairing list / future billing |
| Login | **Passwordless** — 6-digit email OTP |
| Backend | **Cloudflare Worker** + D1 + KV, reusing the `relay/` E2E pattern |

Rejected approaches: Firebase/Supabase BaaS (third-party SDK, non-UK data
residency, conflicts with the privacy-first posture); pure P2P (child device is
often offline when the parent looks — a "check anytime" dashboard needs a
server-side mailbox).

## 3. Architecture overview

SafeBrowse becomes mode-aware. On first launch the user picks a role, stored in
DataStore (`device_role`):

- **Child mode** — the existing app (onboarding PIN, web filter, app blocking,
  screen time) plus a new Family section that pairs with a parent, uploads an
  encrypted summary, and polls for encrypted commands.
- **Parent mode** — a different UI: email login, a list of paired children, a
  per-child dashboard, and remote-control screens. Parent mode does **not** run
  `SafeBrowseVpnService` or `AppMonitorService`.

```
[Child phone]               [Cloudflare Worker]            [Parent phone]
 SafeBrowse (child mode)     D1: accounts, pairings          SafeBrowse (parent mode)
 + FamilySync module   ──>   KV: encrypted blobs only   <──  ParentRepository + UI
 encrypt summary,            (ciphertext + metadata,         login, decrypt & show,
 poll commands               never decryptable)              send encrypted commands
```

Three components: the **child device**, the **parent device**, and the
**Cloudflare backend**. The backend only ever holds ciphertext plus minimal
metadata (pairing IDs, parent email, timestamps).

### 3.1 New code structure

- Android `family/` package — pairing, crypto, sync models; shared by both
  modes.
- Android `parent/` package — Parent-mode UI and `ParentRepository`.
- Child-mode code is largely unchanged; it gains a small `family/` hook
  (`FamilySyncWorker`) and the role picker ahead of onboarding.
- `backend/` (new top-level folder) — the Cloudflare Worker, D1 schema, KV
  bindings, and its tests. The dev `relay/` folder stays as the reference
  pattern; the Worker is the production implementation.

## 4. Pairing flow

Both phones are in hand at setup time.

1. **Parent device** — Parent mode → "Add a child":
   - Generates an X25519 keypair (private key in the Android Keystore).
   - `POST /pair/create` (authenticated) → backend returns a `pairingId` and an
     8-character short code; the parent phone displays the code.
2. **Child device** — after child onboarding, Family section → "Link a parent":
   - Parent reads out the code; it is typed into the child phone.
   - Child generates its X25519 keypair.
   - `POST /pair/join {code, childPublicKey}` → backend matches code→pairingId,
     stores the child public key, returns the parent public key.
3. **Key exchange + MITM check (SAS):**
   - Each phone fetches the other's public key.
   - Both phones display a 6-digit **SAS** = a truncated hash of
     `parentPublicKey ‖ childPublicKey`.
   - The parent and child confirm the two phones show the same 6 digits and tap
     "Matches". A relay that swapped a public key cannot make both SAS values
     agree, so the swap is caught. Only then is the pairing trusted.
4. **Shared key** — `X25519(myPrivate, theirPublic)` → HKDF → an AES-GCM key,
   held only on the two phones. The backend never sees it.

Details: the short code carries ~40 bits of entropy, expires after 10 minutes,
and is rate-limited server-side. The parent is the pairing creator; the child
is the joiner (the child has no account). The child phone permanently shows
"Linked to a parent" — transparency required by the UK Children's Code and to
stay clear of the "stalkerware" classification.

## 5. Cloudflare backend

A single Cloudflare Worker. All routes are HTTPS + JSON.

### 5.1 Routes

**Auth (parent account):**
- `POST /auth/request {email}` — generate a 6-digit OTP, store its hash in KV
  (TTL 10 min), email it to the address.
- `POST /auth/verify {email, otp}` — on match, return a session token (JWT
  signed with a Worker secret).

**Pairing:**
- `POST /pair/create` (JWT required) → `{pairingId, code}`.
- `POST /pair/join {code, childPublicKey}` (the code authorizes — the child has
  no account) → stores the child public key, returns the parent public key.
- `GET /pair/:id` → the pairing record (public keys, status).

**Sync — child → parent:**
- `POST /sync/:pairingId {ciphertext}` — child uploads the encrypted summary;
  the backend keeps only the latest blob per pairing (each upload overwrites).
- `GET /sync/:pairingId` (JWT) — parent fetches the latest ciphertext.

**Commands — parent → child:**
- `POST /cmd/:pairingId {ciphertext}` (JWT) — parent enqueues an encrypted
  command.
- `GET /cmd/:pairingId` — child polls for pending commands.
- `POST /cmd/:pairingId/ack {ids}` — child acknowledges; the backend deletes
  the acked commands.

- `GET /health` → `{ ok: true }`.

### 5.2 Storage

- **D1 (SQL):** `accounts(id, email, created_at)` and
  `pairings(id, account_id, child_label, created_at, paired_at)`. Minimal — no
  child data of any kind.
- **KV:** OTP hashes (TTL 10 min); the latest summary ciphertext per pairing
  (TTL ~7 days — expiry is the retention limit); the command-queue ciphertext
  (TTL ~24 h).

### 5.3 Retention & secrets

Nothing decryptable is ever stored. The backend keeps one encrypted summary per
pairing (overwritten on each upload) and commands until acked or expired. The
only personal data is the parent's email in D1.

The Worker secret (JWT signing key) and the D1/KV bindings are loaded from the
environment. If a required binding is missing the Worker refuses to start.

Email delivery uses **MailChannels** (callable directly from a Worker, no SDK);
Resend is a fallback option.

## 6. Data sync & remote control

### 6.1 Child upload

`FamilySyncWorker` (WorkManager, ~15 min periodic, plus an immediate trigger
when a block event occurs) builds a summary:

```
{
  ts, protectionOn, screenTimeTodayMin, dailyLimitMin,
  topApps: [{label, minutes}],          // app labels, not package names
  blockedCount: {web, app},
  recentEvents: [{ts, type, label}]      // last ~20, e.g. "youtube.com" web block
}
```

It is encrypted with the pairing AES-GCM key, then `POST /sync`. Because the
payload is end-to-end encrypted, the backend never sees the labels or events.

### 6.2 Parent dashboard

`ParentRepository.refresh()` runs when the parent opens a child dashboard and
every ~2 minutes while it is open: `GET /sync` → decrypt → render protection
status, screen time and the blocked-attempts feed.

### 6.3 Remote control

Each parent action becomes an encrypted command:

- `grantExtraTime(minutes)` — bonus time when the child is on the time's-up
  screen.
- `setDailyLimit(minutes)`.
- `setBlockedApps(...)` — add/remove apps.
- `setBlockedCategories(...)` — change web categories.

The command is encrypted, then `POST /cmd`. The child's `FamilySyncWorker`
polls `GET /cmd` each cycle, decrypts, applies the change to `ConfigRepository`,
and acks. While the child is showing the time's-up `BlockActivity`, it polls
every ~30–60 s so "grant extra time" feels responsive; otherwise ~15 min.

**Out of scope:** remote on/off of the VPN. Android requires on-device VPN
consent, so protection toggling stays manual on the child phone. Remote control
covers screen-time limit, extra time, blocked apps and categories only.

## 7. Parent-mode UI

All screens reuse the existing "bold & playful" design system (`Style.kt` —
colour blocks, `pageHeader`, green buttons).

1. **Role picker** (first launch) — two large blocks: "Set up my child's phone"
   (child mode) and "I'm a parent — link a child" (parent mode).
2. **Parent login** — email field → "Send code" → 6-digit OTP field → done.
3. **Children list** (parent home) — one colourful card per paired child (label,
   status dot, today's screen time), plus an "Add a child" block.
4. **Add child** — shows the pairing code large, then status ("Waiting for the
   child phone…"), then the SAS confirmation screen.
5. **Child dashboard** — the child's own dashboard layout, read-only, plus
   remote-action buttons ("Grant 30 min", "Edit daily limit", "Manage blocked
   apps", "Manage categories") and a "Last synced X ago" staleness line.
6. **Remote-edit screens** — daily limit / blocked apps / categories, reusing
   the child-screen layouts; saving sends a command.

**Unpair:** the parent can remove a child at any time. The child phone shows
"Linked to a parent"; unlinking on the child side requires the parent PIN — so
the pairing is transparent to the child but the child cannot remove it alone.

## 8. Security & threat model

- The relay sees only ciphertext plus metadata (timing, pairing IDs, parent
  email). Raw child browsing/usage data never reaches it in a readable form.
- The SAS confirmation defeats a key-swap MITM by a malicious relay.
- Device private keys live in the Android Keystore; the derived shared AES key
  lives in DataStore.
- The short code is rate-limited with a 10-minute TTL; OTPs are hashed with a
  TTL; the session JWT is signed with a Worker secret.
- The pairing is non-covert: the child phone always shows it is linked — UK
  Children's Code compliance and anti-stalkerware.
- Get legal / DPO sign-off before launch (the company now stores a parent email
  — a small but real change to the data-controller posture).

## 9. Error handling

- Offline — uploads are queued and retried (WorkManager backoff).
- Pairing code expired — regenerate.
- Wrong OTP — limited retries.
- Decryption failure — the parent sees "Couldn't sync — re-pair this child".
- Stale data — the parent dashboard shows "Last synced X ago" with a stale
  badge when data is old.

## 10. Testing

- **Unit (Android):** crypto (key agreement, encrypt/decrypt round-trip), SAS
  derivation, summary serialize/parse, command-apply logic.
- **Worker:** Vitest + Miniflare — auth, pairing, sync and command routes, each
  with happy / unauthorised / wrong-pairing paths.
- The existing 52 child-mode tests are unaffected (this feature is additive).

## 11. Delivery — three plans

- **Plan A — Backend, account, pairing.** Cloudflare Worker (auth + pairing
  routes, D1 + KV), Android `family/` crypto, the role picker, parent login,
  and the pairing + SAS flow. End state: a parent can create an account and
  pair with a child device.
- **Plan B — Read-only sync + parent dashboard.** Child upload worker, sync
  routes, the parent children-list and child dashboard (status, screen time,
  blocked-attempts feed). End state: a parent sees the child remotely.
- **Plan C — Remote control.** Command-queue routes, parent remote-edit UI,
  child command polling and apply. End state: full two-way control.

Each plan ends at a usable state: A gives working pairing, B gives the
dashboard, C gives remote control.
