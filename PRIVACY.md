# Privacy Policy (Safeguard — SafeBrowse AI)

Safeguard is a privacy‑first browser extension. It processes content locally and does not send your browsing data to external servers. This document describes how we treat personal information when the extension is deployed for individual or organisational use.

## Data collection
- No telemetry, analytics, or third-party tracking is integrated. The extension never transmits browsing history, URLs, or content back to our infrastructure.
- Network access is limited to the active tab and Chrome Declarative Net Request (DNR) redirects required for SafeSearch/ad blocking.
- Optional: if you enable override/tamper alerts, the extension sends a small JSON payload (reason, approver initials/name, host/URL, policy verdict) to **your** HTTPS webhook only. Localhost and private-network addresses are rejected.

## Data stored locally
- `chrome.storage.sync`
  - Protection state (`enabled`), allowlist, aggressive mode, sensitivity, selected profile metadata, nudge settings
- `chrome.storage.local`
  - User blocklist, override log (AES-GCM encrypted; reason/approver, host, timestamps — no full URLs), optional webhook URL (HTTPS only), tamper/override alert toggles, classroom/focus mode settings, and PIN hash/salt/iterations
- No user identity, account, or credential data is persisted. PINs are hashed (PBKDF2 with salt/iterations) and never transmitted.

## Content scanning
- Heuristic text and DOM analysis runs within the user’s browser process. Images/videos stay on device; we do not upload pixels for remote classification.
- Blocked pages show an interstitial with a temporary override toggle scoped to the current host + tab (stored only in `sessionStorage`).

## Permissions rationale
- `storage`: required to store user/administrator preferences listed above.
- `declarativeNetRequest`: allows us to ship SafeSearch and block/allow policies without inspecting full request bodies.
- `tabs`: read the active tab’s URL to show the “Allow this site” toggle in the popup; the hostname is not persisted after the popup closes.
- No background network calls or remote configuration fetches are performed.

## Opt-out and removal
- Users can pause protection from the popup, or remove the extension entirely from Chrome at any time. Removing the extension deletes all local data.

## Contact
Questions or data requests? Open a discussion or email the maintainer listed in `SUPPORT.md`. Security reports should follow the responsible disclosure path in `SECURITY.md`.

Questions? Open a discussion or report security issues privately via GitHub Advisories (see `SECURITY.md`).
