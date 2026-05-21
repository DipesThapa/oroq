# SafeBrowse Android Parental Control — MVP Design

> **For agentic workers:** the next step after this spec is the `superpowers:writing-plans`
> skill — turn this design into a task-by-task implementation plan. Do not start
> implementation directly from this document.

**Date:** 2026-05-21
**Status:** Approved design, pending implementation plan.

---

## 1. Overview & goal

Build a **native Android parental-control app** for SafeBrowse that filters harmful
web content on a child's phone. The MVP is deliberately narrow: **on-device web
content filtering only**, installed as a single app on the child's device, with
PIN-locked parent settings.

This is the first step of a longer roadmap (see §11). It exists because a browser
extension cannot protect mobile devices, and a PWA cannot filter anything outside
its own sandbox — only a native app can.

## 2. Background & decision history

- The earlier **DoH/DNS MVP** (Cloudflare Worker + hosted resolver, Kids/Teens/Family
  levels) was built and then **cancelled on 2026-05-21**. Its `dns/`, `landing/`,
  and `profiles/` directories were removed (commit `429a424`).
- The agreed replacement direction is **native mobile parental-control apps**.
- **Android-first** was chosen over iOS-first because: the developer already owns a
  Google Play account; Android can be fully developed *and tested* for free, locally,
  with no upfront fee or platform approval; iOS would require the $99/year Apple
  Developer Program plus a gatekept Family Controls entitlement.
- The code is structured so it can later grow toward a unified cross-platform parent
  dashboard ("Approach C"), but that is **not** in this MVP.

## 3. Scope

### In scope — MVP (v1)

- A **single Android app**, installed on the **child's device**.
- **Web content filtering** via an on-device local VPN doing DNS-level filtering.
- **Category-based filtering** — the parent picks which categories to block.
- **PIN-locked parent settings** on the child's device.
- **Blocklist updates** via a one-way periodic download.

### Out of scope — deferred

- **v2:** app blocking + screen-time limits (needs the Accessibility API → higher
  Play Store policy risk); uninstall protection via Device Admin; custom per-domain
  allow/block overrides.
- **v3+:** a separate parent app, encrypted-relay device pairing, a unified
  cross-platform parent dashboard, and the iOS app.
- No user accounts, no parent app, no device pairing, no relay in the MVP.

## 4. Core constraints (locked)

1. **On-device, zero-retention for child data.** Browsing data is never logged and
   never leaves the device. It never reaches any company server.
2. The company stores **only parent/account data** in later phases; the MVP stores
   **nothing server-side at all** — it has no backend beyond a static blocklist file.
3. **Non-covert.** The app is visible to the child and clearly shows its status
   (required by Play Store policy and appropriate for UK child-safety norms).
4. **Fail-safe + honest status.** If filtering cannot run, the app shows a clear
   "Not Protected" state. It never displays a false "Protected" state.

## 5. Architecture — filtering mechanism

### 5.1 Local VpnService + DNS-level filtering

The app runs a `VpnService` that establishes a **local-only VPN** — there is no
remote VPN server; the VPN exists purely to intercept traffic on the device itself.

- The VPN inspects **DNS queries only** ("which domain is being requested").
- If the domain is in an enabled blocklist category → the query is **blocked**
  (sinkholed). Otherwise → forwarded to a real DNS resolver and returned normally.
- The app does **not** proxy or inspect full traffic. DNS-level filtering is
  lightweight, low-battery, sees only domain names (never content), and matches the
  zero-retention / privacy-first posture.

### 5.2 Known trade-offs

- **Domain-level only.** A whole domain is blocked or allowed; blocking a specific
  path on an otherwise-allowed domain is not possible. Acceptable for the MVP.
- **DoH bypass.** A browser using its own DNS-over-HTTPS (e.g. Chrome "Secure DNS")
  would bypass DNS interception. Mitigation: the app blocks connections to known
  public DoH endpoints (`cloudflare-dns.com`, `dns.google`, etc.), forcing the
  browser to fall back to system DNS, which the app controls. The DoH-endpoint list
  is maintained and ships through the same blocklist-update mechanism. This is a
  cat-and-mouse area; the app covers the common providers.

