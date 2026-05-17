# SafeBrowse DoH Service — MVP Design

**Status:** Approved
**Date:** 2026-05-17
**Author:** Dipesh Thapa (with brainstorming session)
**Scope:** End-to-end MVP slice of a DNS-over-HTTPS filtering service for SafeBrowse, covering iOS, Android, and desktop. No user accounts. Three fixed filter presets (Kids, Teens, Family). Aggregate-only logging.

---

## 1. Purpose

Provide DNS-based web safety protection for SafeBrowse users on mobile devices, where browser extensions cannot run. Solve the "child mostly uses phone" gap by intercepting DNS resolution at the network layer.

The MVP proves the technical pattern end-to-end (Cloudflare Worker DoH server + signed iOS profile + Android Private DNS hostname + landing page + verification) with a single shared filter per level, before investing in per-user accounts, parent dashboards, or billing.

Success at the MVP stage means a public beta with 50–500 users installing successfully, validating the technical pattern, and surfacing real-world feedback to inform a v2 (per-user accounts, parent PWA).

## 2. Non-goals (out of scope for this MVP)

The following are deliberately deferred to future sub-projects:

- User accounts / authentication
- Per-family or per-child configuration (only 3 fixed presets)
- Parent dashboard / PWA
- Push notifications / per-user alerts
- Custom blocklist or allowlist management
- Time-based filtering (bedtime, focus mode, scheduling)
- Payment / subscription (service is free during MVP)
- Schools / B2B tier features
- Per-user DoH endpoint or encrypted audit log
- Internationalisation (English only)
- Native mobile app wrapper (e.g. PWABuilder/Capacitor)
- Changes to the existing browser extension (desktop install simply links to the existing Chrome Web Store listing)

## 3. Requirements

### 3.1 Functional

- Three filter levels installable independently: **Kids**, **Teens**, **Family**.
- Each level corresponds to a distinct DoH endpoint hostname.
- iOS users receive a signed `.mobileconfig` that auto-installs as a DNS configuration profile.
- Android (9+) users receive a hostname to enter under Settings → Private DNS.
- Desktop users are directed to the existing SafeBrowse Chrome / Firefox extension; optional router-DNS instructions are provided.
- A `/verify` page on the landing site confirms whether the user's device is currently routed through SafeBrowse DNS.
- A public `/stats` page displays aggregate, anonymised usage statistics (transparency).

### 3.2 Non-functional

- **Latency:** median DoH query latency < 50 ms globally.
- **Availability:** rely on Cloudflare's edge SLA (≥ 99.99 %). Worker must fail-open if the blocklist KV is unavailable so users do not lose internet access.
- **Privacy:** aggregate-only logging. No per-IP query history, no domain ↔ IP mapping, no user identity stored. IP samples hashed with a daily-rotated salt and discarded within 24 hours.
- **Cost:** ≤ £20/month at MVP scale (≤ 500 users).
- **Scale headroom:** architecture must support per-family routing later without rewrite.

### 3.3 Platforms

- iOS 14+ (iPhone, iPad) — DoH via signed configuration profile.
- Android 9+ (Pie) — DoT via Private DNS setting.
- Desktop (Chromium browsers + Firefox) — handled by existing SafeBrowse extension; landing page links out.

### 3.4 Branding & domain

- Hosted under `cyberheroez.co.uk` subdomains.
- Landing: `safebrowse.cyberheroez.co.uk`
- DoH endpoints: `kids.dns.cyberheroez.co.uk`, `teens.dns.cyberheroez.co.uk`, `family.dns.cyberheroez.co.uk`
- Verification test domains (used only by the `/verify` page; see §8):
  - `safebrowse-kids-test.cyberheroez.co.uk` — blocked only in Kids list.
  - `safebrowse-teens-test.cyberheroez.co.uk` — blocked only in Teens list.
  - `safebrowse-family-test.cyberheroez.co.uk` — blocked only in Family list.
  - `safebrowse-allow-test.cyberheroez.co.uk` — present in no list (always resolves).

## 4. Architecture

### 4.1 High-level

```
User devices (iOS / Android / Desktop)
        │
        │  DoH (RFC 8484) or DoT (Android Private DNS)
        ▼
Cloudflare edge
        │
        ├─ SafeBrowse DoH Worker  ← handles dns-query
        │    │
        │    ├─ Cloudflare KV (blocklist data per level)
        │    ├─ Durable Object (atomic stats counters)
        │    └─ Upstream: 1.1.1.1 (Cloudflare public DNS)
        │
        └─ Cloudflare Pages       ← landing + profiles + stats
             ├─ index.html
             ├─ verify.html
             ├─ stats.html
             └─ profiles/{kids,teens,family}.mobileconfig (signed)
```

