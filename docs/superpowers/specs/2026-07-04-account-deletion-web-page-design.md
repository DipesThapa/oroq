# Account-deletion web page — design

**Date:** 2026-07-04
**Goal:** satisfy Google Play's account-deletion policy, which requires a web
resource where users can request account deletion without reinstalling the
app. This URL goes in the Play Console **Data safety → Account deletion**
field.

## Context

The in-app deletion path already exists end-to-end and is deployed:
MoreScreen "Delete account" (confirmation dialog) → `ParentViewModel` →
`ParentRepository` → `DELETE /account` on the production Worker, which
deletes every pairing, each pairing's encrypted summary + command queue in
KV, push tokens, and the account row (idempotent). The only missing piece is
the public web resource. The ⚠️ "account deletion gap" warning in
`docs/PLAY_DATA_SAFETY.md` predates the in-app implementation and is stale.

## Decision

**Static deletion-request page** (Option A). A self-serve web deletion flow
(Google OAuth on web + CORS on the Worker) was considered and deliberately
deferred: it adds browser-reachable attack surface to a parental-control
product days before policy review, and Google's policy is satisfied by a
request-based page. Revisit post-launch if email requests become a burden.

## Changes

1. **New page `site/delete-account.html`** — same styling/nav/footer pattern
   as `privacy-app.html` / `support.html`. Content:
   - **Fastest path (in-app):** More → Delete account → confirm. Immediate
     and permanent.
   - **If you've uninstalled the app:** email `dipesh@cyberheroez.co.uk`
     from the Google account email used to sign in, subject
     "Delete my OroQ account". Processed within 30 days.
   - **What gets deleted:** the account record, every device pairing, all
     encrypted activity summaries and pending commands, and push
     notification tokens. Child devices stop being monitored and their
     local app data stays on the device (uninstall removes it).
   - **Retention note:** server-side encrypted summaries auto-expire after
     7 days regardless of deletion.
2. **Link the page** from the nav + footer of the existing site pages
   (index, features, support, privacy×2), matching how the privacy pages
   are cross-linked.
3. **Deploy:** `npx wrangler pages deploy site --project-name=oroq-site` →
   live at `https://oroq-site.pages.dev/delete-account`.
4. **Docs:** in `docs/PLAY_DATA_SAFETY.md`, replace the stale ⚠️ warning
   with the resolved state: in-app deletion shipped + this URL for the Data
   safety deletion field. Tick/annotate the related item in
   `docs/PRE_SUBMISSION_CHECKLIST.md` if present.

## Not doing

- No app or backend changes (already shipped).
- No web OAuth / self-serve deletion (deferred, see Decision).
- No custom-domain URL (cyberheroez.co.uk still points at Vercel).

## Verification

- `curl` the deployed URL → 200 and correct `<title>`.
- Page renders with site styling; nav/footer links resolve.
- `PLAY_DATA_SAFETY.md` no longer claims the gap exists.
