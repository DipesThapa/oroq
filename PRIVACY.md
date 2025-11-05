# Privacy Policy (Safeguard — SafeBrowse AI)

Safeguard is a privacy‑first browser extension. It processes content locally and does not send your browsing data to external servers. This document describes how we treat personal information when the extension is deployed for individual or organisational use.

## Data collection
- No telemetry, analytics, or third-party tracking is integrated. The extension never transmits browsing history, URLs, or content back to our infrastructure.
- Network access is limited to the active tab and Chrome Declarative Net Request (DNR) redirects required for SafeSearch/ad blocking.

## Data stored locally
- `chrome.storage.sync`
  - `enabled`: on/off state of core protection
  - `allowlist`: hostnames trusted by the user/administrator
  - `aggressive`: whether visual blurring is enabled
  - `sensitivity`: slider value for the heuristic threshold
- `chrome.storage.local`
  - `userBlocklist`: administrator-imported domains to block
- No user identity, account, or credential data is persisted.

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
