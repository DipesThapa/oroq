# DoH Worker Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and unit-test the SafeBrowse DoH (DNS-over-HTTPS) Cloudflare Worker plus its blocklist build/upload pipeline, such that the Worker can be deployed and validated end-to-end with `curl`/`dig`.

**Architecture:** A single Cloudflare Worker handles DoH queries on three subdomains (`kids.dns`, `teens.dns`, `family.dns`). It parses incoming DNS messages, looks up the queried domain in Cloudflare KV (separate keyspaces per filter level), returns NXDOMAIN for blocked domains, and forwards allowed queries upstream to `1.1.1.1`. A Durable Object provides atomic counters for aggregate stats. A pair of Node scripts curates source blocklists into per-level built files and uploads them to KV.

**Tech Stack:** Cloudflare Workers (JavaScript, Web APIs only — no Node built-ins), Cloudflare KV, Cloudflare Durable Objects, Wrangler 3, Vitest with `@cloudflare/vitest-pool-workers`.

**Out of scope for this plan** (later plans): `.mobileconfig` signing, landing page, verification page, DNS record provisioning, real-device testing, beta launch.

**Reference spec:** `docs/superpowers/specs/2026-05-17-safebrowse-doh-mvp-design.md`

---

## Task 0: Scaffold `dns/` project

**Files:**
- Create: `dns/worker/package.json`
- Create: `dns/worker/wrangler.toml`
- Create: `dns/worker/vitest.config.js`
- Create: `dns/worker/src/index.js` (stub)
- Create: `dns/README.md`
- Modify: `.gitignore` (append `dns/data/built/` and `dns/worker/.wrangler/`)

- [ ] **Step 1: Create `dns/worker/package.json`**

```json
{
  "name": "safebrowse-doh-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "vitest": "^1.6.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: Create `dns/worker/wrangler.toml`**

```toml
name = "safebrowse-doh"
main = "src/index.js"
compatibility_date = "2026-05-01"
compatibility_flags = ["nodejs_compat"]

# KV binding (id filled in after running `wrangler kv:namespace create BLOCKLIST_KV`)
[[kv_namespaces]]
binding = "BLOCKLIST_KV"
id = "PLACEHOLDER_FILL_AFTER_NAMESPACE_CREATE"

# Durable Object binding
[[durable_objects.bindings]]
name = "STATS_DO"
class_name = "StatsCounter"

[[migrations]]
tag = "v1"
new_classes = ["StatsCounter"]

# Daily cron at 00:05 UTC
[triggers]
crons = ["5 0 * * *"]

# Worker secrets (set via `wrangler secret put`):
#   UPSTREAM_DNS_URL  default https://cloudflare-dns.com/dns-query
```

- [ ] **Step 3: Create `dns/worker/vitest.config.js`**

```javascript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

- [ ] **Step 4: Create `dns/worker/src/index.js` (stub)**

```javascript
export default {
  async fetch(request) {
    return new Response('SafeBrowse DoH placeholder', { status: 200 });
  },
};
```

- [ ] **Step 5: Create `dns/README.md`**

```markdown
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
```

- [ ] **Step 6: Update `.gitignore`**

Append two lines:

```
dns/data/built/
dns/worker/.wrangler/
```

- [ ] **Step 7: Install dependencies**

```bash
cd dns/worker
npm install
```

Expected: `node_modules/` populated, `package-lock.json` created.

- [ ] **Step 8: Commit**

```bash
git add dns/ .gitignore
git commit -m "chore(dns): scaffold DoH Worker project"
```

---

## Task 1: DNS wire format — parse question domain

**Background:** A DoH request body is a binary DNS message (RFC 1035 wire format). The message has a 12-byte header, then one or more question records. Each question contains a domain name encoded as length-prefixed labels (e.g. `\x07example\x03com\x00`), a 2-byte query type, and a 2-byte query class. We need to extract just the domain name.

**Files:**
- Create: `dns/worker/src/dns-message.js`
- Create: `dns/worker/__tests__/dns-message.test.js`

- [ ] **Step 1: Write the failing test**

Create `dns/worker/__tests__/dns-message.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { parseQuestionDomain } from '../src/dns-message.js';

// Hex of a real DoH query for "example.com" type A, class IN
// 12-byte header (id=0xabcd, flags=0x0100, qd=1, an/ns/ar=0)
// + question: 07 'example' 03 'com' 00 + type 0001 + class 0001
const EXAMPLE_COM_QUERY = new Uint8Array([
  0xab, 0xcd, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

const PORNHUB_COM_QUERY = new Uint8Array([
  0xde, 0xad, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x70, 0x6f, 0x72, 0x6e, 0x68, 0x75, 0x62,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

describe('parseQuestionDomain', () => {
  it('extracts a two-label domain', () => {
    expect(parseQuestionDomain(EXAMPLE_COM_QUERY)).toBe('example.com');
  });

  it('extracts a different two-label domain', () => {
    expect(parseQuestionDomain(PORNHUB_COM_QUERY)).toBe('pornhub.com');
  });

  it('extracts a single-label root query as empty string', () => {
    const rootOnly = new Uint8Array([
      0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x01, 0x00, 0x01,
    ]);
    expect(parseQuestionDomain(rootOnly)).toBe('');
  });

  it('extracts a three-label subdomain', () => {
    // img.example.com
    const sub = new Uint8Array([
      0x00, 0x02, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x03, 0x69, 0x6d, 0x67,
      0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
      0x03, 0x63, 0x6f, 0x6d,
      0x00,
      0x00, 0x01,
      0x00, 0x01,
    ]);
    expect(parseQuestionDomain(sub)).toBe('img.example.com');
  });

  it('throws on truncated message (header only)', () => {
    const headerOnly = new Uint8Array(12);
    expect(() => parseQuestionDomain(headerOnly)).toThrow();
  });

  it('rejects compression pointers (not allowed in question)', () => {
    // 0xc0 0x0c is a pointer — must not appear in question section
    const withPtr = new Uint8Array([
      0x00, 0x03, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xc0, 0x0c,
      0x00, 0x01, 0x00, 0x01,
    ]);
    expect(() => parseQuestionDomain(withPtr)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dns/worker
npm test -- dns-message
```

Expected: FAIL — module `../src/dns-message.js` not found.

- [ ] **Step 3: Implement `parseQuestionDomain`**

Create `dns/worker/src/dns-message.js`:

