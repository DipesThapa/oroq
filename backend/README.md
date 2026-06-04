# OroQ Family Link — Backend

A Cloudflare Worker for passwordless parent accounts and device pairing.
It stores only ciphertext and minimal metadata (see the design spec,
`docs/superpowers/specs/2026-05-22-oroq-parent-remote-view-design.md`).

## Routes

- `GET  /health`                       — liveness probe
- `POST /auth/request {email}`         — email a 6-digit OTP
- `POST /auth/verify  {email, otp}`    — returns `{ token }` (30-day JWT)
- `POST /pair/create  {parentPublicKey, childLabel?}` — auth'd; returns `{ pairingId, code }`
- `POST /pair/join    {code, childPublicKey}`         — returns `{ pairingId, parentPublicKey }`
- `GET  /pair/:id`                     — pairing record

## Local development

    cd backend
    npm install
    npm test          # runs the full suite in the Workers runtime
    npm run dev       # local Worker at http://localhost:8787

With no `RESEND_API_KEY` set, OTP emails are written to the dev console
instead of being sent.

## Provisioning (one-time)

    npx wrangler d1 create oroq-family
    npx wrangler kv namespace create KV

Copy the printed `database_id` and KV `id` into `wrangler.toml`.

Apply the schema:

    npx wrangler d1 migrations apply oroq-family --remote

Set the secrets:

    npx wrangler secret put JWT_SECRET        # a long random string
    npx wrangler secret put RESEND_API_KEY    # from resend.com
    npx wrangler secret put RESEND_FROM       # e.g. "OroQ <code@yourdomain>"

`RESEND_FROM` must be on a domain verified in the Resend dashboard.

## Deploy

    npm run deploy

## Notes

- The Worker refuses to start if `DB`, `KV` or `JWT_SECRET` are missing.
- D1 holds parent accounts and pairing metadata only — no child data.
- KV entries (OTP hashes, pairing codes, rate-limit counters) all carry TTLs.
