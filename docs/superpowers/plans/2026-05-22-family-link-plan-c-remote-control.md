# Family Link — Plan C: Remote Control

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a parent change the child's screen-time settings from their own phone — grant extra time and set the daily limit — over an end-to-end-encrypted command queue.

**Architecture:** The Worker gains a `/cmd/:pairingId` queue — the parent `POST`s an encrypted command, the child `GET`s pending commands and `POST`s an ack. The parent encrypts each command with the child's public key; the child decrypts with its private key and applies it to `ConfigRepository`. An applied-id log makes the non-idempotent "grant extra time" safe against retries. The child picks up commands on its sync cycle and, while the "time's up" screen is showing, polls every 30s so a remote grant clears the lock quickly.

**Tech Stack:** TypeScript Cloudflare Worker (D1 + KV); Kotlin, Android Views, WorkManager, the `family/` package, `ConfigRepository`.

**Reference:** Spec — `docs/superpowers/specs/2026-05-22-safebrowse-parent-remote-view-design.md`, section 6.3 (remote control).

**Depends on:** Plans A1, A2a, A2b, B (pairing, sync, dashboard).

**Scope note:** Plan C covers the two screen-time commands — `grant_extra_time` and `set_daily_limit` — which need no extra data flow. Remote app-blocking and category changes need the child's installed-app inventory synced to the parent first; that is a separate follow-up, not part of Plan C.

**Verification note:** Worker routes and the pure Android pieces (`FamilyCommand`, `AppliedCommandLog`, `FamilyApi` methods) are unit-tested; `CommandSync`, the worker/BlockActivity wiring and the dashboard buttons are verified by building and on an emulator.

---

## File structure produced by this plan

```
backend/
├─ src/cmd.ts                                    POST/GET/ack /cmd/:pairingId
├─ src/index.ts                                  + /cmd route
└─ test/cmd.test.ts

android/app/src/main/java/uk/co/cyberheroez/safebrowse/
├─ family/
│  ├─ FamilyCommand.kt      command model + toJson/parseCommand
│  ├─ AppliedCommandLog.kt  file-backed set of already-applied command ids
│  ├─ CommandSync.kt        pollAndApplyCommands() — fetch, decrypt, apply, ack
│  ├─ FamilyApi.kt          + cmdSend / cmdFetch / cmdAck
│  ├─ FamilyStore.kt        + childrenBlocking()
│  └─ FamilySyncWorker.kt   + poll commands each cycle
├─ parent/
│  ├─ ParentRepository.kt   + sendCommand()
│  └─ ChildDashboardActivity.kt   + "Grant 30 min" / "Set daily limit" buttons
└─ ui/BlockActivity.kt      time's-up screen polls for a remote grant

android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/
├─ FamilyCommandTest.kt
└─ AppliedCommandLogTest.kt
```

---

## Task 1: Worker command-queue routes

**Files:**
- Create: `backend/src/cmd.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/cmd.test.ts`

- [ ] **Step 1: Write the failing test — `backend/test/cmd.test.ts`**