```javascript
const HEADER_LEN = 12;

/**
 * Extract the queried domain name from a DNS message (question section).
 * Returns the lowercase domain as a dot-separated string (no trailing dot).
 * Throws on malformed or compressed input.
 */
export function parseQuestionDomain(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('expected Uint8Array');
  }
  if (bytes.length < HEADER_LEN + 1) {
    throw new Error('message truncated: shorter than header + qname terminator');
  }

  const labels = [];
  let offset = HEADER_LEN;

  while (offset < bytes.length) {
    const len = bytes[offset];

    // End of name
    if (len === 0) {
      return labels.join('.').toLowerCase();
    }

    // Compression pointers (high two bits set) are not permitted in the
    // question section per RFC 1035 §4.1.4.
    if ((len & 0xc0) !== 0) {
      throw new Error('compression pointer in question is not permitted');
    }

    offset += 1;
    if (offset + len > bytes.length) {
      throw new Error('message truncated within label');
    }

    let label = '';
    for (let i = 0; i < len; i++) {
      label += String.fromCharCode(bytes[offset + i]);
    }
    labels.push(label);
    offset += len;
  }

  throw new Error('message truncated: no terminator');
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- dns-message
```

Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/dns-message.js dns/worker/__tests__/dns-message.test.js
git commit -m "feat(dns): parse question domain from DoH wire format"
```

---

## Task 2: DNS wire format — build NXDOMAIN response

**Background:** When we want to block a domain, we respond with an NXDOMAIN (NAME_ERROR, rcode 3). The response echoes the original query's ID and question section, sets the QR (response) flag, AA (authoritative — we are authoritative for "this domain doesn't exist"), and rcode=3. Answer/authority/additional counts are zero.

**Files:**
- Modify: `dns/worker/src/dns-message.js`
- Modify: `dns/worker/__tests__/dns-message.test.js`

- [ ] **Step 1: Add failing tests for `buildNxdomainResponse`**

Append to `dns/worker/__tests__/dns-message.test.js`:

```javascript
import { buildNxdomainResponse } from '../src/dns-message.js';

