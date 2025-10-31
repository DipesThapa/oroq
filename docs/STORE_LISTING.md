# Store Listing Content

Use this content for the Chrome Web Store listing. Replace screenshots with real PNGs before submission.

## Title
Safeguard (SafeBrowse AI)

## Short Description
Privacy‑first web safety. Block adult sites, enforce SafeSearch, blur risky images/videos — all on‑device.

## Full Description
Safeguard helps families and schools reduce exposure to harmful content. It blocks adult sites, enforces SafeSearch on Google/Bing, and can blur images/videos on the page using on‑device heuristics. No data leaves your device.

Features:
- Advanced heuristics: weighted URL/title/meta/body scoring with sensitivity control
- On‑page protection: optional Aggressive mode to blur/pause images/videos
- Domain blocklist: packaged defaults + user‑importable list; allowlist overrides
- SafeSearch enforcement (Google/Bing) via Declarative Net Request (DNR)
- Static ad/marketing rules for cleaner pages
- Interstitial with timed “Show anyway” override (per tab/session)

Privacy:
- No telemetry or external requests for detection
- Uses only `storage` and `declarativeNetRequest` permissions
- See the full policy: https://github.com/DipesThapa/safebrowse-ai/blob/main/PRIVACY.md

How to use:
1) Install and open the popup; toggle Enable (badge shows ON)
2) Optional: toggle Aggressive mode and adjust Sensitivity
3) Optional: paste domains (one per line) into Blocklist → Import/Replace; use Allowlist to override

Notes:
- Very large blocklists may exceed Chrome’s dynamic DNR capacity; core heuristics still protect
- Cross‑origin videos may block pixel reads; visual sampling is skipped in those cases

## Categories
Productivity or Family

## Screenshots (PNG, 1280×800 or 640×400)
Place these files (replace with real screenshots) in `assets/store/`:
- assets/store/screenshot-1-popup.png — Popup with Enable, Aggressive mode, Sensitivity
- assets/store/screenshot-2-interstitial.png — Interstitial page with timed override
- assets/store/screenshot-3-allowlist.png — Allowlist add/remove
- assets/store/screenshot-4-aggressive-mode.png — Blurred image/video with “Blocked by Safeguard” tag
- assets/store/screenshot-5-blocklist-import.png — Blocklist import textarea + count

Tip: Keep total image sizes modest; they are uploaded to the Store UI (not bundled in the extension zip).