### 5.3 Foreground service

Android requires a `VpnService` to run as a **foreground service** with a persistent
notification and the system VPN key icon. This is treated as a feature: the child
can see protection is active, which satisfies the non-covert requirement automatically.

### 5.4 Components

| Component | Responsibility |
|-----------|----------------|
| VPN filter engine | `VpnService` subclass; reads packets, parses DNS, applies blocklist |
| Blocklist module | Loads blocklists into a fast in-memory lookup; handles updates |
| Config store | On-device persistence: hashed PIN, recovery code, enabled categories, on/off state |
| PIN / auth module | Set, verify, and gate access with the parent PIN |
| UI layer | The five screens (§7) |
| Blocklist updater | Background job that fetches updated blocklists |

### 5.5 Data flow

1. Child's browser/app issues a DNS query.
2. VPN filter engine intercepts it, extracts the domain.
3. Domain is checked against the in-memory lookup of enabled categories.
4. Blocked → a sinkhole/NXDOMAIN response is returned. Allowed → forwarded to a real
   resolver, response returned unchanged.
5. Nothing is logged; nothing is transmitted off-device.

## 6. Blocklist data & updates

### 6.1 Data sources

- **SafeBrowse curated core:** the per-category lists from the deleted
  `dns/data/sources/` (`adult`, `drugs`, `gambling`, `gaming`, `malware`, `phishing`,
  `social`, `violence`). These are recoverable from git history (the commit before
  `429a424`).
- These curated lists are small (the DoH MVP was a deliberately narrow slice). A real
  web filter needs far broader coverage, so each category is augmented with at least
  one **maintained, permissively-licensed open blocklist** from a community project.
  Specific lists are selected during implementation on the basis of licence (must be
  redistributable) and quality.

### 6.2 Build pipeline

A build script (adapting the deleted `dns/scripts/build-blocklist.mjs`) merges the
sources per category, deduplicates, normalises domains, and emits per-category list
files. These files are **bundled into the APK** as assets.

### 6.3 In-app storage & lookup

- The bundled lists ship inside the APK, so the app filters correctly **offline,
  immediately on install** — no network needed for first use.
- At runtime, the domains of enabled categories are loaded into an in-memory
  `HashSet<String>` for constant-time lookup. (If lists grow very large, a more
  compact structure can replace the HashSet later; HashSet is sufficient for the MVP.)
- Updated lists are stored in the app's private storage and take precedence over the
  bundled copy.

### 6.4 Updates

- A **WorkManager** periodic job (roughly weekly) fetches updated per-category lists
  from a **static file hosted on Cloudflare** (free tier; public, non-sensitive,
  versioned).
- The download is verified by version/checksum before being swapped in. On any
  failure, the last-known-good list is kept; the bundled list is the ultimate
  fallback. The app is never left without a blocklist.
- This is the **only** network interaction in the MVP, and it is a one-way download —
  no data about the child is sent.

## 7. App screens & UX

Five screens:

1. **Onboarding** (first launch): welcome → parent sets a **PIN** → a **recovery
   code** is generated and the parent is told to save it → parent selects categories
   to block → grants the system VpnService permission → done.
2. **Home / Status:** large, clear **"Protected"** / **"Off"** state and the enabled
   categories. This is what the child sees when opening the app — intentionally
   transparent.
3. **PIN entry:** shown whenever someone tries to open Settings or turn protection
   off. The gate.
4. **Settings** (PIN-locked): change categories, change PIN, view blocklist
   last-updated time, about/help.
5. **Blocked page:** when a blocked domain is requested over HTTP, the child sees a
   clear branded "blocked by SafeBrowse" page served from a local sinkhole. **Honest
   limitation:** for HTTPS domains (most of the web), DNS-level blocking causes the
   browser to show its own native connection-failure screen rather than a branded
   page — a fully branded HTTPS blocked page is not reliably possible with DNS-only
   filtering and is out of MVP scope.

### Filter model

The parent enables/disables **categories** (`adult`, `gambling`, `drugs`,
`social media`, `gaming`, `violence`, `malware/phishing`). There are **no fixed
Kids/Teens/Family levels** — the category-toggle model is more flexible, avoids
age-label framing, and maps directly to the curated data structure.

