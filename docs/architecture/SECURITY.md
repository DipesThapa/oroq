# OroQ — Security Model

Full findings + status: [../SECURITY_AUDIT.md](../SECURITY_AUDIT.md). This is the
design-level summary.

## 1. End-to-end encryption

- **Primitive:** Google Tink **HPKE** — `DHKEM_X25519_HKDF_SHA256 …
  AES_256_GCM`. A device encrypts *for* the peer's public key; only the peer's
  private key decrypts. The Worker holds only public keys + ciphertext.
- **Associated data:** the `pairingId` is authenticated as AEAD associated data,
  so a ciphertext bound to one pairing can't be replayed into another.
- **Version tag:** a 1-byte format version prefixes every ciphertext (clean
  future migration).
- **Keys:** each device generates its own HPKE keypair on first run (Tink
  CSPRNG). Public keys are exchanged at pairing; private keysets never leave the
  device.

## 2. Authentication

| Actor | Credential | Issued by | Verified |
|-------|-----------|-----------|----------|
| Parent | Session **JWT** (HS256, 30-day) | `/auth/verify` or `/auth/google` | HMAC + `exp`, then `account_id` ownership per request |
| Child | Per-pairing **bearer token** | `/pair/create` (returned once) | SHA-256 hash, constant-time compare |
| Login (email) | 6-digit OTP | `/auth/request` (Resend) | KV hash, 10-min TTL, **5-try cap** |
| Login (Google) | Google ID token | Google | RS256 vs JWKS; `aud`/`iss`/`exp`/`iat`/`nonce`/`email_verified` |

The child holds **no account** — the per-pairing token is what stops anyone who
merely learns a (non-secret) `pairingId` from reading the command queue,
ack-dropping the parent's commands, or overwriting the summary.

## 3. Pairing integrity (SAS)

The relay is untrusted, so it could swap the public keys during the handshake. A
6-digit **Short Authentication String** = `SHA-256(parentPub ‖ childPub)` is shown
on both devices and compared out-of-band by the humans. A key swap changes the
SAS, so the mismatch is caught. (Strengthening the SAS UX — type/scan vs
self-attest — is tracked as audit L2.)

## 4. Anti-replay & freshness

- **Commands:** each carries a parent send-`ts`; the child persists the highest
  applied `ts` and rejects anything not strictly newer. A captured command can't
  be re-injected.
- **Summaries:** the server stamps `receivedAt`; the parent judges
  online/offline on that, not the child-supplied timestamp — so a tampered child
  can't fake "last seen just now".

## 5. On-device tamper resistance (consumer model)

OroQ's stance is **detect-and-alert**, not prevention — a determined device owner
can ultimately uninstall (true prevention needs Device Owner / managed-device
enrollment, parked for a future schools SKU). Within that:

- **Default-deny** app access (new installs blocked until approved); the home
  launcher and system UI (settings, permission dialog, installer, dialer) are
  never blocked.
- **ClockGuard** projects trusted time from a monotonic anchor → schedule/limit
  curfews survive wall-clock changes.
- **Fail-loud:** losing Usage Access or the VPN flips the notification and fires
  an expedited parent push.
- **BootReceiver** restarts protection after a reboot.
- **Wire/transport:** HTTPS-only in release (cleartext is debug-only);
  `usesCleartextTraffic` is absent from the release manifest.

## 6. Privacy posture

- DNS filtering runs **on the child device**; browsing history/content never
  leaves it. Only the **domain** of a *blocked* query is recorded.
- Activity summaries are **end-to-end encrypted** to the parent; the server
  can't read them. The only server-side plaintext PII is the parent email.
- No advertising ID, no analytics, no third-party SDKs beyond FCM (push) and
  Google Identity (sign-in). FCM auto-init and Firebase analytics are disabled.
- Account + data deletion is self-serve (`DELETE /account`).

## 7. Threat model snapshot

| Adversary | Mitigation |
|-----------|-----------|
| Network MITM | HTTPS; E2E encryption; SAS-verified keys |
| Malicious/compromised relay | E2E (can't read); AAD pairing-binding; *(e2e command sender-auth = audit M1, deferred)* |
| Someone who learns a pairingId | Child bearer token required on child endpoints |
| OTP brute force | 5-try cap + IP throttle on verify |
| Pairing-code brute force | ~39-bit code, single-use, 10-min TTL, IP-throttled join |
| Tech-savvy child | Default-deny, clock-guard, fail-loud, boot-restart (within non-MDM limits) |
| Cross-pairing replay | AAD = pairingId; per-command monotonic ts |

Open hardening items (non-blocking, tracked in the audit): **M1** e2e command
sender-authentication, **L1** keystore-wrapping the on-device keyset, **L2** SAS
type/scan UX.
