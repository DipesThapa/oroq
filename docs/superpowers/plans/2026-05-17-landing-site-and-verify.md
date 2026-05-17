# Landing Site + Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SafeBrowse landing site at `landing/`, an unsigned `.mobileconfig` generation pipeline at `profiles/`, and the `/verify` page that probes the four test domains. Site is testable locally via `wrangler pages dev`.

**Architecture:** Vanilla HTML/CSS/JS, no framework or build step. Single-page progressive disclosure on `index.html` (Choose Level → Install on Device → Verify). Three platform-specific install panels (iPhone, Android, Desktop) shown as tabs with platform auto-detection. `/verify` page probes four sentinel domains and reports which filter level is active. Unsigned `.mobileconfig` profiles generated at build time and served as static assets.

**Tech Stack:** Vanilla HTML, vanilla CSS (custom properties for theming), vanilla ES modules (no bundler). Cloudflare Pages for hosting. Node script (`node:fs` + `node:crypto`) for `.mobileconfig` generation. Vitest for JS unit tests.

**Important constraint** (per Path B decision, 2026-05-17): iOS `.mobileconfig` files are **unsigned** in this MVP. Installation will trigger iOS's "Unverified Profile" warning. Landing copy must address this honestly. Plan 2 (signing pipeline) is deferred; existing installs will upgrade automatically when the signed version ships.

**Out of scope for this plan** (handled by Plan 4): DNS record provisioning, Worker custom domain attachment, real-device end-to-end testing, beta announcement, public `/stats` page, signed profile pipeline (Plan 2, deferred).

**Reference spec:** `docs/superpowers/specs/2026-05-17-safebrowse-doh-mvp-design.md`
**Sibling plan:** `docs/superpowers/plans/2026-05-17-doh-worker-backend.md` (Plan 1, complete)

---

## Task 0: Scaffold `landing/` and `profiles/` projects

**Files:**
- Create: `landing/package.json`
- Create: `landing/.gitignore`
- Create: `profiles/package.json`
- Create: `profiles/README.md`
- Create: `landing/README.md`
- Modify: `.gitignore` (append `landing/dist/` and `profiles/build/`)

- [ ] **Step 1: Create `landing/package.json`**

```json
{
  "name": "safebrowse-landing",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler pages dev public --port 8788",
    "deploy": "wrangler pages deploy public",
    "build:profiles": "node ../profiles/scripts/generate-unsigned.mjs && cp -R ../profiles/build/* public/profiles/",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "~2.1.0",
    "jsdom": "^25.0.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 2: Create `profiles/package.json`**

```json
{
  "name": "safebrowse-profiles",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build:unsigned": "node scripts/generate-unsigned.mjs",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "~2.1.0"
  }
}
```

- [ ] **Step 3: Create `landing/README.md`**

```markdown
# SafeBrowse Landing Site

Static landing site for the SafeBrowse DoH service. Vanilla HTML/CSS/JS.

## Layout

- `public/`           Static assets served by Cloudflare Pages
  - `index.html`      Main install portal (3-step flow)
  - `verify.html`     Verification page
  - `privacy.html`    Privacy policy
  - `terms.html`      Terms of service
  - `assets/`         CSS + JS
  - `profiles/`       Generated `.mobileconfig` files (copied from ../profiles/build/)

## Dev quick start

```bash
cd landing
npm install
npm run build:profiles    # generates the 3 unsigned .mobileconfig files
npm run dev               # serves on http://localhost:8788
```

Open http://localhost:8788 in a browser to see the landing site.

## Tests

```bash
npm test
```

Unit tests cover platform detection and verify-page logic using jsdom.
```

- [ ] **Step 4: Create `profiles/README.md`**

```markdown
# SafeBrowse .mobileconfig Profiles

Generates iOS configuration profiles that route DNS through SafeBrowse.

> **MVP STATUS:** Profiles are **unsigned**. iOS will show an "Unverified
> Profile" warning at install. Plan 2 will add Apple Developer signing.

## Layout

- `templates/`        Plist templates (one per filter level)
- `scripts/`          Node generators
- `build/`            Generated `.mobileconfig` files (gitignored)
```

- [ ] **Step 5: Create `landing/.gitignore`**

```
node_modules/
public/profiles/
.wrangler/
```

- [ ] **Step 6: Update root `.gitignore`**

Append two lines:

```
profiles/build/
landing/node_modules/
```

- [ ] **Step 7: Install both projects**

```bash
cd landing && npm install
cd ../profiles && npm install
```

Expected: `node_modules/` populated in each.

- [ ] **Step 8: Commit**

```bash
git add landing/ profiles/ .gitignore
git commit -m "chore(landing,profiles): scaffold projects"
```

---

## Task 1: Plist `.mobileconfig` templates

**Background:** Each filter level needs its own `.mobileconfig` template. The payload type `com.apple.dnsSettings.managed` tells iOS to use HTTPS DNS (DoH). UUIDs are injected at build time so each generation produces unique IDs.

**Files:**
- Create: `profiles/templates/kids.mobileconfig.template`
- Create: `profiles/templates/teens.mobileconfig.template`
- Create: `profiles/templates/family.mobileconfig.template`

- [ ] **Step 1: Create `profiles/templates/kids.mobileconfig.template`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key>
  <string>SafeBrowse — Kids Filter</string>
  <key>PayloadDescription</key>
  <string>Blocks adult, gambling, social, gaming, and violence content. Best for under 13.</string>
  <key>PayloadIdentifier</key>
  <string>uk.co.cyberheroez.safebrowse.kids</string>
  <key>PayloadOrganization</key>
  <string>CyberHeroez CIC</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{{UUID_OUTER}}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadIdentifier</key>
      <string>uk.co.cyberheroez.safebrowse.kids.dns</string>
      <key>PayloadUUID</key>
      <string>{{UUID_INNER}}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadDisplayName</key>
      <string>SafeBrowse DNS — Kids</string>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>https://kids.dns.cyberheroez.co.uk/dns-query</string>
        <key>ServerName</key>
        <string>kids.dns.cyberheroez.co.uk</string>
      </dict>
      <key>OnDemandRules</key>
      <array>
        <dict>
          <key>Action</key>
          <string>Connect</string>
        </dict>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

- [ ] **Step 2: Create `profiles/templates/teens.mobileconfig.template`**

Same structure, change five strings:
- `PayloadDisplayName` (outer): `SafeBrowse — Teens Filter`
- `PayloadDescription`: `Blocks adult, gambling, drugs, malware, and phishing. Best for 13–17.`
- `PayloadIdentifier` (outer): `uk.co.cyberheroez.safebrowse.teens`
- `PayloadIdentifier` (inner): `uk.co.cyberheroez.safebrowse.teens.dns`
- `PayloadDisplayName` (inner): `SafeBrowse DNS — Teens`
- `ServerURL`: `https://teens.dns.cyberheroez.co.uk/dns-query`
- `ServerName`: `teens.dns.cyberheroez.co.uk`

