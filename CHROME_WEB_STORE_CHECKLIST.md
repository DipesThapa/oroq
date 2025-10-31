# Chrome Web Store Checklist

- Listing basics
  - Title: Safeguard (SafeBrowse AI)
  - Short description: Privacy‑first web safety — blocklist, SafeSearch, simple heuristics.
  - Full description: Features, permissions rationale, privacy statement, how to use.
  - Category: Productivity or Family
- Assets
  - Icons (128/48/16) — already present under `assets/icons/`
  - Screenshots (1280×800 or 640×400): popup, interstitial, allowlist management
  - Optional promo video (YouTube)
- Privacy & policy
  - Link `PRIVACY.md` (no data collection; storage for settings only)
  - No remote servers; on‑device processing
- Manifest & permissions
  - `storage` and `declarativeNetRequest` only
  - Content scripts restricted to `http/https` matches
- QA scenarios
  - Toggle enabled ON/OFF from popup
  - Add/remove allowlist entries; confirm DNR rules update
  - Visit a blocklisted domain -> interstitial; test override
  - Google/Bing search -> verify SafeSearch params
  - Heuristic keywords -> verify interstitial
- Release process
  - Tag `vX.Y.Z` -> GitHub Release artifact via workflow
  - Upload the same zip to Chrome Web Store for review

Notes: Follow brand guidelines; avoid misleading claims; keep permissions minimal and documented.
