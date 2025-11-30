# Chrome Web Store Publishing

This repo is configured to publish automatically via GitHub Actions when a release is published (or on manual dispatch). You provide the API credentials as repo secrets.

## 1) Prepare a Developer Account
- Create/Log in: https://chrome.google.com/webstore/devconsole (one-time $5 fee)
- Create a new item (temporary placeholder upload) to obtain an Extension ID.

## 2) OAuth Credentials + Refresh Token
- Create OAuth2 credentials (Web application) in Google Cloud Console.
- Obtain:
  - Client ID
  - Client secret
  - Refresh token (follow the action’s instructions to generate or use a helper script)

## 3) Set GitHub Secrets
In your repository Settings → Secrets and variables → Actions, add:
- CHROME_CLIENT_ID
- CHROME_CLIENT_SECRET
- CHROME_REFRESH_TOKEN
- CHROME_EXTENSION_ID (from Dev Console)

## 4) Trigger Publishing
- Tag a release (e.g., `v0.2.0`) or run the workflow manually: Actions → “Publish to Chrome Web Store” → Run workflow.
- The workflow builds a curated `extension.zip` (icons/data/src/manifest only) and uploads + publishes it.

## 5) Listing Requirements
- Title: Safeguard (SafeBrowse AI)
- Short description: Privacy‑first web safety. Block adult sites, enforce SafeSearch, blur risky images/videos.
- Long description: Use README highlights (privacy‑on‑device, features, usage).
- Category: Productivity or Family
- Screenshots: 1280×800 or 640×400 (popup, interstitial, allowlist, aggressive mode). Place files under `assets/store/`.
- Privacy policy: Link to `PRIVACY.md` in GitHub (public URL)
- Data disclosure: “No data is collected” (no telemetry; override logs encrypted locally and exclude full URLs)

## 6) Listing Content Template
See `docs/STORE_LISTING.md` for a ready‑to‑paste title, descriptions, and screenshot list.

## Notes
- Manifest version is `0.3.2` (bump for each submission).
- The workflow zips only required files; dev/backup files are excluded. For manual uploads, run `npm run zip:webstore` and upload `dist/extension.zip`.
- Large blocklists are supported via import; dynamic DNR limits apply.