Full file:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key>
  <string>SafeBrowse — Teens Filter</string>
  <key>PayloadDescription</key>
  <string>Blocks adult, gambling, drugs, malware, and phishing. Best for 13–17.</string>
  <key>PayloadIdentifier</key>
  <string>uk.co.cyberheroez.safebrowse.teens</string>
  <key>PayloadOrganization</key>
  <string>CyberHeroez CIC</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{{UUID_OUTER}}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadIdentifier</key>
      <string>uk.co.cyberheroez.safebrowse.teens.dns</string>
      <key>PayloadUUID</key>
      <string>{{UUID_INNER}}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadDisplayName</key>
      <string>SafeBrowse DNS — Teens</string>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>https://teens.dns.cyberheroez.co.uk/dns-query</string>
        <key>ServerName</key>
        <string>teens.dns.cyberheroez.co.uk</string>
      </dict>
      <key>OnDemandRules</key>
      <array>
        <dict>
          <key>Action</key>
          <string>Connect</string>
        </dict>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

- [ ] **Step 3: Create `profiles/templates/family.mobileconfig.template`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key>
  <string>SafeBrowse — Family Filter</string>
  <key>PayloadDescription</key>
  <string>Blocks adult content, malware, and phishing. Suitable for adult households.</string>
  <key>PayloadIdentifier</key>
  <string>uk.co.cyberheroez.safebrowse.family</string>
  <key>PayloadOrganization</key>
  <string>CyberHeroez CIC</string>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{{UUID_OUTER}}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadIdentifier</key>
      <string>uk.co.cyberheroez.safebrowse.family.dns</string>
      <key>PayloadUUID</key>
      <string>{{UUID_INNER}}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>PayloadDisplayName</key>
      <string>SafeBrowse DNS — Family</string>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>https://family.dns.cyberheroez.co.uk/dns-query</string>
        <key>ServerName</key>
        <string>family.dns.cyberheroez.co.uk</string>
      </dict>
      <key>OnDemandRules</key>
      <array>
        <dict>
          <key>Action</key>
          <string>Connect</string>
        </dict>
      </array>
    </dict>
  </array>
</dict>
</plist>
```

- [ ] **Step 4: Commit**

```bash
git add profiles/templates/
git commit -m "feat(profiles): .mobileconfig templates for kids/teens/family"
```

---

## Task 2: Unsigned `.mobileconfig` generator

**Background:** Reads each template, substitutes fresh UUIDs, writes the result to `profiles/build/<level>.mobileconfig`. Pure JS, fully testable.

**Files:**
- Create: `profiles/scripts/lib/generate.js`
- Create: `profiles/scripts/__tests__/generate.test.js`
- Create: `profiles/scripts/generate-unsigned.mjs`
- Create: `profiles/vitest.config.js`

- [ ] **Step 1: Write the failing test**

Create `profiles/vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

Create `profiles/scripts/__tests__/generate.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { substituteUuids } from '../lib/generate.js';

const TEMPLATE = `
<key>PayloadUUID</key>
<string>{{UUID_OUTER}}</string>
<key>InnerPayloadUUID</key>
<string>{{UUID_INNER}}</string>
`;

describe('substituteUuids', () => {
  it('replaces UUID_OUTER and UUID_INNER placeholders', () => {
    const out = substituteUuids(TEMPLATE);
    expect(out).not.toContain('{{UUID_OUTER}}');
    expect(out).not.toContain('{{UUID_INNER}}');
  });

  it('produces uppercase UUIDs in canonical 8-4-4-4-12 format', () => {
    const out = substituteUuids(TEMPLATE);
    const uuidRegex = /[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/g;
    const matches = out.match(uuidRegex);
    expect(matches).toHaveLength(2);
  });

  it('produces distinct UUIDs for OUTER and INNER on the same call', () => {
    const out = substituteUuids(TEMPLATE);
    const uuids = out.match(/[0-9A-F-]{36}/g);
    expect(uuids[0]).not.toBe(uuids[1]);
  });

  it('produces different UUIDs across calls', () => {
    const a = substituteUuids(TEMPLATE);
    const b = substituteUuids(TEMPLATE);
    expect(a).not.toBe(b);
  });

  it('leaves non-placeholder content untouched', () => {
    const out = substituteUuids(TEMPLATE);
    expect(out).toContain('<key>PayloadUUID</key>');
    expect(out).toContain('<key>InnerPayloadUUID</key>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd profiles
npm test -- generate
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `substituteUuids`**

Create `profiles/scripts/lib/generate.js`:

```javascript
import { randomUUID } from 'node:crypto';

/**
 * Substitute {{UUID_OUTER}} and {{UUID_INNER}} placeholders in a template
 * string with freshly generated uppercase UUIDs.
 */
export function substituteUuids(template) {
  const outer = randomUUID().toUpperCase();
  const inner = randomUUID().toUpperCase();
  return template
    .replace('{{UUID_OUTER}}', outer)
    .replace('{{UUID_INNER}}', inner);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- generate
```

Expected: 5 tests PASS.

- [ ] **Step 5: Implement the CLI wrapper**

Create `profiles/scripts/generate-unsigned.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { substituteUuids } from './lib/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, '..', 'templates');
const BUILD_DIR = join(__dirname, '..', 'build');

const LEVELS = ['kids', 'teens', 'family'];

function main() {
  mkdirSync(BUILD_DIR, { recursive: true });
  for (const level of LEVELS) {
    const tplPath = join(TEMPLATE_DIR, `${level}.mobileconfig.template`);
    const outPath = join(BUILD_DIR, `${level}.mobileconfig`);
    const template = readFileSync(tplPath, 'utf8');
    const out = substituteUuids(template);
    writeFileSync(outPath, out);
    console.log(`wrote ${outPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 6: Run the generator**

```bash
npm run build:unsigned
```

Expected: three lines `wrote .../profiles/build/<level>.mobileconfig`, three files appear in `build/`.

- [ ] **Step 7: Commit**

```bash
cd ..
git add profiles/scripts/ profiles/vitest.config.js
git commit -m "feat(profiles): unsigned .mobileconfig generator with TDD"
```

---

## Task 3: Landing site skeleton and global styles

**Background:** Establish the visual foundation: a single page (`index.html`), shared CSS with custom properties, and a header/footer pattern that the other pages (`verify.html`, `privacy.html`, `terms.html`) will reuse.

**Files:**
- Create: `landing/public/index.html`
- Create: `landing/public/assets/styles.css`
- Create: `landing/public/assets/logo.svg`

- [ ] **Step 1: Create `landing/public/assets/styles.css`**

```css
:root {
  --color-bg: #ffffff;
  --color-fg: #1a1a2e;
  --color-muted: #5a5a6c;
  --color-accent: #2563eb;
  --color-accent-hover: #1d4ed8;
  --color-success: #16a34a;
  --color-warn: #f59e0b;
  --color-error: #dc2626;
  --color-border: #e5e7eb;
  --color-card: #f9fafb;

  --radius: 10px;
  --gap: 1.5rem;
  --max-width: 960px;
  --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f1117;
    --color-fg: #f5f5f7;
    --color-muted: #a0a0b0;
    --color-card: #1a1d28;
    --color-border: #2a2d38;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--color-bg);
  color: var(--color-fg);
  font-family: var(--font-body);
  line-height: 1.55;
  font-size: 16px;
}

.container {
  max-width: var(--max-width);
  margin: 0 auto;
  padding: 1rem 1.25rem;
}

.site-header {
  border-bottom: 1px solid var(--color-border);
}

.site-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
}

.site-header__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  text-decoration: none;
  color: inherit;
}

.site-header__brand img { height: 28px; }

.site-footer {
  margin-top: 4rem;
  border-top: 1px solid var(--color-border);
  font-size: 0.9rem;
  color: var(--color-muted);
}

.site-footer__inner {
  padding: 1.5rem 1.25rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
}

.site-footer a { color: var(--color-muted); }

.hero { padding: 3rem 0 2rem; text-align: center; }
.hero h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); margin: 0 0 0.5rem; }
.hero p { font-size: 1.1rem; color: var(--color-muted); max-width: 36em; margin: 0.5rem auto; }

