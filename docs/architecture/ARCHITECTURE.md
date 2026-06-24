# OroQ — System Architecture

## 1. High-level diagram

```mermaid
graph TB
    subgraph CHILD["📱 Child device (OroQ, CHILD role)"]
        CVPN["OroQVpnService<br/>local DNS filter"]
        CMON["AppMonitorService<br/>default-deny + screen-time"]
        CSYNC["FamilySyncWorker<br/>(WorkManager ~15m)"]
        CCRYPTO["FamilyCrypto<br/>Tink HPKE"]
        CSTORE["FamilyStore / ConfigRepository<br/>(DataStore)"]
    end

    subgraph PARENT["📱 Parent device (OroQ, PARENT role)"]
        PUI["Compose dashboard<br/>(ParentViewModel)"]
        PREPO["ParentRepository"]
        PCRYPTO["FamilyCrypto<br/>Tink HPKE"]
        PFCM["FCM token"]
    end

    subgraph EDGE["☁️ Cloudflare Worker (oroq-family) — zero-knowledge relay"]
        ROUTER["index.ts router"]
        AUTH["auth · pairing · account"]
        RELAY["sync · cmd (ciphertext only)"]
        PUSH["push (FCM v1)"]
        D1[("D1 / SQLite<br/>accounts, pairings,<br/>push_tokens, rate_limits")]
        KV[("KV<br/>otp, code, summary,<br/>cmds, ratelimit")]
    end

    RESEND["Resend (email OTP)"]
    GOOGLE["Google Identity (sign-in)"]
    FCMSVC["Firebase Cloud Messaging"]
    UPSTREAM["Upstream DNS resolver"]

    CVPN -->|allowed queries| UPSTREAM
    CSYNC -->|"POST /sync (x-child-token)<br/>ciphertext"| ROUTER
    CSYNC -->|"GET/ack /cmd (x-child-token)"| ROUTER
    CCRYPTO --- CSYNC
    CSTORE --- CSYNC

    PUI --> PREPO
    PREPO -->|"GET /sync, POST /cmd (JWT)"| ROUTER
    PREPO -->|"/auth, /pair, /account (JWT)"| ROUTER
    PCRYPTO --- PREPO

    ROUTER --> AUTH --> D1
    ROUTER --> RELAY --> KV
    RELAY --> D1
    ROUTER --> PUSH --> FCMSVC --> PFCM
    AUTH --> RESEND
    AUTH --> GOOGLE
    AUTH --> KV
```

## 2. The three tiers

### A. Child device — the enforcement engine
Everything that actually *protects* runs here, locally, with no dependency on the
network for enforcement:

- **`OroQVpnService`** (`vpn/`) establishes a local VPN that routes **only DNS**
  to an on-device resolver loop. `DnsFilter` (`filter/`) checks each query against
  category blocklists; blocked queries get a sinkhole response, allowed ones are
  forwarded to the upstream resolver over a protected socket. Browsing content
  never leaves the device; only the *domain* of a blocked query is logged.
- **`AppMonitorService`** (`monitor/`) polls the foreground app once per second
  and applies `decideBlock(...)` — a pure function with precedence:
  system-critical → default-deny (unapproved) → schedule window → blocked app →
  daily-limit. It shows `BlockActivity` when needed. Time comes from
  **`ClockGuard`** (monotonic anchor) so clock tampering can't skip curfews.
- **`FamilySyncWorker`** (`family/`) every ~15 min builds an activity summary,
  encrypts it for the parent, uploads it, and drains the parent command queue.
- **`BootReceiver`** (`boot/`) restarts the services after a reboot.

### B. Parent device — the control plane
Pure client of the backend, no enforcement:

- **`ParentViewModel` / `ParentRepository`** (`parent/`) fetch + decrypt the
  child's latest summary, derive dashboard stats (`Insights`,
  `ConfidenceScore`), and send encrypted commands.
- Compose screens: dashboard, activity timeline, devices, device-detail
  (per-child controls), more/settings.

### C. Cloudflare Worker — the zero-knowledge relay
Stateless request router (`index.ts`) over D1 + KV:

- **Account/auth/pairing** is the only place plaintext identity lives (parent
  email, pairing public keys, child-token hashes).
- **Sync/cmd** are opaque ciphertext stores keyed by `pairingId`; the Worker
  never decrypts.
- **Push** sends FCM alerts to the parent (e.g. a threat was blocked).

## 3. Layering inside the Android app

```
UI (Compose screens, Activities)
        │   observes
ViewModel (ParentViewModel)  ── state ──►  UI
        │   calls
Repository (ParentRepository) / Worker (FamilySyncWorker, AppMonitorService)
        │   uses
Domain  (FamilyCrypto, decideBlock, ClockGuard, DnsFilter, Insights)   ← pure, unit-tested
        │   persists / transports
Data    (FamilyStore, ConfigRepository = DataStore) · FamilyApi (HTTP) · KV/D1 (server)
```

Pure domain logic (`decideBlock`, `ClockGuard`, `DnsFilter`, `Insights`,
`FamilyCrypto`, summary/command (de)serialization) is isolated from Android/IO so
it is unit-tested without a device (~152 Android unit tests; 10 backend suites).

## 4. Process / lifecycle model (child)

```mermaid
stateDiagram-v2
    [*] --> Onboarding: first launch (CHILD)
    Onboarding --> Pairing: show code, await parent join + SAS
    Pairing --> Protected: confirm → start services + WorkManager
    Protected --> Protected: 1s monitor tick · 15m sync · DNS filter
    Protected --> Degraded: permission revoked / VPN lost
    Degraded --> Protected: permission restored
    Protected --> Rebooted: device reboot
    Rebooted --> Protected: BootReceiver restarts services
    Degraded --> [*]: (parent alerted via expedited push)
```