## 8. Edge cases & error handling

### Tamper

- **Child disables the VPN** from system settings: mitigated by Android **always-on
  VPN with lockdown**, which the parent enables once during setup; Android then
  re-establishes the VPN automatically. The in-app off toggle is PIN-gated. A
  tech-savvy child can still reach system VPN settings — full lockdown requires
  Device Owner mode, which is deferred beyond v2.
- **Child uninstalls the app:** **known MVP limitation — not prevented in v1.**
  Uninstall protection requires Device Admin and is deferred to v2.

### Reliability

- **VpnService killed by the OS:** the foreground service makes this rare; always-on
  VPN auto-restarts it; on restart the app re-establishes the VPN and reloads
  blocklists.
- **Blocklist update fails:** keep the last-known-good list; verify checksum before
  swapping; retry next cycle; bundled list is the ultimate fallback.
- **Battery optimisation:** during setup the parent is prompted to exempt the app
  from battery optimisation.
- **Another VPN already active:** Android allows only one VPN; the app detects the
  conflict and informs the parent.
- **VpnService permission denied/revoked:** the app detects it and shows a clear
  "Not Protected — tap to re-enable" state.

### PIN recovery

There is no account and no email, so PIN reset is handled by a **recovery code
generated at setup** that the parent is asked to save. This keeps the design
zero-retention — nothing leaves the device.

## 9. Testing strategy

1. **Unit tests** (JVM, no emulator — fast, heaviest coverage): DNS packet parsing;
   blocklist lookup and domain matching (subdomains, `www`, case, trailing dot,
   internationalised domains); PIN hash/verify; the blocklist build script; update
   version/checksum/fallback logic. The filter/blocklist logic is pure and
   TDD-friendly — the implementation plan should use test-driven development for it.
2. **Instrumented tests** (emulator/device): VpnService establishment, DataStore
   round-trip, filter engine end-to-end with a synthetic DNS query, WorkManager job.
3. **Manual real-device testing** (developer, on their own device/emulator, $0):
   real browsing (blocked vs allowed), the DoH-bypass test (Chrome "Secure DNS" on),
   always-on VPN behaviour, battery/Doze survival, onboarding UX.

## 10. UK / compliance constraints

- CyberHeroez CIC is UK-based. UK GDPR, the Data Protection Act 2018, and the ICO
  **Age Appropriate Design Code ("Children's Code")** apply to any child-facing
  service.
- The zero-retention, on-device architecture means the company collects and stores
  **no child data**, which shrinks data-controller liability to near zero. The
  company still owes **age-appropriate design** duties for the app itself.
- The app must remain **non-covert / non-stalkerware** — visible to the child, clear
  status. Apple and Google both reject covert monitoring apps.
- A privacy policy stating "we collect nothing" is still required.
- Proper legal / DPO sign-off should be obtained before public launch. This document
  is not legal advice.

## 11. Costs & external dependencies

- **Google Play developer account:** already owned — no additional cost.
- **Development & local testing:** $0 — Android Studio, the emulator, and local
  installs are free; no platform approval is needed to build or test.
- **Blocklist hosting:** Cloudflare free tier (static file) — ~$0.
- **No Apple costs** — iOS is out of scope for this MVP.

## 12. Repository & tech stack

- The Android app is a **new Kotlin/Gradle project** living in a new `android/`
  directory of the existing `safebrowse-ai` repository (consistent with how `dns/`,
  `landing/`, and `profiles/` were previously organised as sibling sub-projects).
- **Kotlin + Jetpack Compose** for the UI.
- **DataStore** for settings persistence.
- **WorkManager** for the periodic blocklist update.
- **Foreground service** for the VpnService.
- **Minimum Android version: 8.0 (API 26)** — covers the large majority of devices
  and supports always-on VPN lockdown.

## 13. Post-MVP roadmap

- **v2:** app blocking + screen-time limits; uninstall protection (Device Admin);
  custom per-domain allow/block overrides.
- **v3+:** separate parent app; encrypted-relay device pairing (reusing the existing
  `relay/` pattern); unified cross-platform parent dashboard; the iOS app (Apple
  Family Controls).
