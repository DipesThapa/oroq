# Pairing relay (Cloudflare Workers + Durable Objects)

This is a small HTTPS relay for Safeguard device pairing. It stores **only encrypted blobs** (plus minimal metadata) and supports the same endpoints as `relay/server.js`.

## Deploy

Prereqs: Cloudflare account + `node` installed.

1. Install Wrangler:
   - `npm i -g wrangler`
2. Login:
   - `wrangler login`
3. Deploy from this folder:
   - `cd relay/cloudflare`
   - `wrangler deploy`

Wrangler prints a `https://...workers.dev` URL. Use that URL in the extension’s **Device pairing → Relay URL (HTTPS)** setting.

## Health check

- `GET /health` returns `{ ok: true }` (no auth), useful for validating the URL from the popup.

## Security notes

- The extension encrypts all payloads end-to-end; the relay does not decrypt.
- Requests are authenticated with `Authorization: Bearer <secret>` (the secret is part of the pairing code).
- For production: add rate limiting and retention controls as needed for your environment.