### 4.2 Components

| Component | Tech | Responsibility |
|-----------|------|----------------|
| DoH Worker | Cloudflare Workers (JavaScript) | Receive DoH queries, match blocklist, forward allowed queries upstream, increment stats |
| Blocklist KV | Cloudflare KV | Per-level domain lists, indexed for O(1) lookup with subdomain fallback |
| Stats DO | Durable Objects | Atomic daily counters (queries, blocks, top blocked, unique installs) |
| Stats Cron | Cloudflare Workers Cron | Daily aggregation at 00:05 UTC; drops raw IP hashes |
| Landing site | Static HTML / CSS / vanilla JS on Cloudflare Pages | Public install portal, verification, stats, privacy/ToS |
| `.mobileconfig` files | Plist XML, CMS-signed via Apple Developer cert | Three pre-signed iOS profiles, one per filter level |
| Signing pipeline | Node script using `openssl smime` | Build-time signing of profiles |
| Verification test domains | Cloudflare DNS records | One always-blocked domain, one always-allowed, for the `/verify` page to probe |

### 4.3 Repository layout

New folders added to existing `safebrowse-ai` repo:

```
safebrowse-ai/
├─ src/                 (existing — browser extension)
├─ data/                (existing — extension blocklist data)
├─ relay/               (existing — pairing relay precedent)
├─ dns/                 NEW
│  ├─ worker/
│  │  ├─ src/
│  │  │  ├─ index.js          DoH endpoint + router
│  │  │  ├─ blocklist.js      Domain match logic
│  │  │  ├─ resolver.js       Upstream forwarding
│  │  │  ├─ stats.js          Counter logic + IP hashing
│  │  │  └─ stats-do.js       Durable Object class
│  │  ├─ __tests__/
│  │  └─ wrangler.toml
│  ├─ data/
│  │  ├─ sources/
│  │  │  ├─ adult.json
│  │  │  ├─ gambling.json
│  │  │  ├─ violence.json
│  │  │  ├─ social.json
│  │  │  ├─ gaming.json
│  │  │  ├─ drugs.json
│  │  │  ├─ malware.json
│  │  │  ├─ phishing.json
│  │  │  └─ _sentinels.json    Test domains injected per level
│  │  └─ built/               Generated per level (gitignored after gen)
│  └─ scripts/
│     ├─ build-blocklist.mjs
│     └─ upload-blocklist.mjs
├─ landing/             NEW
│  ├─ index.html
│  ├─ verify.html
│  ├─ stats.html
│  ├─ privacy.html
│  ├─ terms.html
│  ├─ assets/
│  └─ profiles/               Symlink or copy of signed profiles
├─ profiles/            NEW
│  ├─ kids.mobileconfig.template
│  ├─ teens.mobileconfig.template
│  ├─ family.mobileconfig.template
│  ├─ build/                  Signed output (gitignored)
│  └─ scripts/
│     └─ sign-profiles.mjs
└─ ... (existing files)
```

## 5. DoH Worker design

### 5.1 Endpoint contract (RFC 8484)

```
POST https://<level>.dns.cyberheroez.co.uk/dns-query
  Content-Type: application/dns-message
  Body: binary DNS query

GET  https://<level>.dns.cyberheroez.co.uk/dns-query?dns=<base64url>
```

Where `<level>` ∈ `{ kids, teens, family }`. Any other path or hostname returns 400 / 404.

