# Child-slim, Parent-full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip the child phone down to a single "Protected" status screen, move blocked-categories control to the parent dashboard, add the `set_categories` remote command (with automatic VPN restart on apply).

**Architecture:** Re-uses the existing Family Link transport — encrypted commands via Cloudflare Worker `/cmd/:pairingId`, encrypted summaries via `/sync/:pairingId`. No Worker change. `FamilyCommand` gets a third type and an optional `stringValue` field; `FamilySummary` gets a new `categories` field so the parent UI can show what's currently set on the child.

**Tech Stack:** Android Views (Kotlin, no Compose), Preferences DataStore, WorkManager, JUnit4 + org.json for tests. Build with `./gradlew` from `/Users/apple/Desktop/Projects/oroq/android`.

**Spec:** `docs/superpowers/specs/2026-05-23-child-slim-parent-full-design.md`

---

## Task 1: Extend `FamilyCommand` with `stringValue` + `SET_CATEGORIES`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyCommand.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/family/FamilyCommandTest.kt`

- [ ] **Step 1: Add failing tests for the new shape**

Edit `FamilyCommandTest.kt`. Replace the entire body with:

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Test

class FamilyCommandTest {

    @Test fun grantExtraTimeRoundTrips() {
        val command = FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, intValue = 30)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setDailyLimitRoundTrips() {
        val command = FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, intValue = 90)
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setCategoriesRoundTripsWithStringValue() {
        val command = FamilyCommand(
            type = FamilyCommand.SET_CATEGORIES,
            stringValue = "adult,gambling",
        )
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setCategoriesAllowsEmptyString() {
        val command = FamilyCommand(FamilyCommand.SET_CATEGORIES, stringValue = "")
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun legacyJsonWithoutStringValueStillParses() {
        // Old commands queued before this change have no stringValue field —
        // the parser must default it to "".
        val legacy = """{"type":"grant_extra_time","intValue":30}"""
        val parsed = parseCommand(legacy)
        assertEquals(FamilyCommand.GRANT_EXTRA_TIME, parsed.type)
        assertEquals(30, parsed.intValue)
        assertEquals("", parsed.stringValue)
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail**

Run:
```bash
cd /Users/apple/Desktop/Projects/oroq/android && \
  ./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilyCommandTest"
```
Expected: build fails or tests fail — `setCategoriesRoundTripsWithStringValue` and friends reference an unknown `stringValue` arg / `SET_CATEGORIES` const.

- [ ] **Step 3: Add `stringValue` + `SET_CATEGORIES` to the model**

Replace the contents of `FamilyCommand.kt` with:

```kotlin
package uk.co.cyberheroez.oroq.family

import org.json.JSONObject

/**
 * A remote-control instruction from the parent.
 *
 * [type] is one of the constants below. Different commands carry different
 * payload shapes, so both an integer and a string payload slot exist; each
 * command only uses what it needs (the others stay at their default).
 *
 *  - [GRANT_EXTRA_TIME] → [intValue] is minutes to grant.
 *  - [SET_DAILY_LIMIT]  → [intValue] is the new daily limit in minutes.
 *  - [SET_CATEGORIES]   → [stringValue] is a comma-joined list of category
 *    ids (e.g. `"adult,gambling"`). Empty string means "no categories
 *    blocked" — every selectable category is turned off.
 */
data class FamilyCommand(
    val type: String,
    val intValue: Int = 0,
    val stringValue: String = "",
) {
    fun toJson(): String = JSONObject()
        .put("type", type)
        .put("intValue", intValue)
        .put("stringValue", stringValue)
        .toString()

    companion object {
        const val GRANT_EXTRA_TIME = "grant_extra_time"
        const val SET_DAILY_LIMIT = "set_daily_limit"
        const val SET_CATEGORIES = "set_categories"
    }
}

/** Parses a command from its JSON wire form. */
fun parseCommand(text: String): FamilyCommand {
    val json = JSONObject(text)
    return FamilyCommand(
        type = json.getString("type"),
        intValue = json.optInt("intValue", 0),
        stringValue = json.optString("stringValue", ""),
    )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilyCommandTest"
```
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyCommand.kt \
          android/app/src/test/java/uk/co/cyberheroez/oroq/family/FamilyCommandTest.kt && \
  git commit -m "feat(family): add SET_CATEGORIES command with stringValue payload"
```

---

## Task 2: Add `categories` field to `FamilySummary` + `buildSummary`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySummary.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/SummaryBuilder.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/family/FamilySummaryTest.kt`

- [ ] **Step 1: Update the failing tests**

Replace the contents of `FamilySummaryTest.kt` with:

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
        categories = setOf("adult", "gambling"),
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
        assertEquals(emptySet<String>(), parsed.categories)
    }

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
            categories = setOf("adult", "social"),
        )
        assertEquals(999, summary.ts)
        assertEquals(true, summary.protectionOn)
        assertEquals(155, summary.screenTimeTodayMin)
        assertEquals(5, summary.topApps.size)
        assertEquals("A", summary.topApps[0].label)
        assertEquals(7, summary.webBlockedToday)
        assertEquals(2, summary.recentEvents.size)
        assertEquals(setOf("adult", "social"), summary.categories)
    }
}
```

- [ ] **Step 2: Run tests to confirm they fail to compile**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilySummaryTest"
```
Expected: compile error — `FamilySummary` has no `categories`, `buildSummary` has no matching overload.

