# Family Link — Plan B: Encrypted Sync & Parent Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a paired child device upload an end-to-end-encrypted activity summary, and let the parent device fetch, decrypt and view it — protection status, today's screen time, and a blocked-attempts feed.

**Architecture:** The Worker gains a `/sync/:pairingId` mailbox — the child `POST`s one encrypted blob (overwritten each time), the parent `GET`s it (account-authenticated). On the child, a `BlockEventLog` records blocked domains/apps, a pure `buildSummary` assembles a `FamilySummary`, and a `FamilySyncWorker` (WorkManager, ~15 min) encrypts it with the parent's public key and uploads it. On the parent, `ParentRepository` fetches and decrypts it and `ChildDashboardActivity` renders it.

**Tech Stack:** TypeScript Cloudflare Worker (D1 + KV); Kotlin, Android Views, WorkManager, the `family/` package from Plans A2a/A2b, `ui/Style.kt`.

**Reference:** Spec — `docs/superpowers/specs/2026-05-22-safebrowse-parent-remote-view-design.md`, section 6 (data sync) and section 7 (child dashboard).

**Depends on:** Plan A1 (Worker), A2a (`FamilyCrypto`, `FamilyApi`), A2b (`FamilyStore`, pairing). Out of scope: remote control (Plan C).

**Verification note:** Worker routes and the pure child logic (`buildSummary`/`parseSummary`, `BlockEventLog`) are unit-tested; the WorkManager worker, the service hooks and the dashboard UI are verified by building and on an emulator.

---

## File structure produced by this plan

```
backend/
├─ src/sync.ts                                   POST/GET /sync/:pairingId
├─ src/index.ts                                  + /sync route
└─ test/sync.test.ts

android/app/src/main/java/uk/co/cyberheroez/safebrowse/
├─ family/
│  ├─ FamilySummary.kt      FamilySummary/TopApp/BlockEvent + toJson/parseSummary
│  ├─ BlockEventLog.kt      file-backed rolling log of blocked attempts
│  ├─ SummaryBuilder.kt     pure buildSummary(...)
│  ├─ FamilySyncWorker.kt   WorkManager: build, encrypt, upload + scheduleFamilySync
│  └─ FamilyApi.kt          + syncUpload / syncFetch
├─ parent/
│  ├─ ParentRepository.kt   fetch + decrypt a child summary
│  ├─ ParentActivity.kt     child card -> ChildDashboardActivity
│  └─ ChildDashboardActivity.kt   renders the summary
├─ vpn/SafeBrowseVpnService.kt    + record web blocks
├─ monitor/AppMonitorService.kt   + record app blocks
├─ MainActivity.kt                + scheduleFamilySync when paired (child)
├─ ui/LinkParentActivity.kt       + scheduleFamilySync after pairing
└─ AndroidManifest.xml            + ChildDashboardActivity

android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/
├─ FamilySummaryTest.kt
└─ BlockEventLogTest.kt
```

---

## Task 1: Worker sync routes

**Files:**
- Create: `backend/src/sync.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/sync.test.ts`

- [ ] **Step 1: Write the failing test — `backend/test/sync.test.ts`**

