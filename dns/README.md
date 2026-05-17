# SafeBrowse DoH Service

DNS-over-HTTPS filtering Worker plus blocklist build/upload tooling.

## Layout

- `worker/` — Cloudflare Worker (DoH endpoint, fail-open, fail-closed strategies)
- `data/sources/` — Curated source blocklists (one JSON per category)
- `data/built/` — Per-level merged blocklists, generated; gitignored
- `scripts/` — Build + upload tooling

## Dev quick start

```bash
cd dns/worker
npm install
npx wrangler kv:namespace create BLOCKLIST_KV
# Paste the printed id into wrangler.toml
npm run test
npm run dev
# In another shell:
curl -H 'content-type: application/dns-message' \
  --data-binary '@test-query.bin' \
  http://localhost:8787/dns-query
```

See `docs/superpowers/specs/2026-05-17-safebrowse-doh-mvp-design.md` for the full design.
