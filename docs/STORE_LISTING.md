# Store Listing Content

Use this content for the Chrome Web Store listing. Replace screenshots with real PNGs before submission.

## Title
Safeguard (SafeBrowse AI)

## Short Description
Privacy-first web safety. Block adult sites, blur risky media, and lock overrides or allowlist edits behind a private PIN — all on-device.

## Full Description
Safeguard helps families and schools reduce exposure to harmful content. It blocks adult sites, enforces SafeSearch on Google/Bing, and can blur images/videos on the page using on‑device heuristics. No data leaves your device.

Features:
- Advanced heuristics: weighted URL/title/meta/body scoring with adjustable sensitivity
- On-page protection: optional Aggressive mode to blur/pause images and videos in the tab
- Visual detection: on-device image heuristics boost scores when explicit imagery appears even without text
- Safeguarding digest: download weekly CSV summaries for DSLs, governors, and audit trails
- Override alerts: send webhook notifications (Slack/Teams/etc.) whenever a PIN override is approved, including approver name
- Localization-ready: language selector prepares Welsh and Scottish Gaelic UI translations (coming soon)
- Domain blocklist: packaged defaults plus user-importable lists; allowlist trusted domains in seconds
- SafeSearch enforcement (Google/Bing) via Declarative Net Request (DNR)
- Static ad/marketing rules that trim common trackers and adult portals
- Manual overrides and allowlist edits locked behind a private PIN with an on-device reason log
- Age-based profiles for EYFS through post-16 so schools can apply presets with one click

What’s new in 0.3.1:
- Capture an override reason for each unblock and store it in a local safeguarding log
- Add age-based profiles (EYFS–post-16) that configure sensitivity, blocklists, and PIN defaults automatically
- Change, remove, or reset the PIN entirely on-device (no cloud storage)
- Updated popup layout with clearer override messaging and status hints

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
- Cross-origin videos may block pixel reads; visual sampling is skipped in those cases

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