.trust-list {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 1rem; margin: 1.5rem 0 0; padding: 0; list-style: none;
  color: var(--color-muted); font-size: 0.95rem;
}
.trust-list li::before { content: '✓ '; color: var(--color-success); font-weight: 700; }

.btn {
  display: inline-block;
  background: var(--color-accent);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius);
  font-weight: 600;
  text-decoration: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
}
.btn:hover { background: var(--color-accent-hover); }
.btn--ghost { background: transparent; color: var(--color-accent); border: 1px solid var(--color-accent); }
.btn--ghost:hover { background: var(--color-card); }

.step { margin: 3rem 0; }
.step__heading { font-size: 1.3rem; margin: 0 0 1rem; }
.step__hint { color: var(--color-muted); margin: 0 0 1rem; }

.level-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.level-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
.level-card:hover, .level-card:focus-visible {
  border-color: var(--color-accent);
  outline: none;
}
.level-card[aria-pressed="true"] {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px var(--color-accent);
}
.level-card__emoji { font-size: 2rem; }
.level-card__title { font-weight: 700; font-size: 1.1rem; margin: 0.25rem 0; }
.level-card__age { color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0.5rem; }
.level-card__list { margin: 0; padding-left: 1.1em; font-size: 0.9rem; color: var(--color-muted); }