```ts
import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { signJwt } from "../src/crypto";

const ACCOUNT = "acc-cmd";

async function seedPairing(): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO pairings (id, account_id, child_label, parent_public_key, child_public_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(id, ACCOUNT, "Tablet", "PK", "CK", Date.now()).run();
  return id;
}

let pairingId = "";
beforeAll(async () => { pairingId = await seedPairing(); });

function token(sub: string): Promise<string> {
  return signJwt({ sub, exp: Math.floor(Date.now() / 1000) + 600 }, env.JWT_SECRET);
}

describe("/cmd", () => {
  it("enqueues, lists, then acks commands", async () => {
    const send = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token(ACCOUNT)}` },
      body: JSON.stringify({ ciphertext: "CMD-1" }),
    });
    expect(send.status).toBe(200);
    const sent = await send.json() as { id: string };
    expect(typeof sent.id).toBe("string");

    const list = await SELF.fetch(`https://x/cmd/${pairingId}`);
    expect(list.status).toBe(200);
    const listed = await list.json() as { commands: { id: string; ciphertext: string }[] };
    expect(listed.commands).toHaveLength(1);
    expect(listed.commands[0].ciphertext).toBe("CMD-1");

    const ack = await SELF.fetch(`https://x/cmd/${pairingId}/ack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [sent.id] }),
    });
    expect(ack.status).toBe(200);

    const after = await SELF.fetch(`https://x/cmd/${pairingId}`);
    expect((await after.json() as { commands: unknown[] }).commands).toHaveLength(0);
  });

  it("rejects enqueue without a token", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ciphertext: "X" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects enqueue from a different account", async () => {
    const res = await SELF.fetch(`https://x/cmd/${pairingId}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await token("other")}` },
      body: JSON.stringify({ ciphertext: "X" }),
    });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run test/cmd.test.ts`
Expected: FAIL — `/cmd` routes 404.

- [ ] **Step 3: Create `backend/src/cmd.ts`**

```ts
import { Env } from "./env";
import { json, readJson } from "./http";
import { verifyJwt } from "./crypto";
import { rateLimit } from "./ratelimit";

const CMD_TTL_SEC = 60 * 60 * 24; // 24 hours

interface QueuedCommand { id: string; ciphertext: string }

/** Routes the /cmd/:pairingId paths. */
export async function handleCmd(req: Request, env: Env, path: string): Promise<Response> {
  const ackMatch = path.match(/^\/cmd\/([0-9a-f-]{36})\/ack$/);
  if (ackMatch && req.method === "POST") return cmdAck(req, env, ackMatch[1]);
  const match = path.match(/^\/cmd\/([0-9a-f-]{36})$/);
  if (!match) return json({ error: "not_found" }, 404);
  if (req.method === "POST") return cmdSend(req, env, match[1]);
  if (req.method === "GET") return cmdFetch(env, match[1]);
  return json({ error: "not_found" }, 404);
}

async function readQueue(env: Env, pairingId: string): Promise<QueuedCommand[]> {
  const raw = await env.KV.get(`cmds:${pairingId}`);
  if (!raw) return [];
  return JSON.parse(raw) as QueuedCommand[];
}

async function writeQueue(env: Env, pairingId: string, queue: QueuedCommand[]): Promise<void> {
  await env.KV.put(`cmds:${pairingId}`, JSON.stringify(queue), { expirationTtl: CMD_TTL_SEC });
}

/** Parent enqueues an encrypted command. Must own the pairing. */
async function cmdSend(req: Request, env: Env, pairingId: string): Promise<Response> {
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

  const ciphertext = (await readJson(req)).ciphertext;
  if (typeof ciphertext !== "string" || ciphertext.length === 0 || ciphertext.length > 20_000) {
    return json({ error: "bad_request" }, 400);
  }
  const id = crypto.randomUUID();
  const queue = await readQueue(env, pairingId);
  queue.push({ id, ciphertext });
  await writeQueue(env, pairingId, queue);
  return json({ id });
}

/** Child fetches pending commands. */
async function cmdFetch(env: Env, pairingId: string): Promise<Response> {
  return json({ commands: await readQueue(env, pairingId) });
}

