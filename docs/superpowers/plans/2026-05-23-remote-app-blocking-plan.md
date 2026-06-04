# Remote App Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the parent pick which apps to block on the child phone from the parent dashboard — by syncing the child's installed-app inventory up and a `SET_BLOCKED_APPS` command down.

**Architecture:** Inventory rides on the existing encrypted `FamilySummary` blob (two new fields: `installedApps`, `blockedApps`). New command `SET_BLOCKED_APPS` reuses the `stringValue` slot added for `SET_CATEGORIES`. No Worker change. No service restart on apply — `AppMonitorService` re-reads `getBlockedApps()` every 1-second tick.

**Tech Stack:** Android Views (Kotlin, no Compose), Preferences DataStore, WorkManager, JUnit4 + org.json for tests. Build with `./gradlew` from `/Users/apple/Desktop/Projects/safebrowse-ai/android`.

**Spec:** `docs/superpowers/specs/2026-05-23-remote-app-blocking-design.md`

---

## Task 1: Add `InstalledApp` model + `InstalledAppReader`

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/InstalledApp.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/InstalledAppReader.kt`

`InstalledAppReader` depends on Android's `PackageManager` — not unit-testable without Robolectric, which this project doesn't use. We rely on compile + manual verification in Task 8.

- [ ] **Step 1: Create the data class**

```kotlin
// android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/InstalledApp.kt
package uk.co.cyberheroez.oroq.family

/** A single user-installed app on the child phone, as seen by the parent. */
data class InstalledApp(val packageName: String, val label: String)
```

- [ ] **Step 2: Create the reader**

```kotlin
// android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/InstalledAppReader.kt
package uk.co.cyberheroez.oroq.family

import android.content.Context
import android.content.pm.ApplicationInfo

/**
 * Returns the user-installed apps on this device, sorted by display label.
 *
 * "User-installed" means anything without `FLAG_SYSTEM` AND without
 * `FLAG_UPDATED_SYSTEM_APP` — the latter excludes preinstalled apps that
 * later received an OTA update (Android clears `FLAG_SYSTEM` on those, so
 * checking it alone would let Settings/Phone leak through).
 *
 * SafeBrowse itself is filtered out so the parent picker can't ask the child
 * to block the parental-control app.
 */
fun listUserApps(context: Context): List<InstalledApp> {
    val pm = context.packageManager
    val ownPackage = context.packageName
    val flags = ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP
    return pm.getInstalledApplications(0)
        .asSequence()
        .filter { it.packageName != ownPackage }
        .filter { (it.flags and flags) == 0 }
        .map { InstalledApp(it.packageName, it.loadLabel(pm).toString()) }
        .sortedBy { it.label.lowercase() }
        .toList()
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  ./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/InstalledApp.kt \
          android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/InstalledAppReader.kt && \
  git commit -m "feat(family): InstalledApp model and user-app reader"
```

---

## Task 2: Add `installedApps` + `blockedApps` fields to `FamilySummary`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySummary.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilySummaryTest.kt`

- [ ] **Step 1: Extend the failing tests**

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
        installedApps = listOf(
            InstalledApp("com.instagram.android", "Instagram"),
            InstalledApp("com.zhiliaoapp.musically", "TikTok"),
        ),
        blockedApps = setOf("com.zhiliaoapp.musically"),
    )

    @Test fun jsonRoundTrips() {
        val restored = parseSummary(sample.toJson())
        assertEquals(sample, restored)
    }

    @Test fun toleratesMissingOptionalFields() {
        val minimal = """{"ts":1,"protectionOn":false,"screenTimeTodayMin":0,""" +
            """"dailyLimitMin":0,"webBlockedToday":0,"appBlockedToday":0}"""
        val parsed = parseSummary(minimal)
        assertEquals(emptyList<TopApp>(), parsed.topApps)
        assertEquals(emptyList<BlockEvent>(), parsed.recentEvents)
        assertEquals(emptySet<String>(), parsed.categories)
        assertEquals(emptyList<InstalledApp>(), parsed.installedApps)
        assertEquals(emptySet<String>(), parsed.blockedApps)
    }

    @Test fun buildSummaryAssemblesFieldsAndTopFive() {
        val usage = linkedMapOf(
            "A" to 50, "B" to 40, "C" to 30, "D" to 20, "E" to 10, "F" to 5,
        )
        val events = listOf(
            BlockEvent(10, "web", "x.com"),
            BlockEvent(20, "app", "TikTok"),
        )
        val apps = listOf(
            InstalledApp("com.a", "App A"),
            InstalledApp("com.b", "App B"),
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
            installedApps = apps,
            blockedApps = setOf("com.a"),
        )
        assertEquals(999, summary.ts)
        assertEquals(155, summary.screenTimeTodayMin)
        assertEquals(5, summary.topApps.size)
        assertEquals(setOf("adult", "social"), summary.categories)
        assertEquals(apps, summary.installedApps)
        assertEquals(setOf("com.a"), summary.blockedApps)
    }
}
```

- [ ] **Step 2: Run the tests to confirm they fail to compile**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilySummaryTest"
```
Expected: compile error — `FamilySummary` has no `installedApps`/`blockedApps`, `buildSummary` has no matching overload.

