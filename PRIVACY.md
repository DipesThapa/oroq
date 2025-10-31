# Privacy Policy (Safeguard — SafeBrowse AI)

Safeguard is a privacy‑first browser extension. It processes content locally and does not send your browsing data to external servers.

- Data collection: None. The extension does not collect, transmit, or sell personal data.
- Network access: Only for normal page loads and Chrome Declarative Net Request redirects. No telemetry.
- Local storage: Uses `chrome.storage.sync` for:
  - `enabled` (on/off setting)
  - `allowlist` (user‑added hostnames to allow)
  - (no PIN or account data stored)
- Content scanning: Heuristic checks (keywords) and lightweight DOM analysis run locally. Blocked pages show an interstitial with a temporary override option (per tab/session).
- Permissions rationale:
  - `storage`: Save settings and allowlist.
  - `declarativeNetRequest`: Apply local block/redirect rules (e.g., SafeSearch) without inspecting full traffic.
- Opt‑out: Disable the extension from the popup or remove it at any time.

Questions? Open a discussion or report security issues privately via GitHub Advisories (see `SECURITY.md`).