- [ ] **Step 3: Add the field to `FamilySummary`**

Replace `FamilySummary.kt` with:

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
    /** Category ids currently enabled (i.e. blocked) on the child. */
    val categories: Set<String> = emptySet(),
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
    val cats = JSONArray()
    for (id in categories) cats.put(id)
    return JSONObject()
        .put("ts", ts)
        .put("protectionOn", protectionOn)
        .put("screenTimeTodayMin", screenTimeTodayMin)
        .put("dailyLimitMin", dailyLimitMin)
        .put("webBlockedToday", webBlockedToday)
        .put("appBlockedToday", appBlockedToday)
        .put("topApps", apps)
        .put("recentEvents", events)
        .put("categories", cats)
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
    val cats = HashSet<String>()
    val catsArray = json.optJSONArray("categories")
    if (catsArray != null) {
        for (i in 0 until catsArray.length()) cats.add(catsArray.getString(i))
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
        categories = cats,
    )
}
```

- [ ] **Step 4: Extend `buildSummary` to accept categories**

Replace `SummaryBuilder.kt` with:

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
    categories: Set<String>,
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
        categories = categories,
    )
}
```

- [ ] **Step 5: Update the existing caller in `FamilySyncWorker`**

Edit `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySyncWorker.kt`. Find the call to `buildSummary(...)` and add a new line for `categories`:

```kotlin
        val summary = buildSummary(
            now = System.currentTimeMillis(),
            protectionOn = OroQVpnService.isActive,
            dailyLimitMinutes = config.getDailyLimitMinutes(),
            usageByApp = if (usage.hasUsageAccess()) usage.todayUsageByApp() else emptyMap(),
            recentEvents = blockLog.recent(20),
            webBlockedToday = blockLog.countSince("web", startOfToday),
            appBlockedToday = blockLog.countSince("app", startOfToday),
            categories = config.getEnabledCategories(),
        )
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilySummaryTest"
```
Expected: all 3 tests pass.

- [ ] **Step 7: Run the full unit-test suite to confirm nothing else broke**

```bash
./gradlew :app:testDebugUnitTest
```
Expected: BUILD SUCCESSFUL, every test in the suite passes.

- [ ] **Step 8: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySummary.kt \
          android/app/src/main/java/uk/co/cyberheroez/oroq/family/SummaryBuilder.kt \
          android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySyncWorker.kt \
          android/app/src/test/java/uk/co/cyberheroez/oroq/family/FamilySummaryTest.kt && \
  git commit -m "feat(family): include enabled categories in the activity summary"
```

---

## Task 3: Apply `SET_CATEGORIES` on the child (with VPN restart)

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/CommandSync.kt`

- [ ] **Step 1: Add the branch + restart helper**

Replace `CommandSync.kt` with:

```kotlin
package uk.co.cyberheroez.oroq.family

import android.content.Context
import android.content.Intent
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.vpn.OroQVpnService
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
            FamilyCommand.GRANT_EXTRA_TIME -> {
                val today = runCatching { UsageReader(context).todayForegroundMinutes() }.getOrDefault(0)
                config.grantExtraMinutes(command.intValue, today)
            }
            FamilyCommand.SET_DAILY_LIMIT -> config.setDailyLimitMinutes(command.intValue)
            FamilyCommand.SET_CATEGORIES -> {
                val ids = command.stringValue
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
                config.setEnabledCategories(ids)
                restartVpnIfActive(context)
            }
        }
        applied.markApplied(id)
        appliedCount++
    }

    // Ack every id we saw — applied now or already applied earlier — so the
    // server drops them.
    familyApi().cmdAck(link.pairingId, queue.map { it.first })
    return appliedCount
}

/**
 * Bounces the VPN service so it re-reads its blocklists. If the service isn't
 * active, this is a no-op — the next time the child starts protection it will
 * load the new categories naturally. Any failure here is swallowed; the next
 * sync's `protectionOn` field tells the parent if something went wrong.
 */
private fun restartVpnIfActive(context: Context) {
    if (!OroQVpnService.isActive) return
    runCatching {
        context.startService(
            Intent(context, OroQVpnService::class.java)
                .setAction(OroQVpnService.ACTION_STOP)
        )
        context.startService(Intent(context, OroQVpnService::class.java))
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/apple/Desktop/Projects/oroq/android && \
  ./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Run the unit-test suite**

```bash
./gradlew :app:testDebugUnitTest
```
Expected: every test passes (no new tests added — CommandSync depends on Android Context which isn't unit-testable without Robolectric).

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/family/CommandSync.kt && \
  git commit -m "feat(family): apply SET_CATEGORIES on child and bounce the VPN tunnel"
```