- [ ] **Step 3: Add the fields and wire-format support**

Replace `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySummary.kt` with:

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
    /** Every user-installed app on the child phone — for the parent picker. */
    val installedApps: List<InstalledApp> = emptyList(),
    /** Package names the child currently blocks. Mirror of [installedApps] selection. */
    val blockedApps: Set<String> = emptySet(),
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
    val installed = JSONArray()
    for (app in installedApps) {
        installed.put(JSONObject().put("pkg", app.packageName).put("label", app.label))
    }
    val blocked = JSONArray()
    for (pkg in blockedApps) blocked.put(pkg)
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
        .put("installedApps", installed)
        .put("blockedApps", blocked)
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
    val installed = ArrayList<InstalledApp>()
    val installedArray = json.optJSONArray("installedApps")
    if (installedArray != null) {
        for (i in 0 until installedArray.length()) {
            val o = installedArray.getJSONObject(i)
            installed.add(InstalledApp(o.getString("pkg"), o.getString("label")))
        }
    }
    val blocked = HashSet<String>()
    val blockedArray = json.optJSONArray("blockedApps")
    if (blockedArray != null) {
        for (i in 0 until blockedArray.length()) blocked.add(blockedArray.getString(i))
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
        installedApps = installed,
        blockedApps = blocked,
    )
}
```

- [ ] **Step 4: Run tests for FamilySummary only**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilySummaryTest"
```
Expected: still fails — `buildSummary` doesn't accept `installedApps`/`blockedApps` yet (Task 3 fixes it).

- [ ] **Step 5: Commit (intentionally on a broken test — Task 3 finishes the wiring)**

The summary model is complete; the builder gets its matching signature in Task 3. Tests will go green at the end of Task 3.

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySummary.kt \
          android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilySummaryTest.kt && \
  git commit -m "feat(family): installedApps and blockedApps in summary wire format"
```

---

## Task 3: Update `buildSummary` + `FamilySyncWorker`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/SummaryBuilder.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt`

- [ ] **Step 1: Extend `buildSummary`**

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
    installedApps: List<InstalledApp>,
    blockedApps: Set<String>,
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
        installedApps = installedApps,
        blockedApps = blockedApps,
    )
}
```

- [ ] **Step 2: Update the caller in `FamilySyncWorker`**

Edit `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt`. Find the `buildSummary(...)` call and add the two new args:

```kotlin
        val summary = buildSummary(
            now = System.currentTimeMillis(),
            protectionOn = SafeBrowseVpnService.isActive,
            dailyLimitMinutes = config.getDailyLimitMinutes(),
            usageByApp = if (usage.hasUsageAccess()) usage.todayUsageByApp() else emptyMap(),
            recentEvents = blockLog.recent(20),
            webBlockedToday = blockLog.countSince("web", startOfToday),
            appBlockedToday = blockLog.countSince("app", startOfToday),
            categories = config.getEnabledCategories(),
            installedApps = listUserApps(applicationContext),
            blockedApps = config.getBlockedApps(),
        )
```

- [ ] **Step 3: Run the full unit test suite**

```bash
./gradlew :app:testDebugUnitTest
```
Expected: BUILD SUCCESSFUL, all `FamilySummaryTest` cases pass (now that `buildSummary` matches).

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/SummaryBuilder.kt \
          android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilySyncWorker.kt && \
  git commit -m "feat(family): worker uploads installedApps and blockedApps"
```

