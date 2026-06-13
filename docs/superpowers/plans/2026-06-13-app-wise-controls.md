# App-wise controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-app blocked-time-window schedules, default-deny app approval, and a protection heartbeat to OroQ's child/parent system, built entirely on the existing overlay-block mechanism.

**Architecture:** A pure decision core (`decideBlock` + a new `AppSchedule` model) decides ALLOW/BLOCK from config + clock; the existing `AppMonitorService` 1-second tick feeds it and shows `BlockActivity`. Config lives in `ConfigRepository` (DataStore) and syncs parent→child via encrypted `FamilyCommand`s; child→parent state rides the existing `FamilySummary`. Pure logic carries the tests; Android wiring is verified by build + manual smoke.

**Tech Stack:** Kotlin, Android, DataStore Preferences, WorkManager, Jetpack Compose, `org.json`, `java.time`, JUnit4.

**Spec:** `docs/superpowers/specs/2026-06-13-app-wise-controls-design.md`

**Conventions (read once):**
- Module is `:app`. Unit tests live in `app/src/test/java/uk/co/cyberheroez/oroq/...` and use JUnit4 (`org.junit.Test`, `org.junit.Assert.*`).
- Run a single test class: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.<pkg>.<Class>"`
- Compile check: `./gradlew :app:compileDebugKotlin`
- Commit messages: imperative, scoped (e.g. `feat(monitor): ...`). **No `Co-Authored-By` trailer** (solo author).
- `DayOfWeek` = `java.time.DayOfWeek` (value 1=Mon … 7=Sun). Minutes-of-day are `0..1439`.

---

## File Structure

**New files:**
- `app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppSchedule.kt` — `Window` model, `isBlockedNow`, and JSON codecs for one app's windows and the full schedules map. Pure (no Android).
- `app/src/main/java/uk/co/cyberheroez/oroq/monitor/SystemApps.kt` — system-critical allowlist: a pure `systemCriticalPackages(home, dialer, ownPackage)` plus a thin Android resolver.
- `app/src/test/java/uk/co/cyberheroez/oroq/monitor/AppScheduleTest.kt`
- `app/src/test/java/uk/co/cyberheroez/oroq/monitor/SystemAppsTest.kt`

**Modified files:**
- `monitor/BlockDecision.kt` — new enum values + extended `decideBlock` precedence.
- `monitor/AppMonitorService.kt` — feed new inputs + clock; map new decisions.
- `ui/BlockActivity.kt` — copy for the two new reasons.
- `config/ConfigRepository.kt` — approvedApps + schedules persistence.
- `family/FamilyCommand.kt` — `SET_APPROVED_APPS`, `SET_APP_SCHEDULE` + a schedule payload codec.
- `family/CommandSync.kt` — apply the two new commands.
- `family/FamilySummary.kt` — `permissionsOk`, `approvedApps`, `schedules` fields + JSON.
- `family/FamilySyncWorker.kt` — populate the new summary fields.
- `parent/ParentRepository.kt` — `sendSetApprovedApps`, `sendSetAppSchedule`.
- `parent/screens/DeviceDetailScreen.kt` — Apps section (approve + schedule editor) + protection banner.

**Test files touched:** `monitor/BlockDecisionTest.kt`, `family/FamilyCommandTest.kt`, `family/FamilySummaryTest.kt`.

---

## Task 1: Schedule window model + `isBlockedNow`

**Files:**
- Create: `app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppSchedule.kt`
- Test: `app/src/test/java/uk/co/cyberheroez/oroq/monitor/AppScheduleTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package uk.co.cyberheroez.oroq.monitor

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek

class AppScheduleTest {

    private val mon = DayOfWeek.MONDAY
    private val tue = DayOfWeek.TUESDAY
    private val allDays = DayOfWeek.values().toSet()

    // Same-day window 09:00–17:00 (540..1020), every day.
    private val daytime = Window(540, 1020, allDays)
    // Overnight curfew 21:00–07:00 (1260..420), every day.
    private val curfew = Window(1260, 420, allDays)

    @Test fun insideSameDayWindowIsBlocked() {
        assertTrue(isBlockedNow(listOf(daytime), nowMinute = 600, today = mon))
    }

    @Test fun startMinuteIsInclusive() {
        assertTrue(isBlockedNow(listOf(daytime), nowMinute = 540, today = mon))
    }

    @Test fun endMinuteIsExclusive() {
        assertFalse(isBlockedNow(listOf(daytime), nowMinute = 1020, today = mon))
    }

    @Test fun outsideSameDayWindowIsAllowed() {
        assertFalse(isBlockedNow(listOf(daytime), nowMinute = 1100, today = mon))
    }

    @Test fun dayNotInSetIsAllowed() {
        val mondayOnly = Window(540, 1020, setOf(mon))
        assertFalse(isBlockedNow(listOf(mondayOnly), nowMinute = 600, today = tue))
    }

    @Test fun overnightEveningPortionBlocksOnStartDay() {
        // 22:00 Monday → inside the evening half of Monday's curfew.
        assertTrue(isBlockedNow(listOf(curfew), nowMinute = 1320, today = mon))
    }

    @Test fun overnightMorningPortionBelongsToPreviousDay() {
        // 06:00 Tuesday → still inside Monday's curfew that wrapped past midnight.
        assertTrue(isBlockedNow(listOf(curfew), nowMinute = 360, today = tue))
    }

    @Test fun overnightMorningBlockedOnlyIfPreviousDayInSet() {
        // Curfew runs Monday nights only. 06:00 Tuesday is the tail of Monday's
        // window, so it blocks; 06:00 Wednesday (tail of Tuesday, not in set) does not.
        val monNight = Window(1260, 420, setOf(mon))
        assertTrue(isBlockedNow(listOf(monNight), nowMinute = 360, today = tue))
        assertFalse(isBlockedNow(listOf(monNight), nowMinute = 360, today = DayOfWeek.WEDNESDAY))
    }

    @Test fun emptyWindowsNeverBlocks() {
        assertFalse(isBlockedNow(emptyList(), nowMinute = 600, today = mon))
    }

    @Test fun anyMatchingWindowBlocks() {
        assertTrue(isBlockedNow(listOf(daytime, curfew), nowMinute = 1320, today = mon))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.AppScheduleTest"`