---

## Task 4: Parent sends `SET_CATEGORIES`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentRepository.kt`

- [ ] **Step 1: Add `sendSetCategories`**

Replace `ParentRepository.kt` with:

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.content.Context
import uk.co.cyberheroez.oroq.family.FamilyCommand
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

    /** Convenience wrapper: tells the child to block exactly [categories]. */
    fun sendSetCategories(pairingId: String, categories: Set<String>): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_CATEGORIES,
                stringValue = categories.joinToString(","),
            ),
        )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentRepository.kt && \
  git commit -m "feat(parent): sendSetCategories convenience wrapper"
```

---

## Task 5: Parent dashboard — categories picker + current limit caption

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ChildDashboardActivity.kt`

- [ ] **Step 1: Replace `ChildDashboardActivity.kt`**

This rewrites the activity to add a current-limit caption and a categories picker section. It preserves the existing remote-control buttons.

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Read-only view of one child's latest activity summary, plus remote controls. */
class ChildDashboardActivity : AppCompatActivity() {

    private val repo by lazy { ParentRepository(this) }

    /** The category-id → CheckBox map, populated as the picker is built. */
    private val categoryBoxes = mutableMapOf<String, CheckBox>()

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
        column.addView(backRow())
        column.addView(title(label), gap(10))
        column.addView(caption("Last synced ${relativeTime(summary.ts)}"), gap(2))

        column.addView(statusBlock(summary.protectionOn), gap(20))
        column.addView(screenTimeBlock(summary), gap(14))
        column.addView(blockedBlock(summary), gap(14))