### 5.2 Request handling pseudocode

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const level = url.hostname.split('.')[0];
    if (!['kids', 'teens', 'family'].includes(level)) {
      return new Response('Invalid filter level', { status: 400 });
    }
    if (url.pathname !== '/dns-query') {
      return new Response('Not found', { status: 404 });
    }

    const query = await parseQuery(request);
    const domain = extractDomain(query);
    const isBlocked = await checkBlocked(env.BLOCKLIST_KV, level, domain);

    let response;
    if (isBlocked) {
      response = buildNxdomainResponse(query);
      ctx.waitUntil(incrementStats(env, level, 'blocks', { domain }));
    } else {
      response = await forwardToUpstream(query);
      ctx.waitUntil(incrementStats(env, level, 'queries'));
    }

    return new Response(response, {
      headers: { 'Content-Type': 'application/dns-message' },
    });
  },
};
```

### 5.3 Blocklist lookup

```javascript
async function checkBlocked(kv, level, domain) {
  // Exact match
  if (await kv.get(`${level}:domain:${domain}`)) return true;

  // Subdomain walk: img.pornhub.com → pornhub.com
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (await kv.get(`${level}:domain:${parent}`)) return true;
  }
  return false;
}
```

A short-lived in-Worker cache (Map keyed by `level:domain`, 30 s TTL) reduces KV reads for hot domains.

### 5.4 Error handling

| Scenario | Behavior |
|----------|----------|
| Malformed DoH query | 400 with empty body |
| Unknown subdomain | 400 with message |
| KV unavailable | **Fail-open** — forward to upstream so user does not lose internet |
| Upstream timeout | Return SERVFAIL |
| Worker exception | Cloudflare logs; return SERVFAIL |
| Excessive request rate per IP | Cloudflare built-in DDoS protection |

The fail-open posture matches industry practice (e.g. NextDNS) — degraded filtering is preferable to broken browsing.

## 6. Blocklist data layer

### 6.1 KV key schema

```
<level>:domain:<domain>                value: "1"
stats:<level>:<YYYY-MM-DD>:queries     value: <int>
stats:<level>:<YYYY-MM-DD>:blocks      value: <int>
stats:<level>:<YYYY-MM-DD>:topblocked  value: JSON (top 100 blocked domains)
stats:<level>:<YYYY-MM-DD>:countries   value: JSON (per-country counts)
stats:<level>:<YYYY-MM-DD>:installs    value: <int> (unique daily IP hashes)
meta:blocklist:<level>:version         value: <hash>
meta:blocklist:<level>:count           value: <int>
meta:dailysalt                         value: <uuid> (rotated daily)
```

### 6.2 Filter level composition

| Level | Categories | Approx domain count |
|-------|------------|--------------------:|
| Kids | Adult + Gambling + Violence + Social + Gaming + Drugs | ~8,000 |
| Teens | Adult + Gambling + Drugs + Malware + Phishing | ~3,500 |
| Family | Adult + Malware + Phishing | ~2,500 |

### 6.3 Source blocklists

Curated per category in `dns/data/sources/`. Initial seed combines:

- `adult.json` — extends the existing `data/blocklist.json` (currently ~200 domains).
- `gambling.json` — community list (e.g. blocklistproject.github.io).
- `violence.json` — curated.
- `social.json` — major social media domains (used only in Kids level).
- `gaming.json` — major gaming / streaming domains (Kids level).
- `drugs.json` — drug-related sites.
- `malware.json` — URLhaus / OISD subset.
- `phishing.json` — extends existing `data/phishing_feed.json` + OpenPhish.

### 6.4 Update flow

```
edit dns/data/sources/*.json
  → npm run blocklist:build      (merge per level → dns/data/built/*.json)
  → npm run blocklist:upload     (push diffs to KV)
  → KV propagates globally within ~60 s
```

Blocklist updates **do not require a Worker redeploy** — data and code are decoupled.

### 6.5 Test sentinel domains

The `build-blocklist.mjs` script also injects per-level test sentinel domains used by `/verify` (see §8):

- `safebrowse-kids-test.cyberheroez.co.uk` → added only to the Kids built list.
- `safebrowse-teens-test.cyberheroez.co.uk` → added only to the Teens built list.
- `safebrowse-family-test.cyberheroez.co.uk` → added only to the Family built list.

These are not present in any source category file; they live in `dns/data/sources/_sentinels.json` and are injected exactly once per matching level.

### 6.6 Cost projection

At 1,000 users (≈5K queries/user/day, ≈5M total queries/day, average ≈5 KV reads per query):

- Raw KV reads: 25M/day = 750M/month → ≈ $375/month at $0.50 per million.
- With in-Worker hot-domain cache (top 1,000 domains cover ~90 % of traffic): 2.5M reads/day → ≈ $37/month.

In-Worker caching is therefore essential to keep MVP costs realistic.

## 7. Landing site

### 7.1 Structure (single page, progressive disclosure)

1. Hero: value proposition, four trust checkmarks (no app, all devices, free, privacy-first), CTA.
2. Step 1: Choose protection level — three cards (Kids / Teens / Family) listing categories blocked.
3. Step 2: Install on your device — three tabs (iPhone / Android / Desktop), auto-selected by User-Agent.
4. Step 3: Verify it's working — link to `/verify`.
5. Footer: privacy / support / GitHub / CyberHeroez CIC.

### 7.2 Platform install flows

**iOS:** download signed `.mobileconfig`, walk through Settings → Profile Downloaded → Install. Embed 30-second walkthrough video.

**Android:** display the relevant hostname (`<level>.dns.cyberheroez.co.uk`) with a Copy button and step-by-step Private DNS instructions.

**Desktop:** link to the existing SafeBrowse Chrome Web Store and Firefox AMO listings. Provide router DNS guide as a secondary option.

### 7.3 Tech

- Vanilla HTML, CSS, JS (~500 LOC). No build step.
- Cloudflare Pages hosting (auto-deploy from git).
- Cloudflare Pages built-in analytics (no cookies).
- WCAG AA accessibility.
- English only.

## 8. Verification mechanism (`/verify`)

The page loads four invisible test images in parallel — one per filter level plus a control:

| Domain | Behavior expected if NO SafeBrowse | Behavior expected if SafeBrowse active |
|--------|------------------------------------|----------------------------------------|
| `safebrowse-allow-test.cyberheroez.co.uk/pixel.png` | loads | loads (sanity check — confirms network is OK) |
| `safebrowse-kids-test.cyberheroez.co.uk/pixel.png` | loads | **fails** only on Kids filter |
| `safebrowse-teens-test.cyberheroez.co.uk/pixel.png` | loads | **fails** only on Teens filter |
| `safebrowse-family-test.cyberheroez.co.uk/pixel.png` | loads | **fails** only on Family filter |

Detection logic:

- If `allow-test` fails → likely network problem, not SafeBrowse. Show troubleshooting.
- If `allow-test` loads and all three level tests load → no SafeBrowse filter detected. Show install instructions.
- If `allow-test` loads and exactly one level test fails → that filter is active. Show ✅ with the detected level.
- If `allow-test` loads and multiple level tests fail → unexpected; show an "unknown configuration" diagnostic.

Each level-specific test domain is added exclusively to its own level's blocklist (see §6) so that detection is unambiguous.

## 9. `.mobileconfig` signing pipeline

### 9.1 Apple Developer setup (one-time)

1. Enrol CyberHeroez CIC in Apple Developer Program. Requires a D-U-N-S number for the CIC (free, ~3 weeks lead time) and the $99/year fee.
2. Provision a **Developer ID Installer** certificate via the developer portal.
3. Export the cert as `.p12` from Keychain. Store in:
   - Local: Mac Keychain.
   - CI: GitHub Actions encrypted secret (base64-encoded `.p12` + password).
   - Backup: encrypted offline copy.

### 9.2 Template

Three `.mobileconfig` templates (`profiles/{level}.mobileconfig.template`) using Apple's `com.apple.dnsSettings.managed` payload type with `DNSProtocol = HTTPS` and `ServerURL = https://<level>.dns.cyberheroez.co.uk/dns-query`.

### 9.3 Signing

```bash
openssl smime -sign \
  -in profiles/build/<level>.unsigned.mobileconfig \
  -out profiles/build/<level>.mobileconfig \
  -signer cert.p12 \
  -passin pass:$APPLE_CERT_PASSWORD \
  -outform der -nodetach
```

The Node wrapper (`profiles/scripts/sign-profiles.mjs`) injects fresh UUIDs per build, signs all three profiles, and writes to `profiles/build/`. The landing build copies signed profiles to `landing/profiles/`.

### 9.4 CI / CD (optional for MVP)

A GitHub Actions workflow at `.github/workflows/deploy-dns.yml` can sign profiles, deploy the Worker via wrangler, and deploy the landing page via wrangler-pages on push to `main`. For MVP, manual local signing is acceptable.

### 9.5 Cert renewal

Annual. Existing installed profiles are unaffected by cert expiry (signing is verified at install, not at runtime). Renewal flow: download new cert, replace `.p12` in Keychain / CI secrets, re-sign profiles, redeploy.

### 9.6 Distribution headers

Cloudflare Pages config for the `profiles/` directory:

```
Content-Type: application/x-apple-aspen-config
Content-Disposition: attachment; filename="SafeBrowse-<Level>.mobileconfig"
Cache-Control: public, max-age=300
```

## 10. Aggregate logging

### 10.1 What is stored

Daily aggregates only (24-hour rotation, then deleted):

- Total queries per level per day.
- Total blocks per level per day.
- Top 100 blocked domains per level per day.
- Per-country query counts.
- Estimated unique installs (count of daily-rotated, truncated IP hashes).

### 10.2 What is not stored

- Per-IP query history.
- Domain ↔ IP mapping.
- User identity.
- Raw IP addresses.

### 10.3 IP hashing

```javascript
const ipHash = await sha256(`${clientIp}:${dailySalt}:${level}`);
const truncatedHash = ipHash.slice(0, 12); // 48 bits → enough to count, not enough to identify
```

`meta:dailysalt` rotates every 24 hours, so yesterday's IP hash cannot be linked to today's. Salt rotation runs in the daily cron at 00:05 UTC.

### 10.4 Atomic counters

KV is eventually consistent and unsafe for concurrent increment, so a Durable Object (`StatsCounter`) is used for hot counters. Roughly 90 DO instances live at any time (3 levels × 30 days). DO cost at MVP scale: ≈ £1/month.

### 10.5 Public stats page (`/stats`)

Public, no-auth transparency page showing the last 24 hours' aggregates, plus an explicit list of what is **not** tracked. Updates from the daily cron output. Serves a dual marketing / trust purpose.

## 11. DNS infrastructure

### 11.1 Cloudflare DNS records (on `cyberheroez.co.uk`)

| Type | Name | Content | Proxied |
|------|------|---------|---------|
| CNAME | `safebrowse` | Cloudflare Pages | Yes |
| CNAME | `kids.dns` | Workers Custom Domain | No (DoH incompatible with HTTP proxy) |
| CNAME | `teens.dns` | Workers Custom Domain | No |
| CNAME | `family.dns` | Workers Custom Domain | No |
| CNAME | `safebrowse-allow-test` | Cloudflare Pages | Yes |
| CNAME | `safebrowse-kids-test` | Cloudflare Pages | Yes |
| CNAME | `safebrowse-teens-test` | Cloudflare Pages | Yes |
| CNAME | `safebrowse-family-test` | Cloudflare Pages | Yes |

Worker custom domains for the three `<level>.dns` subdomains are configured via the Cloudflare dashboard; SSL certs are auto-provisioned.

### 11.2 `wrangler.toml`

```toml
name = "safebrowse-doh"
main = "src/index.js"
compatibility_date = "2026-05-01"

[[kv_namespaces]]
binding = "BLOCKLIST_KV"
id = "<created via wrangler kv:namespace create>"

[[durable_objects.bindings]]
name = "STATS_DO"
class_name = "StatsCounter"

[[migrations]]
tag = "v1"
new_classes = ["StatsCounter"]

[triggers]
crons = ["5 0 * * *"]

routes = [
  { pattern = "kids.dns.cyberheroez.co.uk/*",   custom_domain = true },
  { pattern = "teens.dns.cyberheroez.co.uk/*",  custom_domain = true },
  { pattern = "family.dns.cyberheroez.co.uk/*", custom_domain = true },
]
```

### 11.3 Secrets

| Secret | Location |
|--------|----------|
| `UPSTREAM_DNS_URL` | `wrangler secret put` (Worker binding) |
| `APPLE_CERT_P12_BASE64` | Local `.env`, GitHub Actions secret |
| `APPLE_CERT_PASSWORD` | Local `.env`, GitHub Actions secret |

`.env` is gitignored (existing project pattern from `.env.example`).

## 12. Testing strategy

### 12.1 Unit (Vitest)

- `dns/worker/__tests__/blocklist.test.js` — exact match, subdomain walk, edge cases.
- `dns/worker/__tests__/resolver.test.js` — upstream forwarding, NXDOMAIN construction.
- `dns/worker/__tests__/stats.test.js` — counter increment, IP hashing determinism, salt rotation.
- `dns/worker/__tests__/router.test.js` — host header / path parsing.
- `profiles/__tests__/template.test.js` — UUID substitution, plist validity.
- `profiles/__tests__/signing.test.js` — signed output validates against test cert.
- `landing/__tests__/platform-detect.test.js` — User-Agent parsing.
- `landing/__tests__/verify-logic.test.js` — test-image error detection.

### 12.2 Integration

- Local Worker via `wrangler dev`, probed with `dig` and `curl --doh-url`.
- Verify blocked vs allowed domain behaviour, stats counter increments.

### 12.3 End-to-end manual

- iPhone (iOS 15+): install each of the three profiles, confirm "Verified" badge, confirm blocking and SafeSearch.
- Android (9+): set Private DNS hostname, confirm Settings shows Connected, confirm blocking.
- Mac: confirm `.mobileconfig` signing pipeline produces valid signed output.
- Browser matrix: Chrome, Safari, Firefox latest stable for the landing page.

## 13. Deployment

### 13.1 Pre-launch checklist

Infrastructure: Apple Developer enrolment, D-U-N-S verified, signing cert provisioned and backed up, Cloudflare zone active, subdomain DNS records created, Worker deployed with custom domains, KV namespace populated, Durable Objects deployed.

Code: Worker complete, tests green, blocklist curated, landing page complete, verification page tested on iOS / Android / desktop, privacy / ToS reviewed, signed profiles tested on a real iPhone.

Operational: support email configured, Cloudflare alerts on Worker errors / latency, basic monitoring, rollback plan documented, beta announcement prepared.

### 13.2 Sequence

1. **Internal dogfood (day 0)** — deploy to a staging subdomain, install on your own devices, 2–3 days of use, fix obvious issues.
2. **Alpha (day 3–7)** — 5–10 trusted users, gather feedback, iterate.
3. **Public beta (day 7+)** — production live, announce to HN, Reddit (r/privacy, r/parenting), Twitter, CIC network, schools mailing list. Monitor error rates, install success, support volume.

### 13.3 Rollback

- Worker bug → `wrangler rollback`.
- Blocklist corruption → previous versioned KV entries, repoint `meta:blocklist:<level>:version`.
- Compromised cert → revoke in Apple portal, issue new, re-sign, landing-page banner.

## 14. Success metrics (4 weeks post-launch)

| Metric | Target | Stretch |
|--------|--------|---------|
| Unique installed devices | 50 | 500 |
| Daily active devices | 30 | 300 |
| Install success rate (`/verify` ✅) | 80 % | 90 % |
| Queries blocked per day | 50 K | 1 M |
| Worker error rate | < 0.1 % | < 0.01 % |
| Median query latency | < 50 ms | < 30 ms |
| Support emails per week | < 10 | < 3 |

If metrics are weak, iterate on onboarding UX, blocklist quality, and marketing. If strong, begin designing v2 (per-user accounts + parent PWA) as the next sub-project.

## 15. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Apple Developer enrolment delays (D-U-N-S) | Start enrolment day 1; fallback to unsigned profile with explicit warning for alpha only. |
| Blocklist false positives | Curated initial lists from reputable sources; clear false-positive reporting flow on the landing page. |
| Cloudflare outage | Status-page mention; fail-open Worker behaviour; not SLA-bound on free tier. |
| DDoS / abuse | Cloudflare auto-mitigates; per-IP rate limiting at Worker level if needed. |
| UK Investigatory Powers Act request | Aggregate-only logging means minimal data to disclose; obtain legal advice if a request is received. |
| Negative framing ("DNS censorship") | Pre-emptive transparency: open-source code, public stats page, explicit opt-in only. |
| Tech-savvy children bypass via VPN / Settings | Acknowledged limitation; recommend pairing with Apple Screen Time / Google Family Link in docs. |

## 16. Effort estimate

| Workstream | Hours (solo) |
|------------|-------------:|
| Apple Developer enrolment + cert | 4–8 (mostly waiting) |
| DoH Worker code | 20–30 |
| Blocklist data curation | 10–15 |
| `.mobileconfig` templates + signing pipeline | 8–12 |
| Landing page | 20–30 |
| Verification page | 4–6 |
| Stats page | 4–6 |
| Testing (unit + manual) | 15–20 |
| DNS + Cloudflare configuration | 4–8 |
| Privacy policy + ToS | 4–8 |
| Beta launch + first feedback iteration | 10–15 |
| **Total** | **103–158 hours** |

At part-time pace (≈10 hrs/week): **10–16 weeks**.
At full-time pace (≈40 hrs/week): **3–4 weeks**.

## 17. Open questions for future sub-projects

These do not block MVP delivery but are worth flagging for the v2 spec:

- Should the parent PWA be served from the same Cloudflare Pages site, or a separate subdomain?
- For per-family routing, will the URL pattern be `/<family-id>/dns-query` (path-based) or `<family-id>.dns.cyberheroez.co.uk` (subdomain)?
- Billing: Stripe direct integration vs. a payment processor designed for non-profits.
- Schools tier: bundled MDM policy export format (JAMF, Mosyle, Google Workspace).
- Blocklist curation governance once user base scales — community contributions, false-positive flow, etc.
