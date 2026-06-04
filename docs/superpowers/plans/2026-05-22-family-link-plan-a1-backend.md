# Family Link — Plan A1: Cloudflare Worker Backend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Cloudflare Worker backend for OroQ Family Link — passwordless email-OTP parent accounts and device pairing — storing only ciphertext and minimal metadata.

**Architecture:** A single TypeScript Cloudflare Worker routes requests by URL path. Parent accounts and pairing records live in D1 (SQL); one-time codes, OTP hashes and rate-limit counters live in KV with TTLs. All cryptographic payloads from devices are opaque to the Worker. Tests run inside the Workers runtime via `@cloudflare/vitest-pool-workers` (Miniflare) with D1 migrations applied before each file.

**Tech Stack:** TypeScript, Cloudflare Workers, D1, KV, WebCrypto (HMAC JWT, SHA-256), Vitest + `@cloudflare/vitest-pool-workers`.

**Reference:** Spec — `docs/superpowers/specs/2026-05-22-oroq-parent-remote-view-design.md`, sections 5 (backend) and 8 (security).

**Depends on:** nothing — this is the foundation. Plan A2 (Android pairing client) consumes this Worker.

---

## File structure produced by this plan

```
backend/
├─ package.json            scripts + devDependencies
├─ tsconfig.json           strict TS, Workers + test types
├─ wrangler.toml           Worker name, D1 + KV bindings
├─ vitest.config.ts        Workers pool, migrations, test bindings
├─ .gitignore              node_modules, .wrangler
├─ migrations/
│  └─ 0001_init.sql        accounts + pairings tables
├─ src/
│  ├─ index.ts             Worker entry — path router, env check
│  ├─ env.ts               Env interface + validateEnv()
│  ├─ http.ts              json() + readJson() helpers
│  ├─ crypto.ts            sha256Hex, randomCode, randomOtp, signJwt, verifyJwt
│  ├─ ratelimit.ts         KV-backed rateLimit()
│  ├─ auth.ts              /auth/request, /auth/verify
│  ├─ email.ts             sendOtpEmail() via Resend (logs in dev)
│  └─ pairing.ts           /pair/create, /pair/join, /pair/:id
├─ test/
│  ├─ env.d.ts             types for the cloudflare:test env
│  ├─ apply-migrations.ts  setup file — applies D1 migrations
│  ├─ health.test.ts
│  ├─ crypto.test.ts
│  ├─ ratelimit.test.ts
│  ├─ auth.test.ts
│  └─ pairing.test.ts
└─ README.md               deploy + operations notes
```

All work is inside a new top-level `backend/` folder — a self-contained npm project, independent of the repo-root `package.json`.

---

## Task 1: Scaffold the Worker with a `/health` route

Set up the project, the D1 schema, and a single passing test.

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/wrangler.toml`
- Create: `backend/vitest.config.ts`
- Create: `backend/.gitignore`
- Create: `backend/migrations/0001_init.sql`
- Create: `backend/src/env.ts`
- Create: `backend/src/http.ts`
- Create: `backend/src/index.ts`
- Create: `backend/test/env.d.ts`
- Create: `backend/test/apply-migrations.ts`
- Test: `backend/test/health.test.ts`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "oroq-family-backend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.8.19",
    "@cloudflare/workers-types": "^4.20250510.0",
    "typescript": "^5.6.3",
    "vitest": "^3.2.4",
    "wrangler": "^3.114.0"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `backend/wrangler.toml`**

The `database_id` and KV `id` are filled in after `wrangler d1 create` / `wrangler kv namespace create` (see Task 6); placeholder values are fine for tests because Miniflare provisions local stores.

```toml
name = "oroq-family"
main = "src/index.ts"
compatibility_date = "2026-05-01"

[[d1_databases]]
binding = "DB"
database_name = "oroq-family"
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "0000000000000000000000000000000000"