        column.addView(sectionLabel("REMOTE CONTROL"), gap(24))
        column.addView(actionButton("Grant 30 minutes") {
            sendCommand(
                FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, intValue = 30),
                "Granted 30 minutes",
            )
        }, gap(10))
        column.addView(actionButton("Change daily limit") { promptDailyLimit() }, gap(10))
        column.addView(
            caption(
                if (summary.dailyLimitMin > 0)
                    "Currently ${formatMinutes(summary.dailyLimitMin)} per day"
                else "No daily limit set",
            ),
            gap(6),
        )

        column.addView(sectionLabel("BLOCKED CATEGORIES"), gap(24))
        column.addView(categoryPicker(summary.categories), gap(8))
        column.addView(actionButton("Save categories") { saveCategories() }, gap(12))

        return ScrollView(this).apply {
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

    /**
     * Builds the categories picker. Rendered as plain checkboxes (no coloured
     * block) so the form action is clearly distinct from the read-only blocks
     * above it.
     */
    private fun categoryPicker(currentlyEnabled: Set<String>): View {
        categoryBoxes.clear()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(Style.WHITE_CHIP, dp(22).toFloat())
            setPadding(dp(22), dp(18), dp(22), dp(18))
        }
        for (category in Categories.SELECTABLE) {
            val box = CheckBox(this).apply {
                text = category.label
                textSize = 15f
                setTextColor(Style.INK)
                isChecked = category.id in currentlyEnabled
            }
            categoryBoxes[category.id] = box
            column.addView(box)
        }
        return column
    }

    private fun saveCategories() {
        val pairingId = intent.getStringExtra(EXTRA_PAIRING_ID) ?: return
        val chosen = categoryBoxes.filterValues { it.isChecked }.keys.toSet()
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) { repo.sendSetCategories(pairingId, chosen) }
            Toast.makeText(
                this@ChildDashboardActivity,
                if (ok) "Sent — the phone updates shortly"
                else "Couldn't send — check your connection",
                Toast.LENGTH_LONG,
            ).show()
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
            insetTop = 0
            insetBottom = 0
            setOnClickListener { onClick() }
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
                    FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, intValue = minutes),
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

    private fun backRow() = TextView(this).apply {
        text = "‹  Back"
        textSize = 15f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.MUTED)
        isClickable = true
        setOnClickListener { finish() }
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
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(4) }
    }

    private fun messageView(text: String): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
            addView(backRow())
            addView(title(intent.getStringExtra(EXTRA_LABEL) ?: "Child phone"), gap(10))
            addView(caption(text), gap(8))
        }
        return ScrollView(this).apply {
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

- [ ] **Step 2: Verify it compiles**

```bash
./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ChildDashboardActivity.kt && \
  git commit -m "feat(parent): categories picker and current-limit caption on dashboard"
```

---

## Task 6: New `ChildOnboardingActivity` — guided permissions + pair

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/ChildOnboardingActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

This is a single Activity that walks through the permissions one at a time, then routes to `LinkParentActivity`. The activity is re-runnable: every time `onResume` fires it recomputes what is still needed and shows the first missing step. When everything is granted *and* a parent is linked, it `finish()`es back to the home.

- [ ] **Step 1: Create `ChildOnboardingActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.graphics.Typeface
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

/**
 * First-launch guided setup for a child phone:
 *
 *  1. VPN consent
 *  2. Usage Access
 *  3. Display over other apps
 *  4. Battery exemption (best-effort)
 *  5. Pair with a parent (delegates to [LinkParentActivity])
 *
 * Once every required step is satisfied and a parent is linked, this activity
 * starts the foreground services and finishes — the home screen takes over.
 * The same activity is launched again from the home screen if any of those
 * conditions later regress.
 */
class ChildOnboardingActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }

    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* refresh on resume */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { renderNextStep() }
    }

    private suspend fun renderNextStep() {
        val step = nextStep()
        if (step == Step.DONE) {
            startServicesAndFinish()
            return
        }
        setContentView(stepView(step))
    }

    /** Recomputes which step is next, given the current permission state. */
    private suspend fun nextStep(): Step {
        if (VpnService.prepare(this) != null) return Step.VPN
        if (!UsageReader(this).hasUsageAccess()) return Step.USAGE
        if (!Settings.canDrawOverlays(this)) return Step.OVERLAY
        if (!isIgnoringBatteryOptimisations()) return Step.BATTERY
        if (store.getParentLink() == null) return Step.PAIR
        return Step.DONE
    }

    private fun isIgnoringBatteryOptimisations(): Boolean {
        val pm = ContextCompat.getSystemService(this, PowerManager::class.java) ?: return true
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    /** Starts the VPN + monitor and routes back to the home. */
    private fun startServicesAndFinish() {
        startService(Intent(this, OroQVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
        finish()
    }

    private fun stepView(step: Step): ScrollView {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(64), dp(20), dp(28))
        }
        column.addView(title("Set up OroQ"))
        column.addView(caption("Step ${step.index} of 5 — ${step.label}"), marginTop(4))
        column.addView(body(step.explanation), marginTop(20))
        column.addView(primaryButton(step.actionLabel) { performStep(step) }, marginTop(28))
        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun performStep(step: Step) {
        when (step) {
            Step.VPN -> {
                val intent = VpnService.prepare(this)
                if (intent != null) vpnConsent.launch(intent)
            }
            Step.USAGE -> startActivity(UsageReader.usageAccessIntent())
            Step.OVERLAY -> startActivity(UsageReader.overlayIntent(this))
            Step.BATTERY -> openBatterySettings()
            Step.PAIR -> startActivity(Intent(this, LinkParentActivity::class.java))
            Step.DONE -> { /* unreachable */ }
        }
    }

    private fun openBatterySettings() {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }
    }

    // ---- view helpers ----

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

    private fun body(text: String) = TextView(this).apply {
        this.text = text
        textSize = 16f
        setTextColor(Style.INK)
        setLineSpacing(0f, 1.3f)
    }

    private fun primaryButton(label: String, onClick: () -> Unit): MaterialButton =
        MaterialButton(this).apply {
            this.text = label
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = dp(28)
            insetTop = 0
            insetBottom = 0
            setOnClickListener { onClick() }
        }

    private fun marginTop(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }

    /**
     * Each onboarding step carries the copy and action label shown to the user.
     * `index` exists only for the "Step N of 5" caption.
     */
    private enum class Step(
        val index: Int,
        val label: String,
        val explanation: String,
        val actionLabel: String,
    ) {
        VPN(1, "Allow web filtering",
            "OroQ runs as a local-only VPN to block harmful sites. " +
                "Android will ask you to allow it.",
            "Allow VPN"),
        USAGE(2, "Allow usage access",
            "This is how OroQ measures screen time and detects which " +
                "app is open.",
            "Open settings"),
        OVERLAY(3, "Allow display over apps",
            "Needed so OroQ can show a block screen when a blocked app " +
                "is opened.",
            "Open settings"),
        BATTERY(4, "Stay on in the background",
            "Exempt OroQ from battery optimisation so protection stays on.",
            "Open settings"),
        PAIR(5, "Link to a parent",
            "Ask your parent for the 8-character pairing code shown on " +
                "their phone.",
            "Open pairing"),
        DONE(0, "", "", "");
    }
}
```

- [ ] **Step 2: Register the activity in the manifest**

Edit `android/app/src/main/AndroidManifest.xml`. Inside `<application>`, just after the existing `RolePickerActivity` line, add:

```xml
        <activity android:name=".ui.ChildOnboardingActivity" android:exported="false" />
```

(Order doesn't matter functionally — placing it next to other internal activities keeps the file tidy.)

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/apple/Desktop/Projects/oroq/android && \
  ./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/ui/ChildOnboardingActivity.kt \
          android/app/src/main/AndroidManifest.xml && \
  git commit -m "feat(child): guided onboarding for permissions and pairing"
```

---

## Task 7: Replace `MainActivity` with the slim child home

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt`

This rewrites the child home as a single status block with one optional "Linked" caption underneath, removing every settings/screen-time/categories entry point. The badge is interactive only when `NOT PROTECTED` — tapping it relaunches `ChildOnboardingActivity`, which finds the next missing piece and shows it.

The Parent and RolePicker routing branches stay identical.

- [ ] **Step 1: Replace `MainActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq

import android.Manifest
import android.content.Intent
import android.graphics.Typeface
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.ChildOnboardingActivity
import uk.co.cyberheroez.oroq.ui.RolePickerActivity
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.update.scheduleBlocklistUpdates
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

/**
 * The child phone's only screen: a single status badge plus a "Linked to a
 * parent" caption. Parent and Role-picker routing is unchanged from before.
 *
 * Tapping the badge when it is red routes to [ChildOnboardingActivity], which
 * walks through whatever permission is missing.
 */
class MainActivity : AppCompatActivity() {

    private val familyStore by lazy { FamilyStore(this) }

    private lateinit var badge: LinearLayout
    private lateinit var badgeTitle: TextView
    private lateinit var badgeSub: TextView
    private lateinit var linkedLine: TextView

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        window.statusBarColor = Style.BG
        WindowCompat.getInsetsController(window, window.decorView)
            .isAppearanceLightStatusBars = true

        lifecycleScope.launch {
            when (familyStore.getRole()) {
                null -> {
                    startActivity(Intent(this@MainActivity, RolePickerActivity::class.java))
                    finish()
                }
                DeviceRole.PARENT -> {
                    startActivity(Intent(this@MainActivity, ParentActivity::class.java))
                    finish()
                }
                DeviceRole.CHILD -> setUpChildHome()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (this::badge.isInitialized) updateStatus()
    }

    private suspend fun setUpChildHome() {
        if (!isReadyToShowHome()) {
            startActivity(Intent(this, ChildOnboardingActivity::class.java))
            finish()
            return
        }
        scheduleBlocklistUpdates(this)
        scheduleFamilySync(this)
        requestNotificationPermissionIfNeeded()
        // Ensure the services are running on every cold start. They no-op if
        // already up.
        startService(Intent(this, OroQVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
        setContentView(buildLayout())
        updateStatus()
    }

    /** True when every onboarding gate has been satisfied. */
    private suspend fun isReadyToShowHome(): Boolean {
        if (VpnService.prepare(this) != null) return false
        if (!UsageReader(this).hasUsageAccess()) return false
        if (!Settings.canDrawOverlays(this)) return false
        if (familyStore.getParentLink() == null) return false
        return true
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun buildLayout(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(96), dp(24), dp(40))
        }
        column.addView(TextView(this).apply {
            text = "SAFEBROWSE"
            textSize = 13f
            letterSpacing = 0.32f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.MUTED)
        })

        badge = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(60), dp(28), dp(60))
            background = Style.roundRect(Style.GREEN, dp(28).toFloat())
            isClickable = true
            setOnClickListener { onBadgeTapped() }
        }
        badgeTitle = TextView(this).apply {
            textSize = 32f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
            gravity = Gravity.CENTER
        }
        badge.addView(badgeTitle)
        badgeSub = TextView(this).apply {
            textSize = 14f
            setTextColor(Style.ON_DARK_SOFT)
            gravity = Gravity.CENTER
        }
        badge.addView(badgeSub, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) })

        column.addView(badge, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(40) })

        linkedLine = TextView(this).apply {
            textSize = 14f
            setTextColor(Style.MUTED)
            gravity = Gravity.CENTER
            text = "Linked to a parent"
        }
        column.addView(linkedLine, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(28) })

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
            ))
        }
    }

    private fun updateStatus() {
        val protectedOn = OroQVpnService.isActive && permissionsGranted()
        if (protectedOn) {
            badge.background = Style.roundRect(Style.GREEN, dp(28).toFloat())
            badgeTitle.text = "✓ Protected"
            badgeSub.text = "Web filtering is on"
        } else {
            badge.background = Style.roundRect(Style.RED_OFF, dp(28).toFloat())
            badgeTitle.text = "Not protected"
            badgeSub.text = "Tap to fix"
        }
    }

    private fun permissionsGranted(): Boolean {
        if (VpnService.prepare(this) != null) return false
        if (!UsageReader(this).hasUsageAccess()) return false
        if (!Settings.canDrawOverlays(this)) return false
        return isIgnoringBatteryOptimisations()
    }

    private fun isIgnoringBatteryOptimisations(): Boolean {
        val pm = ContextCompat.getSystemService(this, PowerManager::class.java) ?: return true
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun onBadgeTapped() {
        if (OroQVpnService.isActive && permissionsGranted()) return
        startActivity(Intent(this, ChildOnboardingActivity::class.java))
    }
}
```

- [ ] **Step 2: Update `RolePickerActivity` routing**

`RolePickerActivity` already routes Child → `MainActivity`, which now handles the gate itself. No change needed there; just confirm by reading the existing `choose(role)` function in `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/RolePickerActivity.kt` and verifying the Child branch points at `MainActivity::class.java`. If it does, skip this step.

- [ ] **Step 3: Verify the project still compiles**

```bash
cd /Users/apple/Desktop/Projects/oroq/android && \
  ./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

If you see "unresolved reference" errors mentioning `OnboardingActivity`, `SettingsActivity`, `AppBlockActivity`, or `ScreenTimeActivity` — that's expected only after task 8 deletes them; at this point those files still exist (just unreferenced from `MainActivity`) so the compile should succeed.

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt && \
  git commit -m "feat(child): slim home — single status badge, no menus"
```

---

## Task 8: Strip the no-longer-used files + the time's-up PIN button

**Files:**
- Delete: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/OnboardingActivity.kt`
- Delete: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/SettingsActivity.kt`
- Delete: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/AppBlockActivity.kt`
- Delete: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/ScreenTimeActivity.kt`
- Delete: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/PinPrompt.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/BlockActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

`BlockActivity` is the only remaining caller of `PinPrompt`; once its PIN-grant action is removed, the file can go.

- [ ] **Step 1: Delete the now-orphan activities**

```bash
cd /Users/apple/Desktop/Projects/oroq/android/app/src/main/java/uk/co/cyberheroez/oroq/ui && \
  rm OnboardingActivity.kt SettingsActivity.kt AppBlockActivity.kt ScreenTimeActivity.kt PinPrompt.kt
```

- [ ] **Step 2: Remove the PIN-grant action from `BlockActivity`**

Replace `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/BlockActivity.kt` with:

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.family.pollAndApplyCommands
import uk.co.cyberheroez.oroq.ui.Style.dp

/**
 * Full-screen screen shown when an app is blocked or screen time is up.
 *
 * The only action is "Go to home screen" — there is no local PIN escape.
 * On the time's-up variant, the activity polls the parent every 30 s for a
 * grant-extra-time command and dismisses itself the moment one is applied.
 */
class BlockActivity : AppCompatActivity() {

    private val match = ViewGroup.LayoutParams.MATCH_PARENT
    private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        val reason = intent.getStringExtra(EXTRA_REASON) ?: REASON_APP
        setContentView(if (reason == REASON_TIME) timeUpView() else appBlockedView())
        if (reason == REASON_TIME) pollForRemoteGrant()
    }

    /** While the time's-up screen shows, checks for a remote grant every 30s. */
    private fun pollForRemoteGrant() {
        lifecycleScope.launch {
            repeat(40) { // ~20 minutes of polling
                delay(30_000)
                val applied = runCatching {
                    pollAndApplyCommands(applicationContext)
                }.getOrDefault(0)
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

    /** Back returns to the launcher, never to the blocked app. */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = goHome()

    private fun appBlockedView(): View = blockScreen(
        bgColor = Style.CORAL,
        iconRes = R.drawable.ic_block,
        heading = "App blocked",
        message = "This app has been blocked by OroQ.",
    ) {
        whiteButton("Go to home screen", Style.CORAL) { goHome() }
    }

    private fun timeUpView(): View = blockScreen(
        bgColor = Style.BLUE,
        iconRes = R.drawable.ic_clock,
        heading = "Screen time's up",
        message = "Today's screen-time limit has been reached. " +
            "A parent can grant more time remotely.",
    ) {
        whiteButton("Go to home screen", Style.BLUE) { goHome() }
    }

    private fun blockScreen(
        bgColor: Int,
        iconRes: Int,
        heading: String,
        message: String,
        actions: LinearLayout.() -> Unit,
    ): View {
        window.statusBarColor = bgColor
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(bgColor)
            setPadding(dp(32), dp(32), dp(32), dp(40))
        }
        column.addView(ImageView(this).apply {
            setImageResource(iconRes)
            imageTintList = ColorStateList.valueOf(Style.ON_DARK)
            background = Style.roundRect(Style.WHITE_CHIP, dp(28).toFloat())
            val p = dp(22)
            setPadding(p, p, p, p)
        }, LinearLayout.LayoutParams(dp(100), dp(100)))
        column.addView(TextView(this).apply {
            text = heading
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
            gravity = Gravity.CENTER
        }, mw(26))
        column.addView(TextView(this).apply {
            text = message
            textSize = 15f
            setTextColor(Style.ON_DARK_SOFT)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.3f)
        }, mw(10))
        column.actions()
        return column
    }

    private fun mw(topDp: Int) = LinearLayout.LayoutParams(match, wrap)
        .apply { topMargin = dp(topDp) }

    /** A white pill button with [textColor] text, for use on a coloured screen. */
    private fun LinearLayout.whiteButton(text: String, textColor: Int, onClick: () -> Unit) {
        addView(MaterialButton(this@BlockActivity).apply {
            this.text = text
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = dp(28)
            insetTop = 0
            insetBottom = 0
            backgroundTintList = ColorStateList.valueOf(Style.ON_DARK)
            setTextColor(textColor)
            setOnClickListener { onClick() }
        }, LinearLayout.LayoutParams(match, dp(56)).apply { topMargin = dp(30) })
    }

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    companion object {
        const val EXTRA_REASON = "reason"
        const val REASON_APP = "APP"
        const val REASON_TIME = "TIME"
    }
}
```

- [ ] **Step 3: Strip the deleted activities from the manifest**

Edit `android/app/src/main/AndroidManifest.xml`. **Remove** these four blocks:

```xml
        <activity
            android:name=".ui.OnboardingActivity"
            android:exported="false" />

        <activity
            android:name=".ui.SettingsActivity"
            android:exported="false" />

        <activity
            android:name=".ui.AppBlockActivity"
            android:exported="false" />

        <activity
            android:name=".ui.ScreenTimeActivity"
            android:exported="false" />
```

Leave the `MainActivity`, `BlockActivity`, `RolePickerActivity`, `ChildOnboardingActivity`, parent-side and service entries alone.

- [ ] **Step 4: Verify the full project compiles**

```bash
cd /Users/apple/Desktop/Projects/oroq/android && \
  ./gradlew :app:assembleDebug
```
Expected: BUILD SUCCESSFUL. APK at `app/build/outputs/apk/debug/app-debug.apk`.

If you see "unresolved reference" errors, find the stale import and remove it. The most likely candidates: any file that still imports `OnboardingActivity`, `SettingsActivity`, `AppBlockActivity`, `ScreenTimeActivity`, or `showPinPrompt`. Use:

```bash
cd /Users/apple/Desktop/Projects/oroq/android && \
  grep -rn "OnboardingActivity\|SettingsActivity\|AppBlockActivity\|ScreenTimeActivity\|showPinPrompt\|PinPrompt" app/src/main app/src/test
```

Each match must either be in a deleted file (already gone) or removed.

- [ ] **Step 5: Run the unit-test suite**

```bash
./gradlew :app:testDebugUnitTest
```
Expected: BUILD SUCCESSFUL, all tests pass. If any reference the deleted UI classes (none should — they're Activities), remove the import.

- [ ] **Step 6: Commit**

```bash
cd /Users/apple/Desktop/Projects/oroq && \
  git add -A android/app && \
  git commit -m "refactor(child): delete settings/onboarding/pin-prompt and the local PIN escape"
```

---

## Task 9: Manual verification on devices

This task is "did the change behave as advertised". No code changes.

**Devices:**
- Emulator `emulator-5554` — child
- Vivo (wireless ADB) — parent

- [ ] **Step 1: Confirm the assembled APK is current**

```bash
ls -la /Users/apple/Desktop/Projects/oroq/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: timestamp matches the most recent `assembleDebug` run.

- [ ] **Step 2: Reinstall on the emulator (child)**

```bash
adb -s emulator-5554 uninstall uk.co.cyberheroez.oroq
adb -s emulator-5554 install /Users/apple/Desktop/Projects/oroq/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success` on install. Uninstall may print "Failure [DELETE_FAILED_INTERNAL_ERROR]" on a fresh emulator — that's fine, the install will still proceed.

- [ ] **Step 3: Walk through child first-run on the emulator**

Open the app. Expected flow, in order:
1. Welcome / "Which phone is this?" — pick "This is my child's phone".
2. Onboarding step 1 of 5: VPN consent — Allow.
3. Step 2: Usage access — toggle on for OroQ, then back.
4. Step 3: Display over apps — toggle on, then back.
5. Step 4: Battery exemption — Allow.
6. Step 5: Open pairing — enter the parent's 8-character code, confirm the 6-digit SAS.
7. Home screen: a single green "✓ Protected" badge with "Linked to a parent" underneath. No menu, no buttons.

- [ ] **Step 4: Reinstall on the Vivo (parent)**

```bash
adb devices
```
Confirm the Vivo serial (e.g. `adb-10AE6K1G5L001AY-Y7XA1M (2)._adb-tls-connect._tcp`) is `device`, then:

```bash
V="<paste the Vivo serial>"
if [ -z "$V" ]; then echo "VIVO SERIAL EMPTY — abort"; exit 1; fi
adb -s "$V" install -r /Users/apple/Desktop/Projects/oroq/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success`. If Vivo is offline, reconnect first via wireless ADB (`adb mdns services` → `adb connect …`).

- [ ] **Step 5: Verify the parent dashboard shows the new sections**

Open OroQ on the Vivo (already in parent mode from the previous session). Tap the child's card → child dashboard.

Expected:
- Existing protection / screen-time / blocked-feed blocks unchanged.
- A new "REMOTE CONTROL" section: "Grant 30 minutes" button, "Change daily limit" button, current-limit caption underneath.
- A new "BLOCKED CATEGORIES" section: 8 checkboxes (Adult content, Gambling, Drugs, Violence, Social media, Gaming sites, Malware, Phishing) — those that are currently enabled are ticked. "Save categories" button.

- [ ] **Step 6: Verify the category command round-trip**

On the parent:
1. Untick "Adult content".
2. Tap "Save categories".
3. Expect toast: "Sent — the phone updates shortly".

On the emulator (child), within ~30 s:
- The home screen briefly redraws (the VPN restart can momentarily flip the badge to red and back to green within a few seconds — that's expected).
- Visit a previously-blocked adult test site in Chrome (e.g. `https://www.pornhub.com`); it now resolves (no block).

Then on the parent, re-tick "Adult content" and save again. Expect the site to be blocked again within ~30 s.

- [ ] **Step 7: Verify time's-up no longer has a local PIN button**

On the emulator, briefly set the daily limit very low (via parent: tap "Change daily limit" → 1 → Send), wait for the time's-up screen to appear, and confirm:
- Only "Go to home screen" button is present.
- No "Grant 30 more minutes" / PIN prompt.

Then from the parent, tap "Grant 30 minutes". Within ~30 s the emulator's time's-up screen dismisses on its own with a "A parent granted more time" toast.

Reset the daily limit to a sensible value (e.g. 90) from the parent.

- [ ] **Step 8: Update the memory file**

Append a paragraph to `/Users/apple/.claude/projects/-Users-apple-Desktop-Projects-oroq/memory/project_native_app_direction.md` recording:
- Date 2026-05-23.
- "Child-slim, parent-full" iteration complete — child UI is one status badge, all configuration on parent.
- Remote app blocking still deferred (needs inventory sync).

No commit required — memory files live outside the repo.

---

## Self-review notes

This plan covers every section of the spec:

- Spec §"Child phone — final shape" → Tasks 6 (onboarding) + 7 (home) + 8 (deletions + BlockActivity).
- Spec §"Parent dashboard — new controls" → Task 5 (`ChildDashboardActivity`).
- Spec §"New remote command: set_categories" → Task 1 (model) + Task 3 (apply) + Task 4 (send).
- Spec §"Syncing current values to parent" → Task 2 (summary field) + the `FamilySyncWorker` edit in the same task.
- Spec §"Files affected" → Tasks 5, 6, 7, 8 between them cover every modified/deleted/created file in the list.
- Spec §"Testing" → Tasks 1, 2 add the listed unit tests; Task 9 covers the manual flows.

Method/field names verified across tasks: `stringValue` (Task 1) is read in Task 3 and written in Task 4; `categories` field on `FamilySummary` (Task 2) is read in Task 5; `sendSetCategories` (Task 4) is called by Task 5; `restartVpnIfActive` is private to `CommandSync` (Task 3) and never called from elsewhere.
