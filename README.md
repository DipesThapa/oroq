# Safeguard (SafeBrowse AI) — Privacy-first Web Safety Extension (MVP)

[![CI](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/ci.yml) [![CodeQL](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/codeql.yml) [![Release](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/release.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/release.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Safeguard is a lightweight, on-device browser extension that helps families and schools
reduce exposure to harmful content.

## Features
- **Advanced heuristics**: weighted URL/title/meta/body scoring with sensitivity control
- **On-page protection**: optional Aggressive mode to blur/pause images/videos on-device
- **Domain blocklist**: packaged defaults + user-importable list; allowlist overrides
- **SafeSearch enforcement**: redirects Google/Bing to strict modes (DNR)
- **Static ad rules**: common ad/marketing domains blocked via DNR
- **Interstitial**: blocked page with timed “Show anyway” override (per tab/session)

## Dev Setup
1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open the popup → toggle **Enable protection** (badge shows ON)
4. Optional: toggle **Aggressive mode** and adjust **Sensitivity**
5. Optional: paste domains (one per line) into **Blocklist → Import/Replace**
   - or edit `data/blocklist.json` and reload the extension

Notes:
- Content script is `src/content.js` (manifest aligned). The legacy `content.js` remains in repo but is not loaded.
- Permissions: `storage`, `declarativeNetRequest`; scripts run on `http/https` pages only.
- DNR rules are rebuilt on install/startup and when allowlist/blocklist change.
- Interstitial uses safe DOM APIs; “Show anyway” temporarily allows the current host for this tab/session.

## Roadmap
- On-device visual model (optional) for stronger image/video detection
- Options page polish + export/import lists (popup import exists)
- Chrome Web Store listing (screenshots, description, privacy link)

MIT License

## Quick start
1) Load unpacked (Developer mode)
2) Toggle Enable in the popup (badge ON)
3) Optional: toggle Aggressive mode + set sensitivity
4) Blocklist: paste domains → Import/Replace (one per line)
5) Visit sites to verify interstitial (strong signals) or blurring (contextual)

Phase 1 additions
- Static DNR rules for common ad domains and SafeSearch (Google/Bing)
- Dynamic DNR rules compiled from packaged + user-imported blocklist with allowlist overrides

Limitations
- Chrome’s dynamic DNR rules have capacity limits (~30k). Very large imports are truncated.
- Visual detection is heuristic-based; cross-origin videos may block pixel reads (skipped).

## Community
- Code of Conduct: see `CODE_OF_CONDUCT.md`
- Contributing guide: see `CONTRIBUTING.md`
- Security policy: see `SECURITY.md` (report via GitHub advisories)
- Support: see `SUPPORT.md`

## Chrome Web Store
- Publishing workflow: see `.github/workflows/publish-webstore.yml`
- Setup + credentials: `docs/WEBSTORE.md`
- Listing content template: `docs/STORE_LISTING.md`