describe('buildNxdomainResponse', () => {
  it('preserves the query ID', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    expect(resp[0]).toBe(0xab);
    expect(resp[1]).toBe(0xcd);
  });

  it('sets QR=1, AA=1, rcode=3 in flags', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    // Flags byte 1: QR=1, opcode=0, AA=1, TC=0, RD=copied (1) → 1000 0101 = 0x85
    expect(resp[2]).toBe(0x85);
    // Flags byte 2: RA=0, Z=0, rcode=3 → 0000 0011 = 0x03
    expect(resp[3]).toBe(0x03);
  });

  it('keeps QDCOUNT=1, all other counts 0', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    // QDCOUNT
    expect(resp[4]).toBe(0);
    expect(resp[5]).toBe(1);
    // ANCOUNT, NSCOUNT, ARCOUNT
    for (let i = 6; i < 12; i++) {
      expect(resp[i]).toBe(0);
    }
  });

  it('echoes the question section verbatim', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    for (let i = 12; i < EXAMPLE_COM_QUERY.length; i++) {
      expect(resp[i]).toBe(EXAMPLE_COM_QUERY[i]);
    }
  });

  it('returns a Uint8Array of identical length to the input', () => {
    const resp = buildNxdomainResponse(EXAMPLE_COM_QUERY);
    expect(resp).toBeInstanceOf(Uint8Array);
    expect(resp.length).toBe(EXAMPLE_COM_QUERY.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- dns-message
```

Expected: 5 new tests FAIL — `buildNxdomainResponse is not a function`.

- [ ] **Step 3: Implement `buildNxdomainResponse`**

Append to `dns/worker/src/dns-message.js`:

```javascript
/**
 * Build an NXDOMAIN response for the given DNS query.
 * Copies the query bytes and flips the appropriate header bits.
 */
export function buildNxdomainResponse(queryBytes) {
  if (!(queryBytes instanceof Uint8Array)) {
    throw new TypeError('expected Uint8Array');
  }
  if (queryBytes.length < HEADER_LEN) {
    throw new Error('query truncated');
  }

  const out = new Uint8Array(queryBytes);

  // Flags byte 1: keep RD (recursion desired) bit from query, set QR=1, AA=1.
  // QR is bit 7, AA is bit 2 (RFC 1035 §4.1.1).
  const flags1 = queryBytes[2];
  const rd = flags1 & 0x01;
  out[2] = 0x80 /* QR */ | 0x04 /* AA */ | rd;

  // Flags byte 2: RA=0, Z=0, rcode=3 (NXDOMAIN).
  out[3] = 0x03;

  // Zero out answer/authority/additional counts (they should already be 0
  // in a query, but be defensive).
  out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0;
  out[10] = 0; out[11] = 0;

  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- dns-message
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/dns-message.js dns/worker/__tests__/dns-message.test.js
git commit -m "feat(dns): build NXDOMAIN response for blocked queries"
```

---

## Task 3: Blocklist matcher with subdomain walk

**Background:** Given a domain like `img.cdn.pornhub.com`, we need to check if it's in the blocklist, _and_ if any parent (e.g. `pornhub.com`) is. We walk from full domain up to the registrable parent. To keep KV reads cheap, we cache hot lookups in an in-Worker `Map`.

**Files:**
- Create: `dns/worker/src/blocklist.js`
- Create: `dns/worker/__tests__/blocklist.test.js`

- [ ] **Step 1: Write the failing tests**

Create `dns/worker/__tests__/blocklist.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkBlocked, clearCache } from '../src/blocklist.js';

function mockKv(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: vi.fn(async (key) => store.get(key) ?? null),
    _store: store,
  };
}

describe('checkBlocked', () => {
  beforeEach(() => {
    clearCache();
  });

  it('returns true on exact domain match', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'pornhub.com')).toBe(true);
  });

  it('returns false when not in list', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'example.com')).toBe(false);
  });

  it('matches subdomain via parent walk', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'img.cdn.pornhub.com')).toBe(true);
  });

  it('does not match across levels', async () => {
    const kv = mockKv({ 'kids:domain:roblox.com': '1' });
    expect(await checkBlocked(kv, 'teens', 'roblox.com')).toBe(false);
  });

  it('does not match on suffix that is not a parent label', async () => {
    // "evilpornhub.com" should NOT match because of "pornhub.com" in list.
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    expect(await checkBlocked(kv, 'kids', 'evilpornhub.com')).toBe(false);
  });

  it('caches lookups (second call hits no KV)', async () => {
    const kv = mockKv({ 'kids:domain:pornhub.com': '1' });
    await checkBlocked(kv, 'kids', 'pornhub.com');
    kv.get.mockClear();
    await checkBlocked(kv, 'kids', 'pornhub.com');
    expect(kv.get).not.toHaveBeenCalled();
  });

  it('caches negative results too', async () => {
    const kv = mockKv({});
    expect(await checkBlocked(kv, 'kids', 'example.com')).toBe(false);
    kv.get.mockClear();
    expect(await checkBlocked(kv, 'kids', 'example.com')).toBe(false);
    expect(kv.get).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- blocklist
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the matcher**

Create `dns/worker/src/blocklist.js`:

```javascript
// In-Worker cache keyed by "<level>:<domain>" → { hit: boolean, expires: number }.
// 30-second TTL is short enough that updates propagate quickly but long
// enough to absorb bursts (the typical user hits the same hot domains
// hundreds of times per minute).
const CACHE = new Map();
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 5_000;

export function clearCache() {
  CACHE.clear();
}

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) {
    CACHE.delete(key);
    return undefined;
  }
  return entry.hit;
}

function cacheSet(key, hit) {
  if (CACHE.size >= CACHE_MAX_ENTRIES) {
    // Simple eviction: drop the oldest 10% by insertion order.
    const drop = Math.ceil(CACHE_MAX_ENTRIES * 0.1);
    let i = 0;
    for (const k of CACHE.keys()) {
      if (i++ >= drop) break;
      CACHE.delete(k);
    }
  }
  CACHE.set(key, { hit, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Returns true if `domain` (or any parent of it, label-aligned)
 * is in the blocklist for `level`.
 */
export async function checkBlocked(kv, level, domain) {
  const key = `${level}:${domain}`;
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  // Build the list of candidates: full domain + each parent.
  // For "img.cdn.pornhub.com" → ["img.cdn.pornhub.com", "cdn.pornhub.com", "pornhub.com"].
  // We stop at the second-to-last label so we never check a bare TLD.
  const parts = domain.split('.');
  const candidates = [];
  for (let i = 0; i + 1 < parts.length; i++) {
    candidates.push(parts.slice(i).join('.'));
  }

  for (const candidate of candidates) {
    const v = await kv.get(`${level}:domain:${candidate}`);
    if (v === '1') {
      cacheSet(key, true);
      return true;
    }
  }

  cacheSet(key, false);
  return false;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- blocklist
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/blocklist.js dns/worker/__tests__/blocklist.test.js
git commit -m "feat(dns): blocklist matcher with subdomain walk and cache"
```

---

## Task 4: Worker router — extract filter level from host

**Background:** The Worker handles three hostnames. The first DNS label tells us the level (`kids`, `teens`, `family`). Anything else is rejected.

**Files:**
- Create: `dns/worker/src/router.js`
- Create: `dns/worker/__tests__/router.test.js`

- [ ] **Step 1: Write the failing tests**

Create `dns/worker/__tests__/router.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { extractLevel } from '../src/router.js';

describe('extractLevel', () => {
  it('extracts kids', () => {
    expect(extractLevel('kids.dns.cyberheroez.co.uk')).toBe('kids');
  });

  it('extracts teens', () => {
    expect(extractLevel('teens.dns.cyberheroez.co.uk')).toBe('teens');
  });

  it('extracts family', () => {
    expect(extractLevel('family.dns.cyberheroez.co.uk')).toBe('family');
  });

  it('returns null for unknown subdomain', () => {
    expect(extractLevel('something.dns.cyberheroez.co.uk')).toBe(null);
  });

  it('returns null for missing subdomain', () => {
    expect(extractLevel('dns.cyberheroez.co.uk')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(extractLevel('')).toBe(null);
  });

  it('lowercases the hostname before matching', () => {
    expect(extractLevel('KIDS.dns.cyberheroez.co.uk')).toBe('kids');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- router
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `extractLevel`**

Create `dns/worker/src/router.js`:

```javascript
const VALID_LEVELS = new Set(['kids', 'teens', 'family']);

/**
 * Given a hostname like "kids.dns.cyberheroez.co.uk", return "kids".
 * Returns null if the hostname does not begin with a recognised level
 * followed by ".dns.".
 */
export function extractLevel(hostname) {
  if (!hostname) return null;
  const lower = hostname.toLowerCase();
  const first = lower.split('.')[0];
  if (!VALID_LEVELS.has(first)) return null;
  // Require the second label to be "dns" so we don't accidentally match
  // an unrelated subdomain shaped like "kids.something-else".
  if (!lower.startsWith(`${first}.dns.`)) return null;
  return first;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- router
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/router.js dns/worker/__tests__/router.test.js
git commit -m "feat(dns): extract filter level from request hostname"
```

---

## Task 5: Upstream resolver — forward allowed queries

**Background:** When a domain is _not_ blocked we forward the original query bytes to a trusted upstream DoH server (`https://cloudflare-dns.com/dns-query`) and return its response.

**Files:**
- Create: `dns/worker/src/resolver.js`
- Create: `dns/worker/__tests__/resolver.test.js`

- [ ] **Step 1: Write the failing test**

Create `dns/worker/__tests__/resolver.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveUpstream } from '../src/resolver.js';

describe('resolveUpstream', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs the query bytes to the upstream URL', async () => {
    const fakeResp = new Uint8Array([1, 2, 3, 4]);
    globalThis.fetch.mockResolvedValue(
      new Response(fakeResp, {
        status: 200,
        headers: { 'content-type': 'application/dns-message' },
      })
    );

    const query = new Uint8Array([9, 9, 9, 9]);
    const out = await resolveUpstream('https://example.com/dns-query', query);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://example.com/dns-query');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/dns-message');
    expect(new Uint8Array(init.body)).toEqual(query);

    expect(out).toEqual(fakeResp);
  });

  it('throws on non-2xx upstream response', async () => {
    globalThis.fetch.mockResolvedValue(new Response('', { status: 500 }));
    await expect(
      resolveUpstream('https://example.com/dns-query', new Uint8Array([0]))
    ).rejects.toThrow(/upstream/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- resolver
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolveUpstream`**

Create `dns/worker/src/resolver.js`:

```javascript
/**
 * Forward a binary DNS query to a DoH-compatible upstream and return the
 * binary response bytes.
 */
export async function resolveUpstream(upstreamUrl, queryBytes) {
  const resp = await fetch(upstreamUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/dns-message' },
    body: queryBytes,
  });

  if (!resp.ok) {
    throw new Error(`upstream returned ${resp.status}`);
  }

  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- resolver
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/resolver.js dns/worker/__tests__/resolver.test.js
git commit -m "feat(dns): forward allowed queries to upstream DoH"
```

---

## Task 6: Stats helpers — daily salt + IP hash

**Background:** For unique-install estimation we hash the client IP with a daily-rotated salt. The hash is truncated so it cannot be reversed. The salt lives in KV at `meta:dailysalt`; the daily cron rotates it.

**Files:**
- Create: `dns/worker/src/stats.js`
- Create: `dns/worker/__tests__/stats.test.js`

- [ ] **Step 1: Write the failing tests**

Create `dns/worker/__tests__/stats.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { hashClientIp, dateKey } from '../src/stats.js';

describe('hashClientIp', () => {
  it('returns a 12-character hex string', async () => {
    const hash = await hashClientIp('1.2.3.4', 'salt-abc', 'kids');
    expect(hash).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is deterministic given same inputs', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt-abc', 'kids');
    const b = await hashClientIp('1.2.3.4', 'salt-abc', 'kids');
    expect(a).toBe(b);
  });

  it('changes when salt changes', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt-old', 'kids');
    const b = await hashClientIp('1.2.3.4', 'salt-new', 'kids');
    expect(a).not.toBe(b);
  });

  it('changes when level changes', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt', 'kids');
    const b = await hashClientIp('1.2.3.4', 'salt', 'teens');
    expect(a).not.toBe(b);
  });

  it('changes when ip changes', async () => {
    const a = await hashClientIp('1.2.3.4', 'salt', 'kids');
    const b = await hashClientIp('1.2.3.5', 'salt', 'kids');
    expect(a).not.toBe(b);
  });
});

describe('dateKey', () => {
  it('formats a Date as YYYY-MM-DD in UTC', () => {
    const d = new Date('2026-05-17T23:50:00Z');
    expect(dateKey(d)).toBe('2026-05-17');
  });

  it('rolls into the next day at UTC midnight', () => {
    const d = new Date('2026-05-18T00:00:00Z');
    expect(dateKey(d)).toBe('2026-05-18');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- stats
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `dns/worker/src/stats.js`:

```javascript
/**
 * Compute a privacy-preserving hash of (ip, salt, level).
 * Returns the first 48 bits of the SHA-256 as a 12-char hex string.
 */
export async function hashClientIp(ip, salt, level) {
  const data = new TextEncoder().encode(`${ip}:${salt}:${level}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  const view = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < 6; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Format a Date as a UTC YYYY-MM-DD key (used in KV stats keys).
 */
export function dateKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- stats
```

Expected: 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/stats.js dns/worker/__tests__/stats.test.js
git commit -m "feat(dns): privacy-preserving IP hash and date-key helpers"
```

---

## Task 7: `StatsCounter` Durable Object

**Background:** KV is eventually consistent and cannot safely increment a shared counter. A Durable Object (one per `<level>:<date>`) serialises writes. The DO exposes three operations via its `fetch` handler:
- `POST /incr?type=queries|blocks` — add one to a counter and return the new value.
- `POST /install?hash=<hex>` — record a unique IP-hash for today.
- `GET /snapshot` — read the current counters and unique-install count.

**Files:**
- Create: `dns/worker/src/stats-do.js`
- Create: `dns/worker/__tests__/stats-do.test.js`

- [ ] **Step 1: Write the failing tests**

Create `dns/worker/__tests__/stats-do.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';

// The Durable Object class is exported as a named export.
// We exercise it through the bound `STATS_DO` namespace declared in
// wrangler.toml (which vitest.config.js wires through).

describe('StatsCounter', () => {
  let id;
  let stub;

  beforeEach(() => {
    id = env.STATS_DO.idFromName('kids:2026-05-17');
    stub = env.STATS_DO.get(id);
  });

  it('increments queries counter', async () => {
    const r1 = await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    expect(await r1.text()).toBe('1');
    const r2 = await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    expect(await r2.text()).toBe('2');
  });

  it('increments blocks counter independently', async () => {
    await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    const r = await stub.fetch('https://do/incr?type=blocks', { method: 'POST' });
    expect(await r.text()).toBe('1');
  });

  it('records unique installs by hash', async () => {
    await stub.fetch('https://do/install?hash=abc', { method: 'POST' });
    await stub.fetch('https://do/install?hash=abc', { method: 'POST' });
    await stub.fetch('https://do/install?hash=def', { method: 'POST' });
    const snap = await stub.fetch('https://do/snapshot');
    const data = await snap.json();
    expect(data.installs).toBe(2);
  });

  it('snapshot returns all counters', async () => {
    await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    await stub.fetch('https://do/incr?type=blocks', { method: 'POST' });
    await stub.fetch('https://do/install?hash=h1', { method: 'POST' });
    const snap = await stub.fetch('https://do/snapshot');
    const data = await snap.json();
    expect(data).toEqual({ queries: 1, blocks: 1, installs: 1 });
  });

  it('rejects unknown counter type', async () => {
    const r = await stub.fetch('https://do/incr?type=bogus', { method: 'POST' });
    expect(r.status).toBe(400);
  });

  it('rejects missing hash on install', async () => {
    const r = await stub.fetch('https://do/install', { method: 'POST' });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- stats-do
```

Expected: FAIL — the Durable Object class is not yet defined.

- [ ] **Step 3: Implement `StatsCounter`**

Create `dns/worker/src/stats-do.js`:

```javascript
export class StatsCounter {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/incr') {
      const type = url.searchParams.get('type');
      if (type !== 'queries' && type !== 'blocks') {
        return new Response('bad type', { status: 400 });
      }
      const current = (await this.state.storage.get(type)) ?? 0;
      const next = current + 1;
      await this.state.storage.put(type, next);
      return new Response(String(next));
    }

    if (request.method === 'POST' && url.pathname === '/install') {
      const hash = url.searchParams.get('hash');
      if (!hash) return new Response('hash required', { status: 400 });
      // Stored as set entries keyed "h:<hash>"; existence-only marker.
      await this.state.storage.put(`h:${hash}`, 1);
      return new Response('ok');
    }

    if (request.method === 'GET' && url.pathname === '/snapshot') {
      const queries = (await this.state.storage.get('queries')) ?? 0;
      const blocks = (await this.state.storage.get('blocks')) ?? 0;
      // Count keys prefixed "h:" to get unique installs.
      const hashes = await this.state.storage.list({ prefix: 'h:' });
      return Response.json({
        queries,
        blocks,
        installs: hashes.size,
      });
    }

    return new Response('not found', { status: 404 });
  }
}
```

- [ ] **Step 4: Wire the DO export through `index.js`**

Replace the contents of `dns/worker/src/index.js` with:

```javascript
export { StatsCounter } from './stats-do.js';

export default {
  async fetch(request) {
    return new Response('SafeBrowse DoH placeholder', { status: 200 });
  },
};
```

The Durable Object class must be re-exported from the Worker entry-point so Wrangler can bind it.

- [ ] **Step 5: Run tests to verify pass**

```bash
npm test -- stats-do
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add dns/worker/src/stats-do.js dns/worker/src/index.js dns/worker/__tests__/stats-do.test.js
git commit -m "feat(dns): StatsCounter Durable Object for atomic counters"
```

---

## Task 8: Assemble the Worker `fetch` handler

**Background:** Now wire all the pieces together. The handler:
1. Parses the URL to extract the level (Task 4).
2. Reads the binary DoH query body.
3. Extracts the domain (Task 1).
4. Checks the blocklist (Task 3).
5. Either builds NXDOMAIN (Task 2) or forwards upstream (Task 5).
6. Increments stats via the DO (Task 7).
7. Returns the binary response.

**Files:**
- Modify: `dns/worker/src/index.js`
- Create: `dns/worker/__tests__/integration.test.js`

- [ ] **Step 1: Write the integration test**

Create `dns/worker/__tests__/integration.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import worker from '../src/index.js';
import { env } from 'cloudflare:test';

// Two precomputed wire queries reused throughout.
const QUERY_EXAMPLE_COM = new Uint8Array([
  0xab, 0xcd, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x65, 0x78, 0x61, 0x6d, 0x70, 0x6c, 0x65,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

const QUERY_PORNHUB_COM = new Uint8Array([
  0xde, 0xad, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x07, 0x70, 0x6f, 0x72, 0x6e, 0x68, 0x75, 0x62,
  0x03, 0x63, 0x6f, 0x6d,
  0x00,
  0x00, 0x01,
  0x00, 0x01,
]);

function postDohQuery(host, body) {
  return new Request(`https://${host}/dns-query`, {
    method: 'POST',
    headers: { 'content-type': 'application/dns-message' },
    body,
  });
}

describe('Worker integration', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(async () => {
    // Seed the blocklist KV with one blocked domain for kids.
    await env.BLOCKLIST_KV.put('kids:domain:pornhub.com', '1');
    // Mock upstream fetch — return a pretend valid response.
    globalThis.fetch = vi.fn(async () =>
      new Response(new Uint8Array([0, 0, 0, 0]), {
        status: 200,
        headers: { 'content-type': 'application/dns-message' },
      })
    );
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns NXDOMAIN for a blocked domain on kids level', async () => {
    const req = postDohQuery('kids.dns.cyberheroez.co.uk', QUERY_PORNHUB_COM);
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('application/dns-message');
    const bytes = new Uint8Array(await resp.arrayBuffer());
    // rcode byte should be 3 (NXDOMAIN)
    expect(bytes[3] & 0x0f).toBe(3);
  });

  it('forwards allowed domains upstream', async () => {
    const req = postDohQuery('kids.dns.cyberheroez.co.uk', QUERY_EXAMPLE_COM);
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown subdomain with 400', async () => {
    const req = postDohQuery('bogus.dns.cyberheroez.co.uk', QUERY_EXAMPLE_COM);
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(400);
  });

  it('returns 404 for non-/dns-query paths', async () => {
    const req = new Request('https://kids.dns.cyberheroez.co.uk/other', {
      method: 'POST',
      body: QUERY_EXAMPLE_COM,
    });
    const resp = await worker.fetch(req, env, { waitUntil: () => {} });
    expect(resp.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- integration
```

Expected: FAIL — current `index.js` returns the placeholder string.

- [ ] **Step 3: Implement the full handler**

Replace `dns/worker/src/index.js` entirely:

```javascript
import { extractLevel } from './router.js';
import { parseQuestionDomain, buildNxdomainResponse } from './dns-message.js';
import { checkBlocked } from './blocklist.js';
import { resolveUpstream } from './resolver.js';
import { hashClientIp, dateKey } from './stats.js';

export { StatsCounter } from './stats-do.js';

const DEFAULT_UPSTREAM = 'https://cloudflare-dns.com/dns-query';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const level = extractLevel(url.hostname);
    if (!level) {
      return new Response('invalid filter level', { status: 400 });
    }
    if (url.pathname !== '/dns-query') {
      return new Response('not found', { status: 404 });
    }

    // Accept POST (binary body) or GET with ?dns=<base64url>.
    let queryBytes;
    if (request.method === 'POST') {
      const buf = await request.arrayBuffer();
      queryBytes = new Uint8Array(buf);
    } else if (request.method === 'GET') {
      const dns = url.searchParams.get('dns');
      if (!dns) return new Response('missing dns param', { status: 400 });
      queryBytes = base64UrlDecode(dns);
    } else {
      return new Response('method not allowed', { status: 405 });
    }

    let domain;
    try {
      domain = parseQuestionDomain(queryBytes);
    } catch {
      return new Response('malformed query', { status: 400 });
    }

    const upstream = env.UPSTREAM_DNS_URL || DEFAULT_UPSTREAM;
    const blocked = await safeCheckBlocked(env, level, domain);

    let responseBytes;
    let counterType;
    if (blocked) {
      responseBytes = buildNxdomainResponse(queryBytes);
      counterType = 'blocks';
    } else {
      try {
        responseBytes = await resolveUpstream(upstream, queryBytes);
      } catch {
        // Upstream failure: return a SERVFAIL (rcode=2) so the client knows
        // we tried.
        responseBytes = buildServfailResponse(queryBytes);
      }
      counterType = 'queries';
    }

    // Stats run in waitUntil so they never delay the response.
    ctx.waitUntil(recordStats(env, request, level, counterType));

    return new Response(responseBytes, {
      status: 200,
      headers: { 'content-type': 'application/dns-message' },
    });
  },
};

/**
 * Fail-open wrapper: if KV throws, treat the domain as allowed so that
 * users never lose internet because of our infrastructure.
 */
async function safeCheckBlocked(env, level, domain) {
  try {
    return await checkBlocked(env.BLOCKLIST_KV, level, domain);
  } catch (err) {
    console.error('blocklist lookup failed', err);
    return false;
  }
}

async function recordStats(env, request, level, counterType) {
  try {
    const date = dateKey();
    const id = env.STATS_DO.idFromName(`${level}:${date}`);
    const stub = env.STATS_DO.get(id);
    await stub.fetch(`https://do/incr?type=${counterType}`, { method: 'POST' });

    const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const salt = (await env.BLOCKLIST_KV.get('meta:dailysalt')) ?? 'default-salt';
    const hash = await hashClientIp(ip, salt, level);
    await stub.fetch(`https://do/install?hash=${hash}`, { method: 'POST' });
  } catch (err) {
    console.error('stats recording failed', err);
  }
}

function buildServfailResponse(queryBytes) {
  const out = new Uint8Array(queryBytes);
  const rd = queryBytes[2] & 0x01;
  out[2] = 0x80 | rd;       // QR=1, RA=0
  out[3] = 0x02;            // rcode=SERVFAIL
  out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0;
  out[10] = 0; out[11] = 0;
  return out;
}

function base64UrlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test
```

Expected: every test PASSES (all suites green).

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/index.js dns/worker/__tests__/integration.test.js
git commit -m "feat(dns): assemble Worker fetch handler with stats + fail-open"
```

---

## Task 9: Explicit fail-open test

**Background:** Task 8 added a try/catch around the blocklist lookup. We must lock that behaviour down with an explicit test so a future refactor cannot accidentally remove it.

**Files:**
- Modify: `dns/worker/__tests__/integration.test.js`

- [ ] **Step 1: Add a fail-open test case**

Append to the existing `describe('Worker integration', ...)` block (inside the same file):

```javascript
  it('falls back to upstream when KV throws (fail-open)', async () => {
    // Replace the KV namespace with one that always rejects.
    const brokenEnv = {
      ...env,
      BLOCKLIST_KV: {
        get: async () => { throw new Error('KV down'); },
        put: async () => {},
      },
    };
    const req = postDohQuery('kids.dns.cyberheroez.co.uk', QUERY_PORNHUB_COM);
    const resp = await worker.fetch(req, brokenEnv, { waitUntil: () => {} });
    expect(resp.status).toBe(200);
    // Upstream mock returned bytes; ensure the response is not an NXDOMAIN.
    const bytes = new Uint8Array(await resp.arrayBuffer());
    // Our mock returns four zero bytes — rcode byte must therefore be 0.
    expect(bytes[3] & 0x0f).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify pass**

```bash
npm test -- integration
```

Expected: 5 tests PASS (including the new one).

- [ ] **Step 3: Commit**

```bash
git add dns/worker/__tests__/integration.test.js
git commit -m "test(dns): lock down fail-open behaviour when KV is down"
```

---

## Task 10: Source blocklists and level mapping

**Background:** Curated source data — these are the seed lists. The existing extension data (`data/blocklist.json` and `data/phishing_feed.json`) is re-used as a starting point; small starter lists for the other categories are added so the build script has something to work with. Real curation happens over time after launch.

**Files:**
- Create: `dns/data/sources/_levels.json`
- Create: `dns/data/sources/_sentinels.json`
- Create: `dns/data/sources/adult.json`
- Create: `dns/data/sources/gambling.json`
- Create: `dns/data/sources/violence.json`
- Create: `dns/data/sources/social.json`
- Create: `dns/data/sources/gaming.json`
- Create: `dns/data/sources/drugs.json`
- Create: `dns/data/sources/malware.json`
- Create: `dns/data/sources/phishing.json`

- [ ] **Step 1: Create level mapping**

Create `dns/data/sources/_levels.json`:

```json
{
  "kids":   ["adult", "gambling", "violence", "social", "gaming", "drugs"],
  "teens":  ["adult", "gambling", "drugs", "malware", "phishing"],
  "family": ["adult", "malware", "phishing"]
}
```

- [ ] **Step 2: Create test sentinels**

Create `dns/data/sources/_sentinels.json`:

```json
{
  "kids":   ["safebrowse-kids-test.cyberheroez.co.uk"],
  "teens":  ["safebrowse-teens-test.cyberheroez.co.uk"],
  "family": ["safebrowse-family-test.cyberheroez.co.uk"]
}
```

- [ ] **Step 3: Create `adult.json`**

Create `dns/data/sources/adult.json`. Start with the existing extension list so the seed is consistent:

```json
{
  "category": "adult",
  "description": "Pornography, escort, and explicit-content sites",
  "domains": [
    "pornhub.com", "xvideos.com", "xhamster.com", "xnxx.com",
    "redtube.com", "youporn.com", "tube8.com", "spankbang.com",
    "porntrex.com", "txxx.com", "beeg.com", "4tube.com",
    "onlyfans.com", "fansly.com", "manyvids.com",
    "chaturbate.com", "myfreecams.com", "livejasmin.com",
    "stripchat.com", "bongacams.com", "streamate.com"
  ]
}
```

(The full list will be merged from `data/blocklist.json` in a follow-up; this is the minimum to make the pipeline work.)

- [ ] **Step 4: Create `gambling.json`**

```json
{
  "category": "gambling",
  "description": "Online casinos, sports betting, and poker sites",
  "domains": [
    "bet365.com", "williamhill.com", "pokerstars.com",
    "888casino.com", "draftkings.com", "fanduel.com",
    "betfair.com", "ladbrokes.com", "paddypower.com"
  ]
}
```

- [ ] **Step 5: Create `violence.json`**

```json
{
  "category": "violence",
  "description": "Graphic violence, gore, and shock-content sites",
  "domains": [
    "liveleak.com", "bestgore.com", "documentingreality.com",
    "theync.com", "kaotic.com"
  ]
}
```

- [ ] **Step 6: Create `social.json`**

```json
{
  "category": "social",
  "description": "Major social networks (blocked only for Kids profile)",
  "domains": [
    "tiktok.com", "instagram.com", "snapchat.com",
    "facebook.com", "twitter.com", "x.com",
    "reddit.com", "discord.com", "tumblr.com"
  ]
}
```

- [ ] **Step 7: Create `gaming.json`**

```json
{
  "category": "gaming",
  "description": "Major online gaming and streaming platforms (Kids profile)",
  "domains": [
    "roblox.com", "fortnite.com", "epicgames.com",
    "twitch.tv", "steamcommunity.com", "minecraft.net"
  ]
}
```

- [ ] **Step 8: Create `drugs.json`**

```json
{
  "category": "drugs",
  "description": "Recreational-drug commerce and how-to sites",
  "domains": [
    "leafly.com", "weedmaps.com", "erowid.org",
    "bluelight.org"
  ]
}
```

- [ ] **Step 9: Create `malware.json`**

```json
{
  "category": "malware",
  "description": "Known malware distribution and C2 domains",
  "domains": [
    "malware-example-test.com",
    "phishing-example-test.com"
  ]
}
```

(Production data will pull from URLhaus or OISD; this stub is enough to validate the pipeline.)

- [ ] **Step 10: Create `phishing.json`**

```json
{
  "category": "phishing",
  "description": "Known phishing domains",
  "domains": [
    "phishing-test-1.com",
    "phishing-test-2.com"
  ]
}
```

- [ ] **Step 11: Commit**

```bash
git add dns/data/sources/
git commit -m "feat(dns): seed source blocklists and level mapping"
```

---

## Task 11: `build-blocklist.mjs`

**Background:** Merges per-category source files into per-level built files. Reads `_levels.json` to know which categories belong to each level. Reads `_sentinels.json` to inject test domains. Writes to `dns/data/built/<level>.json`.

**Files:**
- Create: `dns/scripts/build-blocklist.mjs`
- Create: `dns/scripts/__tests__/build-blocklist.test.js`

- [ ] **Step 1: Write the failing test**

Create `dns/scripts/__tests__/build-blocklist.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { buildLevels } from '../build-blocklist.mjs';

const SOURCES = {
  '_levels.json': {
    kids: ['adult', 'social'],
    teens: ['adult'],
    family: ['adult'],
  },
  '_sentinels.json': {
    kids:   ['kids-sentinel.example'],
    teens:  ['teens-sentinel.example'],
    family: ['family-sentinel.example'],
  },
  'adult.json': {
    category: 'adult',
    domains: ['pornhub.com', 'xvideos.com'],
  },
  'social.json': {
    category: 'social',
    domains: ['tiktok.com'],
  },
};

describe('buildLevels', () => {
  it('merges categories per level definition', () => {
    const result = buildLevels(SOURCES);
    expect(result.kids.domains.sort()).toEqual(
      ['kids-sentinel.example', 'pornhub.com', 'tiktok.com', 'xvideos.com']
    );
    expect(result.teens.domains.sort()).toEqual(
      ['pornhub.com', 'teens-sentinel.example', 'xvideos.com']
    );
    expect(result.family.domains.sort()).toEqual(
      ['family-sentinel.example', 'pornhub.com', 'xvideos.com']
    );
  });

  it('dedupes domains across categories', () => {
    const sources = {
      ...SOURCES,
      'social.json': { category: 'social', domains: ['pornhub.com'] },
    };
    const result = buildLevels(sources);
    const kidsCount = result.kids.domains.filter((d) => d === 'pornhub.com').length;
    expect(kidsCount).toBe(1);
  });

  it('lowercases all domains', () => {
    const sources = {
      ...SOURCES,
      'adult.json': { category: 'adult', domains: ['PORNHUB.COM'] },
    };
    const result = buildLevels(sources);
    expect(result.kids.domains).toContain('pornhub.com');
    expect(result.kids.domains).not.toContain('PORNHUB.COM');
  });

  it('includes version hash for cache busting', () => {
    const result = buildLevels(SOURCES);
    expect(result.kids.version).toMatch(/^[0-9a-f]+$/);
  });

  it('throws when a referenced category is missing', () => {
    const broken = {
      ...SOURCES,
      '_levels.json': { kids: ['adult', 'gambling'], teens: [], family: [] },
    };
    expect(() => buildLevels(broken)).toThrow(/gambling/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd dns/worker
npm test -- build-blocklist
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildLevels` and CLI wrapper**

Create `dns/scripts/build-blocklist.mjs`:

```javascript
#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, '..', 'data', 'sources');
const BUILT_DIR = join(__dirname, '..', 'data', 'built');

/**
 * Pure function (testable): given a map of source filename → parsed JSON,
 * return per-level built blocklists.
 */
export function buildLevels(sources) {
  const levels = sources['_levels.json'];
  const sentinels = sources['_sentinels.json'] ?? {};
  if (!levels) throw new Error('_levels.json missing');

  const out = {};
  for (const [level, categories] of Object.entries(levels)) {
    const set = new Set();

    for (const category of categories) {
      const file = `${category}.json`;
      const src = sources[file];
      if (!src) throw new Error(`category source not found: ${file}`);
      for (const d of src.domains ?? []) {
        set.add(d.toLowerCase());
      }
    }

    for (const sentinel of sentinels[level] ?? []) {
      set.add(sentinel.toLowerCase());
    }

    const domains = [...set].sort();
    const version = createHash('sha256')
      .update(domains.join('\n'))
      .digest('hex')
      .slice(0, 12);

    out[level] = { level, count: domains.length, version, domains };
  }
  return out;
}

function loadSources(dir) {
  const out = {};
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    out[file] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  }
  return out;
}

function main() {
  const sources = loadSources(SOURCES_DIR);
  const built = buildLevels(sources);
  mkdirSync(BUILT_DIR, { recursive: true });
  for (const [level, data] of Object.entries(built)) {
    const path = join(BUILT_DIR, `${level}.json`);
    writeFileSync(path, JSON.stringify(data, null, 2));
    console.log(`built ${level}: ${data.count} domains (version ${data.version})`);
  }
}

// CLI entrypoint: only run main when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- build-blocklist
```

Expected: 5 tests PASS.

- [ ] **Step 5: Add npm script and run the build**

Edit `dns/worker/package.json` `scripts` section to add:

```json
"blocklist:build": "node ../scripts/build-blocklist.mjs"
```

Then run:

```bash
npm run blocklist:build
```

Expected: prints three lines like `built kids: 36 domains (version <hex>)` and creates `dns/data/built/{kids,teens,family}.json`.

- [ ] **Step 6: Commit**

```bash
git add dns/scripts/build-blocklist.mjs dns/scripts/__tests__/build-blocklist.test.js dns/worker/package.json
git commit -m "feat(dns): build script merges sources into per-level blocklists"
```

---

## Task 12: `upload-blocklist.mjs`

**Background:** Pushes the built per-level files into Cloudflare KV using `wrangler kv:bulk put`. Generates a temp JSON file in the bulk format that `wrangler kv:bulk put` expects and shells out. Supports a `--dry-run` flag.

**Files:**
- Create: `dns/scripts/upload-blocklist.mjs`

- [ ] **Step 1: Implement the upload script**

Create `dns/scripts/upload-blocklist.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILT_DIR = join(__dirname, '..', 'data', 'built');
const LEVELS = ['kids', 'teens', 'family'];

function buildBulkEntries(level) {
  const path = join(BUILT_DIR, `${level}.json`);
  if (!existsSync(path)) {
    throw new Error(`missing built file: ${path} — run blocklist:build first`);
  }
  const { domains, version, count } = JSON.parse(readFileSync(path, 'utf8'));
  const entries = domains.map((d) => ({
    key: `${level}:domain:${d}`,
    value: '1',
  }));
  // Bookkeeping keys
  entries.push({ key: `meta:blocklist:${level}:version`, value: version });
  entries.push({ key: `meta:blocklist:${level}:count`, value: String(count) });
  return entries;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const tmp = mkdtempSync(join(tmpdir(), 'safebrowse-kv-'));

  try {
    for (const level of LEVELS) {
      const entries = buildBulkEntries(level);
      const filePath = join(tmp, `${level}.json`);
      writeFileSync(filePath, JSON.stringify(entries));
      console.log(`prepared ${entries.length} entries for ${level}`);

      if (dryRun) {
        console.log(`  [dry-run] would upload ${filePath}`);
        continue;
      }

      // Requires `wrangler` on PATH and BLOCKLIST_KV namespace bound.
      execFileSync(
        'npx',
        ['wrangler', 'kv:bulk', 'put', '--binding', 'BLOCKLIST_KV', filePath],
        { stdio: 'inherit', cwd: join(__dirname, '..', 'worker') }
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 2: Add npm script**

Edit `dns/worker/package.json` `scripts`:

```json
"blocklist:upload": "node ../scripts/upload-blocklist.mjs",
"blocklist:upload:dry": "node ../scripts/upload-blocklist.mjs --dry-run"
```

- [ ] **Step 3: Smoke test in dry-run mode**

```bash
npm run blocklist:build
npm run blocklist:upload:dry
```

Expected output ends with three "would upload" lines, no actual KV writes.

- [ ] **Step 4: Commit**

```bash
git add dns/scripts/upload-blocklist.mjs dns/worker/package.json
git commit -m "feat(dns): upload script pushes built blocklists to KV"
```

---

## Task 13: Daily cron — salt rotation + aggregation

**Background:** The scheduled handler runs once a day at 00:05 UTC. It rotates `meta:dailysalt` and writes yesterday's DO snapshots back into long-lived KV stats keys so the public stats page can read them without touching DOs directly.

**Files:**
- Modify: `dns/worker/src/index.js`
- Create: `dns/worker/__tests__/scheduled.test.js`

- [ ] **Step 1: Write the test**

Create `dns/worker/__tests__/scheduled.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { env } from 'cloudflare:test';

describe('scheduled (daily cron)', () => {
  beforeEach(async () => {
    await env.BLOCKLIST_KV.delete('meta:dailysalt');
  });

  it('rotates the daily salt', async () => {
    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });
    const salt = await env.BLOCKLIST_KV.get('meta:dailysalt');
    expect(salt).toBeTruthy();
    expect(salt.length).toBeGreaterThanOrEqual(16);
  });

  it('replaces an existing salt with a new value', async () => {
    await env.BLOCKLIST_KV.put('meta:dailysalt', 'old-salt-value');
    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });
    const salt = await env.BLOCKLIST_KV.get('meta:dailysalt');
    expect(salt).not.toBe('old-salt-value');
  });

  it('writes a per-level stats summary key for yesterday', async () => {
    // Seed a DO with some counts as if traffic happened yesterday.
    const yesterday = new Date(Date.now() - 86_400_000);
    const y = yesterday.getUTCFullYear();
    const m = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getUTCDate()).padStart(2, '0');
    const key = `${y}-${m}-${d}`;

    const id = env.STATS_DO.idFromName(`kids:${key}`);
    const stub = env.STATS_DO.get(id);
    await stub.fetch('https://do/incr?type=queries', { method: 'POST' });
    await stub.fetch('https://do/incr?type=blocks', { method: 'POST' });
    await stub.fetch('https://do/install?hash=hh', { method: 'POST' });

    await worker.scheduled({ scheduledTime: Date.now() }, env, { waitUntil: () => {} });

    const summary = await env.BLOCKLIST_KV.get(`stats:kids:${key}`);
    expect(summary).toBeTruthy();
    const parsed = JSON.parse(summary);
    expect(parsed).toMatchObject({ queries: 1, blocks: 1, installs: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- scheduled
```

Expected: FAIL — `worker.scheduled` is not a function.

- [ ] **Step 3: Implement the scheduled handler**

Replace the entire contents of `dns/worker/src/index.js` with the version below, which is the Task 8 file plus a new `scheduled` method:

```javascript
import { extractLevel } from './router.js';
import { parseQuestionDomain, buildNxdomainResponse } from './dns-message.js';
import { checkBlocked } from './blocklist.js';
import { resolveUpstream } from './resolver.js';
import { hashClientIp, dateKey } from './stats.js';

export { StatsCounter } from './stats-do.js';

const DEFAULT_UPSTREAM = 'https://cloudflare-dns.com/dns-query';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const level = extractLevel(url.hostname);
    if (!level) {
      return new Response('invalid filter level', { status: 400 });
    }
    if (url.pathname !== '/dns-query') {
      return new Response('not found', { status: 404 });
    }

    let queryBytes;
    if (request.method === 'POST') {
      const buf = await request.arrayBuffer();
      queryBytes = new Uint8Array(buf);
    } else if (request.method === 'GET') {
      const dns = url.searchParams.get('dns');
      if (!dns) return new Response('missing dns param', { status: 400 });
      queryBytes = base64UrlDecode(dns);
    } else {
      return new Response('method not allowed', { status: 405 });
    }

    let domain;
    try {
      domain = parseQuestionDomain(queryBytes);
    } catch {
      return new Response('malformed query', { status: 400 });
    }

    const upstream = env.UPSTREAM_DNS_URL || DEFAULT_UPSTREAM;
    const blocked = await safeCheckBlocked(env, level, domain);

    let responseBytes;
    let counterType;
    if (blocked) {
      responseBytes = buildNxdomainResponse(queryBytes);
      counterType = 'blocks';
    } else {
      try {
        responseBytes = await resolveUpstream(upstream, queryBytes);
      } catch {
        responseBytes = buildServfailResponse(queryBytes);
      }
      counterType = 'queries';
    }

    ctx.waitUntil(recordStats(env, request, level, counterType));

    return new Response(responseBytes, {
      status: 200,
      headers: { 'content-type': 'application/dns-message' },
    });
  },

  async scheduled(event, env, ctx) {
    // 1. Rotate the daily salt so today's IP hashes cannot link back
    //    to yesterday's IP hashes.
    const newSalt = crypto.randomUUID();
    await env.BLOCKLIST_KV.put('meta:dailysalt', newSalt);

    // 2. Snapshot yesterday's per-level DO counters into long-lived
    //    KV keys so the public stats page can read them without
    //    touching Durable Objects directly.
    const yesterday = new Date(Date.now() - 86_400_000);
    const yKey = dateKey(yesterday);
    const levels = ['kids', 'teens', 'family'];

    for (const level of levels) {
      try {
        const id = env.STATS_DO.idFromName(`${level}:${yKey}`);
        const stub = env.STATS_DO.get(id);
        const resp = await stub.fetch('https://do/snapshot');
        const snap = await resp.json();
        await env.BLOCKLIST_KV.put(`stats:${level}:${yKey}`, JSON.stringify(snap));
      } catch (err) {
        console.error(`snapshot failed for ${level}:${yKey}`, err);
      }
    }
  },
};

async function safeCheckBlocked(env, level, domain) {
  try {
    return await checkBlocked(env.BLOCKLIST_KV, level, domain);
  } catch (err) {
    console.error('blocklist lookup failed', err);
    return false;
  }
}

async function recordStats(env, request, level, counterType) {
  try {
    const date = dateKey();
    const id = env.STATS_DO.idFromName(`${level}:${date}`);
    const stub = env.STATS_DO.get(id);
    await stub.fetch(`https://do/incr?type=${counterType}`, { method: 'POST' });

    const ip = request.headers.get('cf-connecting-ip') ?? '0.0.0.0';
    const salt = (await env.BLOCKLIST_KV.get('meta:dailysalt')) ?? 'default-salt';
    const hash = await hashClientIp(ip, salt, level);
    await stub.fetch(`https://do/install?hash=${hash}`, { method: 'POST' });
  } catch (err) {
    console.error('stats recording failed', err);
  }
}

function buildServfailResponse(queryBytes) {
  const out = new Uint8Array(queryBytes);
  const rd = queryBytes[2] & 0x01;
  out[2] = 0x80 | rd;       // QR=1, RA=0
  out[3] = 0x02;            // rcode=SERVFAIL
  out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0;
  out[10] = 0; out[11] = 0;
  return out;
}

function base64UrlDecode(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test
```

Expected: every test (including the three new scheduled tests) PASSES.

- [ ] **Step 5: Commit**

```bash
git add dns/worker/src/index.js dns/worker/__tests__/scheduled.test.js
git commit -m "feat(dns): daily cron rotates salt and snapshots stats"
```

---

## Task 14: Expand the dev README

**Files:**
- Modify: `dns/README.md`

- [ ] **Step 1: Replace the README with the full version**

Overwrite `dns/README.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add dns/README.md
git commit -m "docs(dns): expand README with full setup and smoke instructions"
```

---

## Task 15: Local end-to-end smoke check

**Background:** A final manual check that the assembled Worker behaves correctly against a real `wrangler dev` instance with a real (local) KV. No automation — this is a developer-confidence step.

**Files:** None (manual).

- [ ] **Step 1: Build and seed blocklists**

```bash
cd dns/worker
npm run blocklist:build
# Seed KV in dev with the kids list only (sufficient for smoke).
npx wrangler kv:key put --binding BLOCKLIST_KV \
  "kids:domain:pornhub.com" "1" --local
npx wrangler kv:key put --binding BLOCKLIST_KV \
  "kids:domain:safebrowse-kids-test.cyberheroez.co.uk" "1" --local
```

- [ ] **Step 2: Start the local Worker**

```bash
npm run dev
```

Wait for the "Ready on http://localhost:8787" message.

- [ ] **Step 3: Probe a blocked domain**

In a separate terminal:

```bash
QUERY=$(python3 -c "
import struct
def encode(name):
    return b''.join(bytes([len(p)]) + p.encode() for p in name.split('.')) + b'\x00'
msg = struct.pack('>HHHHHH', 0xabcd, 0x0100, 1, 0, 0, 0) + encode('pornhub.com') + struct.pack('>HH', 1, 1)
import base64; print(base64.urlsafe_b64encode(msg).rstrip(b'=').decode())
")
curl -s -H 'host: kids.dns.cyberheroez.co.uk' \
  "http://localhost:8787/dns-query?dns=$QUERY" | xxd | head -2
```

Expected: response bytes whose 4th byte (offset 3) ends in `03` (rcode=NXDOMAIN).

- [ ] **Step 4: Probe an allowed domain**

```bash
QUERY=$(python3 -c "
import struct
def encode(name):
    return b''.join(bytes([len(p)]) + p.encode() for p in name.split('.')) + b'\x00'
msg = struct.pack('>HHHHHH', 0xabcd, 0x0100, 1, 0, 0, 0) + encode('example.com') + struct.pack('>HH', 1, 1)
import base64; print(base64.urlsafe_b64encode(msg).rstrip(b'=').decode())
")
curl -s -H 'host: kids.dns.cyberheroez.co.uk' \
  "http://localhost:8787/dns-query?dns=$QUERY" | xxd | head -3
```

Expected: response bytes whose 4th byte ends in `00` (rcode=NOERROR) and answer count > 0 in bytes 6–7.

- [ ] **Step 5: Probe unknown subdomain**

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'host: bogus.dns.cyberheroez.co.uk' \
  "http://localhost:8787/dns-query?dns=$QUERY"
```

Expected: `400`.

- [ ] **Step 6: Verify stats counter increment**

```bash
npx wrangler tail
```

(In another shell, repeat steps 3 & 4 a few times.)

Look at the tail output for `stats recording failed` errors — there should be none. (Counter values cannot be read directly from CLI yet; that will land with the public stats page in a later plan.)

- [ ] **Step 7: Tag the milestone**

```bash
git tag -a doh-worker-mvp -m "DoH Worker backend ready for integration"
```

(No commit — just a tag pointing at the current `main`.)

---

## Wrap-up

After Task 15, the Worker backend is feature-complete for the MVP:

- DoH endpoint behind three subdomains with level extraction.
- Blocklist lookup with subdomain walk and hot-domain cache.
- Upstream forwarding with SERVFAIL fallback.
- Fail-open when KV is unavailable.
- Atomic stats via Durable Object.
- Daily cron for salt rotation and stats snapshot.
- Source → built → upload pipeline.

The remaining MVP work — `.mobileconfig` signing, landing site, custom-domain DNS attachment, real-device E2E, beta launch — is covered by Plans 2, 3, and 4.