.platform-tabs {
  display: flex; gap: 0.5rem; margin: 1rem 0;
  border-bottom: 1px solid var(--color-border);
}
.platform-tab {
  background: none;
  border: none;
  padding: 0.75rem 1rem;
  cursor: pointer;
  color: var(--color-muted);
  font: inherit;
  border-bottom: 2px solid transparent;
}
.platform-tab[aria-selected="true"] {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
.platform-panel { display: none; padding: 1rem 0; }
.platform-panel[data-active="true"] { display: block; }

.notice {
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  margin: 1rem 0;
  border: 1px solid var(--color-border);
}
.notice--warn {
  background: rgba(245, 158, 11, 0.1);
  border-color: var(--color-warn);
}
.notice--info {
  background: rgba(37, 99, 235, 0.06);
  border-color: var(--color-accent);
}
.notice__title { font-weight: 700; margin: 0 0 0.3rem; }
.notice__body { margin: 0; color: var(--color-muted); }

.copy-row {
  display: flex; align-items: center; gap: 0.5rem;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 0.5rem 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.95rem;
  word-break: break-all;
}
.copy-row__text { flex: 1; }
.copy-row__btn {
  border: none; background: var(--color-accent); color: white;
  padding: 0.3rem 0.75rem; border-radius: 6px; cursor: pointer; font-size: 0.85rem;
}

.step__list { padding-left: 1.25rem; }
.step__list li { margin: 0.4rem 0; }

[hidden] { display: none !important; }
```

- [ ] **Step 2: Create a minimal SVG logo**

Create `landing/public/assets/logo.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#2563eb"/>
  <path d="M32 14 L48 22 V34 C48 42 41 50 32 52 C23 50 16 42 16 34 V22 Z"
        fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>
  <path d="M24 33 L30 39 L42 27" fill="none" stroke="white" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 3: Create the index page skeleton**

Create `landing/public/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SafeBrowse — Free family DNS protection</title>
  <meta name="description" content="Block harmful websites across all browsers and apps on your child's phone, tablet, and computer in 60 seconds. Free, private, no app to install.">
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body>
  <header class="site-header">
    <div class="site-header__inner">
      <a class="site-header__brand" href="/">
        <img src="/assets/logo.svg" alt="">
        <span>SafeBrowse</span>
      </a>
      <nav>
        <a href="/verify.html">Verify</a>
      </nav>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <h1>Free DNS-based web safety for your family</h1>
      <p>Block harmful websites across all browsers and apps on your child's
         phone, tablet, and computer — in 60 seconds.</p>
      <ul class="trust-list">
        <li>No app to install</li>
        <li>Works on all devices</li>
        <li>Free</li>
        <li>Privacy-first (no tracking)</li>
      </ul>
    </section>

    <!-- Step 1 — populated in Task 4 -->
    <section class="step" id="step-level" aria-labelledby="step-level-h">
      <h2 class="step__heading" id="step-level-h">Step 1: Choose protection level</h2>
      <p class="step__hint">Pick the level that fits your child's age. You can change it later.</p>
      <!-- level cards inserted in Task 4 -->
    </section>

    <!-- Step 2 — populated in Tasks 5-7 -->
    <section class="step" id="step-install" hidden aria-labelledby="step-install-h">
      <h2 class="step__heading" id="step-install-h">Step 2: Install on your device</h2>
      <!-- platform tabs + panels inserted in Tasks 5-7 -->
    </section>

    <!-- Step 3 -->
    <section class="step" id="step-verify" hidden aria-labelledby="step-verify-h">
      <h2 class="step__heading" id="step-verify-h">Step 3: Verify it's working</h2>
      <p class="step__hint">After installing, tap the button below to confirm SafeBrowse is active.</p>
      <a class="btn" href="/verify.html">Test now →</a>
    </section>
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <span>SafeBrowse · A CyberHeroez CIC project</span>
      <span>
        <a href="/privacy.html">Privacy</a> ·
        <a href="/terms.html">Terms</a> ·
        <a href="https://github.com/DipesThapa/safebrowse-ai">GitHub</a>
      </span>
    </div>
  </footer>

  <script type="module" src="/assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Smoke-check the page renders**

```bash
cd landing
mkdir -p public/profiles
npm run dev
```

Open http://localhost:8788. You should see the hero, the four trust checkmarks, and the empty Step 1 heading. Step 2 and Step 3 are hidden until selection (next tasks). Stop the dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
cd ..
git add landing/public/
git commit -m "feat(landing): site skeleton, global styles, hero, dark mode"
```

---

## Task 4: Level selector (Step 1)

**Background:** Renders three clickable cards for Kids/Teens/Family. Selecting a card stores the choice and reveals Step 2 with the install panels.

**Files:**
- Modify: `landing/public/index.html`
- Create: `landing/public/assets/app.js`
- Create: `landing/__tests__/level-selector.test.js`

- [ ] **Step 1: Write failing test for the level state machine**

Create `landing/vitest.config.js`:

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

Create `landing/__tests__/level-selector.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setupLevelSelector } from '../public/assets/level-selector.js';

function setupDom() {
  document.body.innerHTML = `
    <section id="step-level">
      <button class="level-card" data-level="kids" aria-pressed="false">Kids</button>
      <button class="level-card" data-level="teens" aria-pressed="false">Teens</button>
      <button class="level-card" data-level="family" aria-pressed="false">Family</button>
    </section>
    <section id="step-install" hidden></section>
    <section id="step-verify" hidden></section>
  `;
}

describe('level selector', () => {
  beforeEach(setupDom);

  it('sets aria-pressed on the clicked card and unsets others', () => {
    setupLevelSelector(() => {});
    document.querySelector('[data-level="teens"]').click();
    expect(document.querySelector('[data-level="kids"]').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('[data-level="teens"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-level="family"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('reveals step-install and step-verify on selection', () => {
    setupLevelSelector(() => {});
    expect(document.getElementById('step-install').hidden).toBe(true);
    document.querySelector('[data-level="kids"]').click();
    expect(document.getElementById('step-install').hidden).toBe(false);
    expect(document.getElementById('step-verify').hidden).toBe(false);
  });

  it('invokes the callback with the chosen level', () => {
    const calls = [];
    setupLevelSelector((level) => calls.push(level));
    document.querySelector('[data-level="family"]').click();
    expect(calls).toEqual(['family']);
  });

  it('allows changing selection (callback fires again)', () => {
    const calls = [];
    setupLevelSelector((level) => calls.push(level));
    document.querySelector('[data-level="kids"]').click();
    document.querySelector('[data-level="teens"]').click();
    expect(calls).toEqual(['kids', 'teens']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd landing
npm test -- level-selector
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the selector module**

Create `landing/public/assets/level-selector.js`:

```javascript
/**
 * Wire up the Step 1 level cards.
 * Calls `onSelect(level)` whenever the user picks one.
 * Reveals the install and verify steps on first selection.
 */
export function setupLevelSelector(onSelect) {
  const cards = document.querySelectorAll('.level-card');
  const stepInstall = document.getElementById('step-install');
  const stepVerify = document.getElementById('step-verify');

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const level = card.dataset.level;
      cards.forEach((c) => c.setAttribute('aria-pressed', c === card ? 'true' : 'false'));
      stepInstall.hidden = false;
      stepVerify.hidden = false;
      onSelect(level);
    });
  });
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
npm test -- level-selector
```

Expected: 4 tests PASS.

- [ ] **Step 5: Add the level cards to `index.html`**

Replace the contents of the `<section id="step-level">` block with:

```html
    <section class="step" id="step-level" aria-labelledby="step-level-h">
      <h2 class="step__heading" id="step-level-h">Step 1: Choose protection level</h2>
      <p class="step__hint">Pick the level that fits your child's age. You can change it later.</p>
      <div class="level-grid">
        <button class="level-card" data-level="kids" aria-pressed="false">
          <span class="level-card__emoji" aria-hidden="true">👦</span>
          <span class="level-card__title">Kids</span>
          <span class="level-card__age">Under 13</span>
          <ul class="level-card__list">
            <li>Adult content</li>
            <li>Social media</li>
            <li>Gaming sites</li>
            <li>Violence &amp; drugs</li>
          </ul>
        </button>
        <button class="level-card" data-level="teens" aria-pressed="false">
          <span class="level-card__emoji" aria-hidden="true">🧑</span>
          <span class="level-card__title">Teens</span>
          <span class="level-card__age">13–17</span>
          <ul class="level-card__list">
            <li>Adult content</li>
            <li>Gambling &amp; drugs</li>
            <li>Malware &amp; phishing</li>
          </ul>
        </button>
        <button class="level-card" data-level="family" aria-pressed="false">
          <span class="level-card__emoji" aria-hidden="true">👪</span>
          <span class="level-card__title">Family</span>
          <span class="level-card__age">Adults</span>
          <ul class="level-card__list">
            <li>Adult content</li>
            <li>Malware &amp; phishing</li>
          </ul>
        </button>
      </div>
    </section>
```

- [ ] **Step 6: Create the entry script**

Create `landing/public/assets/app.js`:

```javascript
import { setupLevelSelector } from './level-selector.js';

let selectedLevel = null;

setupLevelSelector((level) => {
  selectedLevel = level;
  // Install panel wiring lands in Tasks 5-7.
  document.dispatchEvent(new CustomEvent('safebrowse:level', { detail: { level } }));
  document.getElementById('step-install').scrollIntoView({ behavior: 'smooth' });
});
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add landing/
git commit -m "feat(landing): level selector with TDD, reveals install + verify"
```

---

## Task 5: iOS install panel with unsigned-profile warning

**Background:** When iOS is selected, the user downloads the unsigned `.mobileconfig` for the chosen level. The panel must clearly warn that iOS will display an "Unverified Profile" prompt and explain that this is expected.

**Files:**
- Modify: `landing/public/index.html`
- Create: `landing/public/assets/install-panels.js`
- Modify: `landing/public/assets/app.js`

- [ ] **Step 1: Add install-step markup**

Replace the contents of `<section id="step-install">` with:

```html
    <section class="step" id="step-install" hidden aria-labelledby="step-install-h">
      <h2 class="step__heading" id="step-install-h">Step 2: Install on your device</h2>
      <p class="step__hint">We've auto-detected your device, but you can pick a different one.</p>
      <div class="platform-tabs" role="tablist">
        <button class="platform-tab" role="tab" aria-selected="false" data-platform="ios">iPhone / iPad</button>
        <button class="platform-tab" role="tab" aria-selected="false" data-platform="android">Android</button>
        <button class="platform-tab" role="tab" aria-selected="false" data-platform="desktop">Desktop</button>
      </div>

      <!-- iOS panel -->
      <div class="platform-panel" data-platform="ios" data-active="false" role="tabpanel">
        <div class="notice notice--warn" role="alert">
          <p class="notice__title">⚠ iOS will show "Unverified Profile" — that's expected</p>
          <p class="notice__body">
            Our profile is currently <strong>unsigned</strong> while we wait for our
            Apple Developer Program enrolment to complete. Installation works
            exactly the same — iOS just asks you to confirm twice. We'll
            replace this with a verified profile soon.
          </p>
        </div>
        <p>Tap the button to download the profile for the level you picked above:</p>
        <p><a class="btn" id="ios-download" href="#" download>Download profile</a></p>
        <ol class="step__list">
          <li>Tap <strong>Allow</strong> when iOS asks "Allow profile download?"</li>
          <li>Open <strong>Settings</strong> on your device</li>
          <li>Tap <strong>Profile Downloaded</strong> near the top
              (or Settings → General → VPN &amp; Device Management)</li>
          <li>Tap <strong>Install</strong> in the top right</li>
          <li>Enter your iPhone passcode</li>
          <li>Tap <strong>Install</strong> twice more to confirm</li>
        </ol>
      </div>

      <!-- Android panel — populated in Task 6 -->
      <div class="platform-panel" data-platform="android" data-active="false" role="tabpanel"></div>

      <!-- Desktop panel — populated in Task 7 -->
      <div class="platform-panel" data-platform="desktop" data-active="false" role="tabpanel"></div>
    </section>
