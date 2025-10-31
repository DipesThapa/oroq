# Safeguard (SafeBrowse AI) — Privacy-first Web Safety Extension (MVP)

[![CI](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/ci.yml) [![CodeQL](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/codeql.yml) [![Release](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/release.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/release.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Safeguard is a lightweight, on-device browser extension that helps families and schools
reduce exposure to harmful content.

## Features
- Domain **blocklist** (`data/blocklist.json`)
- **Allowlist** managed from the popup
- Simple **keyword heuristic** scanner
- Interstitial "blocked" page with override

## Dev Setup
1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Toggle **Enable protection** in the popup; edit `data/blocklist.json` to test

Notes:
- Content script is `src/content.js` (manifest aligned). The legacy `content.js` is experimental and not loaded.
- Permissions minimized to `storage`; scripts run on `http/https` pages only.
- Interstitial is built with safe DOM APIs; “Show anyway” temporarily allows the current host for this tab/session.

## Roadmap
- Interstitial v2 (reason badge + 5s delay) — implemented
- DNR-based domain blocking + SafeSearch redirects (Google/Bing) — implemented (MVP)
- On-device small text classifier (replace keywords)
- Options page polish + export/import lists
- Chrome Web Store draft

MIT License

## Quick start
1) Load unpacked
2) Toggle Enable
3) Edit data/blocklist.json

Phase 1 additions
- Static DNR rules for common ad domains and SafeSearch (Google/Bing)
- Dynamic DNR rules compiled from `data/blocklist.json` with allowlist overrides

## Community
- Code of Conduct: see `CODE_OF_CONDUCT.md`
- Contributing guide: see `CONTRIBUTING.md`
- Security policy: see `SECURITY.md` (report via GitHub advisories)
- Support: see `SUPPORT.md`
