# Pairing Relay (Dev)

`Safeguard` device pairing needs a small HTTPS relay so two different devices (different Google accounts) can exchange **encrypted** access requests and approvals.

This folder contains a minimal development relay that stores only encrypted blobs in memory.

## Run locally

1. `node relay/server.js`
2. Expose it via an HTTPS tunnel (the extension rejects `http://` and localhost/LAN for safety).
   - Example: `cloudflared tunnel --url http://localhost:8787`
   - Then use the generated `https://...` URL in the extension pairing settings.

For real use (Chrome Web Store), deploy it behind **HTTPS** on a public domain.

## Security notes

- The relay never sees decrypted content (the extension encrypts payloads end-to-end).
- The relay still sees metadata (timing, request volume, IPs at your host).
- For production: add persistence, rate limits, abuse protections, and short retention.