```

- [ ] **Step 2: Write failing test for install-panel behaviour**

Create `landing/__tests__/install-panels.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { setupInstallPanels, detectPlatform } from '../public/assets/install-panels.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="platform-tabs">
      <button class="platform-tab" role="tab" aria-selected="false" data-platform="ios">iOS</button>
      <button class="platform-tab" role="tab" aria-selected="false" data-platform="android">Android</button>
      <button class="platform-tab" role="tab" aria-selected="false" data-platform="desktop">Desktop</button>
    </div>
    <div class="platform-panel" data-platform="ios" data-active="false"></div>
    <div class="platform-panel" data-platform="android" data-active="false"></div>
    <div class="platform-panel" data-platform="desktop" data-active="false"></div>
    <a id="ios-download" href="#">Download</a>
  `;
}

describe('detectPlatform', () => {
  it('detects iOS user agents', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 16_0)')).toBe('ios');
  });

  it('detects Android user agents', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe('android');
  });

  it('defaults to desktop for other UAs', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0)')).toBe('desktop');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0)')).toBe('desktop');
  });
});

describe('install panels', () => {
  beforeEach(setupDom);

  it('activates the auto-detected platform tab', () => {
    setupInstallPanels({ platform: 'android', level: 'kids' });
    expect(document.querySelector('[data-platform="android"][role="tabpanel"]').dataset.active).toBe('true');
    expect(document.querySelector('[data-platform="android"][role="tab"]').getAttribute('aria-selected')).toBe('true');
  });

  it('switches panel when a tab is clicked', () => {
    setupInstallPanels({ platform: 'android', level: 'kids' });
    document.querySelector('[data-platform="ios"][role="tab"]').click();
    expect(document.querySelector('[data-platform="ios"][role="tabpanel"]').dataset.active).toBe('true');
    expect(document.querySelector('[data-platform="android"][role="tabpanel"]').dataset.active).toBe('false');
  });

  it('points iOS download link at the chosen level\'s profile', () => {
    setupInstallPanels({ platform: 'ios', level: 'teens' });
    expect(document.getElementById('ios-download').getAttribute('href')).toBe('/profiles/teens.mobileconfig');
  });

  it('updates iOS link when level changes', () => {
    const handle = setupInstallPanels({ platform: 'ios', level: 'kids' });
    handle.setLevel('family');
    expect(document.getElementById('ios-download').getAttribute('href')).toBe('/profiles/family.mobileconfig');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- install-panels
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `install-panels.js`**

Create `landing/public/assets/install-panels.js`:

```javascript
const PLATFORMS = ['ios', 'android', 'desktop'];

export function detectPlatform(ua = navigator.userAgent) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function activatePlatform(p) {
  PLATFORMS.forEach((name) => {
    const tab = document.querySelector(`.platform-tab[data-platform="${name}"]`);
    const panel = document.querySelector(`.platform-panel[data-platform="${name}"]`);
    const selected = name === p;
    if (tab) tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (panel) panel.dataset.active = selected ? 'true' : 'false';
  });
}

function updateIosDownload(level) {
  const link = document.getElementById('ios-download');
  if (link) link.setAttribute('href', `/profiles/${level}.mobileconfig`);
}

/**
 * Wire the install-step tabs and the per-platform link state.
 * Returns a handle with `setLevel(level)` so the caller can update
 * the link when the user changes their level pick.
 */
export function setupInstallPanels({ platform, level }) {
  activatePlatform(platform);
  updateIosDownload(level);

  document.querySelectorAll('.platform-tab').forEach((tab) => {
    tab.addEventListener('click', () => activatePlatform(tab.dataset.platform));
  });

  return {
    setLevel(newLevel) {
      updateIosDownload(newLevel);
    },
  };
}
```

- [ ] **Step 5: Run test to verify pass**

```bash
npm test -- install-panels
```

Expected: 8 tests PASS (3 platform + 5 install panels).

- [ ] **Step 6: Wire `install-panels` into `app.js`**

Replace `landing/public/assets/app.js` with:

```javascript
import { setupLevelSelector } from './level-selector.js';
import { setupInstallPanels, detectPlatform } from './install-panels.js';

let panels = null;

setupLevelSelector((level) => {
  if (!panels) {
    panels = setupInstallPanels({ platform: detectPlatform(), level });
  } else {
    panels.setLevel(level);
  }
  document.getElementById('step-install').scrollIntoView({ behavior: 'smooth' });
});
```

- [ ] **Step 7: Commit**

```bash
cd ..
git add landing/
git commit -m "feat(landing): iOS install panel with unsigned-profile warning"
```

---

## Task 6: Android install panel with copy-to-clipboard hostname

**Background:** Android users set a hostname in Settings → Private DNS. Show a copy-button row with the right hostname for the selected level, plus the step-by-step instructions.

**Files:**
- Modify: `landing/public/index.html`
- Modify: `landing/public/assets/install-panels.js`
- Modify: `landing/__tests__/install-panels.test.js`

- [ ] **Step 1: Add Android panel markup**

Replace the empty `<div class="platform-panel" data-platform="android" ...>` block with:

```html
      <div class="platform-panel" data-platform="android" data-active="false" role="tabpanel">
        <p>
          Android 9 (Pie) or newer supports DNS-over-TLS natively. No app needed —
          just one setting change.
        </p>
        <p>Copy this hostname:</p>
        <div class="copy-row">
          <span class="copy-row__text" id="android-hostname">kids.dns.cyberheroez.co.uk</span>
          <button class="copy-row__btn" id="android-copy" type="button">Copy</button>
        </div>
        <ol class="step__list">
          <li>Open <strong>Settings</strong> on the device</li>
          <li>Tap <strong>Network &amp; Internet → Private DNS</strong>
              (on some phones: Connections → More → Private DNS)</li>
          <li>Select <strong>Private DNS provider hostname</strong></li>
          <li>Paste the hostname above</li>
          <li>Tap <strong>Save</strong></li>
        </ol>
      </div>
