# OroQ Android App Redesign — Design (deck v1.0, sub-project 1 of 3)

**Date:** 2026-06-10
**Source:** `OROQ — Mobile App Design Specification v1.0` (design deck spec)
**Goal:** Rebuild the Android app UI in Jetpack Compose to match the design deck exactly — dark navy theme, Inter, Cyber Confidence dashboard, deck pairing flow.

## Scope

This is the first of three sub-projects from the deck spec:

1. **Android app redesign (this spec)** — all mobile screens, both roles.
2. Parent web portal (deck panel 14) — separate spec, later.
3. Backend additions (server-side score, notifications push, stats endpoints) — separate spec, later.

Out of scope here: panel 14 (portal), panel 15 (ecosystem marketing), any Supabase migration (the deck's §5 mention of Supabase does not apply — OroQ stays on the Cloudflare Worker backend), iOS.

## Decisions (resolved with product owner, 2026-06-10)

| Question | Decision |
|---|---|
| Screen→role mapping | Deck panels 6–13 (dashboard suite) = **parent role**. Panels 4–5 (onboarding/pairing) = **child role**. Matches existing child-slim/parent-full split. |
| Pairing code format | **Keep 8-character codes** (existing backend). All deck copy that says "6-character" becomes "8-character"; example chip `CSH38S` becomes `CSH38SQ2`. No backend change. |
| Dashboard data | **Derived client-side on the parent app** from already-synced child summaries. No new endpoints. Score formula lives in one Kotlin object (`ConfidenceScore`) so it can move server-side in sub-project 3. |
| QR scanning | **ZXing core (Apache-2.0) + CameraX**, our own scan UI matching deck 5.3. Camera permission requested only when the user taps "Scan QR instead". |
| UI framework | **Jetpack Compose rewrite** (owner's choice over evolving `Style.kt`). Old view-based screens and `Style.kt` are deleted at the end; no parallel maintenance. |
| Theme | Dark is the only mobile theme. The deck's light surfaces exist only in deck-slide backgrounds and the (out-of-scope) portal. |

Deck defects fixed as the deck spec instructs: "Allo to Home" → `Go to Home`; 5-tab bar everywhere (deck panel 08 shows 4); wordmark **OROQ**, prose **OroQ**; panels renumbered 10 Insights / 11 Recommendations / 12 Timeline / 13 Notifications.

## Architecture

Single-activity-per-role Compose hosts. Non-UI layers (`family/`, `vpn/`, `filter/`, `monitor/`, `config/` DataStore) are untouched; screens reach them through thin ViewModels.

```
RolePickerActivity (Compose, deck-themed)        — entry gate, unchanged routing logic
ChildActivity   (Compose NavHost)                — replaces ChildOnboardingActivity, LinkParentActivity
  welcome → setup → pair (code|qr) → allow-protection → all-set → child-home
ParentActivity  (Compose Scaffold + BottomNav + NavHost)
                                                 — replaces ParentActivity, ChildDashboardActivity, AddChildActivity
  tabs: home | activity | devices | insights | more
  pushed: device-details/{id} · recommendations · timeline · notifications · add-child
BlockActivity   (Compose, deck-themed)           — same trigger path from filter/vpn, new visuals
ParentLoginActivity (Compose, deck-themed)       — same auth flow against /auth/*
```

New dependencies (all pinned via `libs.versions.toml`): Compose BOM + ui/foundation/material3 (used for scaffolding only — all visible components are custom), `activity-compose`, `navigation-compose`, `lifecycle-viewmodel-compose`, `zxing:core`, `camera-camera2`/`camera-lifecycle`/`camera-view`. AGP is 9.1.1 with built-in Kotlin; the Compose compiler Gradle plugin (`org.jetbrains.kotlin.plugin.compose`) must match the built-in Kotlin version — verify at implementation start (risk R1).

## Theme — `ui/theme/`

Tokens exactly as deck §0, exposed as an `OroqTheme` object (not Material `ColorScheme` — the deck palette doesn't map onto Material roles):

- **Colors:** `BgPrimary #010715`, `BgSurface #0A1420`, `BgSurface2 #111A29`, `BluePrimary #0A67F3`, `BlueAccent #2563EB`, `BlueLight #60A5FA`, `BlueDeep #1E3A8A`, `TextPrimary #FFFFFF`, `TextSecondary #8B94A3`, `Success #22C55E`, `Danger #EF4444`, `Warning #F59E0B`, `PurpleInfo #8B5CF6`. Border on dark: `White 8%`. Status colors appear only as 10–15% alpha pill fills with full-opacity content.
- **Type:** Inter 400/500/600/700 bundled in `res/font/` (OFL licence file included). Styles per deck §0.2: Display 56/700, H1 32/700, H2 24/600, Body 15–16/400 secondary, Caption 11–12/500 uppercase +8% tracking, Metric 48/700 and 28/700.
- **Shape/spacing:** radii 16 card / 12 tile / 10 button / 999 pill; paddings 16 card, 20 screen-horizontal, 12 grid gap.
- **Gradients:** radial blue glow `BluePrimary→transparent`; Q-tail linear `BlueLight→BlueAccent→BlueDeep` at 45°.

## Components — `ui/components/`

The deck §3 inventory, one composable each, previewable via `@Preview`:

1. `ConfidenceGauge(score, size)` — Canvas arc starting at 135°, round caps, track White 8%; animated sweep 800 ms ease-out on first composition; thresholds ≥80 blue "Excellent", 60–79 warning "Fair", <60 danger "At risk".
2. `StatTile(label, value, meta, metaColor)` — Surface2 tile, Metric-small value.
3. `ActivityRow(category, domain, time)` — severity pill icon, ellipsized domain, relative time. Category→color: phishing/malware danger; scam warning; adult_content purple; info blue; allowed success.
4. `FilterChips(options, active, onSelect)` — active chip solid blue.
5. `PrimaryButton` / `SecondaryLink`.
6. `ToggleRow(label, checked, onChange)`.
7. `RecommendationCard(icon, title, sub, onEnable)`.
8. `DeviceRow(name, statusLine, protected)` — trailing `Protected` success pill.
9. `BottomNav(activeTab)` — 5 tabs: Home, Activity, Devices, Insights, More.
10. `TimelineGroup(day, events)` — vertical rail, colored dots.
11. `OnboardingScaffold(illustration, title, sub, content, cta)`.
12. `QSymbol` / `OroqWordmark` — `ImageVector` from the brand SVGs. **Input needed (risk R2): `oroq_logo.svg` + Q-mark SVG are not in the repo; product owner supplies them, else we re-draw from the deck description.**

Illustrations (family, shield-check, green check): simple flat vector drawables in the navy/blue palette, hand-built; the deck's exact illustrations are not available as assets.

## Screens

### Child role
- **Welcome (panel 04):** wordmark, `Welcome to OroQ`, sub, 3-row feature card, `Get started`, sign-in link (parent login).
- **Set up OroQ (5.1):** numbered checklist (Pair with parent / Allow protection / ✓ All set), `Let's go`.
- **Pair with parent (5.2):** copy "Ask your parent to generate an **8-character** code…", `Pair code` field with trailing QR icon, `Scan QR instead` link, `Continue`. Submits through existing `FamilyApi.pairJoin` + `normalizeCode`.
- **Scan QR (5.3):** CameraX preview, ZXing decode of the same 8-char token, "Or enter code manually" + code chip, `Cancel`. QR payload = the bare pairing code (what the parent app shows alongside the text code).
- **Allow protection (5.4):** shield illustration, checklist, `Allow & Continue` → existing VPN/accessibility permission flow in `MonitorPermissions`.
- **All set (5.5):** green check, `Go to Home`.
- **Child home:** minimal status screen (protection on/off state, paired indicator) in deck style — slim per AADC posture; no stats, no activity history shown to the child.
- **Block overlay:** deck-themed rebuild of `BlockActivity` (dark card, category pill, existing override/PIN affordances).

### Parent role
- **Home (06):** top bar wordmark + bell (unread dot → Notifications). `CYBER CONFIDENCE` gauge card with `Updated Xm ago` from last sync. Stat grid 2×2: Threats Blocked / Unsafe Domains / Devices Protected / Uptime, real derived values with `This week` meta. Recent Activity card (3 latest events) + `View all` → Activity tab.
- **Activity (07):** chips All/Threats/Warnings/Info, `Last 7 days ▾` dropdown, full event list with uppercase category pills.
- **Devices (08):** chips `All (n)`/`Active (n)`/`Inactive (n)`, `DeviceRow` list. Status line "Active • Last seen Xm ago" from sync recency (active = synced within 24 h).
- **Device Details (09):** title + status, `Protection` toggle section (AI Protection, Web Filtering, Safe Search, YouTube Restricted) mapped onto existing `FamilyCommand`s; below it the existing Blocked Categories and Blocked Apps editors restyled — current functionality is kept, not dropped, even though the deck omits it.
- **Insights (10):** `This week ▾`, big stat `OroQ blocked N potential threats`, 3 mini-stats (threats / warnings / devices flagged — deck-illegible row, this is our explicit assumption), Top categories horizontal bars, `View all recommendations` link.
- **Recommendations (11):** cards Enable Safe Search / Block Adult Content / Enable YouTube Restricted Mode, each `Enable` issuing the matching command to all (or a chosen) child device; enabled state reflected.
- **Timeline (12):** grouped Today/Yesterday/date, colored dots, block + lifecycle events (protection enabled, device added, weekly summary).
- **Notifications (13):** chips All/Unread/Important, rows mirroring timeline events, blue unread dots. Local, derived from synced events — no push in this sub-project.
- **More tab:** Timeline, Notifications, Manage children (add child = existing pairing-code generation screen restyled, shows text code + QR), Settings, About, Sign out.

## Data derivation — `parent/Insights.kt` (pure Kotlin, unit-tested)

Inputs: the decrypted `FamilySummary` blobs the parent already fetches per paired child (block events with category/domain/timestamp, protection states, last-sync times).

- **Threats Blocked (week):** count of block events in last 7 days, categories phishing/malware/scam.
- **Unsafe Domains (week):** distinct blocked domains, last 7 days.
- **Devices Protected:** paired children with protection on and sync within 24 h.
- **Uptime:** percentage of the last 7 days each device had protection enabled (from sync heartbeats), averaged; shown honestly, not hardcoded 99%.
- **Confidence score (0–100):** `40 × protections-enabled fraction + 25 × device coverage (active/paired) + 20 × sync freshness + 15 × threat-handling (blocked vs allowed-after-warning ratio)`. Weights live as constants in `ConfidenceScore` with KDoc, explicitly marked "moves server-side in sub-project 3".
- Domains only, never full URLs (existing posture, deck §5.3); events older than 30 days dropped client-side.

## Error handling & offline

- Parent screens render from the last cached summaries instantly; a stale banner ("Last updated 3h ago — pull to refresh") appears when sync age > 1 h. Refresh failures show a quiet inline notice, never block the UI.
- Pairing: invalid/expired code → inline field error (deck-styled), rate-limit response → "Too many attempts, try again in a few minutes". QR scan of a non-OroQ payload → "That's not an OroQ pairing code".
- Camera permission denied → fall back to manual entry with the link hidden for the session.
- Child block overlay continues to work fully offline (it already does — visual change only).

## Testing

- **Unit (JUnit):** `Insights` derivations (boundaries: zero devices, empty week, all-stale), `ConfidenceScore` thresholds (79/80, 59/60), QR payload validation, copy regression for "8-character".
- **Compose UI tests:** gauge renders score + status word per threshold; BottomNav switches tabs; pairing screen error states.
- **Existing tests** (`normalizeCode`, crypto, instrumented package test) must stay green.
- Manual smoke on emulator + Vivo: child onboarding end-to-end pairing against the live worker, parent dashboard derives non-empty stats.

## Risks

- **R1 — Compose on AGP 9.1.1 built-in Kotlin:** verify compose compiler plugin wiring as implementation step 1; fallback is pinning the explicit Kotlin Android plugin.
- **R2 — Brand SVGs missing from repo:** owner to supply `oroq_logo.svg` + Q icon, else re-draw.
- **R3 — Full rewrite regression surface:** mitigated by migrating per-screen behind the same entry points, keeping non-UI layers untouched, and the manual smoke pass on both devices.

## Implementation order

1. Gradle: Compose plugin + deps (R1 resolved here).
2. `ui/theme/` tokens + Inter fonts + brand vectors.
3. Components with previews.
4. Parent: Home → Activity → Devices → Device Details → Insights → Recommendations → Timeline → Notifications → More.
5. Child: Welcome → Setup → Pair → QR → Allow → All set → Child home → Block overlay.
6. Delete `Style.kt` + old activities, manifest cleanup.
7. Full test + device smoke pass.