---

## Task 4: Add `SET_BLOCKED_APPS` command

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyCommand.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCommandTest.kt`

- [ ] **Step 1: Add the failing test**

Append to the existing `FamilyCommandTest.kt` (inside the class, before the closing `}`):

```kotlin

    @Test fun setBlockedAppsRoundTripsWithStringValue() {
        val command = FamilyCommand(
            type = FamilyCommand.SET_BLOCKED_APPS,
            stringValue = "com.instagram.android,com.zhiliaoapp.musically",
        )
        assertEquals(command, parseCommand(command.toJson()))
    }

    @Test fun setBlockedAppsAllowsEmptyString() {
        val command = FamilyCommand(FamilyCommand.SET_BLOCKED_APPS, stringValue = "")
        assertEquals(command, parseCommand(command.toJson()))
    }
```

- [ ] **Step 2: Run tests to confirm they fail to compile**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilyCommandTest"
```
Expected: compile error — `SET_BLOCKED_APPS` undefined.

- [ ] **Step 3: Add the constant**

Edit `FamilyCommand.kt`. Inside `companion object`, add the new line after `SET_CATEGORIES`:

```kotlin
    companion object {
        const val GRANT_EXTRA_TIME = "grant_extra_time"
        const val SET_DAILY_LIMIT = "set_daily_limit"
        const val SET_CATEGORIES = "set_categories"
        const val SET_BLOCKED_APPS = "set_blocked_apps"
    }
```

Also update the KDoc on the data class to document the new type. Replace the existing KDoc on `data class FamilyCommand` with:

```kotlin
/**
 * A remote-control instruction from the parent.
 *
 * [type] is one of the constants below. Different commands carry different
 * payload shapes, so both an integer and a string payload slot exist; each
 * command only uses what it needs (the others stay at their default).
 *
 *  - [GRANT_EXTRA_TIME]  → [intValue] is minutes to grant.
 *  - [SET_DAILY_LIMIT]   → [intValue] is the new daily limit in minutes.
 *  - [SET_CATEGORIES]    → [stringValue] is a comma-joined list of category
 *    ids (e.g. `"adult,gambling"`). Empty string means "no categories
 *    blocked".
 *  - [SET_BLOCKED_APPS]  → [stringValue] is a comma-joined list of package
 *    names (e.g. `"com.instagram.android,com.zhiliaoapp.musically"`). Empty
 *    string means "no apps blocked".
 */
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./gradlew :app:testDebugUnitTest --tests \
  "uk.co.cyberheroez.oroq.family.FamilyCommandTest"
```
Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyCommand.kt \
          android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCommandTest.kt && \
  git commit -m "feat(family): add SET_BLOCKED_APPS command type"
```

---

## Task 5: `CommandSync` applies `SET_BLOCKED_APPS`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/CommandSync.kt`

`AppMonitorService` already polls `getBlockedApps()` every 1 s, so no service restart is needed here — unlike `SET_CATEGORIES` which has to bounce the VPN.

- [ ] **Step 1: Add the branch**

Edit `CommandSync.kt`. Inside the `when (command.type) { … }` block, add a new branch after `SET_CATEGORIES`:

```kotlin
            FamilyCommand.SET_BLOCKED_APPS -> {
                val pkgs = command.stringValue
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
                config.setBlockedApps(pkgs)
            }
```

The final `when` should look like:

```kotlin
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
            FamilyCommand.SET_BLOCKED_APPS -> {
                val pkgs = command.stringValue
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
                config.setBlockedApps(pkgs)
            }
        }
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  ./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/CommandSync.kt && \
  git commit -m "feat(family): apply SET_BLOCKED_APPS on child"
```

---

## Task 6: `ParentRepository.sendSetBlockedApps`

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentRepository.kt`

- [ ] **Step 1: Add the wrapper**

Edit `ParentRepository.kt`. After the existing `sendSetCategories` function (and before the closing `}` of the class), add:

```kotlin

    /** Convenience wrapper: tells the child to block exactly [packageNames]. */
    fun sendSetBlockedApps(pairingId: String, packageNames: Set<String>): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_BLOCKED_APPS,
                stringValue = packageNames.joinToString(","),
            ),
        )
