# Integration + Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Operational nature:** unlike Plans 1 and 3, most tasks here require Cloudflare account access, DNS control, real iPhone / Android devices, and human launch decisions. Tasks are tagged **🧑 You** (requires the human operator) or **🤖 Agent** (an AI agent or automation can execute). Run them in order.

**Goal:** Move SafeBrowse from local-only to a publicly accessible DoH service with three filter subdomains and a polished landing site, validated on real iOS and Android devices, and softly launched to a small beta cohort.

**Architecture:** Cloudflare end-to-end. Worker bound to three custom domains (`kids.dns`, `teens.dns`, `family.dns`). Cloudflare Pages bound to `safebrowse.cyberheroez.co.uk`. Four sentinel test domains (`safebrowse-allow-test`, `safebrowse-kids-test`, `safebrowse-teens-test`, `safebrowse-family-test`) resolved by Cloudflare's static origin. KV namespace seeded with the curated blocklists. Daily salt seeded at first deploy.

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Cloudflare Pages, Cloudflare DNS, Wrangler CLI, the user's iPhone + Android phone, the user's existing extension privacy/legal copy.

**Out of scope for this plan** (deferred indefinitely or to later plans): Plan 2 (signed `.mobileconfig`), per-family/per-child accounts, parent PWA, schools tier, billing, push notifications.

**References:**
- Spec: `docs/superpowers/specs/2026-05-17-safebrowse-doh-mvp-design.md`
- Plan 1 (Worker): `docs/superpowers/plans/2026-05-17-doh-worker-backend.md`
- Plan 3 (Landing): `docs/superpowers/plans/2026-05-17-landing-site-and-verify.md`

---

## Phase A — Infrastructure provisioning

### Task 0: Cloudflare prerequisites 🧑 You

**Files:** none.

- [ ] **Step 1: Verify Cloudflare account**

You need:
- A Cloudflare account with the `cyberheroez.co.uk` zone already in it
- Workers paid plan: **not required** for MVP (free tier covers ~100K req/day)
- Pages: free tier is fine

If `cyberheroez.co.uk` is not yet on Cloudflare, add it first (dashboard → Add a site → follow the nameserver-change instructions at your current registrar). Wait until the zone status shows "Active" before continuing.

- [ ] **Step 2: Wrangler login**

In a terminal:

```bash
cd dns/worker
npx wrangler login
```

This opens a browser window. Approve. Verify with:

```bash
npx wrangler whoami
```

You should see the email tied to your Cloudflare account.

- [ ] **Step 3: Record your account id**

```bash
npx wrangler whoami
```

Note the account id printed. You will paste it into `wrangler.toml` in Task 1.

---

### Task 1: Create production KV namespace 🧑 You

**Files:**
- Modify: `dns/worker/wrangler.toml` (replace `PLACEHOLDER_FILL_AFTER_NAMESPACE_CREATE`)

- [ ] **Step 1: Create the namespace**

```bash
cd dns/worker
npx wrangler kv:namespace create BLOCKLIST_KV
```

Output looks like:

```
🌀 Creating namespace with title "safebrowse-doh-BLOCKLIST_KV"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "BLOCKLIST_KV", id = "abcdef0123456789..." }
```

- [ ] **Step 2: Paste the id into `wrangler.toml`**

Open `dns/worker/wrangler.toml` and replace the placeholder line:

```toml
id = "PLACEHOLDER_FILL_AFTER_NAMESPACE_CREATE"
```

with the real id from Step 1:

```toml
id = "abcdef0123456789..."
```

- [ ] **Step 3: (Optional) Create a preview namespace for `wrangler dev`**

If you want local dev to use a separate KV from production:

```bash
npx wrangler kv:namespace create BLOCKLIST_KV --preview
```

Add `preview_id = "..."` next to `id` in `wrangler.toml`.

- [ ] **Step 4: Commit the wrangler.toml update**

```bash
cd ..
git add dns/worker/wrangler.toml
git commit -m "chore(dns): bind production BLOCKLIST_KV namespace"
```

---

### Task 2: Seed the daily salt 🧑 You

The Worker reads `meta:dailysalt` for IP hashing. The daily cron rotates it, but at first deploy the key doesn't exist yet; seed it once.

- [ ] **Step 1: Write an initial salt**

```bash
cd dns/worker
npx wrangler kv:key put --binding BLOCKLIST_KV \
  "meta:dailysalt" "$(uuidgen)"
```

- [ ] **Step 2: Verify**

```bash
npx wrangler kv:key get --binding BLOCKLIST_KV "meta:dailysalt"
```

