# OroQ — Backend Data Model

What the OroQ Family-Link backend stores, where, and (just as important) what it
deliberately does **not** store. The backend is a Cloudflare Worker
(`backend/`, deployed at `oroq-family.cyberheroez.workers.dev`) backed by **D1**
(SQLite, the `DB` binding) for durable rows and **KV** for short-lived secrets.

> Posture: the company holds only **parent** account data (an email), opaque IDs,
> and **public** keys. Child activity is end-to-end encrypted and is never
> readable server-side. There are no passwords anywhere.

---

## Durable storage — Cloudflare D1

### `accounts` — the parent's login record
`backend/migrations/0001_init.sql`

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (PK) | generated UUID; this is the `sub` claim in the session JWT |
| `email` | TEXT, UNIQUE | verified email, normalised to lowercase |
| `created_at` | INTEGER | epoch ms |

This is the **entire** server-side login record: a UUID + verified email + a
timestamp. No password, name, phone, or Google profile. The row is created by
`upsertAccount(email)` the first time an email-OTP **or** Google sign-in is
verified — so "sign in" and "sign up" are the same action, and both auth methods
for the same address resolve to the same account.

### `pairings` — parent ↔ child links
`backend/migrations/0001_init.sql` (+ `0003_child_led_pairing.sql`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT (PK) | pairing UUID |
| `account_id` | TEXT, nullable | the owning parent account (set when the parent joins) |
| `child_label` | TEXT, nullable | parent-chosen label, e.g. "Sita's phone" |
| `parent_public_key` | TEXT, nullable | parent device public key (set at join) |
| `child_public_key` | TEXT, nullable | child device public key (set at create) |
| `created_at` | INTEGER | epoch ms |
| `paired_at` | INTEGER, nullable | when the parent joined |

Only **public** keys are stored — they're used for the SAS check and to address
the encrypted channel. Private keys never leave the devices.

### `push_tokens` — alert delivery
`backend/migrations/0002_push_tokens.sql`

| Column | Type | Notes |
|--------|------|-------|
| `account_id` | TEXT | parent account |
| `token` | TEXT | FCM registration token |
| `created_at` | INTEGER | epoch ms |
| PK | (`account_id`, `token`) | one account can register several devices |

---

## Ephemeral storage — Cloudflare KV

| Key | Value | TTL | Set by |
|-----|-------|-----|--------|
| `otp:<email>` | **SHA-256 hash** of the 6-digit code | 10 min | `/auth/request`; deleted on verify |
| `code:<CODE>` | pairing id | 10 min | `/pair/create`; deleted on join |
| `summary:<pairingId>` | latest **encrypted** activity blob | — | `/sync` upload |
| `cmds:<pairingId>` | queued **encrypted** parent→child commands | — | `/cmd` send; cleared on ack |
| rate-limit keys | counters | short | `rateLimit()` |

The login OTP is never persisted in plaintext and never lands in D1 — only a
hash, for ten minutes. `summary:` and `cmds:` payloads are ciphertext the server
cannot read.

---

## Not stored anywhere server-side

- **Passwords** — the system is passwordless.
- **The session** — after verify the Worker signs a JWT (`{ sub: accountId,
  exp: +30 days }`) with `JWT_SECRET` and returns it. It lives **on the device**
  (Android `FamilyStore` / DataStore), not in the DB. The Worker is stateless
  about sessions: it re-verifies the JWT signature on each request
  (`authAccount` / `verifyJwt`).
- **Plaintext child activity** — browsing, app usage and block events are
  end-to-end encrypted; the server relays ciphertext only.
- **Private keys** — generated and held on each device.

---

## Deleting a parent's data

`DELETE /pair/:id` (owner-authenticated) removes the pairing row and its KV
traces (`summary:`, `cmds:`). Removing the `accounts` row and any
`push_tokens`/`pairings` for an account is an operator/SAR action against D1.
All migrations are **human-applied** to production (see root `CLAUDE.md` §13).