# JWT_SECRET, RESEND_API_KEY and RESEND_FROM are set with `wrangler secret put`,
# never committed here.
```

- [ ] **Step 4: Create `backend/.gitignore`**

```
node_modules/
.wrangler/
dist/
```

- [ ] **Step 5: Create `backend/migrations/0001_init.sql`**

```sql
-- Migration 0001: parent accounts and device pairings.
CREATE TABLE accounts (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE pairings (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL,
  child_label        TEXT,
  parent_public_key  TEXT NOT NULL,
  child_public_key   TEXT,
  created_at         INTEGER NOT NULL,
  paired_at          INTEGER
);

CREATE INDEX idx_pairings_account ON pairings (account_id);
```

- [ ] **Step 6: Create `backend/src/env.ts`**

```ts
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

/** Throws if a required binding or secret is missing — the Worker must not run half-configured. */
export function validateEnv(env: Env): void {
  if (!env.DB) throw new Error("Missing D1 binding: DB");
  if (!env.KV) throw new Error("Missing KV binding: KV");
  if (!env.JWT_SECRET) throw new Error("Missing secret: JWT_SECRET");
}
```

- [ ] **Step 7: Create `backend/src/http.ts`**

```ts
/** A JSON response with the correct content type. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Parses a JSON request body, returning {} on any malformed input. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
```

- [ ] **Step 8: Create `backend/src/index.ts`**

```ts
import { Env, validateEnv } from "./env";
import { json } from "./http";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
```

- [ ] **Step 9: Create `backend/test/env.d.ts`**

```ts
import "@cloudflare/vitest-pool-workers";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    KV: KVNamespace;
    JWT_SECRET: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
```

- [ ] **Step 10: Create `backend/test/apply-migrations.ts`**

```ts
import { applyD1Migrations, env } from "cloudflare:test";

// Runs once per test file before any test — creates the D1 tables.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

- [ ] **Step 11: Create `backend/vitest.config.ts`**

```ts
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const migrations = await readD1Migrations("./migrations");

export default defineWorkersConfig({
  test: {
    setupFiles: ["./test/apply-migrations.ts"],
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          d1Databases: ["DB"],
          kvNamespaces: ["KV"],
          bindings: {
            JWT_SECRET: "test-secret-not-for-prod",
            TEST_MIGRATIONS: migrations,
          },
        },
      },
    },
  },
});
```

- [ ] **Step 12: Write the failing test — `backend/test/health.test.ts`**

```ts
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("/health", () => {
  it("returns ok", async () => {
    const res = await SELF.fetch("https://example.com/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("404s an unknown path", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 13: Install dependencies and run the test**

Run: `cd backend && npm install && npm test`
Expected: the install completes, then both `/health` tests PASS.

- [ ] **Step 14: Commit**

```bash
git add backend/
git commit -m "feat(backend): scaffold Family Link Worker with /health and D1 schema"
```

---

## Task 2: Cryptographic helpers

Pure WebCrypto helpers: hashing, code/OTP generation, and HS256 JWTs.

**Files:**
- Create: `backend/src/crypto.ts`
- Test: `backend/test/crypto.test.ts`

- [ ] **Step 1: Write the failing test — `backend/test/crypto.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { sha256Hex, randomCode, randomOtp, signJwt, verifyJwt } from "../src/crypto";

describe("crypto", () => {
  it("hashes deterministically and distinctly", async () => {
    expect(await sha256Hex("abc")).toBe(await sha256Hex("abc"));
    expect(await sha256Hex("abc")).not.toBe(await sha256Hex("abd"));
  });

  it("generates 8-char codes without ambiguous characters", () => {
    const code = randomCode(8);
    expect(code).toHaveLength(8);
    expect(code).not.toMatch(/[ILO01]/);
  });

  it("generates 6-digit OTPs", () => {
    expect(randomOtp()).toMatch(/^\d{6}$/);
  });

  it("signs then verifies a JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "acc1", exp }, "secret");
    const payload = await verifyJwt(token, "secret");
    expect(payload?.sub).toBe("acc1");
  });

  it("rejects a wrong-secret JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = await signJwt({ sub: "acc1", exp }, "secret");
    expect(await verifyJwt(token, "wrong")).toBeNull();
  });

  it("rejects an expired JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const token = await signJwt({ sub: "acc1", exp }, "secret");
    expect(await verifyJwt(token, "secret")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/crypto.test.ts`
Expected: FAIL — `Cannot find module '../src/crypto'`.

- [ ] **Step 3: Create `backend/src/crypto.ts`**

```ts
const encoder = new TextEncoder();

/** Lowercase-hex SHA-256 of a string. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Crockford-style alphabet with no I, L, O, 0 or 1 — unambiguous when read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A random pairing code from an unambiguous uppercase alphabet. */
export function randomCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/** A random zero-padded 6-digit OTP. */
export function randomOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array {
  let s = text.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Signs a payload as a compact HS256 JWT. */
export async function signJwt(payload: object, secret: string): Promise<string> {
  const head = b64urlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const data = `${head}.${body}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Verifies an HS256 JWT; returns its payload, or null if invalid or expired. */
export async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    b64urlDecode(parts[2]),
    encoder.encode(data),
  );
  if (!ok) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
  if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/crypto.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crypto.ts backend/test/crypto.test.ts
git commit -m "feat(backend): add SHA-256, code/OTP and HS256 JWT helpers"
```

---

## Task 3: KV-backed rate limiter

A coarse fixed-window limiter shared by the auth and pairing routes.

**Files:**
- Create: `backend/src/ratelimit.ts`
- Test: `backend/test/ratelimit.test.ts`

- [ ] **Step 1: Write the failing test — `backend/test/ratelimit.test.ts`**

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { rateLimit } from "../src/ratelimit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks", async () => {
    expect(await rateLimit(env, "key-a", 2, 60)).toBe(true);
    expect(await rateLimit(env, "key-a", 2, 60)).toBe(true);
    expect(await rateLimit(env, "key-a", 2, 60)).toBe(false);
  });

  it("tracks keys independently", async () => {
    expect(await rateLimit(env, "key-b", 1, 60)).toBe(true);
    expect(await rateLimit(env, "key-b", 1, 60)).toBe(false);
    expect(await rateLimit(env, "key-c", 1, 60)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/ratelimit.test.ts`
Expected: FAIL — `Cannot find module '../src/ratelimit'`.

- [ ] **Step 3: Create `backend/src/ratelimit.ts`**

```ts
import { Env } from "./env";

/**
 * Fixed-window rate limit. Returns true if the action is allowed, false if the
 * count for [key] has reached [limit] within the [windowSec] window.
 *
 * Note: each call refreshes the KV TTL, so a steady stream of requests keeps
 * the window sliding — acceptable for coarse abuse protection.
 */
export async function rateLimit(
  env: Env,
  key: string,
  limit: number,
  windowSec: number,
): Promise<boolean> {
  const k = `rl:${key}`;
  const current = parseInt((await env.KV.get(k)) ?? "0", 10);
  if (current >= limit) return false;
  await env.KV.put(k, String(current + 1), { expirationTtl: windowSec });
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/ratelimit.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ratelimit.ts backend/test/ratelimit.test.ts
git commit -m "feat(backend): add KV-backed rate limiter"
```

---

## Task 4: Auth routes — email OTP

`POST /auth/request` issues an OTP; `POST /auth/verify` checks it, upserts the account, and returns a JWT.

**Files:**
- Create: `backend/src/email.ts`
- Create: `backend/src/auth.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/auth.test.ts`

- [ ] **Step 1: Write the failing test — `backend/test/auth.test.ts`**

```ts
import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { sha256Hex, verifyJwt } from "../src/crypto";

function post(path: string, body: object): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/auth", () => {
  it("stores an OTP hash on request", async () => {
    const res = await post("/auth/request", { email: "Alice@Example.com" });
    expect(res.status).toBe(200);
    // email is normalised to lowercase
    expect(await env.KV.get("otp:alice@example.com")).not.toBeNull();
  });

  it("rejects a malformed email", async () => {
    const res = await post("/auth/request", { email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("verifies a correct OTP, creates the account, and returns a JWT", async () => {
    await env.KV.put("otp:carol@example.com", await sha256Hex("123456"));
    const res = await post("/auth/verify", { email: "carol@example.com", otp: "123456" });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const payload = await verifyJwt(token, env.JWT_SECRET);
    expect(typeof payload?.sub).toBe("string");
    const row = await env.DB.prepare("SELECT email FROM accounts WHERE email = ?")
      .bind("carol@example.com")
      .first();
    expect(row).not.toBeNull();
  });

  it("rejects a wrong OTP", async () => {
    await env.KV.put("otp:dave@example.com", await sha256Hex("111111"));
    const res = await post("/auth/verify", { email: "dave@example.com", otp: "999999" });
    expect(res.status).toBe(401);
  });

  it("consumes the OTP so it cannot be reused", async () => {
    await env.KV.put("otp:erin@example.com", await sha256Hex("222222"));
    await post("/auth/verify", { email: "erin@example.com", otp: "222222" });
    const second = await post("/auth/verify", { email: "erin@example.com", otp: "222222" });
    expect(second.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/auth.test.ts`
Expected: FAIL — `/auth/request` 404s (route not wired) or module missing.

- [ ] **Step 3: Create `backend/src/email.ts`**

```ts
import { Env } from "./env";

/**
 * Sends the OTP by email via Resend. When no API key is configured (local dev
 * and tests) it logs the code instead of sending — so tests stay offline.
 */
export async function sendOtpEmail(env: Env, email: string, otp: string): Promise<void> {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) {
    console.log(`[dev] OTP for ${email}: ${otp}`);
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: email,
      subject: "Your OroQ code",
      text: `Your OroQ verification code is ${otp}. It expires in 10 minutes.`,
    }),
  });
}
```

- [ ] **Step 4: Create `backend/src/auth.ts`**

```ts
import { Env } from "./env";
import { json, readJson } from "./http";
import { randomOtp, sha256Hex, signJwt } from "./crypto";
import { sendOtpEmail } from "./email";
import { rateLimit } from "./ratelimit";

const OTP_TTL_SEC = 600; // 10 minutes
const JWT_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

/** Routes the /auth/* paths. */
export async function handleAuth(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/auth/request" && req.method === "POST") return authRequest(req, env);
  if (path === "/auth/verify" && req.method === "POST") return authVerify(req, env);
  return json({ error: "not_found" }, 404);
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

async function authRequest(req: Request, env: Env): Promise<Response> {
  const email = normalizeEmail((await readJson(req)).email);
  if (!email) return json({ error: "bad_email" }, 400);

  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `auth:${ip}`, 5, OTP_TTL_SEC))) {
    return json({ error: "rate_limited" }, 429);
  }

  const otp = randomOtp();
  await env.KV.put(`otp:${email}`, await sha256Hex(otp), { expirationTtl: OTP_TTL_SEC });
  await sendOtpEmail(env, email, otp);
  return json({ ok: true });
}

async function authVerify(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";
  if (!email || !otp) return json({ error: "bad_request" }, 400);

  const stored = await env.KV.get(`otp:${email}`);
  if (!stored || stored !== (await sha256Hex(otp))) {
    return json({ error: "bad_otp" }, 401);
  }
  await env.KV.delete(`otp:${email}`);

  const accountId = await upsertAccount(env, email);
  const exp = Math.floor(Date.now() / 1000) + JWT_TTL_SEC;
  const token = await signJwt({ sub: accountId, exp }, env.JWT_SECRET);
  return json({ token });
}

/** Returns the existing account id for [email], creating the account if new. */
async function upsertAccount(env: Env, email: string): Promise<string> {
  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE email = ?")
    .bind(email)
    .first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?)")
    .bind(id, email, Date.now())
    .run();
  return id;
}
```

- [ ] **Step 5: Modify `backend/src/index.ts` to route `/auth/*`**

Replace the whole file with:

```ts
import { Env, validateEnv } from "./env";
import { json } from "./http";
import { handleAuth } from "./auth";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      if (path.startsWith("/auth/")) return await handleAuth(req, env, path);
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/auth.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/email.ts backend/src/auth.ts backend/src/index.ts backend/test/auth.test.ts
git commit -m "feat(backend): add email-OTP auth routes"
```

---

## Task 5: Pairing routes

`POST /pair/create` (account-authenticated) issues a code; `POST /pair/join` (code-authorized) attaches the child key; `GET /pair/:id` returns the record.

**Files:**
- Create: `backend/src/pairing.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/pairing.test.ts`

- [ ] **Step 1: Write the failing test — `backend/test/pairing.test.ts`**

```ts
import { SELF, env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { signJwt } from "../src/crypto";

const PARENT_KEY = "P".repeat(44);
const CHILD_KEY = "C".repeat(44);

async function accountToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 600;
  return signJwt({ sub: "acc-test", exp }, env.JWT_SECRET);
}

function fetchJson(path: string, init: RequestInit): Promise<Response> {
  return SELF.fetch(`https://example.com${path}`, init);
}

describe("/pair", () => {
  it("rejects pair/create without a token", async () => {
    const res = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentPublicKey: PARENT_KEY }),
    });
    expect(res.status).toBe(401);
  });

  it("creates a pairing + code, lets a child join, and exposes the record", async () => {
    const token = await accountToken();
    const create = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentPublicKey: PARENT_KEY, childLabel: "Tablet" }),
    });
    expect(create.status).toBe(200);
    const created = (await create.json()) as { pairingId: string; code: string };
    expect(created.code).toHaveLength(8);

    const join = await fetchJson("/pair/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: created.code, childPublicKey: CHILD_KEY }),
    });
    expect(join.status).toBe(200);
    expect(await join.json()).toMatchObject({
      pairingId: created.pairingId,
      parentPublicKey: PARENT_KEY,
    });

    const get = await fetchJson(`/pair/${created.pairingId}`, { method: "GET" });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({
      paired: true,
      childPublicKey: CHILD_KEY,
      childLabel: "Tablet",
    });
  });

  it("rejects an unknown code", async () => {
    const res = await fetchJson("/pair/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "ZZZZZZZZ", childPublicKey: CHILD_KEY }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects re-using a consumed code", async () => {
    const token = await accountToken();
    const create = await fetchJson("/pair/create", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ parentPublicKey: PARENT_KEY }),
    });
    const { code } = (await create.json()) as { code: string };
    const body = JSON.stringify({ code, childPublicKey: CHILD_KEY });
    const headers = { "content-type": "application/json" };
    const first = await fetchJson("/pair/join", { method: "POST", headers, body });
    expect(first.status).toBe(200);
    // A successful join consumes the code, so re-using it is rejected.
    const second = await fetchJson("/pair/join", { method: "POST", headers, body });
    expect(second.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/pairing.test.ts`
Expected: FAIL — `/pair/create` 404s (route not wired).

- [ ] **Step 3: Create `backend/src/pairing.ts`**

```ts
import { Env } from "./env";
import { json, readJson } from "./http";
import { randomCode, verifyJwt } from "./crypto";
import { rateLimit } from "./ratelimit";

const CODE_TTL_SEC = 600; // 10 minutes

/** Routes the /pair* paths. */
export async function handlePairing(req: Request, env: Env, path: string): Promise<Response> {
  if (path === "/pair/create" && req.method === "POST") return pairCreate(req, env);
  if (path === "/pair/join" && req.method === "POST") return pairJoin(req, env);
  const match = path.match(/^\/pair\/([0-9a-f-]{36})$/);
  if (match && req.method === "GET") return pairGet(env, match[1]);
  return json({ error: "not_found" }, 404);
}

/** Returns the authenticated account id from the Bearer JWT, or null. */
async function authAccount(req: Request, env: Env): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const payload = await verifyJwt(auth.slice("Bearer ".length), env.JWT_SECRET);
  return payload && typeof payload.sub === "string" ? payload.sub : null;
}

function isPublicKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 256;
}

async function pairCreate(req: Request, env: Env): Promise<Response> {
  const accountId = await authAccount(req, env);
  if (!accountId) return json({ error: "unauthorized" }, 401);

  const body = await readJson(req);
  if (!isPublicKey(body.parentPublicKey)) return json({ error: "bad_request" }, 400);
  const childLabel =
    typeof body.childLabel === "string" ? body.childLabel.slice(0, 40) : null;

  const id = crypto.randomUUID();
  const code = randomCode(8);
  await env.DB.prepare(
    `INSERT INTO pairings (id, account_id, child_label, parent_public_key, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id, accountId, childLabel, body.parentPublicKey, Date.now())
    .run();
  await env.KV.put(`code:${code}`, id, { expirationTtl: CODE_TTL_SEC });

  return json({ pairingId: id, code, expiresInSec: CODE_TTL_SEC });
}

async function pairJoin(req: Request, env: Env): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `join:${ip}`, 10, CODE_TTL_SEC))) {
    return json({ error: "rate_limited" }, 429);
  }

  const body = await readJson(req);
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || !isPublicKey(body.childPublicKey)) return json({ error: "bad_request" }, 400);

  const pairingId = await env.KV.get(`code:${code}`);
  if (!pairingId) return json({ error: "bad_code" }, 404);

  const row = await env.DB.prepare(
    "SELECT parent_public_key, child_public_key FROM pairings WHERE id = ?",
  )
    .bind(pairingId)
    .first<{ parent_public_key: string; child_public_key: string | null }>();
  if (!row) return json({ error: "bad_code" }, 404);
  if (row.child_public_key) return json({ error: "already_paired" }, 409);

  await env.DB.prepare(
    "UPDATE pairings SET child_public_key = ?, paired_at = ? WHERE id = ?",
  )
    .bind(body.childPublicKey, Date.now(), pairingId)
    .run();
  await env.KV.delete(`code:${code}`);

  return json({ pairingId, parentPublicKey: row.parent_public_key });
}

async function pairGet(env: Env, id: string): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, child_label, parent_public_key, child_public_key, paired_at
     FROM pairings WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      child_label: string | null;
      parent_public_key: string;
      child_public_key: string | null;
      paired_at: number | null;
    }>();
  if (!row) return json({ error: "not_found" }, 404);

  return json({
    pairingId: row.id,
    childLabel: row.child_label,
    parentPublicKey: row.parent_public_key,
    childPublicKey: row.child_public_key,
    paired: row.child_public_key !== null,
    pairedAt: row.paired_at,
  });
}
```

- [ ] **Step 4: Modify `backend/src/index.ts` to route `/pair*`**

Replace the whole file with:

```ts
import { Env, validateEnv } from "./env";
import { json } from "./http";
import { handleAuth } from "./auth";
import { handlePairing } from "./pairing";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      if (path.startsWith("/auth/")) return await handleAuth(req, env, path);
      if (path.startsWith("/pair")) return await handlePairing(req, env, path);
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/pairing.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `cd backend && npm test && npm run typecheck`
Expected: every test file PASSES (health, crypto, ratelimit, auth, pairing); `tsc --noEmit` reports no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/pairing.ts backend/src/index.ts backend/test/pairing.test.ts
git commit -m "feat(backend): add device pairing routes"
```

---

## Task 6: Deploy & operations documentation

The Worker is complete; document how to provision and deploy it. No code, no tests.

**Files:**
- Create: `backend/README.md`

- [ ] **Step 1: Create `backend/README.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/README.md
git commit -m "docs(backend): add deploy and operations guide"
```

---

## Self-review

**Spec coverage** (spec §5 — backend):
- §5.1 auth routes → Task 4. Pairing routes → Task 5. `/health` → Task 1.
- §5.2 D1 `accounts`/`pairings` → Task 1 migration; KV OTP/code/rate-limit → Tasks 3-5.
- §5.3 retention (TTLs) → `OTP_TTL_SEC`, `CODE_TTL_SEC`, rate-limit TTL; secrets via env → `validateEnv` (Task 1), `wrangler secret` (Task 6). Email via Resend → Task 4 `email.ts`.
- §8 security: JWT signed with secret (Task 2/4), OTP hashed + TTL (Task 4), code rate-limited + TTL (Tasks 3/5), unauthorised/wrong-pairing test paths (Tasks 4/5).

**Out of scope here** (later plans): the `/sync` and `/cmd` routes are Plan B and Plan C — deliberately excluded so A1 ships a testable auth + pairing backend on its own.

**Placeholder scan:** none — every step has complete file content or an exact command.

**Type consistency:** `Env` (env.ts) is imported unchanged everywhere; `json`/`readJson` (http.ts) signatures stable; `handleAuth(req, env, path)` and `handlePairing(req, env, path)` match their calls in `index.ts`; `signJwt`/`verifyJwt` payload shape (`{ sub, exp }`) is consistent across crypto, auth and pairing.

**Note on dependency versions:** the pinned versions of `wrangler`, `vitest` and `@cloudflare/vitest-pool-workers` must be mutually compatible; if `npm install` reports a peer-dependency conflict, accept the versions npm proposes for that trio and re-run — the API used (`defineWorkersConfig`, `readD1Migrations`, `applyD1Migrations`, `SELF`, `env`) is stable across recent releases.