```ts
import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { signJwt } from "../src/crypto";

const ACCOUNT = "acc-sync";

/** Inserts a paired pairing owned by ACCOUNT and returns its id. */
async function seedPairing(paired: boolean): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pairings (id, account_id, child_label, parent_public_key, child_public_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, ACCOUNT, "Tablet", "PK", paired ? "CK" : null, Date.now()).run();
  return id;
}

let pairedId = "";
let unpairedId = "";

beforeAll(async () => {
  pairedId = await seedPairing(true);
  unpairedId = await seedPairing(false);
});

function token(sub: string): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

describe("/sync", () => {
  it("stores then returns the latest ciphertext", async () => {
    const put = await SELF.fetch(`https://x/sync/${pairedId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ciphertext: "BLOB-1" }),
    });
    expect(put.status).toBe(200);

    const get = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ ciphertext: "BLOB-1" });
  });

  it("overwrites with the newest upload", async () => {
    const headers = { "content-type": "application/json" };
    await SELF.fetch(`https://x/sync/${pairedId}`, {
      method: "POST", headers, body: JSON.stringify({ ciphertext: "BLOB-2" }),
    });
    const get = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token(ACCOUNT)}` },
    });
    expect(await get.json()).toMatchObject({ ciphertext: "BLOB-2" });
  });

  it("rejects an upload to an unpaired pairing", async () => {
    const res = await SELF.fetch(`https://x/sync/${unpairedId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ciphertext: "BLOB" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects a GET without a token", async () => {
    const res = await SELF.fetch(`https://x/sync/${pairedId}`);
    expect(res.status).toBe(401);
  });

  it("rejects a GET from a different account", async () => {
    const res = await SELF.fetch(`https://x/sync/${pairedId}`, {
      headers: { authorization: `Bearer ${await token("someone-else")}` },
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/sync.test.ts`
Expected: FAIL — `/sync` routes return 404.

- [ ] **Step 3: Create `backend/src/sync.ts`**

```ts
import { Env } from "./env";
import { json, readJson } from "./http";
import { verifyJwt } from "./crypto";
import { rateLimit } from "./ratelimit";

const SUMMARY_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

/** Routes the /sync/:pairingId paths. */
export async function handleSync(req: Request, env: Env, path: string): Promise<Response> {
  const match = path.match(/^\/sync\/([0-9a-f-]{36})$/);
  if (!match) return json({ error: "not_found" }, 404);
  const pairingId = match[1];
  if (req.method === "POST") return syncUpload(req, env, pairingId);
  if (req.method === "GET") return syncFetch(req, env, pairingId);
  return json({ error: "not_found" }, 404);
}

/** Child uploads an encrypted summary. The pairing must exist and be paired. */
async function syncUpload(req: Request, env: Env, pairingId: string): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `sync:${ip}`, 30, 600))) {
    return json({ error: "rate_limited" }, 429);
  }
  const ciphertext = (await readJson(req)).ciphertext;
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > 100_000) {
    return json({ error: "bad_request" }, 400);
  }
  const row = await env.DB.prepare("SELECT child_public_key FROM pairings WHERE id = ?")
    .bind(pairingId)
    .first<{ child_public_key: string | null }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (!row.child_public_key) return json({ error: "not_paired" }, 409);

  await env.KV.put(`summary:${pairingId}`, ciphertext, { expirationTtl: SUMMARY_TTL_SEC });
  return json({ ok: true });
}

/** Parent fetches the latest encrypted summary for one of their pairings. */
async function syncFetch(req: Request, env: Env, pairingId: string): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const payload = await verifyJwt(auth.slice("Bearer ".length), env.JWT_SECRET);
  const accountId = payload && typeof payload.sub === "string" ? payload.sub : null;
  if (!accountId) return json({ error: "unauthorized" }, 401);

  const row = await env.DB.prepare("SELECT account_id FROM pairings WHERE id = ?")
    .bind(pairingId)
    .first<{ account_id: string }>();
  if (!row) return json({ error: "not_found" }, 404);
  if (row.account_id !== accountId) return json({ error: "forbidden" }, 403);

  const ciphertext = await env.KV.get(`summary:${pairingId}`);
  return json({ ciphertext });
}
```

- [ ] **Step 4: Modify `backend/src/index.ts` to route `/sync`**

Replace the whole file with:

```ts
import { Env, validateEnv } from "./env";
import { json } from "./http";
import { handleAuth } from "./auth";
import { handlePairing } from "./pairing";
import { handleSync } from "./sync";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      if (path.startsWith("/auth/")) return await handleAuth(req, env, path);
      if (path.startsWith("/pair")) return await handlePairing(req, env, path);
      if (path.startsWith("/sync/")) return await handleSync(req, env, path);
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/sync.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: every test file PASSES (health, crypto, ratelimit, auth, pairing, sync).

- [ ] **Step 7: Commit**

```bash
git add backend/src/sync.ts backend/src/index.ts backend/test/sync.test.ts
git commit -m "feat(backend): add encrypted summary sync routes"
```

---

## Task 2: FamilySummary model