```

- [ ] **Step 2: Verify it compiles**

```bash
./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ParentRepository.kt && \
  git commit -m "feat(parent): sendSetBlockedApps convenience wrapper"
```

---

## Task 7: Parent dashboard — BLOCKED APPS section

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ChildDashboardActivity.kt`

The picker mirrors the categories one — same visual treatment, same Save flow.

- [ ] **Step 1: Add the import**

Open `ChildDashboardActivity.kt`. After the existing `import uk.co.cyberheroez.oroq.family.FamilySummary` line, add:

```kotlin
import uk.co.cyberheroez.oroq.family.InstalledApp
```

- [ ] **Step 2: Add a second checkbox map field**

Find the existing line in the class:

```kotlin
    /** The category-id → CheckBox map, populated as the picker is built. */
    private val categoryBoxes = mutableMapOf<String, CheckBox>()
```

Add this directly below it:

```kotlin
    /** The package-name → CheckBox map for the apps picker. */
    private val appBoxes = mutableMapOf<String, CheckBox>()
```

- [ ] **Step 3: Add the new section to `dashboardView`**

Find this block inside `dashboardView`:

```kotlin
        column.addView(sectionLabel("BLOCKED CATEGORIES"), gap(24))
        column.addView(categoryPicker(summary.categories), gap(8))
        column.addView(actionButton("Save categories") { saveCategories() }, gap(12))
```

Add the following directly after it (still inside `dashboardView`, before the `return ScrollView(this).apply { … }` block):

```kotlin
        column.addView(sectionLabel("BLOCKED APPS"), gap(24))
        column.addView(appPicker(summary.installedApps, summary.blockedApps), gap(8))
        if (summary.installedApps.isNotEmpty()) {
            column.addView(actionButton("Save blocked apps") { saveBlockedApps() }, gap(12))
        }
```

- [ ] **Step 4: Add the `appPicker` and `saveBlockedApps` helpers**

Inside the class, after the existing `saveCategories()` function, add:

```kotlin

    /**
     * Builds the apps picker. If the child hasn't synced its inventory yet,
     * shows a single waiting caption instead of an empty box.
     */
    private fun appPicker(installed: List<InstalledApp>, blocked: Set<String>): View {
        appBoxes.clear()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(Style.WHITE_CHIP, dp(22).toFloat())
            setPadding(dp(22), dp(18), dp(22), dp(18))
        }
        if (installed.isEmpty()) {
            val waiting = TextView(this).apply {
                text = "Waiting for the child phone to sync its app list…"
                textSize = 13.5f
                setTextColor(Style.MUTED)
            }
            column.addView(waiting)
            return column
        }
        for (app in installed) {
            val box = CheckBox(this).apply {
                text = app.label
                textSize = 15f
                setTextColor(Style.INK)
                isChecked = app.packageName in blocked
            }
            appBoxes[app.packageName] = box
            column.addView(box)
        }
        return column
    }

    private fun saveBlockedApps() {
        val pairingId = intent.getStringExtra(EXTRA_PAIRING_ID) ?: return
        val chosen = appBoxes.filterValues { it.isChecked }.keys.toSet()
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) { repo.sendSetBlockedApps(pairingId, chosen) }
            Toast.makeText(
                this@ChildDashboardActivity,
                if (ok) "Sent — the phone updates shortly"
                else "Couldn't send — check your connection",
                Toast.LENGTH_LONG,
            ).show()
        }
    }
```

- [ ] **Step 5: Verify it compiles**

```bash
./gradlew :app:compileDebugKotlin
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 6: Build the APK end-to-end and run the test suite**

```bash
./gradlew :app:assembleDebug && ./gradlew :app:testDebugUnitTest
```
Expected: BUILD SUCCESSFUL on both, all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/parent/ChildDashboardActivity.kt && \
  git commit -m "feat(parent): BLOCKED APPS picker on child dashboard"
```

---

## Task 8: Manual verification on devices

No code changes — this is "does the round-trip work in real life".

**Devices:**
- Emulator `emulator-5554` — child
- Vivo (wireless ADB) — parent

- [ ] **Step 1: Install on the emulator**

