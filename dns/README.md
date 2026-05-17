# SafeBrowse DoH Service

DNS-over-HTTPS filtering Worker plus blocklist build/upload tooling for
the SafeBrowse safety service.

> Spec: `docs/superpowers/specs/2026-05-17-safebrowse-doh-mvp-design.md`
> Plan: `docs/superpowers/plans/2026-05-17-doh-worker-backend.md`

## Layout

```
dns/
├─ worker/     Cloudflare Worker (DoH endpoint + StatsCounter DO + cron)
├─ data/
│  ├─ sources/   Curated per-category blocklists (committed)
│  └─ built/     Generated per-level blocklists (gitignored)
└─ scripts/   build-blocklist.mjs, upload-blocklist.mjs
```

## One-time setup

1. Install Wrangler globally **or** rely on the project-local one:
   ```bash
   cd dns/worker
   npm install
   ```

2. Authenticate Wrangler against your Cloudflare account:
   ```bash
   npx wrangler login
   ```

3. Create the KV namespace and paste the printed id into `wrangler.toml`:
   ```bash
   npx wrangler kv:namespace create BLOCKLIST_KV
   ```

4. (Optional) override the upstream DoH server. Default is
   `https://cloudflare-dns.com/dns-query`:
   ```bash
   npx wrangler secret put UPSTREAM_DNS_URL
   ```

## Day-to-day workflow

```bash
cd dns/worker

# Run the full test suite
npm test

# Build per-level blocklists from sources
npm run blocklist:build

# Push them to KV (production)
npm run blocklist:upload

# Dry-run upload (no KV writes)
npm run blocklist:upload:dry

# Local Worker
npm run dev
```

## Local end-to-end smoke check

With `npm run dev` running:

```bash
# Construct a DNS query for example.com using `dig` and pipe to curl.
QUERY=$(dig +noall +short -b - example.com @8.8.8.8 +qr +retry=0 \
  | head -1 | xxd -r -p | base64 -w 0)

curl -i \
  -H 'host: kids.dns.cyberheroez.co.uk' \
  -H 'content-type: application/dns-message' \
  "http://localhost:8787/dns-query?dns=$QUERY"
```

If you prefer a one-step helper, install `dnsproxy` or use `kdig`:

```bash
kdig @127.0.0.1 +https=/dns-query +tls-hostname=kids.dns.cyberheroez.co.uk \
  example.com
```

A blocked domain (`pornhub.com` against the seeded kids list) should
return `status: NXDOMAIN`. An allowed one (`example.com`) should return
the upstream's answer.

## Deployment

```bash
npm run deploy
```

Then attach the three custom domains via the Cloudflare dashboard:
- `kids.dns.cyberheroez.co.uk`
- `teens.dns.cyberheroez.co.uk`
- `family.dns.cyberheroez.co.uk`

(Custom domain provisioning is handled in the integration plan, not here.)
