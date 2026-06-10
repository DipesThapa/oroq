# OroQ — Privacy-first Family Safety

[![CI](https://github.com/DipesThapa/oroq/actions/workflows/ci.yml/badge.svg)](https://github.com/DipesThapa/oroq/actions/workflows/ci.yml) [![CodeQL](https://github.com/DipesThapa/oroq/actions/workflows/codeql.yml/badge.svg)](https://github.com/DipesThapa/oroq/actions/workflows/codeql.yml) [![Release](https://github.com/DipesThapa/oroq/actions/workflows/release.yml/badge.svg)](https://github.com/DipesThapa/oroq/actions/workflows/release.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**OroQ — *See Risk. Act With Confidence.*** A privacy-first web-safety suite for families, schools, and workplaces. All filtering and decisioning happens **on-device**; activity a parent sees is **end-to-end encrypted**, so OroQ's own servers can't read it. Built and maintained by CyberHeroez CIC.

OroQ ships as two complementary products that share one backend:

| Component | What it is | Path |
|---|---|---|
| **Browser extension** | On-device web filtering for Chromium / Firefox / Safari | repo root (`manifest.json`, `src/`) |
| **Android app** | Parent + child family app — web/app blocking, screen-time, instant alerts | `android/` |
| **Family backend** | Cloudflare Worker for passwordless parent accounts, device pairing, encrypted sync, FCM push | `backend/`, `relay/` |

---

## 1. Browser extension

A lightweight, on-device extension that reduces exposure to harmful content without sending browsing data anywhere.

### Features
- **Advanced heuristics**: weighted URL/title/meta/body scoring with sensitivity control
- **On-page protection**: optional Aggressive mode to blur/pause images/videos on-device
- **Visual detection**: image heuristics sample pixels to escalate or block graphic imagery even without text
- **Domain blocklist**: packaged defaults + user-importable list; allowlist overrides
- **Sensitivity profiles**: Kids (7-12), Teens (13-16), College, and Work presets tuned for safeguarding and productivity goals
- **Explain why this was blocked**: interstitial gives kid-friendly reasoning, safe suggestions, and rotating AI literacy micro-lessons
- **Family setup wizard**: 30-second onboarding for age presets, PIN, and Focus defaults
- **Conversation starters**: parent card with topic-only scripts when content is blocked (no URLs stored)
- **Kid reports**: “Report unsafe page” button (host + optional note, stored locally, PIN-gated view)
- **Healthy nudges**: gentle break reminders and wellbeing prompts, all on-device
- **Weekly tips**: local digital-safety tips delivered once per week
- **Focus Mode**: homework/study timer that blocks social/gaming/streaming and allows edu sites
- **Classroom Mode**: teacher lockdown (social/gaming blocked, YouTube playlists only, overrides locked)
- **SafeSearch enforcement**: redirects Google/Bing to strict modes (DNR)
- **Control centre**: refreshed popup with live status badge, quick toggles, and policy management in one place
- **First-run tour**: onboarding highlights key controls and policy workflows for new admins
- **Static ad rules**: common ad/marketing domains blocked via DNR
- **PIN protection**: require a PIN before overrides or allowlist edits, capturing on-device reason & approver logs
- **Secure alerts**: HTTPS-only override/tamper webhooks (no localhost/LAN/creds) with PIN-locked setup
- **OroQing digest**: export a weekly CSV summary of settings and override activity for DSL reviews
- **Override alerts**: optional PIN-protected webhooks (Slack/Teams/email) with approver names for instant oversight
- **Encrypted override log**: AES-GCM at rest; stores timestamp, host, reason, and approver only (no full URLs)
- **Interstitial**: blocked page with timed “Show anyway” override (per tab/session)

### Business-ready capabilities
- **Privacy by design**: all analysis and decisioning stays on-device; no browsing data is transmitted.
- **Policy controls**: organisation-wide allowlists & custom blocklists with import/export workflows.
- **Deployment friendly**: minimal permissions (`storage`, `declarativeNetRequest`) and no background polling.
- **Support collateral**: ready-made privacy policy, security briefing (`SECURITY.md`), support workflows (`SUPPORT.md`), UK safeguarding packs (`docs/KCSIE_COMPLIANCE_MATRIX.md`, `docs/PREVENT_DUTY_BRIEFING.md`, `docs/DPIA_TEMPLATE_UK.md`), and age-based profile presets.
- **Managed Chrome guidance**: see [docs/WEBSTORE.md](docs/WEBSTORE.md) for publishing, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for rollout playbooks, and [SUPPORT.md](SUPPORT.md) for help desk scripts.

Hosted resources
- Bundled static pages (packaged inside the extension): `site/index.html`, `site/privacy.html`, `site/support.html`
- Optional public hosting: host `site/` on cyberheroez.co.uk (or enable GitHub Pages) and point the Chrome Web Store listing + homepage to those URLs.

### Browser support
- Chromium browsers (Chrome/Edge/Brave/Vivaldi/Opera): load the repo folder directly (contains `manifest.json`).
- Firefox: build and load `dist/firefox/manifest.json` (see `docs/BROWSER_SUPPORT.md`).
- Safari: convert via Apple’s Safari Web Extension tooling (see `docs/BROWSER_SUPPORT.md`).

### Dev setup
1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open the popup → toggle **Enable protection** (badge shows **Active**)
4. Optional: toggle **Aggressive mode** and adjust **Sensitivity**
5. Optional: paste domains (one per line) into **Blocklist → Import/Replace**
   - or edit `data/blocklist.json` and reload the extension
6. For private windows: open extension details → enable **Allow in Incognito**

### Quick setup (parents)
1. Enable protection in the popup.
2. Run the Family Setup Wizard → pick age profile → set PIN (for overrides) → set Focus default.
3. Turn on Conversation starters and Weekly tips (optional).
4. Show your child the “Report unsafe page” button; review reports in Parent mode.

### Quick setup (teachers)
1. Enable protection; apply Classroom Mode when teaching.
2. Add approved YouTube playlists/videos if needed; overrides stay locked.
3. Use Focus Mode presets for study blocks; allow comms tools only if required.
4. Review Child reports/Overrides in Parent mode (PIN-gated).

### Privacy/Security at a glance
- All analysis runs locally; no browsing history or page content is sent anywhere.
- Kid reports store only timestamp + host + optional note; conversation starters store topic only.
- Override logs are encrypted locally; webhooks require HTTPS and no LAN/localhost.
- Web-accessible resources are limited; SafeSearch and DNR rules enforced; PIN hashes are salted/iterated.

Notes:
- Content script is `src/content.js` (manifest aligned). The legacy `content.js` remains in repo but is not loaded.
- Permissions: `storage`, `declarativeNetRequest`, `tabs`; scripts run on `http/https` pages only (tabs permission is used to show the active site toggle).
- Web-accessible resources limited to `https://*/*` (no localhost/LAN) to reduce fingerprinting.
- DNR rules are rebuilt on install/startup and when allowlist/blocklist change.
- Interstitial uses safe DOM APIs; “Show anyway” temporarily allows the current host for this tab/session.

### Limitations
- Chrome’s dynamic DNR rules have capacity limits (~30k). Very large custom imports are truncated.
- Visual detection is heuristic-based; cross-origin videos may block pixel reads (skipped).

---

## 2. Android app (`android/`)

A single APK with **two roles**, chosen on first launch:

- **Child phone** — on-device DNS filtering via a local-only `VpnService` (no traffic leaves the device), app blocking and screen-time limits, Safe Search / YouTube Restricted enforcement, and a visible "protected" status. Designed slim per the UK Age Appropriate Design Code: the child is never covertly monitored.
- **Parent phone** — a Jetpack Compose dashboard (deck design v1.0): a **Cyber Confidence** gauge, threat/activity feed, per-device protection toggles, screen-time controls, insights, and **instant push alerts** when a child is blocked from a threat.

**Pairing** is end-to-end encrypted: the parent generates an 8-character code (or QR); the child joins; both confirm a matching 6-digit security number before the link is trusted (Tink HPKE over X25519). The child's activity summary is encrypted **for the parent device only** — the server stores an opaque blob it cannot read.

**Sign-in:** parents use one-tap **Sign in with Google** (Android Credential Manager, no Firebase Auth SDK) or a passwordless email code as fallback.

**Instant alerts:** a threat block fires an expedited, encrypted sync; the worker sends an FCM push carrying only IDs (never the domain or category) so the parent is notified within seconds. Push registers on the parent role only — the child never gets a Google push identifier.

### Tech stack
Kotlin · Jetpack Compose · Material3 · CameraX + ZXing (QR) · Tink (E2E crypto) · WorkManager (sync) · Credential Manager (Google sign-in) · Firebase Cloud Messaging (parent push only). `applicationId uk.co.cyberheroez.oroq`, minSdk 26, targetSdk 36.

### Build & run
```bash
cd android
./gradlew assembleDebug          # build the debug APK
./gradlew testDebugUnitTest      # unit tests (stat derivation, crypto, DNS, API)
./gradlew connectedDebugAndroidTest   # Compose UI tests (needs a device/emulator)
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Design specs and implementation plans live in `docs/superpowers/`.

### Activation prerequisites (owner-supplied)
- **Google sign-in:** an OAuth web client id in `FamilyConfig.GOOGLE_WEB_CLIENT_ID` + the worker `GOOGLE_CLIENT_ID` var. Blank → the button hides itself.
- **Push:** `android/app/google-services.json` (Firebase project), the `com.google.gms.google-services` plugin, and the worker secret `FCM_SERVICE_ACCOUNT` + `FCM_PROJECT_ID` var. Unset → push stays dormant, app runs normally.

> Note: aggressive-OEM phones (Vivo, Oppo, Xiaomi) suppress background FCM unless the app is added to their auto-start / battery allowlist. Stock Android (Pixel, most others) delivers instantly.

---

## 3. Family backend (`backend/`, `relay/`)

A dependency-light **Cloudflare Worker** (D1 + KV) providing:
- Passwordless parent auth (email OTP via Resend) and **Sign in with Google** (WebCrypto ID-token verification — no SDK).
- Device pairing (single-use codes, ≤10-min TTL) and unpair.
- Encrypted summary sync (opaque blobs, 7-day TTL) and encrypted parent→child commands (24-h TTL).
- **FCM push** (HTTP v1, service-account token minted with WebCrypto) — IDs-only payloads.

```bash
cd backend
npm test            # vitest (49 tests: auth, pairing, sync, push, crypto)
npm run typecheck
npx wrangler dev     # local
npx wrangler deploy  # production (operator)
```
Migrations live in `backend/migrations/` and are **human-applied to production** D1. The optional pairing relay (WebRTC-style signalling) is in `relay/cloudflare/`.

---

## Roadmap
- **Extension:** on-device visual model for stronger image/video detection; options-page polish; Chrome Web Store listing.
- **App:** per-category alert preferences and quiet hours; richer insights once server-side history lands; parent web portal (deck panel 14).
- **Backend:** server-side Cyber Confidence scoring; threat-event history beyond the rolling on-device window.

---

## Community
- Code of Conduct: see `CODE_OF_CONDUCT.md`
- Contributing guide: see `CONTRIBUTING.md`
- Security policy: see `SECURITY.md` (report via GitHub advisories)
- Support: see `SUPPORT.md`
- Publisher: CyberHeroez CIC — https://cyberheroez.co.uk/
- Maintainer: dipesthapa (dipesh@cyberheroez.co.uk)

## Store / distribution
**Extension (Chrome Web Store):**
- Publishing workflow: `.github/workflows/publish-webstore.yml`
- Setup + credentials + manual upload: `docs/WEBSTORE.md`
- Listing content template: `docs/STORE_LISTING.md`
- Build zip for upload: `npm run zip:webstore` (outputs `dist/extension.zip`)

**Android app (Google Play):**
- Privacy policy: `docs/PRIVACY_ANDROID.md` · Data Safety mapping: `docs/PLAY_DATA_SAFETY.md`
- UK compliance packs: `docs/KCSIE_COMPLIANCE_MATRIX.md`, `docs/PREVENT_DUTY_BRIEFING.md`, `docs/DPIA_TEMPLATE_UK.md`
- Before release: a release-signed AAB, the release keystore SHA-1 added to the Google OAuth + Firebase Android app, and the worker's Resend secrets for email-OTP delivery.
