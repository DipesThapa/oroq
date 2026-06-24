# OroQ — Backend API Reference

Base URL (prod): `https://oroq-family.cyberheroez.workers.dev`
All requests/responses are JSON. Two auth schemes:

- **Parent (JWT):** `Authorization: Bearer <session token>` (HS256, `sub`=accountId).
- **Child (token):** `x-child-token: <per-pairing bearer token>` (minted at pairing).

`{id}` is a pairing UUID, constrained by the router to `[0-9a-f-]{36}`.

---

## Health
| Method | Path | Auth | Returns |
|--------|------|------|---------|
| GET | `/health` | none | `{ ok: true }` |

## Auth — `auth.ts`
| Method | Path | Auth | Body → Returns |
|--------|------|------|----------------|
| POST | `/auth/request` | none (IP rate-limited) | `{email}` → `{ok}`; emails a 6-digit code |
| POST | `/auth/verify` | none (IP rate-limited, 5-try cap) | `{email, otp}` → `{token}` or `401 bad_otp` |
| POST | `/auth/google` | none (IP rate-limited) | `{idToken, nonce}` → `{token}` |

OTP is stored hashed in KV (10-min TTL), burned after 5 wrong tries. The session
token (`token`) is a 30-day JWT.

## Pairing — `pairing.ts`
| Method | Path | Auth | Body → Returns |
|--------|------|------|----------------|
| POST | `/pair/create` | none (IP rate-limited) | `{childPublicKey}` → `{pairingId, code, childToken, expiresInSec}` |
| POST | `/pair/join` | JWT (IP rate-limited) | `{code, parentPublicKey, childLabel?}` → `{pairingId, childPublicKey}` |
| GET | `/pair/{id}` | none | `{pairingId, childLabel, parentPublicKey, childPublicKey, paired, pairedAt}` |
| DELETE | `/pair/{id}` | JWT (must own) | `{ok}` — unpair: deletes pairing + its `summary:`/`cmds:` KV |

`childToken` is returned to the child **once** (only its hash is stored).

## Sync (encrypted activity) — `sync.ts`
| Method | Path | Auth | Body → Returns |
|--------|------|------|----------------|
| POST | `/sync/{id}` | **child token** (IP rate-limited) | `{ciphertext, notify?}` → `{ok}`; stores `{c, r:receivedAt}` |
| GET | `/sync/{id}` | JWT (must own) | → `{ciphertext, receivedAt}` |

Parent judges staleness on server `receivedAt`, not the child-supplied timestamp.

## Commands — `cmd.ts`
| Method | Path | Auth | Body → Returns |
|--------|------|------|----------------|
| POST | `/cmd/{id}` | JWT (must own) | `{ciphertext}` → `{id}`; appends to queue |
| GET | `/cmd/{id}` | **child token** | → `{commands:[{id, ciphertext}]}` |
| POST | `/cmd/{id}/ack` | **child token** (IP rate-limited) | `{ids:[…]}` → `{ok}`; drops them |

## Push — `push.ts`
| Method | Path | Auth | Body → Returns |
|--------|------|------|----------------|
| POST | `/push/register` | JWT | `{token}` → `{ok}`; stores the parent's FCM token |

## Account — `account.ts`
| Method | Path | Auth | Returns |
|--------|------|------|---------|
| DELETE | `/account` | JWT | `{ok}` — cascade-deletes account + all pairings (+ KV) + push tokens. Idempotent. |

---

## Error shape
`{ "error": "<code>" }` with an HTTP status. Common codes: `unauthorized` (401),
`forbidden` (403, wrong account), `not_found` (404), `bad_request`/`bad_email`/
`bad_otp`/`bad_code` (400/401/404), `rate_limited` (429), `not_paired` (409),
`server_error` (500).

## Authorization invariants
- Parent write/read of a pairing's data (`/sync` GET, `/cmd` POST, `/pair` DELETE,
  `/account`) verifies `pairings.account_id === jwt.sub`.
- Child endpoints (`/sync` POST, `/cmd` GET/ack) verify `SHA-256(x-child-token)
  === pairings.child_token_hash`, constant-time, always 401 on mismatch (no
  existence oracle).
- All D1 access is parameterized; pairing ids are regex-constrained at the router.
