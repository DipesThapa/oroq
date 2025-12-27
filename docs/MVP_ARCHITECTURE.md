# Safeguard MVP Architecture

This document describes how the extension is wired together at runtime.

## Runtime layers
- Background service worker (`src/background.js`)
  - Maintains DNR rules (blocklist, SafeSearch, ad rules).
  - Schedules Focus/Classroom mode timers.
  - Maintains heartbeat/tamper checks and alerting.
  - Generates the weekly safeguarding digest.
- Content script (`src/content.js`)
  - Runs on every http/https page.
  - Scores page risk (URL/title/meta/body) and can blur media in aggressive mode.
  - Shows the blocking interstitial with explanations and safe options.
  - Handles override flow, PIN prompts, and access requests.
- Popup UI (`src/popup.html`, `src/popup.js`, `src/popup.css`)
  - Control center for status, profiles, lists, logs, and alerts.
  - Parent/Teacher mode flows and quick actions.
- Local storage (Chrome `storage`)
  - Holds preferences, profiles, lists, and logs on-device.

## Data flow (high level)
1) User updates settings in the popup.
2) Settings are saved in extension storage.
3) Background reads settings and updates DNR rules.
4) Content script reads settings and applies on-page heuristics.
5) When a block happens, content script shows the interstitial and logs an event (locally).
6) Optional alerts are sent via HTTPS webhook if configured.

## Blocking and detection layers
- Network blocking:
  - Dynamic DNR rules for blocklist domains.
  - SafeSearch enforcement for Google/Bing.
  - Static ad rules to reduce risky ad exposure.
- On-page heuristics:
  - Weighted scoring of URL, title, meta, and body text.
  - Optional aggressive mode to blur images/videos.
  - Visual heuristics for graphic imagery when available.

## Storage and privacy
- All logs and settings are local to the browser profile.
- Override logs are encrypted at rest (AES-GCM).
- No browsing history or page content is transmitted.
- Webhooks are optional, HTTPS-only, and send alert metadata only.

## Key limitations
- Chrome DNR dynamic rule limits (~30k rules).
- Some cross-origin media cannot be pixel-sampled; visual checks may be skipped.