Should print a UUID.

---

### Task 3: Upload blocklists to production KV 🧑 You

- [ ] **Step 1: Build the blocklists**

```bash
cd dns/worker
npm run blocklist:build
```

Should print three lines like `built kids: 55 domains (version ...)`.

- [ ] **Step 2: Dry-run the upload first**

```bash
npm run blocklist:upload:dry
```

Should print three "prepared … entries for …" lines and no errors.

- [ ] **Step 3: Upload for real**

```bash
npm run blocklist:upload
```

This takes 30–60 seconds (3 bulk PUTs against KV).

- [ ] **Step 4: Spot-check a few keys**

```bash
npx wrangler kv:key get --binding BLOCKLIST_KV "kids:domain:pornhub.com"
# Expect: 1

npx wrangler kv:key get --binding BLOCKLIST_KV "meta:blocklist:kids:count"
# Expect: 55  (or whatever the build script printed)
```

---

### Task 4: Deploy the DoH Worker 🧑 You

- [ ] **Step 1: Deploy**

```bash
cd dns/worker
npm run deploy
```

Wrangler will:
1. Bundle the Worker
2. Upload to Cloudflare
3. Bind the KV namespace and the StatsCounter Durable Object
4. Register the daily cron trigger

Successful output ends with a URL like `https://safebrowse-doh.<your-subdomain>.workers.dev`.

- [ ] **Step 2: Smoke-check via the workers.dev URL**

```bash
WORKER_URL="https://safebrowse-doh.<your-subdomain>.workers.dev"
curl -i \
  -H 'host: kids.dns.cyberheroez.co.uk' \
  "${WORKER_URL}/dns-query?dns=q80BAAABAAAAAAAAB3Bvcm5odWIDY29tAAABAAE"
```

Should return `HTTP/1.1 200 OK` with `Content-Type: application/dns-message` and an NXDOMAIN response (4th byte ends in `03`).

If you get a 400 ("invalid filter level"), the Host header isn't being forwarded — that's expected on the bare workers.dev URL; the real test comes after custom domain attach (Task 7).

---

### Task 5: Provision DNS records 🧑 You

Done in the **Cloudflare dashboard** → DNS → Records.

> Modern Cloudflare workflow: you do **not** need to pre-create DNS records for the DoH subdomains or the landing-site subdomain. When you attach the Worker custom domain (Task 6) and the Pages custom domain (Task 8), Cloudflare creates the records automatically with the right configuration (CNAME flattened to A/AAAA, correct proxy state, auto-managed SSL).
>
> The only records you need to add manually are the four test sentinel subdomains used by `/verify`, because they are not associated with a Worker or Pages binding.

- [ ] **Step 1: Test sentinel domains for `/verify`**

These need to resolve to **a real reachable IP** that serves an image, so that `/verify` can probe them. The easiest setup: serve a 1-pixel PNG from Cloudflare Pages at `safebrowse.cyberheroez.co.uk/test-pixel.png` and point all four sentinels at the same Pages distribution. Then the Worker (via blocklist) decides whether to allow or block.

| Type  | Name                          | Target           | Proxy |
|-------|-------------------------------|------------------|-------|
| CNAME | `safebrowse-allow-test`       | `safebrowse.cyberheroez.co.uk` | proxied |
| CNAME | `safebrowse-kids-test`        | `safebrowse.cyberheroez.co.uk` | proxied |
| CNAME | `safebrowse-teens-test`       | `safebrowse.cyberheroez.co.uk` | proxied |
| CNAME | `safebrowse-family-test`      | `safebrowse.cyberheroez.co.uk` | proxied |

The blocklist already contains the three level-specific sentinels (see `dns/data/sources/_sentinels.json`). The `allow-test` sentinel is intentionally NOT in any blocklist, so it always resolves.

- [ ] **Step 2: Verify DNS propagation for sentinels**

```bash
dig +short safebrowse-allow-test.cyberheroez.co.uk
dig +short safebrowse-kids-test.cyberheroez.co.uk
```

Both should resolve to Cloudflare IPs within ~60 seconds. (The DoH subdomain and `safebrowse.` subdomain records will be created in Tasks 6 and 8.)

---

### Task 6: Attach Worker custom domains 🧑 You

Cloudflare dashboard → Workers & Pages → `safebrowse-doh` → Settings → Triggers → Custom Domains.

- [ ] **Step 1: Add three custom domains, one at a time**

For each:
1. Click "Add Custom Domain"
2. Enter the full domain (e.g. `kids.dns.cyberheroez.co.uk`)
3. Click "Add Custom Domain"

