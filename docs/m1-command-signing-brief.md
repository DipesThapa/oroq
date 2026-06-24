# M1 — End-to-end command sender authentication (scoping brief)

**Status:** deferred / not started. Phase 2 of the crypto-hardening work (phase 1 —
AAD binding, version tag, anti-replay — shipped in PR #15).
**Audit ref:** M1 in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) (Medium).

## The problem

OroQ's E2E channel uses Tink **hybrid encryption** (HPKE X25519 / AES-256-GCM):
the parent encrypts a command *to the child's public key*. Hybrid encryption
gives confidentiality but **not sender authentication** — anyone holding the
child's public key can craft a ciphertext the child will decrypt and apply. The
child's public key is not secret (it's returned by the unauthenticated
`GET /pair/:id`). The child currently applies **any** command that decrypts
(`CommandSync.pollAndApplyCommands`).

Today the only thing stopping a forged command is **backend authorization** —
`cmdSend` requires the owning parent's JWT (`backend/src/cmd.ts`). So the threat
is not a random internet attacker; it is:

- a **compromised or malicious relay/backend** injecting `SET_PROTECTION=0`, or
- any **future authz regression** on the `/cmd` POST path.

M1 closes this with defense-in-depth: the child verifies each command was
**signed by the bound parent**, independent of what the backend says.

## Why it was deferred

- Real protocol work: a **second keypair per device** + a **pairing-handshake
  change**, vs phase 1 which was self-contained.
- Lower urgency than C1/H2: phase 1 already binds ciphertexts to the pairing and
  blocks replay; C1 authenticates the channel. M1 only matters once you don't
  trust your own backend — a deliberate "zero-trust relay" stance, which matches
  the product's E2E promise but isn't load-bearing for launch.

## Proposed design — signed-then-encrypted, with a bundled signing key

Add an **Ed25519 signing keypair** alongside each device's existing hybrid
keypair (`tink-android:1.15.0` already ships `signature` / Ed25519).

1. **Key generation.** Each device generates a signing keypair at first run
   (next to `getOrCreateKeyPair`). Store both private keysets locally.
2. **Pairing exchange.** The "public key" exchanged at pairing becomes a JSON
   **bundle**: `{"hyb": "<hybrid pub>", "sig": "<signing pub>"}`. Because the
   backend stores/relays the public key as an **opaque TEXT string** (verified:
   `pairings.child_public_key` / `parent_public_key`, relayed as `pk`), bundling
   needs **no backend migration** — only the Kotlin parse/serialize changes.
3. **SAS covers both.** `FamilyCrypto.sas` already hashes the public-key
   *strings*; if the stored string is the bundle, the SAS automatically commits
   to both keys — so a relay can't swap just the signing key. (Confirm this when
   implementing; do not let the SAS hash only the hybrid key.)
4. **Send (parent).** `sendCommand`: sign the command JSON with the parent's
   signing private key; HPKE-encrypt `{cmd, sig}` to the child (keep phase-1 AAD
   + version + `ts`).
5. **Apply (child).** `pollAndApplyCommands`: after decrypt, **verify the
   signature against the SAS-pinned parent signing public key** before applying;
   drop on failure.
6. **(Optional, symmetric) summaries.** A summary is encrypted *to the parent*,
   so anyone with the parent's hybrid pubkey could forge one. Having the **child
   sign** its summaries closes the mirror gap. Scope M1 to commands first;
   note summary-signing as a fast follow on the same machinery.

## Files touched (estimate)

- `family/FamilyCrypto.kt` — add `generateSigningKeyPair()`, `sign()`, `verify()`.
- `family/FamilyStore.kt` — store this device's signing keypair; store the peer's
  signing public key (extend `PairedChild` / `ParentLink`).
- `family/FamilyModels.kt` + `FamilyApi.kt` — bundle parse/serialize for
  create/join/get payloads.
- `ui/child/ChildScreens.kt` + parent `AddChildScreen` — build/consume the bundle
  during pairing; SAS over the bundle.
- `parent/ParentRepository.kt` (`sendCommand`) — sign.
- `family/CommandSync.kt` — verify before apply.
- Tests: `FamilyCryptoTest` (sign/verify, wrong-key rejection), `CommandSync`
  verify-rejects-unsigned, pairing round-trip with the bundle.
- **No backend change, no migration** (bundle rides the existing string field).

**Effort:** ~2–3 days incl. tests. **Breaking:** changes the pairing wire format →
re-pair required (fine pre-launch; same re-pair as C1).

## Risks / gotchas

- **SAS must commit to both keys** — the highest-value mistake to avoid. If the
  SAS only covers the hybrid key, a key-swapping relay defeats the whole feature.
- Two keypairs per device → double the key-management surface; keep generation +
  storage in one place.
- Don't regress phase 1: AAD, version tag, and the `ts` anti-replay must stay.
- Backend remains the first line of defense (`cmdSend` authz) — M1 is *additive*,
  not a replacement.

## Decision points before starting

1. **Commands only, or commands + summaries** (symmetric signing)? Recommend
   commands first, summaries as a fast follow.
2. **Bundle the keys** (no migration, recommended) **vs** add real DB columns
   (cleaner schema, needs a migration). Bundling is simpler and the backend never
   inspects the key.
3. Land it as its **own PR on top of #15** (depends on the phase-1 channel work).
