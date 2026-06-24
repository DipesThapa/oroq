# OroQ — Key Flows

Sequence/flow diagrams for the core journeys. Participants:
**C** = child device, **P** = parent device, **W** = Worker, **D1/KV** = stores.

---

## 1. Parent authentication (email OTP)

```mermaid
sequenceDiagram
    participant P as Parent app
    participant W as Worker
    participant KV
    participant R as Resend
    P->>W: POST /auth/request {email}
    W->>KV: put otp:{email} = SHA256(code) (TTL 10m), clear otpfail
    W->>R: send 6-digit code
    R-->>P: email with code
    P->>W: POST /auth/verify {email, otp}
    Note over W: rate-limit by IP,<br/>burn OTP after 5 wrong tries
    W->>KV: get otp:{email}, compare
    W-->>P: { token } (JWT HS256, sub=accountId, 30d)
```

Google sign-in is equivalent: `POST /auth/google {idToken, nonce}` → Worker
verifies the Google ID token (RS256 vs JWKS, `aud`/`iss`/`exp`/`nonce`) → same
session JWT. Accounts link by verified email.

---

## 2. Child-led pairing (with SAS)

```mermaid
sequenceDiagram
    participant C as Child app
    participant W as Worker
    participant P as Parent app
    C->>C: generate device keypair (Tink)
    C->>W: POST /pair/create {childPublicKey}
    W->>W: store pairing (child key, hash(childToken))
    W-->>C: { pairingId, code, childToken }
    Note over C: show code + QR, persist childToken,<br/>poll GET /pair/:id
    P->>W: POST /pair/join {code, parentPublicKey} (JWT)
    W->>W: bind account_id + parent key to pairing
    W-->>P: { childPublicKey }
    Note over C,P: both compute SAS = SHA256(parentPub‖childPub)[:6 digits]
    C->>C: SAS shown
    P->>P: SAS shown
    Note over C,P: humans compare the 6 digits aloud
    P->>P: "They match" → store ParentLink (pin child key)
    C->>C: "They match" → store ParentLink (pin parent key) → start protection
```

**Why SAS:** the Worker relays the public keys, so a malicious relay could swap
them (MITM). The out-of-band human comparison detects a swap.

---

## 3. Activity sync (child → parent, E2E)

```mermaid
sequenceDiagram
    participant C as Child (FamilySyncWorker)
    participant W as Worker
    participant KV
    participant P as Parent (ParentRepository)
    Note over C: build FamilySummary (screen time, top apps,<br/>block events, protection/permission state)
    C->>C: ct = HPKE_encrypt(parentPubKey, summary, AAD=pairingId)<br/>+ version byte
    C->>W: POST /sync/:id {ciphertext, notify?} + x-child-token
    W->>W: requireChildToken (hash compare)
    W->>KV: put summary:{id} = { c: ct, r: now }
    opt notify
        W->>P: FCM push (threat blocked)
    end
    P->>W: GET /sync/:id (JWT, owns pairing)
    W-->>P: { ciphertext, receivedAt }
    P->>P: summary = HPKE_decrypt(ownPriv, ct, AAD=pairingId)
    Note over P: staleness judged on server receivedAt,<br/>NOT the child-supplied ts (anti-spoof)
```

---

## 4. Remote command (parent → child, E2E + anti-replay)

```mermaid
sequenceDiagram
    participant P as Parent
    participant W as Worker
    participant KV
    participant C as Child (CommandSync poll)
    P->>P: cmd = {type, value, ts=now},<br/>ct = HPKE_encrypt(childPubKey, cmd, AAD=pairingId)
    P->>W: POST /cmd/:id {ciphertext} (JWT + owns pairing)
    W->>KV: append cmds:{id} (id, ct)
    Note over C: every ~60s (or in sync worker)
    C->>W: GET /cmd/:id + x-child-token
    W-->>C: { commands:[{id, ciphertext}] }
    loop each command
        C->>C: cmd = HPKE_decrypt(ownPriv, ct, AAD=pairingId)
        alt cmd.ts ≤ last applied ts (replay)
            C->>C: skip
        else newer
            C->>C: apply (set protection / approve apps / limit / grant time / schedule)
            C->>C: record applied id + advance high-water ts
        end
    end
    C->>W: POST /cmd/:id/ack {ids} + x-child-token  (server drops them)
```

Command types: `SET_PROTECTION`, `SET_CATEGORIES`, `SET_SAFE_SEARCH`,
`SET_YT_RESTRICTED`, `SET_BLOCKED_APPS`, `SET_APPROVED_APPS`, `SET_APP_SCHEDULE`,
`SET_DAILY_LIMIT`, `GRANT_EXTRA_TIME`.

---

## 5. On-device enforcement (child monitor tick)

```mermaid
flowchart TD
    A[Foreground app sampled<br/>~1s] --> B{Own app /<br/>BlockActivity?}
    B -->|yes| Z[Allow]
    B -->|no| T[ClockGuard: trusted time<br/>from monotonic anchor]
    T --> C{System-critical?<br/>launcher, dialer, settings,<br/>permission UI, installer}
    C -->|yes| Z
    C -->|no| D{Approved app?<br/>default-deny}
    D -->|no| BU[Block: 'Not allowed yet']
    D -->|yes| E{Inside a blocked<br/>schedule window?}
    E -->|yes| BS[Block: schedule]
    E -->|no| F{In blocked-apps list?}
    F -->|yes| BA[Block: app]
    F -->|no| G{Daily limit reached?<br/>today ≥ limit + extra}
    G -->|yes| BT[Block: time up]
    G -->|no| Z
```

And DNS filtering (VPN loop), independent of the above:

```mermaid
flowchart TD
    Q[DNS query on TUN] --> P{Parse IPv4/UDP/DNS}
    P -->|malformed| AL[Forward upstream]
    P -->|ok| M{Domain in a blocked<br/>category? safe-search?<br/>yt-restricted?}
    M -->|block| SINK[Sinkhole response<br/>log domain + maybe push]
    M -->|rewrite| RW[Safe-search / restricted CNAME]
    M -->|allow| UP[Forward to upstream resolver<br/>over protected socket]
```

---

## 6. Account deletion (Play compliance)

```mermaid
sequenceDiagram
    participant P as Parent (More → Delete account)
    participant W as Worker
    P->>W: DELETE /account (JWT)
    W->>W: for each pairing: delete summary:{id}, cmds:{id} (KV)
    W->>W: DELETE pairings, push_tokens, accounts (D1)
    W-->>P: { ok }
    P->>P: clear local session + child records → login
```