Cloudflare will auto-provision a Let's Encrypt cert (takes 30 seconds to a few minutes per domain).

Add:
- `kids.dns.cyberheroez.co.uk`
- `teens.dns.cyberheroez.co.uk`
- `family.dns.cyberheroez.co.uk`

- [ ] **Step 2: Wait until cert status shows "Active"**

Refresh the page until each custom domain shows the green "Active" badge.

- [ ] **Step 3: Smoke-check with the real host header**

```bash
curl -i \
  -H 'content-type: application/dns-message' \
  "https://kids.dns.cyberheroez.co.uk/dns-query?dns=q80BAAABAAAAAAAAB3Bvcm5odWIDY29tAAABAAE"
```

Expect `HTTP/2 200`, `content-type: application/dns-message`, NXDOMAIN response bytes.

```bash
curl -i \
  -H 'content-type: application/dns-message' \
  "https://kids.dns.cyberheroez.co.uk/dns-query?dns=q80BAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE"
```

Expect `HTTP/2 200` with an answer section (`ANCOUNT > 0`). This domain is allowed; Worker forwards to `1.1.1.1`.

- [ ] **Step 4: Quick check the other two levels**

```bash
curl -s -o /dev/null -w 'teens: %{http_code}\n' \
  "https://teens.dns.cyberheroez.co.uk/dns-query?dns=q80BAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE"

curl -s -o /dev/null -w 'family: %{http_code}\n' \
  "https://family.dns.cyberheroez.co.uk/dns-query?dns=q80BAAABAAAAAAAAB2V4YW1wbGUDY29tAAABAAE"
```

Both should print `200`.

---

### Task 7: Deploy the landing site 🧑 You

- [ ] **Step 0: Confirm `landing/public/pixel.png` exists**

The `/verify` page probes the four sentinel domains by loading `pixel.png`. The Pages site must serve a real image so the "allow" probe loads successfully.

```bash
ls landing/public/pixel.png
```

If missing, create a 1×1 transparent PNG (16 bytes, easiest via Python):

```bash
python3 -c "
import base64
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
open('landing/public/pixel.png', 'wb').write(png)
"
git add landing/public/pixel.png
git commit -m "feat(landing): 1x1 transparent pixel for /verify probes"
```

- [ ] **Step 1: Build unsigned profiles + copy them into `public/`**

```bash
cd landing
npm run build:profiles
```

Should print three "wrote …" lines.

- [ ] **Step 2: Deploy to Pages**

```bash
npm run deploy
```

The first deploy will prompt you to create a Pages project. Accept the default name (`safebrowse-landing`) or pick one.

Output ends with a URL like `https://<random>.safebrowse-landing.pages.dev`.

- [ ] **Step 3: Smoke-check the workers.dev URL**

Open the printed URL in a browser. The landing page should render. Spot-check:
- `/verify` returns 200
- `/profiles/kids.mobileconfig` downloads as `SafeBrowse-Kids.mobileconfig` (check headers via `curl -sI`)

---

### Task 8: Attach Pages custom domains 🧑 You

Cloudflare dashboard → Workers & Pages → `safebrowse-landing` → Custom Domains.

- [ ] **Step 1: Add `safebrowse.cyberheroez.co.uk`**

Click "Set up a custom domain" → enter `safebrowse.cyberheroez.co.uk` → confirm.

Cloudflare auto-creates the CNAME record and provisions SSL.

- [ ] **Step 2: Add the four sentinel domains too**

Repeat the "Set up a custom domain" flow for each, so the Pages distribution serves `pixel.png` under each Host:

- `safebrowse-allow-test.cyberheroez.co.uk`
- `safebrowse-kids-test.cyberheroez.co.uk`
- `safebrowse-teens-test.cyberheroez.co.uk`
- `safebrowse-family-test.cyberheroez.co.uk`

> These sentinel attachments are what make `/verify` work end-to-end. Without them, Pages returns "no application here" for those hostnames and `/verify` always reports "network problem".

- [ ] **Step 3: Wait until all five show "Active"**

Usually within 1–2 minutes per domain.

- [ ] **Step 4: Smoke-check from a browser**

Open https://safebrowse.cyberheroez.co.uk/ — landing page should render with the lock icon.

```bash
curl -sI https://safebrowse.cyberheroez.co.uk/profiles/kids.mobileconfig | \
  grep -iE 'content-type|content-disposition'
```

Expect:

```
Content-Type: application/x-apple-aspen-config
Content-Disposition: attachment; filename="SafeBrowse-Kids.mobileconfig"
```