```

- [ ] **Step 2: Add Android tests**

Append to `landing/__tests__/install-panels.test.js` inside the `describe('install panels', ...)` block:

```javascript
  it('shows correct Android hostname for chosen level', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <span id="android-hostname"></span>
      <button id="android-copy"></button>
    `);
    setupInstallPanels({ platform: 'android', level: 'family' });
    expect(document.getElementById('android-hostname').textContent).toBe('family.dns.cyberheroez.co.uk');
  });

  it('updates Android hostname when level changes', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <span id="android-hostname"></span>
      <button id="android-copy"></button>
    `);
    const handle = setupInstallPanels({ platform: 'android', level: 'kids' });
    handle.setLevel('teens');
    expect(document.getElementById('android-hostname').textContent).toBe('teens.dns.cyberheroez.co.uk');
  });

  it('copy button writes hostname to clipboard', async () => {
    document.body.insertAdjacentHTML('beforeend', `
      <span id="android-hostname"></span>
      <button id="android-copy"></button>
    `);
    let written = '';
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (s) => { written = s; } },
      configurable: true,
    });
    setupInstallPanels({ platform: 'android', level: 'kids' });
    document.getElementById('android-copy').click();
    // Microtask flush
    await Promise.resolve();
    expect(written).toBe('kids.dns.cyberheroez.co.uk');
  });
```

- [ ] **Step 3: Extend `install-panels.js`**

Replace the contents of `landing/public/assets/install-panels.js` with:

```javascript
const PLATFORMS = ['ios', 'android', 'desktop'];

export function detectPlatform(ua = navigator.userAgent) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

function activatePlatform(p) {
  PLATFORMS.forEach((name) => {
    const tab = document.querySelector(`.platform-tab[data-platform="${name}"]`);
    const panel = document.querySelector(`.platform-panel[data-platform="${name}"]`);
    const selected = name === p;
    if (tab) tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (panel) panel.dataset.active = selected ? 'true' : 'false';
  });
}

function updateIosDownload(level) {
  const link = document.getElementById('ios-download');
  if (link) link.setAttribute('href', `/profiles/${level}.mobileconfig`);
}

function hostnameFor(level) {
  return `${level}.dns.cyberheroez.co.uk`;
}

function updateAndroidHostname(level) {
  const text = document.getElementById('android-hostname');
  if (text) text.textContent = hostnameFor(level);
}

function wireAndroidCopy() {
  const btn = document.getElementById('android-copy');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const text = document.getElementById('android-hostname')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      btn.textContent = 'Press Cmd/Ctrl+C';
    }
  });
}

/**
 * Wire the install-step tabs and the per-platform link / hostname state.
 * Returns a handle with `setLevel(level)` so the caller can update
 * the link and hostname when the user changes their level pick.
 */
