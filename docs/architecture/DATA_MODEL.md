# OroQ — Data Model

Three storage surfaces: **D1** (durable relational), **KV** (ephemeral), and
**on-device DataStore**. The design principle: the server holds the *minimum*
plaintext (parent email + public keys + token hashes); everything about the
child's activity is ciphertext.

---

## 1. D1 (SQLite) — `oroq-family`

Migrations `0001`–`0005`, append-only, human-applied to prod.

### `accounts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | uuid |
| `email` | TEXT UNIQUE | parent email (only plaintext PII) |
| `created_at` | INTEGER | epoch ms |

### `pairings` (one child↔parent link)
| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | the **pairingId** (uuid); also the KV key root |
| `account_id` | TEXT (nullable) | parent account; null until parent joins (0003) |
| `child_label` | TEXT | display name (e.g. "Dipesh") |
| `parent_public_key` | TEXT (nullable) | parent HPKE public keyset (b64); null until join |
| `child_public_key` | TEXT | child HPKE public keyset (b64) |
| `child_token_hash` | TEXT (nullable) | SHA-256 of the child bearer token (0004) |
| `created_at` / `paired_at` | INTEGER | created by child / when parent joined |

### `push_tokens`
| Column | Type | Notes |
|--------|------|-------|
| `account_id` | TEXT | parent account |
| `token` | TEXT | FCM registration token |
| `created_at` | INTEGER | |

### `rate_limits` (0005 — atomic fixed-window counter)
| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | `rl:<scope>:<ip|email>` |
| `count` | INTEGER | hits in the current window |
| `expires_at` | INTEGER | window end (epoch ms) |

---

## 2. KV — ephemeral / opaque

| Key | Value | TTL | Written by |
|-----|-------|-----|-----------|
| `otp:{email}` | SHA-256 of the 6-digit login code | 10 min | `/auth/request` |
| `otpfail:{email}` | wrong-guess counter | 10 min | `/auth/verify` |
| `code:{CODE}` | pairingId | 10 min | `/pair/create` |
| `summary:{pairingId}` | `{ c: ciphertext, r: receivedAt }` | 7 days | `/sync` upload |
| `cmds:{pairingId}` | JSON `[{id, ciphertext}]` queue | 24 h | `/cmd` send |
| `rl:{key}` | legacy limiter (superseded by D1 `rate_limits`) | window | — |

`summary` and `cmds` values are **opaque ciphertext** — the Worker never parses
the plaintext.

---

## 3. On-device storage (Jetpack DataStore)

Two Preferences DataStores, app-private:

### `family_config` (FamilyStore) — pairing & identity
- `device_role` — CHILD / PARENT
- `own_private_keyset` / `own_public_keyset` — this device's HPKE keypair (Tink)
- `parent_token` — parent session JWT (parent device)
- `child_token` — per-pairing bearer token (child device)
- `parent_link` — {pairingId, parent public key} (child device)
- `paired_children` — set of {pairingId, label, child public key} (parent device)
- `last_command_ts` — anti-replay high-water mark (child device)

> The private keyset is stored as plaintext protobuf in app-private storage and is
> **excluded from cloud backup** (`backup_rules.xml` / `data_extraction_rules.xml`).
> Keystore-wrapping is a tracked hardening follow-up (audit L1).

### `oroq_config` (ConfigRepository) — child enforcement settings
- `enabled_categories` — blocked DNS categories
- `blocked_apps` / `approved_apps` — app block list / default-deny allow set
- `approved_apps_seeded` — one-time seed flag
- `app_schedules_json` — per-app blocked-time windows
- `daily_limit_minutes`, `extra_minutes`, `extra_date` — screen-time budget
- `safe_search_on`, `yt_restricted_on`
- `clock_anchor_wall`, `clock_anchor_elapsed` — ClockGuard tamper anchor

---

## 4. The activity summary (wire payload, encrypted)

`FamilySummary` (child → parent, inside the ciphertext):

```
ts, protectionOn, permissionsOk,
screenTimeTodayMin, dailyLimitMin,
topApps: [{label(pkg), minutes}],        ← package names, resolved to labels parent-side
webBlockedToday, appBlockedToday,
recentEvents: [{ts, type(web|app), label(domain|app), cat}],   ← blocked domain, never full URL
categories, installedApps, blockedApps, approvedApps, schedules,
safeSearchOn, ytRestrictedOn
```

Only the **domain** of a blocked site is ever recorded — no full URLs, no page
content, no allowed-site history.