Also check the allow sentinel serves the pixel:

```bash
curl -sI https://safebrowse-allow-test.cyberheroez.co.uk/pixel.png | grep -iE 'http|content-type'
```

Expect `HTTP/2 200` and `content-type: image/png`.

---

## Phase B — Real-device validation

### Task 9: iPhone end-to-end test 🧑 You

You need: an iPhone running iOS 15+ that you're willing to install an unsigned configuration profile on. **Recommended:** start with your own device, not a child's, until everything is proven.

- [ ] **Step 1: Open Safari on the iPhone**

Navigate to https://safebrowse.cyberheroez.co.uk/.

- [ ] **Step 2: Pick a level (e.g. Family — least restrictive)**

Click "Family" → "Download profile" on the iOS tab.

- [ ] **Step 3: Install the profile**

iOS will show "Profile Downloaded" notification. Open Settings → tap "Profile Downloaded" (or Settings → General → VPN & Device Management).

You will see a red **⚠ Unverified** warning at the top. This is expected (Plan 2 deferred). Tap "Install" anyway, enter your passcode, and tap "Install" two more times to confirm.

- [ ] **Step 4: Verify activation**

In iOS Settings → General → VPN, Device Management → "SafeBrowse — Family Filter" should be listed.

- [ ] **Step 5: Test in Safari**

Visit https://safebrowse.cyberheroez.co.uk/verify in Safari. After ~5 seconds it should show:

> ✅ SafeBrowse is active — FAMILY filter

- [ ] **Step 6: Test real blocking**

In Safari, try to visit a blocked domain (e.g. `https://pornhub.com`). Should fail to load (NXDOMAIN → "Server cannot be found").

Try an allowed domain (`https://example.com`). Should load normally.

- [ ] **Step 7: Test in non-Safari app**

Open the YouTube app, Instagram app, or any other app. They should continue to function (allowed traffic forwards upstream). Try the Chrome app and visit a blocked domain — also blocked, confirming the profile is system-wide.

- [ ] **Step 8: Try a stricter level**

Settings → General → VPN, Device Management → SafeBrowse — Family Filter → Remove Profile (enter passcode).

Repeat steps 1–6 with the **Teens** profile, confirming the level switch works end-to-end.

- [ ] **Step 9: Remove the test profile (cleanup)**

Same removal flow as Step 8. Confirm Safari can again resolve previously-blocked domains.

---

### Task 10: Android end-to-end test 🧑 You

You need: an Android device on Android 9 (Pie) or newer.

- [ ] **Step 1: Open the landing site in Chrome on Android**

Navigate to https://safebrowse.cyberheroez.co.uk/.

- [ ] **Step 2: Pick the Family level**

Click "Family" → switch to the "Android" tab → tap the "Copy" button next to the hostname. You should see `family.dns.cyberheroez.co.uk` copied.

- [ ] **Step 3: Apply Private DNS**

Open Android Settings → Network & Internet → Private DNS (path varies slightly per OEM — on Samsung: Connections → More connection settings → Private DNS).

Select "Private DNS provider hostname" → paste → Save.

After a few seconds the status should show "Connected".

- [ ] **Step 4: Verify activation**

Open Chrome and visit https://safebrowse.cyberheroez.co.uk/verify. After ~5 seconds expect:

> ✅ SafeBrowse is active — FAMILY filter

- [ ] **Step 5: Test blocking and forwarding**

Visit `https://pornhub.com` in Chrome — should fail (`DNS_PROBE_FINISHED_NXDOMAIN`).

Visit `https://example.com` — should load.

- [ ] **Step 6: Try app-level blocking**

