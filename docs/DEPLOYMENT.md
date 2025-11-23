# Safeguard Deployment Guide

This playbook is intended for IT administrators rolling out Safeguard across a business or school fleet.

## 1. Package & verify

1. Clone the repository and install dependencies (`npm install`).
2. Generate the production bundle: `npm run build:adblock` (optional refresh of static rules) then `npm run zip:webstore` to create `dist/extension.zip`.
3. Load the unpacked build locally and confirm:
   - Popup shows the **Active** status badge.
   - Allowlist/blocklist management works end-to-end.
   - Aggressive mode blurs explicit imagery on sample pages.
   - No errors appear in the background service worker console.

## 2. Chrome enterprise rollout

1. Publish via the Chrome Web Store (see `docs/WEBSTORE.md`) or host internally using Chrome’s force-install policies.
2. Configure policy `ExtensionSettings` with:
   - `installation_mode`: `force_installed`
   - `allowed_types`: `extension`
   - `runtime_allowed_domains`: optional allowlist for managed blocklist updates
3. (Optional) Preload administrator blocklist/allowlist by pushing JSON files to user profiles and importing through managed scripts.

## 3. Host customer-facing pages

Safeguard ships with static HTML pages in `/site` for privacy, support, and product overview.

1. In GitHub, enable **Pages** → Build from branch → `main` / `/site` directory.
2. GitHub will publish at `https://&lt;username&gt;.github.io/safebrowse-ai/`. Update the Chrome Web Store listing and in-extension footer links if you use a custom domain.
3. For alternative hosts (Netlify, Vercel, Cloudflare Pages) deploy the `site/` folder as a static site.

## 4. Post-deployment checklist

- Share the updated popup tour (screenshot + explanation) with end-users.
- Enable “Allow in Incognito” if coverage is needed for private windows.
- Document the support escalation path (`SUPPORT.md`) for help-desk agents.
- Review privacy notice (`PRIVACY.md`) and add it to internal compliance portals as required.
- For UK schools, complete the safeguarding pack: KCSIE matrix, Prevent briefing, and DPIA template in `docs/`.
- Apply the relevant age-based profile (EYFS, KS1–KS4, post-16) and note any manual tweaks.
- Run through an override test (with PIN) and verify the reason appears in the override log card.
- Configure override alerts (optional): supply a webhook (Slack/Teams) and test that notifications fire when the PIN override is used.
- Enable the approver prompt if you want DSL initials captured for every override; verify the name appears in the log/digest.

## 5. Change management

- Track release notes in the repository changelog whenever new filters or UI updates ship.
- Re-run `npm run build:adblock` before packaging new releases to ensure rule freshness.
- Smoke-test key flows (enable/disable, allowlist, blocklist import) on each update before publishing to managed channels.

## 6. Incident response

- Encourage users to capture screenshots and the page URL for any false positives.
- File high-priority bugs via GitHub (see `SUPPORT.md`) and note if the issue blocks production usage.
- For security concerns, follow the responsible disclosure policy in `SECURITY.md`.

Questions or custom deployment needs? Open a GitHub Discussion with the `deployment` label.