/** Child acknowledges commands; the listed ids are removed from the queue. */
async function cmdAck(req: Request, env: Env, pairingId: string): Promise<Response> {
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  if (!(await rateLimit(env, `ack:${ip}`, 60, 600))) return json({ error: "rate_limited" }, 429);
  const ids = (await readJson(req)).ids;
  if (!Array.isArray(ids)) return json({ error: "bad_request" }, 400);
  const remove = new Set(ids.map(String));
  const queue = (await readQueue(env, pairingId)).filter((c) => !remove.has(c.id));
  await writeQueue(env, pairingId, queue);
  return json({ ok: true });
}
```

- [ ] **Step 4: Modify `backend/src/index.ts` to route `/cmd`**

Replace the whole file with:

```ts
import { Env, validateEnv } from "./env";
import { json } from "./http";
import { handleAuth } from "./auth";
import { handlePairing } from "./pairing";
import { handleSync } from "./sync";
import { handleCmd } from "./cmd";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    validateEnv(env);
    const path = new URL(req.url).pathname;
    try {
      if (path === "/health") return json({ ok: true });
      if (path.startsWith("/auth/")) return await handleAuth(req, env, path);
      if (path.startsWith("/pair")) return await handlePairing(req, env, path);
      if (path.startsWith("/sync/")) return await handleSync(req, env, path);
      if (path.startsWith("/cmd/")) return await handleCmd(req, env, path);
      return json({ error: "not_found" }, 404);
    } catch {
      return json({ error: "server_error" }, 500);
    }
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx vitest run test/cmd.test.ts`
Expected: all 3 tests PASS.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && npm test`
Expected: every test file PASSES (health, crypto, ratelimit, auth, pairing, sync, cmd).

- [ ] **Step 7: Commit**

```bash
git add backend/src/cmd.ts backend/src/index.ts backend/test/cmd.test.ts
git commit -m "feat(backend): add remote-command queue routes"
```

---