Open the TikTok app (or any app on a domain that's in the Kids list). It should fail to connect, proving Android Private DNS applies system-wide, not just to browsers.

(You may want to repeat with the Kids hostname for the strictest test — `kids.dns.cyberheroez.co.uk` blocks social apps including TikTok.)

- [ ] **Step 7: Restore default (cleanup)**

Settings → Private DNS → choose "Automatic" (or "Off").

---

### Task 11: Multi-platform smoke matrix 🧑 You

Optional but recommended before a wider beta announce. Walk through the install flow in each browser:

- [ ] macOS Safari, latest stable
- [ ] macOS Chrome, latest stable
- [ ] macOS Firefox, latest stable
- [ ] Windows Edge, latest stable (if you have a Windows device or VM)
- [ ] Android stock Chrome
- [ ] iOS Safari

Look for: rendering glitches, broken images, copy-button failures, font issues, dark-mode anomalies. Note anything in a list and decide what to fix before announcing.

---

## Phase C — Public stats page (code work)

### Task 12: Add a Worker route for stats JSON 🤖 Agent

The landing site needs a JSON endpoint to read aggregate stats. Add a small route to the DoH Worker.

**Files:**
- Modify: `dns/worker/src/index.js`
- Create: `dns/worker/__tests__/stats-endpoint.test.js`

- [ ] **Step 1: Write the failing test**

Create `dns/worker/__tests__/stats-endpoint.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { env } from 'cloudflare:test';

describe('GET /stats.json', () => {
  beforeEach(async () => {
    // Seed yesterday's snapshot for each level
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const y = yesterday.toISOString().slice(0, 10);
    await env.BLOCKLIST_KV.put(`stats:kids:${y}`, JSON.stringify({ queries: 100, blocks: 20, installs: 3 }));
    await env.BLOCKLIST_KV.put(`stats:teens:${y}`, JSON.stringify({ queries: 50, blocks: 5, installs: 1 }));
    await env.BLOCKLIST_KV.put(`stats:family:${y}`, JSON.stringify({ queries: 25, blocks: 1, installs: 1 }));
  });

  it('returns aggregate JSON for yesterday across all levels', async () => {
    const req = new Request('https://safebrowse.cyberheroez.co.uk/stats.json');
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toMatch(/json/);
    const data = await resp.json();
    expect(data.totals).toEqual({ queries: 175, blocks: 26, installs: 5 });
    expect(data.byLevel.kids).toEqual({ queries: 100, blocks: 20, installs: 3 });
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns zeros when no snapshot exists', async () => {
    // Clear seeded data
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    const y = yesterday.toISOString().slice(0, 10);
    await env.BLOCKLIST_KV.delete(`stats:kids:${y}`);
    await env.BLOCKLIST_KV.delete(`stats:teens:${y}`);
    await env.BLOCKLIST_KV.delete(`stats:family:${y}`);

    const req = new Request('https://safebrowse.cyberheroez.co.uk/stats.json');
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    const data = await resp.json();
    expect(data.totals).toEqual({ queries: 0, blocks: 0, installs: 0 });
  });

  it('sets permissive CORS so the landing site can fetch it', async () => {
    const req = new Request('https://safebrowse.cyberheroez.co.uk/stats.json');
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.headers.get('access-control-allow-origin')).toBe('*');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dns/worker
npm test -- stats-endpoint
```

Expected: FAIL — current Worker rejects unknown hostname / path.

- [ ] **Step 3: Add a stats handler to `index.js`**

In `dns/worker/src/index.js`, **inside the `default.fetch` function**, add a new branch _before_ the `extractLevel(url.hostname)` line:

```javascript
    // Public stats endpoint — accessible from any host on a GET /stats.json
    if (url.pathname === '/stats.json' && request.method === 'GET') {
      return statsJson(env);
    }
```

Then at the bottom of the file (before the helper functions), add:

```javascript
async function statsJson(env) {
  const yesterday = new Date(Date.now() - 86_400_000);
  const yKey = dateKey(yesterday);
  const levels = ['kids', 'teens', 'family'];

  const byLevel = {};
  let totalQ = 0, totalB = 0, totalI = 0;

  for (const level of levels) {
    const raw = await env.BLOCKLIST_KV.get(`stats:${level}:${yKey}`);
    const snap = raw ? JSON.parse(raw) : { queries: 0, blocks: 0, installs: 0 };
    byLevel[level] = snap;
    totalQ += snap.queries;
    totalB += snap.blocks;
    totalI += snap.installs;
  }

  return Response.json({
    date: yKey,
    totals: { queries: totalQ, blocks: totalB, installs: totalI },
    byLevel,
  }, {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'public, max-age=300',
    },
  });
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test
```

Expected: all tests PASS (53 existing + 3 new = 56).

- [ ] **Step 5: Redeploy the Worker**

```bash
npm run deploy
```

- [ ] **Step 6: Smoke-check the live endpoint**

```bash
curl -s https://kids.dns.cyberheroez.co.uk/stats.json | jq .
```

(Hostname is intentionally arbitrary — the new route works on any custom domain bound to the Worker, even DNS subdomains. Eventually you can also bind a path on `safebrowse.cyberheroez.co.uk` via Pages → Functions or a separate Worker route.)

Expect a JSON document with `totals` and `byLevel`. On first run, all zeros — counters fill in after the next cron run.

- [ ] **Step 7: Commit**

```bash
cd ..
git add dns/worker/
git commit -m "feat(dns): public /stats.json aggregate endpoint"
```

---

### Task 13: Render the `/stats` page on the landing site 🤖 Agent

**Files:**
- Create: `landing/public/stats.html`
- Create: `landing/public/assets/stats.js`
- Create: `landing/__tests__/stats.test.js`

- [ ] **Step 1: Write the failing test**

Create `landing/__tests__/stats.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { formatStats } from '../public/assets/stats.js';

describe('formatStats', () => {
  it('formats large numbers with commas', () => {
    expect(formatStats({
      date: '2026-05-16',
      totals: { queries: 1234567, blocks: 5234, installs: 89 },
      byLevel: {
        kids:   { queries: 600000, blocks: 4000, installs: 40 },
        teens:  { queries: 400000, blocks: 1000, installs: 30 },
        family: { queries: 234567, blocks: 234, installs: 19 },
      },
    })).toMatchObject({
      queriesDisplay: '1,234,567',
      blocksDisplay: '5,234',
      installsDisplay: '89',
    });
  });

  it('computes percent share per level', () => {
    const out = formatStats({
      date: '2026-05-16',
      totals: { queries: 100, blocks: 50, installs: 10 },
      byLevel: {
        kids:   { queries: 40, blocks: 30, installs: 4 },
        teens:  { queries: 35, blocks: 15, installs: 3 },
        family: { queries: 25, blocks: 5,  installs: 3 },
      },
    });
    expect(out.byLevel.kids.queriesPct).toBe(40);
    expect(out.byLevel.teens.queriesPct).toBe(35);
    expect(out.byLevel.family.queriesPct).toBe(25);
  });

  it('handles zero totals gracefully (no NaN)', () => {
    const out = formatStats({
      date: '2026-05-16',
      totals: { queries: 0, blocks: 0, installs: 0 },
      byLevel: {
        kids:   { queries: 0, blocks: 0, installs: 0 },
        teens:  { queries: 0, blocks: 0, installs: 0 },
        family: { queries: 0, blocks: 0, installs: 0 },
      },
    });
    expect(out.byLevel.kids.queriesPct).toBe(0);
    expect(out.queriesDisplay).toBe('0');
  });
});
```

- [ ] **Step 2: Implement `stats.js`**

Create `landing/public/assets/stats.js`:

```javascript
const STATS_URL = 'https://kids.dns.cyberheroez.co.uk/stats.json';

export function formatStats(raw) {
  const fmt = (n) => n.toLocaleString('en-GB');
  const total = raw.totals.queries || 0;
  const byLevel = {};
  for (const [level, snap] of Object.entries(raw.byLevel)) {
    byLevel[level] = {
      ...snap,
      queriesPct: total ? Math.round((snap.queries / total) * 100) : 0,
    };
  }
  return {
    date: raw.date,
    queriesDisplay: fmt(raw.totals.queries),
    blocksDisplay: fmt(raw.totals.blocks),
    installsDisplay: fmt(raw.totals.installs),
    byLevel,
  };
}

async function loadAndRender() {
  const root = document.getElementById('stats-root');
  if (!root) return;
  try {
    const resp = await fetch(STATS_URL, { cache: 'no-store' });
    const raw = await resp.json();
    const v = formatStats(raw);
    root.innerHTML = `
      <p>Last 24 hours (as of ${v.date}):</p>
      <ul class="stats-totals">
        <li>📊 Queries processed: <strong>${v.queriesDisplay}</strong></li>
        <li>🚫 Sites blocked:      <strong>${v.blocksDisplay}</strong></li>
        <li>📱 Active devices:     <strong>~${v.installsDisplay}</strong></li>
      </ul>
      <h2>By filter level</h2>
      <table class="stats-table">
        <thead><tr><th>Level</th><th>Queries</th><th>Share</th><th>Blocks</th><th>Devices</th></tr></thead>
        <tbody>
          ${['kids','teens','family'].map((l) => `
            <tr>
              <td><strong>${l}</strong></td>
              <td>${v.byLevel[l].queries.toLocaleString('en-GB')}</td>
              <td>${v.byLevel[l].queriesPct}%</td>
              <td>${v.byLevel[l].blocks.toLocaleString('en-GB')}</td>
              <td>${v.byLevel[l].installs.toLocaleString('en-GB')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch {
    root.innerHTML = '<p class="notice notice--warn">Stats temporarily unavailable.</p>';
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', loadAndRender);
}
```

- [ ] **Step 3: Create `stats.html`**

Create `landing/public/stats.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SafeBrowse — Transparency stats</title>
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
  <style>
    .stats-totals { list-style: none; padding: 0; font-size: 1.1rem; }
    .stats-totals li { margin: 0.4rem 0; }
    .stats-table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    .stats-table th, .stats-table td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border); }
    .stats-table th { color: var(--color-muted); font-weight: 600; font-size: 0.9rem; }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="site-header__brand" href="/">
        <img src="/assets/logo.svg" alt="">
        <span>SafeBrowse</span>
      </a>
      <nav><a href="/">Home</a></nav>
    </div>
  </header>

  <main class="container">
    <h1>Transparency stats</h1>
    <p>SafeBrowse publishes anonymous, aggregate usage stats every 24 hours.
       Below is yesterday's snapshot.</p>

    <div id="stats-root"><p>Loading…</p></div>

    <hr style="margin: 3rem 0">

    <h2>What we never track</h2>
    <ul>
      <li>Which specific sites you visit</li>
      <li>Your IP address (only daily-rotated hashes, dropped after 24 hours)</li>
      <li>Your identity or device fingerprint</li>
      <li>Browsing history</li>
    </ul>
    <p><a href="/privacy.html">Read the full privacy policy →</a></p>
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <span>SafeBrowse · A CyberHeroez CIC project</span>
      <span>
        <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a>
      </span>
    </div>
  </footer>

  <script type="module" src="/assets/stats.js"></script>
</body>
</html>
```

- [ ] **Step 4: Run tests**

```bash
cd landing
npm test
```

Expected: all 21 prior tests + 3 new = 24 PASS.

- [ ] **Step 5: Redeploy landing**

```bash
npm run deploy
```

- [ ] **Step 6: Smoke-check `/stats` in a browser**

Open https://safebrowse.cyberheroez.co.uk/stats. Should load the page; "Stats temporarily unavailable." on first visit (no cron run yet) or zeroes is fine. Once the daily cron runs once (00:05 UTC), real numbers appear.

- [ ] **Step 7: Add the footer link**

In `landing/public/index.html`, `verify.html`, `privacy.html`, `terms.html`, add a link to `/stats.html` in the footer. Example: in `index.html`, change:

```html
<a href="/privacy.html">Privacy</a> ·
<a href="/terms.html">Terms</a> ·
<a href="https://github.com/DipesThapa/safebrowse-ai">GitHub</a>
```

to:

```html
<a href="/stats.html">Stats</a> ·
<a href="/privacy.html">Privacy</a> ·
<a href="/terms.html">Terms</a> ·
<a href="https://github.com/DipesThapa/safebrowse-ai">GitHub</a>
```

Repeat the same edit in the other three pages' footers.

- [ ] **Step 8: Commit**

```bash
cd ..
git add landing/
git commit -m "feat(landing): /stats transparency page + footer link"
```

---

## Phase D — Launch

### Task 14: Monitoring + alerting 🧑 You

Cloudflare dashboard → Workers & Pages → `safebrowse-doh` → Metrics + → Triggers → Email Notifications.

- [ ] **Step 1: Enable Worker error notifications**

Subscribe to email alerts for:
- Worker error rate > 0.5% over 5 minutes
- Worker CPU time exceeded
- Daily cron failure

- [ ] **Step 2: Check the daily cron actually fires**

After the first 00:05 UTC after deploy, check `safebrowse-doh` → Logs → "Triggered events" to confirm the cron ran.

If it didn't, verify `[triggers]` in `wrangler.toml` was deployed (`wrangler deploy` should mention "Cron triggers: 5 0 * * *").

---

### Task 15: Pre-launch sanity sweep 🧑 You

- [ ] **Step 1: Spot-check the live blocklists**

For each level:

```bash
for L in kids teens family; do
  COUNT=$(npx wrangler kv:key get --binding BLOCKLIST_KV "meta:blocklist:${L}:count" --cwd dns/worker)
  echo "${L}: ${COUNT}"
done
```

Compare against the latest `dns/data/built/<level>.json` counts.

- [ ] **Step 2: Verify the four sentinels behave correctly**

```bash
# Allow sentinel should resolve via any level
dig +https=https://kids.dns.cyberheroez.co.uk/dns-query safebrowse-allow-test.cyberheroez.co.uk @1.1.1.1

# Level sentinel should NXDOMAIN on its own level
dig +https=https://kids.dns.cyberheroez.co.uk/dns-query safebrowse-kids-test.cyberheroez.co.uk
# Expect: status: NXDOMAIN

# Level sentinel should resolve on a non-matching level
dig +https=https://teens.dns.cyberheroez.co.uk/dns-query safebrowse-kids-test.cyberheroez.co.uk
# Expect: status: NOERROR with an answer
```

If your `dig` version does not support `+https=`, use `kdig` (DNSSEC-aware sibling).

- [ ] **Step 3: Walk the install flow on a clean device one more time**

Pick a device you haven't tested on (or restore the iPhone from Task 9). Walk through install → verify → blocked-domain test → uninstall. This is the rubber-meets-road check before sending strangers to the site.

---

### Task 16: Soft launch — 5 to 10 friends and family 🧑 You

- [ ] **Step 1: Draft the personal-network message**

Suggested template (adjust to your voice):

> Hey — I've just finished the first version of SafeBrowse, a free
> DNS-based web filter for families. It's at
> https://safebrowse.cyberheroez.co.uk if you want to try it on your
> phone (60 seconds to set up). Honest warning: the iOS profile is
> currently unsigned so you'll see a scary "Unverified" prompt — tap
> install anyway, it's safe. I'd love feedback before I open it up
> more widely. No data collection beyond anonymous aggregate counts.

- [ ] **Step 2: Send to 5–10 people you trust**

WhatsApp, email, whichever. Ask them to install on their own device only (not their children's yet).

- [ ] **Step 3: Collect feedback over ~3–7 days**

Track in a simple list:
- Install success/failure (and why if failure)
- Pages that look broken
- Sites being wrongly blocked (false positives)
- Any iOS UX complaints about the unsigned prompt
- Whether anyone tested Android successfully

- [ ] **Step 4: Triage and fix anything blocking before public beta**

Likely false-positive reports for any popular site you have in your blocklist that you shouldn't (e.g. a forum). Adjust `dns/data/sources/*.json`, rebuild, re-upload, commit.

---

### Task 17: Public beta launch 🧑 You

After the soft-launch feedback has settled and you've fixed obvious issues.

- [ ] **Step 1: Write the launch post**

Suggested venues, in order of fit:
- **Hacker News** "Show HN" — keep it short, lead with the privacy-first DNS angle
- **r/privacy** on Reddit
- **r/parenting** on Reddit
- **Twitter / Mastodon** with screenshots of the install flow
- **UK schools mailing lists** (via your CIC network)
- **LinkedIn** if you have any reach in the EdTech / safeguarding space

Suggested HN title template: "Show HN: SafeBrowse – Free DNS-based web safety for families"

- [ ] **Step 2: Pin the GitHub repo**

Make `https://github.com/DipesThapa/safebrowse-ai` clearly visible from the landing-site footer (already done in Plan 3). Pin it on your GitHub profile.

- [ ] **Step 3: Monitor the live site for 24 hours after each post**

Watch:
- Cloudflare Worker dashboard → request volume + error rate
- Cloudflare Pages dashboard → request volume
- Email inbox for support requests
- HN/Reddit comments

Be ready to:
- Push a hotfix Worker if the error rate spikes
- Reply to comments within a few hours
- Update the landing-page copy if a common confusion emerges

- [ ] **Step 4: Tag the launch in git**

```bash
git tag -a v0.1.0-beta -m "SafeBrowse DoH public beta launch"
git push --tags  # if you have a remote
```

---

### Task 18: Operational rituals (ongoing) 🧑 You

After launch, weekly cadence:

- [ ] **Weekly Monday:**
  - Check `/stats.json` for the past week
  - Skim Cloudflare Worker logs for unusual errors
  - Review any false-positive reports in your support email

- [ ] **Weekly Friday:**
  - Rebuild + reupload blocklists if any source category has been edited
  - Tag a `v0.1.X-beta` if any meaningful change shipped

- [ ] **Monthly:**
  - Review usage trends and decide on Plan 2 (signing) urgency
  - Decide whether to start writing v2 sub-projects (per-user accounts, parent PWA)

---

## Wrap-up

After Task 18 the MVP is live and operating:

- `https://safebrowse.cyberheroez.co.uk` serves the install portal
- `https://{kids,teens,family}.dns.cyberheroez.co.uk` answer DoH queries
- iOS, Android, and desktop users can all install and verify
- Aggregate stats are published daily
- Real users are flowing through the system, generating real feedback

The biggest deliberate gap is **Plan 2 (signed `.mobileconfig`)**. Re-evaluate it once iOS install drop-off data is visible from the stats page — if the gap is large, prioritise Plan 2 next. Otherwise the next sub-project is v2 (per-user accounts + parent PWA).
