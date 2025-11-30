# Safeguard (SafeBrowse AI) — Privacy-first Web Safety Extension

[![CI](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/ci.yml) [![CodeQL](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/codeql.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/codeql.yml) [![Release](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/release.yml/badge.svg)](https://github.com/DipesThapa/safebrowse-ai/actions/workflows/release.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Safeguard is a lightweight, on-device browser extension that helps families, schools, and workplace teams reduce exposure to harmful content without compromising privacy.

## Features
- **Advanced heuristics**: weighted URL/title/meta/body scoring with sensitivity control
- **On-page protection**: optional Aggressive mode to blur/pause images/videos on-device
- **Visual detection**: image heuristics sample pixels to escalate or block graphic imagery even without text
- **Domain blocklist**: packaged defaults + user-importable list; allowlist overrides
- **Sensitivity profiles**: Kids (7-12), Teens (13-16), College, and Work presets tuned for safeguarding and productivity goals
- **Explain why this was blocked**: interstitial gives kid-friendly reasoning, safe suggestions, and rotating AI literacy micro-lessons
- **SafeSearch enforcement**: redirects Google/Bing to strict modes (DNR)
- **Control centre**: refreshed popup with live status badge, quick toggles, and policy management in one place
- **First-run tour**: onboarding highlights key controls and policy workflows for new admins
- **Static ad rules**: common ad/marketing domains blocked via DNR
- **PIN protection**: require a PIN before overrides or allowlist edits, capturing on-device reason & approver logs
- **Secure alerts**: HTTPS-only override/tamper webhooks (no localhost/LAN/creds) with PIN-locked setup
- **Safeguarding digest**: export a weekly CSV summary of settings and override activity for DSL reviews
- **Override alerts**: optional PIN-protected webhooks (Slack/Teams/email) with approver names for instant oversight
- **Encrypted override log**: AES-GCM at rest; stores timestamp, host, reason, and approver only (no full URLs)
- **Interstitial**: blocked page with timed “Show anyway” override (per tab/session)

## Business-ready capabilities
- **Privacy by design**: all analysis and decisioning stays on-device; no browsing data is transmitted.
- **Policy controls**: organisation-wide allowlists & custom blocklists with import/export workflows.
- **Deployment friendly**: minimal permissions (`storage`, `declarativeNetRequest`) and no background polling.
- **Support collateral**: ready-made privacy policy, security briefing (`SECURITY.md`), support workflows (`SUPPORT.md`), UK safeguarding packs (`docs/KCSIE_COMPLIANCE_MATRIX.md`, `docs/PREVENT_DUTY_BRIEFING.md`, `docs/DPIA_TEMPLATE_UK.md`), and age-based profile presets.
- **Managed Chrome guidance**: see [docs/WEBSTORE.md](docs/WEBSTORE.md) for publishing, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for rollout playbooks, and [SUPPORT.md](SUPPORT.md) for help desk scripts.

Hosted resources
- Bundled static pages (packaged inside the extension): `site/index.html`, `site/privacy.html`, `site/support.html`
- Optional public hosting: enable GitHub Pages (Settings → Pages → build from `/site`) or deploy the same folder to Netlify/Vercel. Update the Chrome Web Store listing with the published URLs once live.

## Dev Setup
1. Chrome → `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this folder
3. Open the popup → toggle **Enable protection** (badge shows **Active**)
4. Optional: toggle **Aggressive mode** and adjust **Sensitivity**
5. Optional: paste domains (one per line) into **Blocklist → Import/Replace**
   - or edit `data/blocklist.json` and reload the extension
6. For private windows: open extension details → enable **Allow in Incognito**

Notes:
- Content script is `src/content.js` (manifest aligned). The legacy `content.js` remains in repo but is not loaded.
- Permissions: `storage`, `declarativeNetRequest`, `tabs`; scripts run on `http/https` pages only (tabs permission is used to show the active site toggle).
- Web-accessible resources limited to `https://*/*` (no localhost/LAN) to reduce fingerprinting.
- DNR rules are rebuilt on install/startup and when allowlist/blocklist change.
- Interstitial uses safe DOM APIs; “Show anyway” temporarily allows the current host for this tab/session.

## Roadmap
- On-device visual model (optional) for stronger image/video detection
- Options page polish + export/import lists (popup import exists)
- Scheduled safeguarding digests and trust-level preset sharing
- Chrome Web Store listing (screenshots, description, privacy link)

MIT License

## Quick start
1. Load unpacked (Developer mode)
2. Toggle **Enable protection** in the popup (status badge turns green)
3. Optional: toggle Aggressive mode + set sensitivity
4. Blocklist: paste domains → Import/Replace (one per line)
5. Visit sites to verify interstitial (strong signals) or blurring (contextual)

Phase 1 additions
- Static DNR rules for common ad domains and SafeSearch (Google/Bing)
- Dynamic DNR rules compiled from packaged + user-imported blocklist with allowlist overrides

Limitations
- Chrome’s dynamic DNR rules have capacity limits (~30k). Very large custom imports are truncated.
- Visual detection is heuristic-based; cross-origin videos may block pixel reads (skipped).

## Community
- Code of Conduct: see `CODE_OF_CONDUCT.md`
- Contributing guide: see `CONTRIBUTING.md`
- Security policy: see `SECURITY.md` (report via GitHub advisories)
- Support: see `SUPPORT.md`

## Chrome Web Store
- Publishing workflow: see `.github/workflows/publish-webstore.yml`
- Setup + credentials + manual upload steps: `docs/WEBSTORE.md`
- Listing content template: `docs/STORE_LISTING.md`
- Build zip for upload: `npm run zip:webstore` (outputs `dist/extension.zip`; ensures only required files are packaged)