## Task 2: FamilyCommand model

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyCommand.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCommandTest.kt`

- [ ] **Step 1: Write the failing test — `FamilyCommandTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilyCommandTest {

    @Test fun grantExtraTimeRoundTrips() {
        val command = FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, 30)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setDailyLimitRoundTrips() {
        val command = FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, 90)
        assertEquals(command, parseCommand(command.toJson()))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCommandTest"`
Expected: FAIL — `FamilyCommand` unresolved.

- [ ] **Step 3: Create `FamilyCommand.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.json.JSONObject

/**
 * A remote-control instruction from the parent. [type] is one of the constants
 * below; [intValue] is its single integer argument (minutes).
 */
data class FamilyCommand(val type: String, val intValue: Int) {
    fun toJson(): String =
        JSONObject().put("type", type).put("intValue", intValue).toString()

    companion object {
        /** Add bonus screen-time minutes for today. */
        const val GRANT_EXTRA_TIME = "grant_extra_time"

        /** Set the daily screen-time limit, in minutes (0 = no limit). */
        const val SET_DAILY_LIMIT = "set_daily_limit"
    }
}

/** Parses a command from its JSON wire form. */
fun parseCommand(text: String): FamilyCommand {
    val json = JSONObject(text)
    return FamilyCommand(json.getString("type"), json.getInt("intValue"))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCommandTest"`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyCommand.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCommandTest.kt
git commit -m "feat(android): add FamilyCommand model"
```

---

## Task 3: FamilyApi command methods

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyApiTest.kt` (add cases)

- [ ] **Step 1: Add tests to `FamilyApiTest.kt`**

Add inside the existing `class FamilyApiTest`:

```kotlin
    @Test fun cmdSendReturnsTrueOn200() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/cmd/pid-1" to HttpResponse(200, """{"id":"c1"}"""),
        )))
        assertTrue(api.cmdSend("jwt-1", "pid-1", "CIPHER"))
    }

    @Test fun cmdFetchParsesTheQueue() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/cmd/pid-1" to HttpResponse(
                200, """{"commands":[{"id":"c1","ciphertext":"A"},{"id":"c2","ciphertext":"B"}]}""",
            ),
        )))
        val queue = api.cmdFetch("pid-1")
        assertEquals(2, queue?.size)
        assertEquals("c1", queue?.get(0)?.first)
        assertEquals("B", queue?.get(1)?.second)
    }

    @Test fun cmdAckReturnsTrueOn200() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/cmd/pid-1/ack" to HttpResponse(200, """{"ok":true}"""),
        )))
        assertTrue(api.cmdAck("pid-1", listOf("c1", "c2")))
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyApiTest"`
Expected: FAIL — `cmdSend`/`cmdFetch`/`cmdAck` unresolved.

- [ ] **Step 3: Add the methods to `FamilyApi.kt`**

In `FamilyApi`, add after `syncFetch` (before `private fun post`). Note the new `import org.json.JSONArray` at the top of the file alongside the existing `import org.json.JSONObject`.

```kotlin
    /** Parent: enqueue an encrypted command for a pairing. Returns true on success. */
    fun cmdSend(token: String, pairingId: String, ciphertextB64: String): Boolean {
        val headers = jsonHeaders + ("authorization" to "Bearer $token")
        val body = JSONObject().put("ciphertext", ciphertextB64).toString()
        return post("/cmd/$pairingId", headers, body).status == 200
    }

    /** Child: fetch pending commands as (id, ciphertext) pairs, or null on failure. */
    fun cmdFetch(pairingId: String): List<Pair<String, String>>? {
        val res = transport.request("GET", "$baseUrl/cmd/$pairingId", emptyMap(), null)
        if (res.status != 200) return null
        val array = JSONObject(res.body).getJSONArray("commands")
        return (0 until array.length()).map { i ->
            val o = array.getJSONObject(i)
            o.getString("id") to o.getString("ciphertext")
        }
    }

    /** Child: acknowledge applied commands so the server drops them. */
    fun cmdAck(pairingId: String, ids: List<String>): Boolean {
        val array = JSONArray()
        for (id in ids) array.put(id)
        val body = JSONObject().put("ids", array).toString()
        return post("/cmd/$pairingId/ack", jsonHeaders, body).status == 200
    }
```

Add the import at the top of `FamilyApi.kt`:

```kotlin
import org.json.JSONArray
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyApiTest"`
Expected: all FamilyApi tests PASS.

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyApiTest.kt
git commit -m "feat(android): add FamilyApi command-queue methods"
```

---

## Task 4: Applied-command log and CommandSync

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/AppliedCommandLog.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/CommandSync.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/AppliedCommandLogTest.kt`

- [ ] **Step 1: Write the failing test — `AppliedCommandLogTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class AppliedCommandLogTest {

    @get:Rule val tempFolder = TemporaryFolder()

    private fun newLog(max: Int = 100): Pair<AppliedCommandLog, File> {
        val file = File(tempFolder.newFolder(), "applied.json")
        return AppliedCommandLog(file, maxIds = max) to file
    }

    @Test fun unseenIdIsNotContained() {
        val (log, _) = newLog()
        assertFalse(log.contains("c1"))
    }

    @Test fun markedIdIsContainedAndPersists() {
        val (log, file) = newLog()
        log.markApplied("c1")
        assertTrue(log.contains("c1"))
        assertTrue(AppliedCommandLog(file).contains("c1"))
    }

    @Test fun oldestIdsDropPastTheCap() {
        val (log, _) = newLog(max = 3)
        for (i in 1..5) log.markApplied("c$i")
        assertFalse(log.contains("c1"))
        assertTrue(log.contains("c5"))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.AppliedCommandLogTest"`
Expected: FAIL — `AppliedCommandLog` unresolved.

- [ ] **Step 3: Create `AppliedCommandLog.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import android.content.Context
import org.json.JSONArray
import java.io.File

/**
 * A bounded, file-backed record of command ids already applied on this device.
 * It makes re-delivery safe — a non-idempotent command (grant extra time) is
 * applied at most once even if the ack does not reach the server.
 */
class AppliedCommandLog(
    private val file: File,
    private val maxIds: Int = 100,
) {
    private val lock = Any()

    fun contains(id: String): Boolean = synchronized(lock) { read().contains(id) }

    fun markApplied(id: String) {
        synchronized(lock) {
            val ids = read().toMutableList()
            if (ids.contains(id)) return
            ids.add(id)
            while (ids.size > maxIds) ids.removeAt(0)
            write(ids)
        }
    }

    private fun read(): List<String> {
        if (!file.exists()) return emptyList()
        return runCatching {
            val array = JSONArray(file.readText())
            (0 until array.length()).map { array.getString(it) }
        }.getOrDefault(emptyList())
    }

    private fun write(ids: List<String>) {
        val array = JSONArray()
        for (id in ids) array.put(id)
        file.parentFile?.mkdirs()
        file.writeText(array.toString())
    }

    companion object {
        fun forContext(context: Context): AppliedCommandLog =
            AppliedCommandLog(File(context.applicationContext.filesDir, "applied_commands.json"))
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.AppliedCommandLogTest"`
Expected: all 3 tests PASS.

- [ ] **Step 5: Create `CommandSync.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import android.content.Context
import uk.co.cyberheroez.oroq.config.ConfigRepository
import java.util.Base64

/**
 * Fetches pending remote commands, decrypts and applies each one to
 * [ConfigRepository], then acknowledges them. Returns the number of commands
 * newly applied. Safe against re-delivery via [AppliedCommandLog].
 */
suspend fun pollAndApplyCommands(context: Context): Int {
    val store = FamilyStore(context)
    val link = store.getParentLink() ?: return 0
    val queue = familyApi().cmdFetch(link.pairingId) ?: return 0
    if (queue.isEmpty()) return 0

    val keys = store.getOrCreateKeyPair()
    val applied = AppliedCommandLog.forContext(context)
    val config = ConfigRepository(context)
    var appliedCount = 0

    for ((id, ciphertextB64) in queue) {
        if (applied.contains(id)) continue
        val command = runCatching {
            val plain = FamilyCrypto.decrypt(
                keys.privateKeysetB64, Base64.getDecoder().decode(ciphertextB64),
            )
            parseCommand(plain.decodeToString())
        }.getOrNull() ?: continue

        when (command.type) {
            FamilyCommand.GRANT_EXTRA_TIME -> config.grantExtraMinutes(command.intValue)
            FamilyCommand.SET_DAILY_LIMIT -> config.setDailyLimitMinutes(command.intValue)
        }
        applied.markApplied(id)
        appliedCount++
    }

    // Ack every id we saw — applied now or already applied earlier — so the
    // server drops them.
    familyApi().cmdAck(link.pairingId, queue.map { it.first })
    return appliedCount
}
```

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/AppliedCommandLog.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/CommandSync.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/AppliedCommandLogTest.kt
git commit -m "feat(android): add applied-command log and CommandSync"
```

---

## Task 5: Child applies commands

The child runs `pollAndApplyCommands` on each sync cycle, and — while the "time's up" screen is showing — every 30 seconds so a remote grant clears the lock quickly.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/BlockActivity.kt`

- [ ] **Step 1: Poll for commands in `FamilySyncWorker.kt`**

In `FamilySyncWorker.doWork()`, after the `syncUpload(...)` call and before `return`, add a command poll. Replace the final lines of `doWork()`:

```kotlin
        val uploaded = familyApi().syncUpload(
            link.pairingId, Base64.getEncoder().encodeToString(ciphertext),
        )
        return if (uploaded) Result.success() else Result.retry()
```

with:

```kotlin
        val uploaded = familyApi().syncUpload(
            link.pairingId, Base64.getEncoder().encodeToString(ciphertext),
        )
        runCatching { pollAndApplyCommands(applicationContext) }
        return if (uploaded) Result.success() else Result.retry()
```

- [ ] **Step 2: Poll for a remote grant in `BlockActivity.kt`**

In `BlockActivity`, the "time's up" path should poll for commands so a parent's remote "grant extra time" dismisses the lock. Add the import:

```kotlin
import kotlinx.coroutines.delay
import uk.co.cyberheroez.oroq.family.pollAndApplyCommands
```

In `onCreate`, after `setContentView(...)`, start the poll when the reason is time's-up:

```kotlin
        val reason = intent.getStringExtra(EXTRA_REASON) ?: REASON_APP
        setContentView(if (reason == REASON_TIME) timeUpView() else appBlockedView())
        if (reason == REASON_TIME) pollForRemoteGrant()
```

Add the polling method to `BlockActivity`:

```kotlin
    /** While the time's-up screen shows, checks for a remote grant every 30s. */
    private fun pollForRemoteGrant() {
        lifecycleScope.launch {
            repeat(40) { // ~20 minutes of polling
                delay(30_000)
                val applied = runCatching { pollAndApplyCommands(applicationContext) }.getOrDefault(0)
                if (applied > 0) {
                    Toast.makeText(
                        this@BlockActivity, "A parent granted more time", Toast.LENGTH_LONG,
                    ).show()
                    finish()
                    return@launch
                }
            }
        }
    }
```

`lifecycleScope` and `launch` are already imported in `BlockActivity.kt` (used by `promptForExtraTime`).

- [ ] **Step 3: Verify it builds**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/BlockActivity.kt
git commit -m "feat(android): child applies remote commands on sync and at the time's-up screen"
```

---

## Task 6: Parent sends commands

`ParentRepository.sendCommand` encrypts a command for the child; `ChildDashboardActivity` gains "Grant 30 minutes" and "Set daily limit" actions.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyStore.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentRepository.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ChildDashboardActivity.kt`

- [ ] **Step 1: Add `childrenBlocking()` to `FamilyStore.kt`**

In `FamilyStore`, next to `tokenBlocking()` and `keyPairBlocking()`, add:

```kotlin
    /** Blocking read of the paired children — for use off the main thread only. */
    fun childrenBlocking(): List<PairedChild> = kotlinx.coroutines.runBlocking { getChildren() }
```

- [ ] **Step 2: Add `sendCommand` to `ParentRepository.kt`**

Add the imports to `ParentRepository.kt`:

```kotlin
import uk.co.cyberheroez.oroq.family.FamilyCommand
```

Add the method inside `class ParentRepository`:

```kotlin
    /**
     * Encrypts [command] with the child's public key and enqueues it on the
     * Worker. Returns true on success.
     */
    fun sendCommand(pairingId: String, command: FamilyCommand): Boolean {
        val token = store.tokenBlocking() ?: return false
        val child = store.childrenBlocking().firstOrNull { it.pairingId == pairingId } ?: return false
        val ciphertext = FamilyCrypto.encryptFor(
            child.childPublicKeyB64, command.toJson().toByteArray(),
        )
        return api.cmdSend(token, pairingId, Base64.getEncoder().encodeToString(ciphertext))
    }
```

- [ ] **Step 3: Add action buttons to `ChildDashboardActivity.kt`**

Add the imports:

```kotlin
import android.text.InputType
import android.widget.EditText
import androidx.appcompat.app.AlertDialog
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyCommand
```

In `dashboardView`, after `column.addView(blockedBlock(summary), gap(14))`, add the controls section:

```kotlin
        column.addView(sectionLabel("REMOTE CONTROL"), gap(24))
        column.addView(actionButton("Grant 30 minutes") {
            sendCommand(FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, 30), "Granted 30 minutes")
        }, gap(10))
        column.addView(actionButton("Set daily limit") { promptDailyLimit() }, gap(10))
```

Add these members to `ChildDashboardActivity`:

```kotlin
    private fun sectionLabel(text: String) = TextView(this).apply {
        this.text = text
        textSize = 12f
        letterSpacing = 0.12f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.MUTED)
    }

    private fun actionButton(label: String, onClick: () -> Unit): MaterialButton =
        MaterialButton(this).apply {
            text = label
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = dp(30)
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(56),
            )
        }

    private fun promptDailyLimit() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "Minutes per day (0 = no limit)"
        }
        AlertDialog.Builder(this)
            .setTitle("Daily screen-time limit")
            .setView(input)
            .setPositiveButton("Send") { _, _ ->
                val minutes = input.text.toString().toIntOrNull() ?: 0
                sendCommand(
                    FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, minutes),
                    "Daily limit set to ${formatMinutes(minutes)}",
                )
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun sendCommand(command: FamilyCommand, successMessage: String) {
        val pairingId = intent.getStringExtra(EXTRA_PAIRING_ID) ?: return
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) { repo.sendCommand(pairingId, command) }
            Toast.makeText(
                this@ChildDashboardActivity,
                if (ok) "$successMessage — it reaches the phone shortly"
                else "Couldn't send — check your connection",
                Toast.LENGTH_LONG,
            ).show()
        }
    }
```

Add the import for `Toast` if it is not already present:

```kotlin
import android.widget.Toast
```

- [ ] **Step 4: Verify it builds and the unit suite passes**

Run: `cd android && ./gradlew :app:assembleDebug :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL — all unit tests pass.

- [ ] **Step 5: Manual verification on an emulator**

With a paired parent and child:
- On the child, set a daily limit low enough to hit "time's up" (or use the existing limit).
- On the parent, open the child dashboard → "Grant 30 minutes". A toast confirms it sent.
- Within ~30s the child's time's-up screen dismisses (or, on the next sync, the extra time applies); `wrangler tail` shows `POST /cmd` then `GET /cmd` then `POST /cmd/.../ack`.
- "Set daily limit" → enter a number → on the next child sync the limit changes (visible on the child's Screen time screen and the parent dashboard).

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyStore.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentRepository.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ChildDashboardActivity.kt
git commit -m "feat(android): parent remote control — grant time and set daily limit"
```

---

## Self-review

**Spec coverage** (spec §6.3 remote control):
- §6.3 `grantExtraTime` and `setDailyLimit` commands → `FamilyCommand` (Task 2), applied in `CommandSync` (Task 4) via the existing `ConfigRepository.grantExtraMinutes` / `setDailyLimitMinutes`.
- §6.3 encrypted command queue → Worker `/cmd` routes (Task 1); parent encrypts with the child key in `ParentRepository.sendCommand` (Task 6); child decrypts in `CommandSync` (Task 4).
- §6.3 child polls each cycle; faster while the time's-up screen shows → `FamilySyncWorker` + `BlockActivity` (Task 5).
- §6.3 commands idempotent / re-delivery safe → `AppliedCommandLog` (Task 4).

**Deliberately out of scope** (noted in the header): remote `setBlockedApps` and `setBlockedCategories` — they need the child's installed-app inventory synced to the parent first. A separate follow-up plan.

**Placeholder scan:** none — every step has complete content or an exact command. The Task 5 instruction "use whatever the variable is named" does not apply here; all referenced symbols (`EXTRA_REASON`, `REASON_TIME`, `timeUpView`, `appBlockedView`, `lifecycleScope`) already exist in `BlockActivity` from Plan A2b's redesign.

**Type consistency:** `FamilyCommand(type, intValue)` and its `GRANT_EXTRA_TIME` / `SET_DAILY_LIMIT` constants are used identically in `CommandSync`, `ParentRepository` and `ChildDashboardActivity`. `FamilyApi.cmdSend(token, pairingId, ciphertextB64)`, `cmdFetch(pairingId): List<Pair<String,String>>?`, `cmdAck(pairingId, ids)` match every call site. `pollAndApplyCommands(context)` is suspend and called from `FamilySyncWorker.doWork()` and `BlockActivity`'s `lifecycleScope`. `FamilyStore.childrenBlocking()` mirrors the existing `tokenBlocking()` / `keyPairBlocking()`. The `/cmd` JSON shape (`{ciphertext}` in, `{commands:[{id,ciphertext}]}` / `{id}` / `{ids}` ) is consistent between `cmd.ts` and the `FamilyApi` methods.

**Known limitation:** `GET /cmd` and `POST /cmd/.../ack` are authorised only by the pairing id (the child has no account). A third party who learns a pairing id could read the encrypted commands (unreadable — E2E) or ack them early (a denial-of-service). Same trade-off as `/sync`; a per-pairing token is the future hardening.