The summary that crosses the wire. `buildSummary` (Task 4) produces a `FamilySummary`; `toJson`/`parseSummary` are its wire format.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySummary.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilySummaryTest.kt`

- [ ] **Step 1: Write the failing test — `FamilySummaryTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilySummaryTest {

    private val sample = FamilySummary(
        ts = 1_716_000_000_000L,
        protectionOn = true,
        screenTimeTodayMin = 275,
        dailyLimitMin = 120,
        topApps = listOf(TopApp("YouTube", 90), TopApp("Chrome", 40)),
        webBlockedToday = 12,
        appBlockedToday = 3,
        recentEvents = listOf(
            BlockEvent(1_716_000_000_001L, "web", "example-adult-site.com"),
            BlockEvent(1_716_000_000_002L, "app", "TikTok"),
        ),
    )

    @Test fun jsonRoundTrips() {
        val restored = parseSummary(sample.toJson())
        assertEquals(sample, restored)
    }

    @Test fun toleratesMissingOptionalArrays() {
        val minimal = """{"ts":1,"protectionOn":false,"screenTimeTodayMin":0,""" +
            """"dailyLimitMin":0,"webBlockedToday":0,"appBlockedToday":0}"""
        val parsed = parseSummary(minimal)
        assertEquals(emptyList<TopApp>(), parsed.topApps)
        assertEquals(emptyList<BlockEvent>(), parsed.recentEvents)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilySummaryTest"`
Expected: FAIL — `FamilySummary` unresolved.

- [ ] **Step 3: Create `FamilySummary.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.json.JSONArray
import org.json.JSONObject

/** One app's foreground time today. */
data class TopApp(val label: String, val minutes: Int)

/** A single blocked attempt — [type] is "web" or "app", [label] a domain or app name. */
data class BlockEvent(val ts: Long, val type: String, val label: String)

/** The activity snapshot a child device sends to its parent. */
data class FamilySummary(
    val ts: Long,
    val protectionOn: Boolean,
    val screenTimeTodayMin: Int,
    val dailyLimitMin: Int,
    val topApps: List<TopApp> = emptyList(),
    val webBlockedToday: Int = 0,
    val appBlockedToday: Int = 0,
    val recentEvents: List<BlockEvent> = emptyList(),
)

/** Serialises the summary to its compact JSON wire form. */
fun FamilySummary.toJson(): String {
    val apps = JSONArray()
    for (app in topApps) {
        apps.put(JSONObject().put("label", app.label).put("minutes", app.minutes))
    }
    val events = JSONArray()
    for (event in recentEvents) {
        events.put(
            JSONObject().put("ts", event.ts).put("type", event.type).put("label", event.label),
        )
    }
    return JSONObject()
        .put("ts", ts)
        .put("protectionOn", protectionOn)
        .put("screenTimeTodayMin", screenTimeTodayMin)
        .put("dailyLimitMin", dailyLimitMin)
        .put("webBlockedToday", webBlockedToday)
        .put("appBlockedToday", appBlockedToday)
        .put("topApps", apps)
        .put("recentEvents", events)
        .toString()
}

/** Parses a summary from its JSON wire form. */
fun parseSummary(text: String): FamilySummary {
    val json = JSONObject(text)
    val apps = ArrayList<TopApp>()
    val appsArray = json.optJSONArray("topApps")
    if (appsArray != null) {
        for (i in 0 until appsArray.length()) {
            val o = appsArray.getJSONObject(i)
            apps.add(TopApp(o.getString("label"), o.getInt("minutes")))
        }
    }
    val events = ArrayList<BlockEvent>()
    val eventsArray = json.optJSONArray("recentEvents")
    if (eventsArray != null) {
        for (i in 0 until eventsArray.length()) {
            val o = eventsArray.getJSONObject(i)
            events.add(BlockEvent(o.getLong("ts"), o.getString("type"), o.getString("label")))
        }
    }
    return FamilySummary(
        ts = json.getLong("ts"),
        protectionOn = json.getBoolean("protectionOn"),
        screenTimeTodayMin = json.getInt("screenTimeTodayMin"),
        dailyLimitMin = json.getInt("dailyLimitMin"),
        topApps = apps,
        webBlockedToday = json.getInt("webBlockedToday"),
        appBlockedToday = json.getInt("appBlockedToday"),
        recentEvents = events,
    )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilySummaryTest"`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySummary.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilySummaryTest.kt
git commit -m "feat(android): add FamilySummary model and JSON wire format"
```

---

## Task 3: BlockEventLog

A small file-backed rolling log of blocked attempts, shared by the two services and read by the sync worker.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/BlockEventLog.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/BlockEventLogTest.kt`

- [ ] **Step 1: Write the failing test — `BlockEventLogTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class BlockEventLogTest {

    @get:Rule val tempFolder = TemporaryFolder()

    private fun newLog(max: Int = 50): Pair<BlockEventLog, File> {
        val file = File(tempFolder.newFolder(), "blocks.json")
        return BlockEventLog(file, maxEvents = max) to file
    }

    @Test fun recordsAndReadsBackRecentEventsNewestFirst() {
        val (log, _) = newLog()
        log.record("web", "a.com", at = 100)
        log.record("app", "TikTok", at = 200)
        val recent = log.recent(10)
        assertEquals(2, recent.size)
        assertEquals("TikTok", recent[0].label)
        assertEquals("a.com", recent[1].label)
    }

    @Test fun capsAtMaxEvents() {
        val (log, _) = newLog(max = 3)
        for (i in 1..6) log.record("web", "site$i.com", at = i.toLong())
        val recent = log.recent(100)
        assertEquals(3, recent.size)
        assertEquals("site6.com", recent[0].label)
    }

    @Test fun persistsAcrossInstances() {
        val (log, file) = newLog()
        log.record("web", "a.com", at = 100)
        val reopened = BlockEventLog(file)
        assertEquals("a.com", reopened.recent(10).single().label)
    }

    @Test fun countsByTypeSinceAGivenTime() {
        val (log, _) = newLog()
        log.record("web", "old.com", at = 50)
        log.record("web", "new.com", at = 150)
        log.record("app", "App", at = 160)
        assertEquals(1, log.countSince("web", since = 100))
        assertEquals(1, log.countSince("app", since = 100))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.BlockEventLogTest"`
Expected: FAIL — `BlockEventLog` unresolved.

- [ ] **Step 3: Create `BlockEventLog.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * A bounded, file-backed log of recent blocked attempts. Thread-safe — the VPN
 * service, the app monitor and the sync worker all touch it from one process.
 */
class BlockEventLog(
    private val file: File,
    private val maxEvents: Int = 50,
) {
    private val lock = Any()

    /** Appends an event (oldest events drop once [maxEvents] is exceeded). */
    fun record(type: String, label: String, at: Long = System.currentTimeMillis()) {
        synchronized(lock) {
            val events = readUnlocked().toMutableList()
            events.add(BlockEvent(at, type, label))
            while (events.size > maxEvents) events.removeAt(0)
            writeUnlocked(events)
        }
    }

    /** The most recent [limit] events, newest first. */
    fun recent(limit: Int): List<BlockEvent> = synchronized(lock) {
        readUnlocked().asReversed().take(limit)
    }

    /** How many events of [type] occurred at or after [since]. */
    fun countSince(type: String, since: Long): Int = synchronized(lock) {
        readUnlocked().count { it.type == type && it.ts >= since }
    }

    private fun readUnlocked(): List<BlockEvent> {
        if (!file.exists()) return emptyList()
        return runCatching {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { i ->
                val o = array.getJSONObject(i)
                BlockEvent(o.getLong("ts"), o.getString("type"), o.getString("label"))
            }
        }.getOrDefault(emptyList())
    }

    private fun writeUnlocked(events: List<BlockEvent>) {
        val array = JSONArray()
        for (e in events) {
            array.put(JSONObject().put("ts", e.ts).put("type", e.type).put("label", e.label))
        }
        file.parentFile?.mkdirs()
        file.writeText(array.toString())
    }

    companion object {
        /** The shared log for this app, stored in the app's private files dir. */
        fun forContext(context: Context): BlockEventLog =
            BlockEventLog(File(context.applicationContext.filesDir, "block_events.json"))
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.BlockEventLogTest"`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/BlockEventLog.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/BlockEventLogTest.kt
git commit -m "feat(android): add BlockEventLog — rolling log of blocked attempts"
```

---

## Task 4: Record blocks from the services

Hook `BlockEventLog` into the two places a block happens, de-duplicating consecutive identical blocks so a retrying child does not flood the log.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/vpn/SafeBrowseVpnService.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/monitor/AppMonitorService.kt`

- [ ] **Step 1: Record web blocks in `SafeBrowseVpnService.kt`**

Add the import near the other `uk.co.cyberheroez.oroq` imports:

```kotlin
import uk.co.cyberheroez.oroq.family.BlockEventLog
```

Add two fields inside the `class SafeBrowseVpnService` body (next to the existing fields):

```kotlin
    private val blockLog by lazy { BlockEventLog.forContext(this) }
    private var lastBlockedDomain: String? = null
```

In `runLoop`, the DNS-filter result has an `is DnsFilter.Decision.Block` branch with `Log.d(TAG, "BLOCK $domain")`. Immediately after that log line, inside that branch, add:

```kotlin
                        if (domain != lastBlockedDomain) {
                            lastBlockedDomain = domain
                            blockLog.record("web", domain)
                        }
```

- [ ] **Step 2: Record app blocks in `AppMonitorService.kt`**

Add the import:

```kotlin
import uk.co.cyberheroez.oroq.family.BlockEventLog
```

Add two fields inside the `class AppMonitorService` body:

```kotlin
    private val blockLog by lazy { BlockEventLog.forContext(this) }
    private var lastBlockedApp: String? = null
```

In `runLoop`, the `when` on the decision has a `BlockDecision.BLOCK_APP -> showBlock(BlockActivity.REASON_APP)` arm. Replace that arm with a block that also records the event — `foregroundApp` is the package the loop already resolved (it is the variable passed as the first argument to `decideBlock`; use that variable's name as it appears in the file):

```kotlin
                            BlockDecision.BLOCK_APP -> {
                                if (foregroundApp != lastBlockedApp) {
                                    lastBlockedApp = foregroundApp
                                    blockLog.record("app", appLabel(foregroundApp))
                                }
                                showBlock(BlockActivity.REASON_APP)
                            }
```

Add a helper to resolve a readable app name, inside the `class AppMonitorService` body:

```kotlin
    private fun appLabel(pkg: String): String = runCatching {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    }.getOrDefault(pkg)
```

> If the loop's foreground-package variable is not named `foregroundApp`, use whatever name the file already gives it — do not rename it.

- [ ] **Step 3: Verify it builds**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/vpn/SafeBrowseVpnService.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/monitor/AppMonitorService.kt
git commit -m "feat(android): record blocked domains and apps to BlockEventLog"
```

---

## Task 5: Summary builder and sync worker

A pure `buildSummary`, then a `FamilySyncWorker` that gathers inputs, encrypts and uploads.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/SummaryBuilder.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/MainActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/LinkParentActivity.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilySummaryTest.kt` (add a case)

- [ ] **Step 1: Add a `buildSummary` test to `FamilySummaryTest.kt`**

Add inside the existing `class FamilySummaryTest`:

```kotlin
    @Test fun buildSummaryAssemblesFieldsAndTopFive() {
        val usage = linkedMapOf(
            "A" to 50, "B" to 40, "C" to 30, "D" to 20, "E" to 10, "F" to 5,
        )
        val events = listOf(
            BlockEvent(10, "web", "x.com"),
            BlockEvent(20, "app", "TikTok"),
        )
        val summary = buildSummary(
            now = 999,
            protectionOn = true,
            dailyLimitMinutes = 120,
            usageByApp = usage,
            recentEvents = events,
            webBlockedToday = 7,
            appBlockedToday = 2,
        )
        assertEquals(999, summary.ts)
        assertEquals(true, summary.protectionOn)
        assertEquals(155, summary.screenTimeTodayMin) // sum of all usage
        assertEquals(5, summary.topApps.size)         // capped at 5
        assertEquals("A", summary.topApps[0].label)
        assertEquals(7, summary.webBlockedToday)
        assertEquals(2, summary.recentEvents.size)
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilySummaryTest"`
Expected: FAIL — `buildSummary` unresolved.

- [ ] **Step 3: Create `SummaryBuilder.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

/**
 * Assembles a [FamilySummary] from already-gathered inputs. Pure — the worker
 * does the I/O and passes the results in, so this stays unit-testable.
 */
fun buildSummary(
    now: Long,
    protectionOn: Boolean,
    dailyLimitMinutes: Int,
    usageByApp: Map<String, Int>,
    recentEvents: List<BlockEvent>,
    webBlockedToday: Int,
    appBlockedToday: Int,
): FamilySummary {
    val topApps = usageByApp.entries
        .sortedByDescending { it.value }
        .take(5)
        .map { TopApp(it.key, it.value) }
    return FamilySummary(
        ts = now,
        protectionOn = protectionOn,
        screenTimeTodayMin = usageByApp.values.sum(),
        dailyLimitMin = dailyLimitMinutes,
        topApps = topApps,
        webBlockedToday = webBlockedToday,
        appBlockedToday = appBlockedToday,
        recentEvents = recentEvents,
    )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilySummaryTest"`
Expected: all 3 tests PASS.

- [ ] **Step 5: Add `syncUpload` to `FamilyApi.kt`**

In `FamilyApi`, add this method after `pairGet`:

```kotlin
    /** Uploads an encrypted summary blob for a pairing. Returns true on success. */
    fun syncUpload(pairingId: String, ciphertextB64: String): Boolean {
        val body = JSONObject().put("ciphertext", ciphertextB64).toString()
        return post("/sync/$pairingId", jsonHeaders, body).status == 200
    }
```

- [ ] **Step 6: Create `FamilySyncWorker.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.vpn.SafeBrowseVpnService
import java.util.Base64
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Periodically builds this child's activity summary, encrypts it with the
 * paired parent's public key, and uploads it. Does nothing if not paired.
 */
class FamilySyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val store = FamilyStore(applicationContext)
        val link = store.getParentLink() ?: return Result.success() // not paired — nothing to do

        val config = ConfigRepository(applicationContext)
        val usage = UsageReader(applicationContext)
        val blockLog = BlockEventLog.forContext(applicationContext)
        val startOfToday = startOfTodayMillis()

        val summary = buildSummary(
            now = System.currentTimeMillis(),
            protectionOn = SafeBrowseVpnService.isActive,
            dailyLimitMinutes = config.getDailyLimitMinutes(),
            usageByApp = if (usage.hasUsageAccess()) usage.todayUsageByApp() else emptyMap(),
            recentEvents = blockLog.recent(20),
            webBlockedToday = blockLog.countSince("web", startOfToday),
            appBlockedToday = blockLog.countSince("app", startOfToday),
        )

        val ciphertext = FamilyCrypto.encryptFor(
            link.parentPublicKeyB64, summary.toJson().toByteArray(),
        )
        val uploaded = familyApi().syncUpload(
            link.pairingId, Base64.getEncoder().encodeToString(ciphertext),
        )
        return if (uploaded) Result.success() else Result.retry()
    }

    private fun startOfTodayMillis(): Long = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}

/** Schedules the ~15-minute periodic summary upload. Safe to call repeatedly. */
fun scheduleFamilySync(context: Context) {
    val request = PeriodicWorkRequestBuilder<FamilySyncWorker>(15, TimeUnit.MINUTES).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "family-sync",
        ExistingPeriodicWorkPolicy.KEEP,
        request,
    )
}
```

- [ ] **Step 7: Schedule the worker when the child is paired**

In `MainActivity.kt`, in the `DeviceRole.CHILD` branch of `onCreate` (the `else` block that runs when onboarding is complete), add `scheduleFamilySync` next to the existing `scheduleBlocklistUpdates` call:

```kotlin
                        scheduleBlocklistUpdates(this@MainActivity)
                        scheduleFamilySync(this@MainActivity)
                        requestNotificationPermissionIfNeeded()
```

Add the import to `MainActivity.kt`:

```kotlin
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
```

In `LinkParentActivity.kt`, in the `sasView` "They match — finish" handler, after `store.setParentLink(...)`, add `scheduleFamilySync(this@LinkParentActivity)`:

```kotlin
        primaryButton("They match — finish") {
            lifecycleScope.launch {
                store.setParentLink(ParentLink(pairingId, parentKey))
                scheduleFamilySync(this@LinkParentActivity)
                Toast.makeText(this@LinkParentActivity, "Linked to a parent", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
```

Add the import to `LinkParentActivity.kt`:

```kotlin
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
```

- [ ] **Step 8: Verify it builds**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 9: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/SummaryBuilder.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/MainActivity.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/LinkParentActivity.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilySummaryTest.kt
git commit -m "feat(android): add summary builder and periodic sync worker"
```

---

## Task 6: Parent fetch repository

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentRepository.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyApiTest.kt` (add a case)

- [ ] **Step 1: Add a `syncFetch` test to `FamilyApiTest.kt`**

Add inside the existing `class FamilyApiTest`:

```kotlin
    @Test fun syncFetchReturnsTheCiphertext() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/sync/pid-1" to HttpResponse(200, """{"ciphertext":"BLOB"}"""),
        )))
        assertEquals("BLOB", api.syncFetch("jwt-123", "pid-1"))
    }

    @Test fun syncFetchReturnsNullWhenEmpty() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/sync/pid-1" to HttpResponse(200, """{"ciphertext":null}"""),
        )))
        assertNull(api.syncFetch("jwt-123", "pid-1"))
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyApiTest"`
Expected: FAIL — `syncFetch` unresolved.

- [ ] **Step 3: Add `syncFetch` to `FamilyApi.kt`**

In `FamilyApi`, add after `syncUpload`:

```kotlin
    /** Fetches the latest encrypted summary blob for a pairing, or null if none. */
    fun syncFetch(token: String, pairingId: String): String? {
        val headers = mapOf("authorization" to "Bearer $token")
        val res = transport.request("GET", "$baseUrl/sync/$pairingId", headers, null)
        if (res.status != 200) return null
        val value = JSONObject(res.body).optString("ciphertext")
        return value.ifEmpty { null }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyApiTest"`
Expected: all FamilyApi tests PASS (the original 8 plus the 2 new).

- [ ] **Step 5: Create `ParentRepository.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.content.Context
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.parseSummary
import java.util.Base64

/** Fetches and decrypts a child's latest activity summary for the parent UI. */
class ParentRepository(context: Context) {

    private val store = FamilyStore(context.applicationContext)
    private val api = familyApi()

    /**
     * Returns the child's latest summary, or null if not signed in, nothing has
     * been uploaded yet, or the blob could not be decrypted.
     */
    fun fetchSummary(pairingId: String): FamilySummary? {
        val token = store.tokenBlocking() ?: return null
        val ciphertextB64 = api.syncFetch(token, pairingId) ?: return null
        return runCatching {
            val keys = store.keyPairBlocking()
            val plaintext = FamilyCrypto.decrypt(
                keys.privateKeysetB64, Base64.getDecoder().decode(ciphertextB64),
            )
            parseSummary(plaintext.decodeToString())
        }.getOrNull()
    }
}
```

- [ ] **Step 6: Add the blocking helpers to `FamilyStore.kt`**

`ParentRepository.fetchSummary` is called from a background dispatcher, so it needs non-suspending reads. In `FamilyStore`, add these methods (they wrap the existing suspend reads with `runBlocking`):

```kotlin
    /** Blocking read of the parent token — for use off the main thread only. */
    fun tokenBlocking(): String? = kotlinx.coroutines.runBlocking { getParentToken() }

    /** Blocking read of the device key pair — for use off the main thread only. */
    fun keyPairBlocking(): FamilyKeyPair = kotlinx.coroutines.runBlocking { getOrCreateKeyPair() }
```

- [ ] **Step 7: Run the unit suite and verify the build**

Run: `cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyStore.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentRepository.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyApiTest.kt
git commit -m "feat(android): add ParentRepository — fetch and decrypt child summary"
```

---

## Task 7: Child dashboard screen

`ChildDashboardActivity` shows one child's summary; the parent opens it from a child card.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ChildDashboardActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create `ChildDashboardActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Read-only view of one child's latest activity summary. */
class ChildDashboardActivity : AppCompatActivity() {

    private val repo by lazy { ParentRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(messageView("Loading…"))
    }

    override fun onResume() {
        super.onResume()
        val pairingId = intent.getStringExtra(EXTRA_PAIRING_ID) ?: run { finish(); return }
        lifecycleScope.launch {
            val summary = withContext(Dispatchers.IO) { repo.fetchSummary(pairingId) }
            setContentView(
                if (summary == null) messageView("No data yet — the child's phone hasn't synced.")
                else dashboardView(summary),
            )
        }
    }

    private fun dashboardView(summary: FamilySummary): View {
        val label = intent.getStringExtra(EXTRA_LABEL) ?: "Child phone"
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
        }
        column.addView(title(label))
        column.addView(caption("Last synced ${relativeTime(summary.ts)}"), gap(2))

        column.addView(statusBlock(summary.protectionOn), gap(20))
        column.addView(screenTimeBlock(summary), gap(14))
        column.addView(blockedBlock(summary), gap(14))

        return android.widget.ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun statusBlock(on: Boolean): View = block(if (on) Style.GREEN else Style.RED_OFF) {
        addView(blockTitle(if (on) "Protected" else "Not protected"))
        addView(blockBody(if (on) "Web filtering is on." else "Web filtering is off on this phone."))
    }

    private fun screenTimeBlock(summary: FamilySummary): View = block(Style.BLUE) {
        addView(blockCaption("SCREEN TIME TODAY"))
        addView(blockValue(formatMinutes(summary.screenTimeTodayMin)))
        val limit = if (summary.dailyLimitMin > 0)
            "of ${formatMinutes(summary.dailyLimitMin)} daily limit" else "No daily limit set"
        addView(blockBody(limit))
        for (app in summary.topApps) {
            addView(blockBody("${app.label} — ${formatMinutes(app.minutes)}"))
        }
    }

    private fun blockedBlock(summary: FamilySummary): View = block(Style.AMBER) {
        addView(blockCaption("BLOCKED TODAY"))
        addView(blockValue("${summary.webBlockedToday + summary.appBlockedToday}"))
        addView(blockBody("${summary.webBlockedToday} web · ${summary.appBlockedToday} apps"))
        if (summary.recentEvents.isEmpty()) {
            addView(blockBody("No blocked attempts recorded."))
        }
        for (event in summary.recentEvents) {
            addView(blockBody("${event.label}  ·  ${relativeTime(event.ts)}"))
        }
    }

    // ---- view helpers ----

    private fun block(color: Int, build: LinearLayout.() -> Unit): View =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(color, dp(22).toFloat())
            setPadding(dp(22), dp(20), dp(22), dp(20))
            build()
        }

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        textSize = 27f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.INK)
    }

    private fun caption(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13f
        setTextColor(Style.MUTED)
    }

    private fun blockTitle(text: String) = TextView(this).apply {
        this.text = text
        textSize = 20f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.ON_DARK)
    }

    private fun blockCaption(text: String) = TextView(this).apply {
        this.text = text
        textSize = 11f
        letterSpacing = 0.1f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.ON_DARK_SOFT)
    }

    private fun blockValue(text: String) = TextView(this).apply {
        this.text = text
        textSize = 30f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.ON_DARK)
    }

    private fun blockBody(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13.5f
        setTextColor(Style.ON_DARK_SOFT)
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(4) }
        layoutParams = lp
    }

    private fun messageView(text: String): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
            addView(title(intent.getStringExtra(EXTRA_LABEL) ?: "Child phone"))
            addView(caption(text), gap(8))
        }
        return android.widget.ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun gap(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }

    private fun formatMinutes(m: Int): String =
        if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"

    private fun relativeTime(ts: Long): String {
        val minutes = (System.currentTimeMillis() - ts) / 60_000
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> "$minutes min ago"
            minutes < 1440 -> "${minutes / 60} h ago"
            else -> SimpleDateFormat("d MMM", Locale.UK).format(Date(ts))
        }
    }

    companion object {
        const val EXTRA_PAIRING_ID = "pairing_id"
        const val EXTRA_LABEL = "label"
    }
}
```

- [ ] **Step 2: Open the dashboard from the child card in `ParentActivity.kt`**

In `ParentActivity.childCard`, make the card open the dashboard. Replace the `childCard` function with:

```kotlin
    private fun childCard(child: PairedChild): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = Style.roundRect(Style.VIOLET, dp(22).toFloat())
        setPadding(dp(22), dp(20), dp(22), dp(20))
        isClickable = true
        setOnClickListener {
            startActivity(
                Intent(this@ParentActivity, ChildDashboardActivity::class.java)
                    .putExtra(ChildDashboardActivity.EXTRA_PAIRING_ID, child.pairingId)
                    .putExtra(ChildDashboardActivity.EXTRA_LABEL, child.label),
            )
        }
        addView(TextView(context).apply {
            text = child.label
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        })
        addView(TextView(context).apply {
            text = "Tap to see today's activity"
            textSize = 12.5f
            setTextColor(Style.ON_DARK_SOFT)
        })
    }