export function setupInstallPanels({ platform, level }) {
  activatePlatform(platform);
  updateIosDownload(level);
  updateAndroidHostname(level);
  wireAndroidCopy();

  document.querySelectorAll('.platform-tab').forEach((tab) => {
    tab.addEventListener('click', () => activatePlatform(tab.dataset.platform));
  });

  return {
    setLevel(newLevel) {
      updateIosDownload(newLevel);
      updateAndroidHostname(newLevel);
    },
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- install-panels
```

Expected: 11 tests PASS (3 platform + 8 install panels).

- [ ] **Step 5: Commit**

```bash
cd ..
git add landing/
git commit -m "feat(landing): Android install panel with copy-to-clipboard"
```

---

## Task 7: Desktop install panel

**Background:** Desktop users get a link to the existing SafeBrowse browser extension. The DoH hostname is also offered for router-level setups.

**Files:**
- Modify: `landing/public/index.html`

- [ ] **Step 1: Add Desktop panel markup**

Replace the empty `<div class="platform-panel" data-platform="desktop" ...>` block with:

```html
      <div class="platform-panel" data-platform="desktop" data-active="false" role="tabpanel">
        <p>
          For browser protection on Mac, Windows, or Chromebook we recommend
          our free SafeBrowse browser extension. It works in Chrome, Edge,
          Brave, Opera, and Vivaldi.
        </p>
        <p>
          <a class="btn"
             href="https://chromewebstore.google.com/detail/safebrowse"
             rel="noopener" target="_blank">
            Install Chrome extension →
          </a>
        </p>
        <p>For Firefox:</p>
        <p>
          <a class="btn btn--ghost"
             href="https://addons.mozilla.org/firefox/addon/safebrowse/"
             rel="noopener" target="_blank">
            Install Firefox add-on →
          </a>
        </p>
        <hr>
        <div class="notice notice--info">
          <p class="notice__title">Want network-wide protection?</p>
          <p class="notice__body">
            Configure your home router's DNS to use the hostname below
            and every device on your Wi-Fi (including phones, tablets,
            smart TVs) gets the same filter.
          </p>
        </div>
        <p>Use this hostname in your router's DNS settings:</p>
        <div class="copy-row">
          <span class="copy-row__text" id="router-hostname">kids.dns.cyberheroez.co.uk</span>
        </div>
      </div>
```

- [ ] **Step 2: Update `install-panels.js` to also update router hostname**

In `landing/public/assets/install-panels.js`, change `updateAndroidHostname` and the public handle so the router-hostname display gets the same value:

Replace `updateAndroidHostname(level)` body with:

```javascript
function updateAndroidHostname(level) {
  const text = document.getElementById('android-hostname');
  if (text) text.textContent = hostnameFor(level);
  const router = document.getElementById('router-hostname');
  if (router) router.textContent = hostnameFor(level);
}
```

(No other change needed — `setLevel` already calls this.)

- [ ] **Step 3: Smoke-check the page**

```bash
cd landing
npm run build:profiles    # populates public/profiles/ with the 3 unsigned files
npm run dev
```

Open http://localhost:8788. Click "Kids" → confirm Step 2 reveals, iPhone tab is auto-selected on a Mac (desktop will be selected here actually — switch to iPhone tab manually). Verify:

- iPhone tab shows the unsigned warning + Download button
- Android tab shows `kids.dns.cyberheroez.co.uk` with Copy button
- Desktop tab shows extension links + router hostname

Stop the dev server.

- [ ] **Step 4: Run all landing tests**

```bash
npm test
```

Expected: every landing test PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add landing/
git commit -m "feat(landing): desktop install panel (extension + router DNS)"
```

---

## Task 8: Verification page (`/verify.html`)

**Background:** Loads four sentinel test images in parallel. Each image either loads or fails. The combination tells us which filter level (if any) is active. See spec §8.

**Files:**
- Create: `landing/public/verify.html`
- Create: `landing/public/assets/verify.js`
- Create: `landing/__tests__/verify.test.js`

- [ ] **Step 1: Write failing test for the detection logic**

Create `landing/__tests__/verify.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { interpretResults } from '../public/assets/verify.js';

describe('interpretResults', () => {
  it('reports network error when the allow probe failed', () => {
    expect(interpretResults({
      allow: false, kids: false, teens: false, family: false,
    })).toEqual({ status: 'network', level: null });
  });

  it('reports no-filter when allow loads and all level probes load', () => {
    expect(interpretResults({
      allow: true, kids: true, teens: true, family: true,
    })).toEqual({ status: 'no-filter', level: null });
  });

  it('reports kids when only the kids probe is blocked', () => {
    expect(interpretResults({
      allow: true, kids: false, teens: true, family: true,
    })).toEqual({ status: 'protected', level: 'kids' });
  });

  it('reports teens when only the teens probe is blocked', () => {
    expect(interpretResults({
      allow: true, kids: true, teens: false, family: true,
    })).toEqual({ status: 'protected', level: 'teens' });
  });

  it('reports family when only the family probe is blocked', () => {
    expect(interpretResults({
      allow: true, kids: true, teens: true, family: false,
    })).toEqual({ status: 'protected', level: 'family' });
  });

  it('reports unknown when multiple level probes are blocked', () => {
    expect(interpretResults({
      allow: true, kids: false, teens: false, family: true,
    })).toEqual({ status: 'unknown', level: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- verify
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the interpretation logic**

Create `landing/public/assets/verify.js`:

```javascript
const LEVELS = ['kids', 'teens', 'family'];

export function interpretResults({ allow, kids, teens, family }) {
  if (!allow) return { status: 'network', level: null };
  const levelResults = { kids, teens, family };
  const blocked = LEVELS.filter((l) => !levelResults[l]);
  if (blocked.length === 0) return { status: 'no-filter', level: null };
  if (blocked.length === 1) return { status: 'protected', level: blocked[0] };
  return { status: 'unknown', level: null };
}

/**
 * Probe a URL by attempting to load it as an Image. Resolves with true
 * if the image loaded, false on error or timeout. Cache-busts to avoid
 * stale results across visits.
 */
export function probeImage(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    const timer = setTimeout(() => resolve(false), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(true); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = bust;
  });
}

const PROBES = {
  allow:  'https://safebrowse-allow-test.cyberheroez.co.uk/pixel.png',
  kids:   'https://safebrowse-kids-test.cyberheroez.co.uk/pixel.png',
  teens:  'https://safebrowse-teens-test.cyberheroez.co.uk/pixel.png',
  family: 'https://safebrowse-family-test.cyberheroez.co.uk/pixel.png',
};

export async function runProbes() {
  const entries = await Promise.all(
    Object.entries(PROBES).map(async ([name, url]) => [name, await probeImage(url)])
  );
  return Object.fromEntries(entries);
}

function render(result) {
  const root = document.getElementById('verify-result');
  if (!root) return;
  root.hidden = false;

  const messages = {
    network: {
      cls: 'notice--warn',
      title: '⚠ Network problem',
      body: 'We couldn\'t reach our test endpoint. SafeBrowse can\'t be detected. Check your internet and try again.',
    },
    'no-filter': {
      cls: 'notice--warn',
      title: '❌ SafeBrowse is not active',
      body: 'No SafeBrowse filter detected on this device. Install a profile from the home page and re-test.',
    },
    protected: {
      cls: 'notice notice--info',
      title: `✅ SafeBrowse is active — ${result.level?.toUpperCase()} filter`,
      body: `This device is currently using the ${result.level} filter. Browsing is being protected.`,
    },
    unknown: {
      cls: 'notice--warn',
      title: '⚠ Unexpected result',
      body: 'Multiple filters appear to be blocking, which we did not expect. Try removing existing SafeBrowse profiles and re-installing one.',
    },
  };
  const msg = messages[result.status];
  root.className = `notice ${msg.cls}`;
  root.innerHTML = `<p class="notice__title">${msg.title}</p><p class="notice__body">${msg.body}</p>`;
}

export async function main() {
  const result = interpretResults(await runProbes());
  render(result);
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', main);
}
```

- [ ] **Step 4: Create `verify.html`**

Create `landing/public/verify.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SafeBrowse — Verify your protection</title>
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
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
    <section class="hero">
      <h1>Verifying your protection…</h1>
      <p>Testing four sentinel domains. This takes about 5 seconds.</p>
    </section>

    <section>
      <div id="verify-result" class="notice" hidden></div>
      <p style="margin-top: 2rem">
        <a class="btn btn--ghost" href="/">← Back to install</a>
      </p>
    </section>
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <span>SafeBrowse · A CyberHeroez CIC project</span>
      <span>
        <a href="/privacy.html">Privacy</a> ·
        <a href="/terms.html">Terms</a>
      </span>
    </div>
  </footer>

  <script type="module" src="/assets/verify.js"></script>
</body>
</html>
```

- [ ] **Step 5: Run tests to verify pass**

```bash
npm test -- verify
```

Expected: 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
cd ..
git add landing/
git commit -m "feat(landing): /verify page probes four sentinel test domains"
```

---

## Task 9: Privacy and Terms pages

**Files:**
- Create: `landing/public/privacy.html`
- Create: `landing/public/terms.html`

- [ ] **Step 1: Create `privacy.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SafeBrowse — Privacy Policy</title>
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
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
    <h1>Privacy Policy</h1>
    <p><em>Last updated: 2026-05-17. SafeBrowse is operated by CyberHeroez CIC (UK).</em></p>

    <h2>What we see</h2>
    <p>When your device is configured to use SafeBrowse DNS, every DNS query
       (the domain name being looked up) is sent over an encrypted HTTPS
       channel to one of our Cloudflare Workers. We use only the domain
       name to decide whether the query should be allowed or blocked.</p>

    <h2>What we never see</h2>
    <ul>
      <li>The pages you visit (we don't see URLs, only domains)</li>
      <li>The content of any page, message, photo, or video</li>
      <li>Your account passwords or banking details</li>
      <li>Anything inside encrypted apps (WhatsApp, Snapchat, etc.)</li>
    </ul>

    <h2>What we store</h2>
    <p>We keep only aggregate, anonymous statistics for 24 hours:</p>
    <ul>
      <li>Total query and block counts per filter level per day</li>
      <li>The top 100 blocked domains per day (popularity counts, not who asked)</li>
      <li>An approximate count of unique devices, calculated from
          truncated IP hashes that are rotated every 24 hours and never
          retained beyond that window</li>
    </ul>

    <h2>What we never store</h2>
    <ul>
      <li>Per-device query history</li>
      <li>The mapping between a person and the domains they queried</li>
      <li>Your IP address (only the daily-rotated, truncated hash exists, and only for the day)</li>
    </ul>

    <h2>Your rights (GDPR / UK GDPR)</h2>
    <p>Because we don't store anything that identifies you, we cannot
       produce a personal-data export for you. You can stop using
       SafeBrowse at any time by removing the profile (iOS) or
       clearing the Private DNS hostname (Android).</p>

    <h2>Contact</h2>
    <p>For privacy questions, email <a href="mailto:dipesh@cyberheroez.co.uk">dipesh@cyberheroez.co.uk</a>.</p>
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <span>SafeBrowse · A CyberHeroez CIC project</span>
      <span><a href="/terms.html">Terms</a></span>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 2: Create `terms.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SafeBrowse — Terms of Service</title>
  <link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/assets/styles.css">
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
    <h1>Terms of Service</h1>
    <p><em>Last updated: 2026-05-17.</em></p>

    <h2>Service description</h2>
    <p>SafeBrowse provides a DNS-over-HTTPS resolver that blocks a curated
       list of domains. The service is operated by CyberHeroez CIC, a
       UK-registered Community Interest Company.</p>

    <h2>Free, as-is</h2>
    <p>The service is offered free of charge, on a best-effort basis,
       with no warranty of any kind. We may modify, suspend, or
       discontinue the service at any time.</p>

    <h2>Acceptable use</h2>
    <p>SafeBrowse is intended for protecting children and families
       from harmful web content. You must not use the service for
       unlawful purposes, to evade surveillance lawfully imposed on
       you, or to interfere with the service's operation.</p>

    <h2>Limitation of liability</h2>
    <p>To the extent permitted by law, CyberHeroez CIC is not liable
       for any direct, indirect, or consequential loss arising from
       use of or inability to use SafeBrowse, including missed access
       to legitimate sites if our filter incorrectly flags them.</p>

    <h2>Reporting a false positive</h2>
    <p>If a legitimate site is being blocked, email
       <a href="mailto:dipesh@cyberheroez.co.uk">dipesh@cyberheroez.co.uk</a>
       and we will review.</p>

    <h2>Governing law</h2>
    <p>These terms are governed by the laws of England and Wales.</p>
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner">
      <span>SafeBrowse · A CyberHeroez CIC project</span>
      <span><a href="/privacy.html">Privacy</a></span>
    </div>
  </footer>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add landing/public/
git commit -m "docs(landing): privacy policy and terms of service pages"
```

---

## Task 10: `_headers` for proper `.mobileconfig` MIME type

**Background:** Cloudflare Pages reads `public/_headers` to apply HTTP headers to responses. iOS only triggers the profile-install flow when the response carries `Content-Type: application/x-apple-aspen-config` and `Content-Disposition: attachment`.

**Files:**
- Create: `landing/public/_headers`

- [ ] **Step 1: Create `_headers`**

```
/profiles/kids.mobileconfig
  Content-Type: application/x-apple-aspen-config
  Content-Disposition: attachment; filename="SafeBrowse-Kids.mobileconfig"
  Cache-Control: public, max-age=300

/profiles/teens.mobileconfig
  Content-Type: application/x-apple-aspen-config
  Content-Disposition: attachment; filename="SafeBrowse-Teens.mobileconfig"
  Cache-Control: public, max-age=300

/profiles/family.mobileconfig
  Content-Type: application/x-apple-aspen-config
  Content-Disposition: attachment; filename="SafeBrowse-Family.mobileconfig"
  Cache-Control: public, max-age=300

/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 2: Smoke-check header delivery**

```bash
cd landing
npm run build:profiles
npm run dev
```

In another terminal:

```bash
curl -sI http://localhost:8788/profiles/kids.mobileconfig | grep -iE 'content-type|content-disposition'
```

Expected:

```
Content-Type: application/x-apple-aspen-config
Content-Disposition: attachment; filename="SafeBrowse-Kids.mobileconfig"
```

Stop the dev server.

- [ ] **Step 3: Commit**

```bash
cd ..
git add landing/public/_headers
git commit -m "feat(landing): _headers for .mobileconfig MIME + security headers"
```

---

## Task 11: Local end-to-end browser check

**Background:** Walk through the full flow in a real browser to catch any wiring problems the unit tests cannot.

**Files:** None (manual).

- [ ] **Step 1: Start the local Pages server**

```bash
cd landing
npm run build:profiles
npm run dev
```

- [ ] **Step 2: Open the site**

Open http://localhost:8788 in Chrome / Safari / Firefox.

- [ ] **Step 3: Walk through the flow**

In each browser, verify:

| Check | Expected |
|-------|----------|
| Hero renders | Title, blurb, four checkmarks |
| Click "Kids" card | `aria-pressed="true"` on Kids; Step 2 and Step 3 appear; smooth scroll to Step 2 |
| Click "Teens" | Kids loses pressed state; Teens gains it; iOS download link updates |
| iOS tab visible | Unsigned-profile warning shown prominently |
| Click "Download profile" (iOS tab) | Downloads `<level>.mobileconfig` file |
| Android tab | Hostname shows `<level>.dns.cyberheroez.co.uk`; Copy button copies it (paste into address bar to verify) |
| Desktop tab | Chrome / Firefox install buttons visible; router hostname matches level |
| Click "Test now" → /verify | Page renders; after ~5s shows "❌ Not active" (no filter installed locally) |
| Open /privacy.html | Page loads with policy content |
| Open /terms.html | Page loads with terms content |
| Dark mode | Toggle OS dark mode → site flips colours via `prefers-color-scheme` |
| Mobile width | Resize to ~360px → cards stack, layout stays usable |

- [ ] **Step 4: Run the full landing test suite once more**

```bash
npm test
```

Expected: every landing test PASS.

- [ ] **Step 5: Stop the dev server**

`Ctrl+C` in the shell running `npm run dev`.

- [ ] **Step 6: Tag the milestone**

```bash
git tag -a landing-mvp -m "Landing site ready for integration"
```

---

## Wrap-up

After Task 11, the landing site is feature-complete for the MVP:

- Three-step install flow on `index.html` (Level → Device → Verify)
- iOS panel with unsigned-profile warning (Plan 2 will replace with signed)
- Android panel with copy-to-clipboard hostname
- Desktop panel with extension links + router DNS hostname
- `/verify.html` probes the four sentinel domains
- Privacy + ToS pages
- Correct HTTP headers for `.mobileconfig` MIME delivery
- Unsigned `.mobileconfig` generation pipeline at `profiles/`

The remaining MVP work — DNS record provisioning, custom-domain attachment for both the Worker and Pages, real-device end-to-end testing, beta launch, public `/stats` page — is the scope of **Plan 4**.