Expected: FAIL — `Window` / `isBlockedNow` unresolved.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package uk.co.cyberheroez.oroq.monitor

import java.time.DayOfWeek

/**
 * A blocked time window for one app. [startMinute]/[endMinute] are minutes
 * since local midnight (0..1439). A window where start < end is same-day; a
 * window where start > end wraps past midnight (overnight curfew) and its
 * morning tail belongs to the day it started on. [days] is the set of weekdays
 * the window's *start* falls on (default callers use all 7 = "every day").
 * start == end is treated as an empty window (never blocks).
 */
data class Window(
    val startMinute: Int,
    val endMinute: Int,
    val days: Set<DayOfWeek>,
)

/**
 * True if [nowMinute] on weekday [today] falls inside any of [windows].
 * start is inclusive, end is exclusive. Overnight windows are split into an
 * evening half (on the start day) and a morning half (which belongs to the
 * previous day's window).
 */
fun isBlockedNow(windows: List<Window>, nowMinute: Int, today: DayOfWeek): Boolean {
    for (w in windows) {
        when {
            w.startMinute < w.endMinute -> {
                if (today in w.days && nowMinute >= w.startMinute && nowMinute < w.endMinute) return true
            }
            w.startMinute > w.endMinute -> {
                // Evening half on the start day.
                if (today in w.days && nowMinute >= w.startMinute) return true
                // Morning half belongs to the previous day's window.
                if (today.minus(1) in w.days && nowMinute < w.endMinute) return true
            }
            // start == end → empty window, never blocks.
        }
    }
    return false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.AppScheduleTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppSchedule.kt \
        app/src/test/java/uk/co/cyberheroez/oroq/monitor/AppScheduleTest.kt
git commit -m "feat(monitor): add per-app schedule window model and isBlockedNow"
```

---

## Task 2: Schedule JSON codecs

Add codecs to `AppSchedule.kt`: one app's windows ↔ JSON array, and the full
`Map<package, List<Window>>` ↔ JSON object (for DataStore + summary storage).

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppSchedule.kt`
- Test: `app/src/test/java/uk/co/cyberheroez/oroq/monitor/AppScheduleTest.kt`

- [ ] **Step 1: Write the failing test (append to `AppScheduleTest`)**

```kotlin
    @Test fun windowsJsonRoundTrip() {
        val windows = listOf(
            Window(540, 1020, setOf(mon, tue)),
            Window(1260, 420, allDays),
        )
        val restored = windowsFromJson(windowsToJson(windows))
        assertEquals(windows, restored)
    }

    @Test fun schedulesMapRoundTrip() {
        val map = mapOf(
            "com.tiktok" to listOf(Window(1260, 420, allDays)),
            "com.game" to listOf(Window(960, 1080, setOf(mon))),
        )
        val restored = schedulesFromJson(schedulesToJson(map))
        assertEquals(map, restored)
    }

    @Test fun emptySchedulesMapRoundTrip() {
        assertEquals(emptyMap<String, List<Window>>(), schedulesFromJson(schedulesToJson(emptyMap())))
    }

    @Test fun malformedScheduleJsonIsEmpty() {
        assertEquals(emptyMap<String, List<Window>>(), schedulesFromJson("not json"))
    }
```

Add the import at the top of the test file:
```kotlin
import org.junit.Assert.assertEquals
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.AppScheduleTest"`
Expected: FAIL — codec functions unresolved.

- [ ] **Step 3: Write minimal implementation (append to `AppSchedule.kt`)**

```kotlin
import org.json.JSONArray
import org.json.JSONObject

/** One app's windows → JSON array of {s,e,days:[1..7]} (days are DayOfWeek.value). */
fun windowsToJson(windows: List<Window>): String {
    val arr = JSONArray()
    for (w in windows) {
        val days = JSONArray()
        for (d in w.days.sortedBy { it.value }) days.put(d.value)
        arr.put(JSONObject().put("s", w.startMinute).put("e", w.endMinute).put("days", days))
    }
    return arr.toString()
}

fun windowsFromJson(text: String): List<Window> = runCatching {
    val arr = JSONArray(text)
    val out = ArrayList<Window>(arr.length())
    for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        val daysArr = o.getJSONArray("days")
        val days = HashSet<DayOfWeek>(daysArr.length())
        for (j in 0 until daysArr.length()) days.add(DayOfWeek.of(daysArr.getInt(j)))
        out.add(Window(o.getInt("s"), o.getInt("e"), days))
    }
    out.toList()
}.getOrDefault(emptyList())

/** Full schedules map → JSON object { "pkg": [windows] }. */
fun schedulesToJson(schedules: Map<String, List<Window>>): String {
    val obj = JSONObject()
    for ((pkg, windows) in schedules) obj.put(pkg, JSONArray(windowsToJson(windows)))
    return obj.toString()
}

fun schedulesFromJson(text: String): Map<String, List<Window>> = runCatching {
    val obj = JSONObject(text)
    val out = HashMap<String, List<Window>>()
    for (key in obj.keys()) {
        val windows = windowsFromJson(obj.getJSONArray(key).toString())
        if (windows.isNotEmpty()) out[key] = windows
    }
    out.toMap()
}.getOrDefault(emptyMap())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.AppScheduleTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppSchedule.kt \
        app/src/test/java/uk/co/cyberheroez/oroq/monitor/AppScheduleTest.kt
git commit -m "feat(monitor): add JSON codecs for app schedules"
```

---

## Task 3: Extend `decideBlock` precedence

Add `BLOCK_UNAPPROVED` and `BLOCK_SCHEDULE`, and append the new inputs to
`decideBlock` with defaults so existing call sites and tests still compile and
behave identically (approval off when `approvedApps == null`).

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/monitor/BlockDecision.kt`
- Test: `app/src/test/java/uk/co/cyberheroez/oroq/monitor/BlockDecisionTest.kt`

- [ ] **Step 1: Write the failing test (append to `BlockDecisionTest`)**

```kotlin
    private val everyDay = java.time.DayOfWeek.values().toSet()

    @Test fun systemCriticalAppIsAlwaysAllowed() {
        assertEquals(
            BlockDecision.ALLOW,
            decideBlock(
                foregroundApp = "com.android.settings",
                todayMinutes = 999, blockedApps = setOf("com.android.settings"),
                limitMinutes = 60, extraMinutes = 0,
                approvedApps = emptySet(), systemCriticalApps = setOf("com.android.settings"),
            ),
        )
    }

    @Test fun unapprovedAppIsBlocked() {
        assertEquals(
            BlockDecision.BLOCK_UNAPPROVED,
            decideBlock(
                foregroundApp = "com.new.app", todayMinutes = 0, blockedApps = emptySet(),
                limitMinutes = 0, extraMinutes = 0, approvedApps = setOf("com.ok.app"),
            ),
        )
    }

    @Test fun approvedAppInBlockedWindowIsScheduleBlocked() {
        assertEquals(
            BlockDecision.BLOCK_SCHEDULE,
            decideBlock(
                foregroundApp = "com.tiktok", todayMinutes = 0, blockedApps = emptySet(),
                limitMinutes = 0, extraMinutes = 0, approvedApps = setOf("com.tiktok"),
                schedules = mapOf("com.tiktok" to listOf(Window(540, 1020, everyDay))),
                nowMinuteOfDay = 600, dayOfWeek = java.time.DayOfWeek.MONDAY,
            ),
        )
    }

    @Test fun approvedAppOutsideWindowIsAllowed() {
        assertEquals(
            BlockDecision.ALLOW,
            decideBlock(
                foregroundApp = "com.tiktok", todayMinutes = 0, blockedApps = emptySet(),
                limitMinutes = 0, extraMinutes = 0, approvedApps = setOf("com.tiktok"),
                schedules = mapOf("com.tiktok" to listOf(Window(540, 1020, everyDay))),
                nowMinuteOfDay = 1100, dayOfWeek = java.time.DayOfWeek.MONDAY,
            ),
        )
    }

    @Test fun unapprovedBeatsScheduleAndLegacyAndTimeUp() {
        // not approved → BLOCK_UNAPPROVED even though legacy + time-up also apply.
        assertEquals(
            BlockDecision.BLOCK_UNAPPROVED,
            decideBlock(
                foregroundApp = "com.x", todayMinutes = 999, blockedApps = setOf("com.x"),
                limitMinutes = 60, extraMinutes = 0, approvedApps = emptySet(),
            ),
        )
    }

    @Test fun nullApprovedAppsKeepsLegacyBehaviour() {
        // approvedApps default null → approval disabled; legacy blocklist still wins.
        assertEquals(
            BlockDecision.BLOCK_APP,
            decideBlock("com.bad.app", 10, setOf("com.bad.app"), 120, 0),
        )
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.BlockDecisionTest"`
Expected: FAIL — new enum values / params unresolved.

- [ ] **Step 3: Write minimal implementation (replace enum + `decideBlock` in `BlockDecision.kt`)**

```kotlin
/** What the monitor should do for the current foreground state. */
enum class BlockDecision { ALLOW, BLOCK_APP, BLOCK_UNAPPROVED, BLOCK_SCHEDULE, TIME_UP }

/**
 * Pure decision. Precedence (first match wins):
 *   1. system-critical app            → ALLOW
 *   2. app not approved (default-deny) → BLOCK_UNAPPROVED   (only when [approvedApps] != null)
 *   3. approved app inside a blocked schedule window → BLOCK_SCHEDULE
 *   4. legacy binary blocklist        → BLOCK_APP
 *   5. device-wide daily limit reached → TIME_UP
 *   6. otherwise                      → ALLOW
 *
 * The per-app params are appended with defaults so legacy callers keep their
 * original behaviour: [approvedApps] = null disables the approval gate, and an
 * empty [schedules]/[systemCriticalApps] plus null [dayOfWeek] disable those rules.
 */
fun decideBlock(
    foregroundApp: String?,
    todayMinutes: Int,
    blockedApps: Set<String>,
    limitMinutes: Int,
    extraMinutes: Int,
    approvedApps: Set<String>? = null,
    schedules: Map<String, List<Window>> = emptyMap(),
    systemCriticalApps: Set<String> = emptySet(),
    nowMinuteOfDay: Int = 0,
    dayOfWeek: java.time.DayOfWeek? = null,
): BlockDecision {
    if (foregroundApp != null && foregroundApp in systemCriticalApps) return BlockDecision.ALLOW
    if (approvedApps != null && foregroundApp != null && foregroundApp !in approvedApps) {
        return BlockDecision.BLOCK_UNAPPROVED
    }
    if (foregroundApp != null && dayOfWeek != null) {
        val windows = schedules[foregroundApp]
        if (windows != null && isBlockedNow(windows, nowMinuteOfDay, dayOfWeek)) {
            return BlockDecision.BLOCK_SCHEDULE
        }
    }
    if (foregroundApp != null && foregroundApp in blockedApps) return BlockDecision.BLOCK_APP
    if (limitMinutes > 0 && todayMinutes >= limitMinutes + extraMinutes) return BlockDecision.TIME_UP
    return BlockDecision.ALLOW
}
```

- [ ] **Step 4: Run the full BlockDecision suite (old + new must pass)**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.BlockDecisionTest"`
Expected: PASS (all legacy tests + the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/monitor/BlockDecision.kt \
        app/src/test/java/uk/co/cyberheroez/oroq/monitor/BlockDecisionTest.kt
git commit -m "feat(monitor): extend decideBlock with approval and schedule rules"
```

---

## Task 4: System-critical allowlist

A pure builder (testable) plus a thin Android resolver that fills in the
current home + dialer packages.

**Files:**
- Create: `app/src/main/java/uk/co/cyberheroez/oroq/monitor/SystemApps.kt`
- Test: `app/src/test/java/uk/co/cyberheroez/oroq/monitor/SystemAppsTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package uk.co.cyberheroez.oroq.monitor

import org.junit.Assert.assertTrue
import org.junit.Test

class SystemAppsTest {

    @Test fun includesOwnPackageAndStaticEssentials() {
        val set = systemCriticalPackages(home = null, dialer = null, ownPackage = "uk.co.cyberheroez.oroq")
        assertTrue("uk.co.cyberheroez.oroq" in set)
        assertTrue("com.android.settings" in set)
        assertTrue("com.android.systemui" in set)
        assertTrue("com.android.vending" in set) // Play Store
    }

    @Test fun includesResolvedHomeAndDialerWhenPresent() {
        val set = systemCriticalPackages(
            home = "com.vendor.launcher", dialer = "com.vendor.dialer",
            ownPackage = "uk.co.cyberheroez.oroq",
        )
        assertTrue("com.vendor.launcher" in set)
        assertTrue("com.vendor.dialer" in set)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.SystemAppsTest"`
Expected: FAIL — `systemCriticalPackages` unresolved.

- [ ] **Step 3: Write minimal implementation**

```kotlin
package uk.co.cyberheroez.oroq.monitor

import android.content.Context
import android.content.Intent
import android.telecom.TelecomManager

/**
 * Packages OroQ must never block, or it would brick the device (and trip Play
 * review). The current home launcher and default dialer are resolved at runtime
 * by [systemCriticalApps]; the static set covers OS surfaces an emergency or
 * recovery action needs.
 */
fun systemCriticalPackages(home: String?, dialer: String?, ownPackage: String): Set<String> {
    val set = mutableSetOf(
        ownPackage,
        "com.android.settings",
        "com.android.systemui",
        "com.android.vending",          // Play Store
        "com.google.android.dialer",    // common stock dialer
        "com.android.phone",            // emergency / telephony UI
        "com.android.emergency",
    )
    if (!home.isNullOrBlank()) set.add(home)
    if (!dialer.isNullOrBlank()) set.add(dialer)
    return set
}

/** Resolves the live system-critical set for [context]. */
fun systemCriticalApps(context: Context): Set<String> {
    val pm = context.packageManager
    val home = runCatching {
        pm.resolveActivity(
            Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0,
        )?.activityInfo?.packageName
    }.getOrNull()
    val dialer = runCatching {
        (context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage
    }.getOrNull()
    return systemCriticalPackages(home, dialer, context.packageName)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.monitor.SystemAppsTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/monitor/SystemApps.kt \
        app/src/test/java/uk/co/cyberheroez/oroq/monitor/SystemAppsTest.kt
git commit -m "feat(monitor): add system-critical app allowlist"
```

---

## Task 5: ConfigRepository — approvedApps + schedules

DataStore accessors. (DataStore needs an Android context, so — matching the
existing repo, which has no `ConfigRepository` unit test — this task is verified
by compile; behaviour is exercised end-to-end in Task 7 and manual smoke.)

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/config/ConfigRepository.kt`

- [ ] **Step 1: Add keys and accessors**

In `object Keys`, add:
```kotlin
        val APPROVED_APPS = stringSetPreferencesKey("approved_apps")
        val APP_SCHEDULES = stringPreferencesKey("app_schedules_json")
```

Add these imports at the top:
```kotlin
import uk.co.cyberheroez.oroq.monitor.Window
import uk.co.cyberheroez.oroq.monitor.schedulesFromJson
import uk.co.cyberheroez.oroq.monitor.schedulesToJson
```

Add these methods to the class body (next to `getBlockedApps`):
```kotlin
    /** Packages the parent has approved. Absent = unapproved (default-deny). */
    suspend fun getApprovedApps(): Set<String> =
        store.data.first()[Keys.APPROVED_APPS] ?: emptySet()

    suspend fun setApprovedApps(apps: Set<String>) {
        store.edit { it[Keys.APPROVED_APPS] = apps }
    }

    /** Per-app blocked-time-window schedules. */
    suspend fun getSchedules(): Map<String, List<Window>> =
        schedulesFromJson(store.data.first()[Keys.APP_SCHEDULES] ?: "")

    /** Replaces the schedule for one package; an empty list clears it. */
    suspend fun setAppSchedule(pkg: String, windows: List<Window>) {
        store.edit { prefs ->
            val current = schedulesFromJson(prefs[Keys.APP_SCHEDULES] ?: "").toMutableMap()
            if (windows.isEmpty()) current.remove(pkg) else current[pkg] = windows
            prefs[Keys.APP_SCHEDULES] = schedulesToJson(current)
        }
    }
```

- [ ] **Step 2: Compile check**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/config/ConfigRepository.kt
git commit -m "feat(config): persist approved apps and per-app schedules"
```

---

## Task 6: FamilyCommand — new types + schedule payload codec

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyCommand.kt`
- Test: `app/src/test/java/uk/co/cyberheroez/oroq/family/FamilyCommandTest.kt`

- [ ] **Step 1: Write the failing test (append to `FamilyCommandTest`)**

```kotlin
    @Test fun appSchedulePayloadRoundTrip() {
        val windows = listOf(
            uk.co.cyberheroez.oroq.monitor.Window(
                1260, 420, java.time.DayOfWeek.values().toSet(),
            ),
        )
        val payload = appSchedulePayload("com.tiktok", windows)
        val (pkg, restored) = parseAppSchedulePayload(payload)
        assertEquals("com.tiktok", pkg)
        assertEquals(windows, restored)
    }

    @Test fun appScheduleEmptyWindowsRoundTrip() {
        val payload = appSchedulePayload("com.x", emptyList())
        val (pkg, restored) = parseAppSchedulePayload(payload)
        assertEquals("com.x", pkg)
        assertEquals(emptyList<uk.co.cyberheroez.oroq.monitor.Window>(), restored)
    }
```

Ensure the test file imports `org.junit.Assert.assertEquals` (existing tests in
this file already use it; add if missing).

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCommandTest"`
Expected: FAIL — `appSchedulePayload` / `parseAppSchedulePayload` unresolved.

- [ ] **Step 3: Write minimal implementation**

In `FamilyCommand.companion object`, add:
```kotlin
        const val SET_APPROVED_APPS = "set_approved_apps"
        const val SET_APP_SCHEDULE = "set_app_schedule"
```

At the bottom of `FamilyCommand.kt` (file scope), add the payload codec:
```kotlin
/**
 * Encodes a SET_APP_SCHEDULE payload: `{ "pkg": "...", "windows": [ ... ] }`.
 * Windows reuse the same shape as [windowsToJson].
 */
fun appSchedulePayload(pkg: String, windows: List<uk.co.cyberheroez.oroq.monitor.Window>): String =
    JSONObject()
        .put("pkg", pkg)
        .put("windows", org.json.JSONArray(uk.co.cyberheroez.oroq.monitor.windowsToJson(windows)))
        .toString()

/** Parses a SET_APP_SCHEDULE payload back into (package, windows). */
fun parseAppSchedulePayload(text: String): Pair<String, List<uk.co.cyberheroez.oroq.monitor.Window>> {
    val o = JSONObject(text)
    val windows = uk.co.cyberheroez.oroq.monitor.windowsFromJson(
        o.optJSONArray("windows")?.toString() ?: "[]",
    )
    return o.getString("pkg") to windows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCommandTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyCommand.kt \
        app/src/test/java/uk/co/cyberheroez/oroq/family/FamilyCommandTest.kt
git commit -m "feat(family): add SET_APPROVED_APPS and SET_APP_SCHEDULE commands"
```

---

## Task 7: CommandSync — apply the new commands

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/family/CommandSync.kt`

- [ ] **Step 1: Add the two `when` branches**

Inside the `when (command.type)` block in `pollAndApplyCommands`, add after the
`SET_BLOCKED_APPS` branch:
```kotlin
            FamilyCommand.SET_APPROVED_APPS -> {
                val pkgs = command.stringValue
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
                config.setApprovedApps(pkgs)
            }
            FamilyCommand.SET_APP_SCHEDULE -> {
                val (pkg, windows) = parseAppSchedulePayload(command.stringValue)
                config.setAppSchedule(pkg, windows)
            }
```

- [ ] **Step 2: Compile check**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/family/CommandSync.kt
git commit -m "feat(family): apply approved-apps and app-schedule commands on child"
```

---

## Task 8: AppMonitorService — feed new inputs + clock

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppMonitorService.kt`

- [ ] **Step 1: Resolve the system-critical set once per loop**

In `runLoop()`, after `val config = ConfigRepository(applicationContext)`, add:
```kotlin
        val systemCritical = systemCriticalApps(applicationContext)
```

- [ ] **Step 2: Pass the new inputs + clock to `decideBlock`**

Replace the `decideBlock(...)` call inside `runBlocking { ... }` with:
```kotlin
                        val now = java.time.LocalTime.now()
                        val decision = runBlocking {
                            decideBlock(
                                foregroundApp = foreground,
                                todayMinutes = usage.todayForegroundMinutes(),
                                blockedApps = config.getBlockedApps(),
                                limitMinutes = config.getDailyLimitMinutes(),
                                extraMinutes = config.getExtraMinutes(),
                                approvedApps = config.getApprovedApps(),
                                schedules = config.getSchedules(),
                                systemCriticalApps = systemCritical,
                                nowMinuteOfDay = now.hour * 60 + now.minute,
                                dayOfWeek = java.time.LocalDate.now().dayOfWeek,
                            )
                        }
```

- [ ] **Step 3: Handle the two new decisions in the `when`**

Replace the `when (decision) { ... }` block with:
```kotlin
                        when (decision) {
                            BlockDecision.BLOCK_APP, BlockDecision.BLOCK_UNAPPROVED -> {
                                foreground?.let { pkg ->
                                    if (pkg != lastBlockedApp) {
                                        lastBlockedApp = pkg
                                        blockLog.record("app", appLabel(pkg))
                                    }
                                }
                                val reason = if (decision == BlockDecision.BLOCK_UNAPPROVED) {
                                    BlockActivity.REASON_UNAPPROVED
                                } else {
                                    BlockActivity.REASON_APP
                                }
                                showBlock(reason)
                            }
                            BlockDecision.BLOCK_SCHEDULE -> showBlock(BlockActivity.REASON_SCHEDULE)
                            BlockDecision.TIME_UP -> showBlock(BlockActivity.REASON_TIME)
                            BlockDecision.ALLOW -> {}
                        }
```

> Note: `lastBlockedApp` is reset to allow re-showing — leave the existing reset
> behaviour as-is; the schedule reason clears itself when the clock leaves the
> window because the next tick returns ALLOW and shows nothing.

- [ ] **Step 4: Compile check**

Run: `./gradlew :app:compileDebugKotlin`
Expected: FAIL — `REASON_UNAPPROVED` / `REASON_SCHEDULE` not yet defined (added in Task 9). This is expected; proceed to Task 9, then re-compile.

- [ ] **Step 5: Commit (after Task 9 compiles)**

Hold this commit until Task 9 is done, then:
```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppMonitorService.kt
git commit -m "feat(monitor): enforce approval and schedules in the monitor loop"
```

---

## Task 9: BlockActivity — copy for the new reasons

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/ui/BlockActivity.kt`

- [ ] **Step 1: Add reason constants**

In `BlockActivity.companion object`, add:
```kotlin
        const val REASON_UNAPPROVED = "UNAPPROVED"
        const val REASON_SCHEDULE = "SCHEDULE"
```

- [ ] **Step 2: Render copy for the new reasons**

In `BlockScreen`, replace the title/body `Text(...)` so all four reasons are
covered (keep the existing accent logic; the new reasons use the Danger accent
like `REASON_APP`):
```kotlin
    val isTime = reason == BlockActivity.REASON_TIME
    val accent = if (isTime) OroqColors.BluePrimary else OroqColors.Danger
    val title = when (reason) {
        BlockActivity.REASON_TIME -> "Screen time's up"
        BlockActivity.REASON_UNAPPROVED -> "Not allowed yet"
        BlockActivity.REASON_SCHEDULE -> "Blocked right now"
        else -> "App blocked"
    }
    val body = when (reason) {
        BlockActivity.REASON_TIME ->
            "Today's screen-time limit has been reached. A parent can grant more time remotely."
        BlockActivity.REASON_UNAPPROVED ->
            "Ask a parent to approve this app before you can use it."
        BlockActivity.REASON_SCHEDULE ->
            "This app is outside its allowed hours. It'll unlock automatically later."
        else -> "This app has been blocked by OroQ."
    }
```
Then use `title` and `body` in the two `Text(...)` composables that previously
used the inline `if (isTime) ... else ...` strings.

- [ ] **Step 3: Compile check (Task 8 + 9 together)**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit BlockActivity, then the held AppMonitorService change**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/ui/BlockActivity.kt
git commit -m "feat(ui): add block-screen copy for unapproved and scheduled blocks"
git add app/src/main/java/uk/co/cyberheroez/oroq/monitor/AppMonitorService.kt
git commit -m "feat(monitor): enforce approval and schedules in the monitor loop"
```

---

## Task 10: FamilySummary — heartbeat + per-app state fields

Add `permissionsOk` (heartbeat), `approvedApps`, and `schedules` so the parent
UI can render current child state. `ts` already serves as "last seen".

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySummary.kt`
- Test: `app/src/test/java/uk/co/cyberheroez/oroq/family/FamilySummaryTest.kt`

- [ ] **Step 1: Write the failing test (append to `FamilySummaryTest`)**

```kotlin
    @Test fun heartbeatAndPerAppFieldsRoundTrip() {
        val summary = FamilySummary(
            ts = 123L,
            protectionOn = true,
            screenTimeTodayMin = 30,
            dailyLimitMin = 120,
            permissionsOk = false,
            approvedApps = setOf("com.ok"),
            schedules = mapOf(
                "com.tiktok" to listOf(
                    uk.co.cyberheroez.oroq.monitor.Window(
                        1260, 420, java.time.DayOfWeek.values().toSet(),
                    ),
                ),
            ),
        )
        val restored = parseSummary(summary.toJson())
        assertEquals(false, restored.permissionsOk)
        assertEquals(setOf("com.ok"), restored.approvedApps)
        assertEquals(summary.schedules, restored.schedules)
    }

    @Test fun missingHeartbeatFieldsDefault() {
        // Old children won't send the new fields; parse must default safely.
        val json = org.json.JSONObject()
            .put("ts", 1L).put("protectionOn", true)
            .put("screenTimeTodayMin", 0).put("dailyLimitMin", 0)
            .put("webBlockedToday", 0).put("appBlockedToday", 0)
            .toString()
        val s = parseSummary(json)
        assertEquals(true, s.permissionsOk) // default = assume ok for legacy
        assertEquals(emptySet<String>(), s.approvedApps)
        assertEquals(emptyMap<String, List<uk.co.cyberheroez.oroq.monitor.Window>>(), s.schedules)
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilySummaryTest"`
Expected: FAIL — new fields unresolved.

- [ ] **Step 3: Implement**

Add to the `FamilySummary` data class (after `ytRestrictedOn`):
```kotlin
    /** Heartbeat: all core child permissions (VPN, usage, overlay) are granted. */
    val permissionsOk: Boolean = true,
    /** Packages the parent has approved on the child (default-deny mirror). */
    val approvedApps: Set<String> = emptySet(),
    /** Per-app blocked-time-window schedules currently on the child. */
    val schedules: Map<String, List<uk.co.cyberheroez.oroq.monitor.Window>> = emptyMap(),
```

In `FamilySummary.toJson()`, before `.toString()`, add these puts (and build the
approved array first):
```kotlin
    val approved = JSONArray()
    for (pkg in approvedApps) approved.put(pkg)
```
```kotlin
        .put("permissionsOk", permissionsOk)
        .put("approvedApps", approved)
        .put("schedules", JSONObject(uk.co.cyberheroez.oroq.monitor.schedulesToJson(schedules)))
```

In `parseSummary(...)`, before the `return FamilySummary(`, add:
```kotlin
    val approved = HashSet<String>()
    val approvedArray = json.optJSONArray("approvedApps")
    if (approvedArray != null) {
        for (i in 0 until approvedArray.length()) approved.add(approvedArray.getString(i))
    }
    val schedules = uk.co.cyberheroez.oroq.monitor.schedulesFromJson(
        json.optJSONObject("schedules")?.toString() ?: "",
    )
```
and add to the `FamilySummary(...)` constructor call:
```kotlin
        permissionsOk = json.optBoolean("permissionsOk", true),
        approvedApps = approved,
        schedules = schedules,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilySummaryTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySummary.kt \
        app/src/test/java/uk/co/cyberheroez/oroq/family/FamilySummaryTest.kt
git commit -m "feat(family): add heartbeat and per-app state to the child summary"
```

---

## Task 11: FamilySyncWorker — populate the new summary fields

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySyncWorker.kt`

- [ ] **Step 1: Compute heartbeat + per-app state and pass to `buildSummary`**

In `doWork()`, before the `buildSummary(` call, add:
```kotlin
        val permissionsOk = usage.hasUsageAccess() &&
            android.provider.Settings.canDrawOverlays(applicationContext) &&
            android.net.VpnService.prepare(applicationContext) == null
```

Add these named args to the `buildSummary(...)` call:
```kotlin
            permissionsOk = permissionsOk,
            approvedApps = config.getApprovedApps(),
            schedules = config.getSchedules(),
```

- [ ] **Step 2: Extend `buildSummary`**

Open `app/src/main/java/uk/co/cyberheroez/oroq/family/SummaryBuilder.kt`, add the
three parameters to the `buildSummary` signature (with defaults so any other
caller still compiles):
```kotlin
    permissionsOk: Boolean = true,
    approvedApps: Set<String> = emptySet(),
    schedules: Map<String, List<uk.co.cyberheroez.oroq.monitor.Window>> = emptyMap(),
```
and pass them through into the `FamilySummary(...)` it constructs:
```kotlin
        permissionsOk = permissionsOk,
        approvedApps = approvedApps,
        schedules = schedules,
```

- [ ] **Step 3: Compile check**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySyncWorker.kt \
        app/src/main/java/uk/co/cyberheroez/oroq/family/SummaryBuilder.kt
git commit -m "feat(family): report heartbeat and per-app state from the child"
```

---

## Task 12: ParentRepository — new senders

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentRepository.kt`

- [ ] **Step 1: Add the two senders (next to `sendSetBlockedApps`)**

```kotlin
    /** Convenience wrapper: tells the child exactly which apps are approved. */
    fun sendSetApprovedApps(pairingId: String, packageNames: Set<String>): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_APPROVED_APPS,
                stringValue = packageNames.joinToString(","),
            ),
        )

    /** Convenience wrapper: sets (or clears, when [windows] is empty) one app's schedule. */
    fun sendSetAppSchedule(
        pairingId: String,
        pkg: String,
        windows: List<uk.co.cyberheroez.oroq.monitor.Window>,
    ): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_APP_SCHEDULE,
                stringValue = uk.co.cyberheroez.oroq.family.appSchedulePayload(pkg, windows),
            ),
        )
```

- [ ] **Step 2: Compile check**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentRepository.kt
git commit -m "feat(parent): senders for approved-apps and app-schedule commands"
```

---

## Task 13: Parent UI — Apps section, schedule editor, protection banner

`DeviceDetailScreen.kt` already renders a "Blocked apps" card from
`summary.installedApps` with per-app toggles, and a screen-time card. **Read the
file first** and follow its existing card/composable style. This task adds three
things; keep each as its own committable change.

**Files:**
- Modify: `app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/DeviceDetailScreen.kt`

- [ ] **Step 1: Protection banner**

At the top of the detail content, add a banner derived from the summary:
```kotlin
@Composable
private fun ProtectionBanner(summary: FamilySummary, nowMs: Long) {
    val stale = nowMs - summary.ts > 35 * 60 * 1000L // > ~2 sync cycles
    val (text, color) = when {
        stale -> "Protection offline — last seen ${'$'}{minutesAgo(summary.ts, nowMs)} min ago" to OroqColors.Danger
        !summary.permissionsOk -> "Permissions turned off on the child device" to OroqColors.Danger
        !summary.protectionOn -> "Web protection is off" to OroqColors.Danger
        else -> "Protection active" to OroqColors.Success
    }
    // Render a pill/row using the screen's existing card style with [color] + [text].
}
```
Add a small helper `private fun minutesAgo(ts: Long, now: Long) = ((now - ts) / 60000L).toInt()`.
Call `ProtectionBanner(summary, System.currentTimeMillis())` near the top of the
detail column.

- [ ] **Step 2: Apps section — approve toggles (replace/augment the blocked-apps card)**

For each `app` in `summary.installedApps`, render a row with an **Approve**
switch whose state is `app.packageName in summary.approvedApps`. On toggle,
recompute the full approved set and call the repository off the main thread:
```kotlin
// inside a rememberCoroutineScope().launch { withContext(Dispatchers.IO) { ... } }
val next = if (approve) summary.approvedApps + app.packageName
           else summary.approvedApps - app.packageName
ParentRepository(context).sendSetApprovedApps(pairingId, next)
```
Add a helper line under the section header: "New apps your child installs stay
blocked until you approve them here." Follow the existing toggle pattern used by
the blocked-apps card (same `sendSetBlockedApps`-style coroutine wiring).

- [ ] **Step 3: Schedule editor (per approved app)**

Add a "Set schedule" affordance on each approved row that opens an editor
(dialog or expandable section) bound to `summary.schedules[app.packageName] ?: emptyList()`:
- A list of windows; each window row has a start `TimePicker`/time field, an end
  time field, and seven day chips (S M T W T F S) — all selected by default for
  a new window. Times map to minute-of-day (`hour*60 + minute`); day chips map to
  `java.time.DayOfWeek`.
- "Add window" appends a default `Window(1260, 420, DayOfWeek.values().toSet())`.
- "Save" sends the full window list for that package:
```kotlin
ParentRepository(context).sendSetAppSchedule(pairingId, app.packageName, editedWindows)
```
- Removing all windows and saving clears the schedule (the empty-list path).

- [ ] **Step 4: Compile check**

Run: `./gradlew :app:compileDebugKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/DeviceDetailScreen.kt
git commit -m "feat(parent): app approval, per-app schedule editor, protection banner"
```

---

## Task 14: Full build, install, manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit-test suite**

Run: `./gradlew :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL, all tests pass.

- [ ] **Step 2: Build + install debug on both devices**

```bash
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"
./gradlew :app:assembleDebug
APK=app/build/outputs/apk/debug/app-debug.apk
for S in emulator-5554; do adb -s "$S" install -r "$APK"; done
# Vivo via transport id (find with: adb devices -l | grep -v emulator)
```
Expected: `Success` on each device.

- [ ] **Step 3: Manual smoke (child = emulator or Vivo)**

Verify, using `adb logcat` + on-screen behaviour:
1. **Default-deny:** after pairing, open an app the parent has NOT approved →
   the block screen shows "Not allowed yet". A system-critical app (Settings,
   Phone, launcher) is never blocked.
2. **Approval:** parent approves that app → within ~60s (command poll) the app
   opens normally.
3. **Schedule:** parent sets a blocked window covering "now" for an approved app
   → opening it shows "Blocked right now"; set the window to NOT cover now →
   it opens. (For a quick test, use a window like now-1min … now+5min.)
4. **Heartbeat:** revoke usage access on the child → on the next sync the parent
   detail shows "Permissions turned off"; kill the app / leave it offline past
   ~35 min → "Protection offline".

- [ ] **Step 4: Commit (if any smoke fixes were needed)**

Commit any fixes with a `fix(...)` message. If everything passed with no code
change, nothing to commit here.

---

## Self-Review notes (already applied)

- **Spec coverage:** per-app schedule (Tasks 1–3, 8, 13), default-deny approval
  (Tasks 3, 5–9, 13), system-critical allowlist (Task 4, 8), sync both
  directions (Tasks 5–7, 10–12), parent UI (Task 13), heartbeat (Tasks 10, 11,
  13), test plan (pure-logic tests in Tasks 1–3, 6, 10).
- **Backward compatibility:** `decideBlock` new params are appended with
  defaults (legacy tests untouched); `parseSummary` defaults the new fields so
  old children parse; `buildSummary` new params have defaults.
- **Type consistency:** `Window(startMinute, endMinute, days)`,
  `isBlockedNow(windows, nowMinute, today)`, `schedulesToJson/FromJson`,
  `appSchedulePayload/parseAppSchedulePayload`, `getApprovedApps/setApprovedApps`,
  `getSchedules/setAppSchedule`, `sendSetApprovedApps/sendSetAppSchedule`,
  `SET_APPROVED_APPS/SET_APP_SCHEDULE`, `REASON_UNAPPROVED/REASON_SCHEDULE` are
  used identically across tasks.
- **Out of scope (per spec):** per-app minute quotas, Device Admin, icon-hiding,
  Play-layer install approval, server-side heartbeat push trigger.