```bash
adb -s emulator-5554 install -r \
  /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success`. No `uninstall` first — we want to keep the existing pairing and category settings.

- [ ] **Step 2: Install on the Vivo**

```bash
adb devices
V="<paste the Vivo serial — usually adb-…_adb-tls-connect._tcp>"
if [ -z "$V" ]; then echo "VIVO SERIAL EMPTY — abort"; exit 1; fi
adb -s "$V" install -r \
  /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success`. If Vivo offline, reconnect via wireless ADB first.

- [ ] **Step 3: Trigger an immediate child sync**

Open SafeBrowse on the emulator. It launches the home screen → `scheduleFamilySync` runs → an immediate one-time `FamilySyncWorker` fires. Within ~30 s the parent should see the updated summary on next pull.

If you'd rather not wait, force a sync from a terminal:

```bash
adb -s emulator-5554 shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS \
  -p uk.co.cyberheroez.oroq
```

(This is the WorkManager diagnostic broadcast — it just logs state; the real way to force-run is to simply restart the app, which `scheduleFamilySync` covers.)

- [ ] **Step 4: Verify the new dashboard section appears**

Open SafeBrowse on the Vivo → tap the child's card. Scroll past BLOCKED CATEGORIES. Expect a new BLOCKED APPS section listing the emulator's user apps alphabetically (Chrome, Settings should be absent — they're system).

If the section shows "Waiting for the child phone to sync its app list…", the sync hasn't landed yet. Wait ~30 s and re-open the dashboard.

- [ ] **Step 5: Verify the block round-trip**

On the parent:
1. Tick a harmless app installed on the emulator (e.g. Chrome — actually a system app and won't be listed; pick any sideloaded app or the default browser variant).
2. Tap "Save blocked apps".
3. Expect toast: "Sent — the phone updates shortly".

On the emulator, within ~30 s:
- Open that app. Expect the SafeBrowse BLOCK screen ("App blocked") to appear immediately.

Then on the parent, untick the app and save again. On the emulator, opening it now works normally.

- [ ] **Step 6: Verify inventory refresh on app install**

On the emulator, install any APK (e.g. `adb -s emulator-5554 install some.apk`). Wait one sync cycle (~15 min) OR reopen the SafeBrowse app to trigger immediate sync. Reopen the parent dashboard. Expect the new app to appear in the BLOCKED APPS picker.

- [ ] **Step 7: Update the project memory file**

Append a one-line note to `/Users/apple/.claude/projects/-Users-apple-Desktop-Projects-safebrowse-ai/memory/project_native_app_direction.md`:

> Remote app blocking COMPLETE (2026-05-23). Child inventory (`InstalledApp` list, user apps only) syncs in `FamilySummary`. New `SET_BLOCKED_APPS` command applied without VPN restart (AppMonitorService polls every 1s). Parent dashboard BLOCKED APPS picker.

No git commit — memory lives outside the repo.

---

## Self-review notes

This plan covers every section of the spec:

- Spec §"Child — inventory and reading" → Tasks 1 + 3 (worker calls `listUserApps`).
- Spec §"FamilySummary additions" → Task 2.
- Spec §"New command — SET_BLOCKED_APPS" → Task 4 (constant + tests) + Task 5 (apply on child).
- Spec §"Parent — repository + UI" → Tasks 6 + 7.
- Spec §"Testing" — unit assertions live in Tasks 2 and 4; manual flow in Task 8.

Type / name consistency across tasks:
- `InstalledApp(packageName, label)` defined Task 1, used Tasks 2, 3, 7.
- `listUserApps(context)` defined Task 1, called Task 3.
- `FamilyCommand.SET_BLOCKED_APPS` defined Task 4, used Tasks 5, 6.
- `installedApps`, `blockedApps` fields on `FamilySummary` (Task 2) read in Task 7's `appPicker(summary.installedApps, summary.blockedApps)`.
- `sendSetBlockedApps(pairingId, packageNames)` defined Task 6, called Task 7's `saveBlockedApps`.
- `appBoxes` map (Task 7 step 2) read in `saveBlockedApps` (Task 7 step 4).
- `restartVpnIfActive` is **not** called for `SET_BLOCKED_APPS` — `AppMonitorService` re-reads `getBlockedApps()` every tick, matching the spec.