```

`Intent` is already imported in `ParentActivity.kt`.

- [ ] **Step 3: Register `ChildDashboardActivity` in `AndroidManifest.xml`**

Next to the other `.parent.*` activities, add:

```xml
        <activity android:name=".parent.ChildDashboardActivity" android:exported="false" />
```

- [ ] **Step 4: Verify the build and unit suite**

Run: `cd android && ./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL — all unit tests pass.

- [ ] **Step 5: Manual verification on an emulator**

With the Worker deployed and `WORKER_BASE_URL` set (Plan A2b prerequisite), and a child paired to a parent:
- On the child phone, turn protection on and use a couple of apps; trigger a block (open a blocked app).
- Wait for `FamilySyncWorker` to run (or force it: `adb shell cmd jobscheduler run -f uk.co.cyberheroez.oroq <jobId>`, or simply wait ~15 min).
- On the parent phone, open the child card → the dashboard shows protection status, screen time and the blocked feed.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ChildDashboardActivity.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentActivity.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): add parent child-dashboard screen"
```

---

## Self-review

**Spec coverage** (spec §6 sync, §7 dashboard):
- §6.1 child uploads an encrypted summary periodically → `FamilySyncWorker` + `scheduleFamilySync` (Task 5); summary fields (status, screen time, top apps, blocked counts, recent events) → `buildSummary` (Task 5), `BlockEventLog` (Tasks 3-4).
- §6.2 parent fetches + decrypts on opening the dashboard → `ParentRepository` + `ChildDashboardActivity.onResume` (Tasks 6-7).
- §6 E2E — child encrypts with the parent's public key, the Worker stores ciphertext only → `FamilyCrypto.encryptFor` in the worker, `/sync` stores the blob verbatim (Tasks 1, 5).
- §7 child dashboard — status, screen time, blocked-attempts feed, "last synced" → `ChildDashboardActivity` (Task 7).

**Out of scope** (Plan C): remote control. Also still open from A2b: the child-side "Linked to a parent" banner; Android Keystore wrapping of the private keyset.

**Placeholder scan:** none — every step has complete content or an exact command. The Task 7 emulator step references a `<jobId>` for the optional force-run shortcut; this is a runtime value the engineer reads from `adb shell dumpsys jobscheduler`, not a code placeholder.

**Type consistency:** `FamilySummary`/`TopApp`/`BlockEvent` (Task 2) are used unchanged by `BlockEventLog` (Task 3), `buildSummary` (Task 5), `FamilySyncWorker` (Task 5), `ParentRepository` and `ChildDashboardActivity` (Tasks 6-7). `BlockEventLog.record/recent/countSince` signatures match every call site. `FamilyApi.syncUpload(pairingId, ciphertextB64)` and `syncFetch(token, pairingId)` match the worker and repository. `FamilyStore.tokenBlocking()/keyPairBlocking()` are added in Task 6 and used only by `ParentRepository`. The `/sync` route shape (`{ciphertext}` both ways) is consistent between `sync.ts`, `syncUpload` and `syncFetch`.

**Known limitation:** `POST /sync/:pairingId` is authorised only by knowing the pairing id (the child has no account). A third party who learns a pairing id could overwrite the blob with junk; because the payload is end-to-end encrypted this only causes a visible "couldn't sync" on the parent, not a data leak. A per-pairing upload token is a reasonable future hardening.
