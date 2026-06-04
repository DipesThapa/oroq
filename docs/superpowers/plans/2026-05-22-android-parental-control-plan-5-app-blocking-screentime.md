# Android Parental Control — Plan 5: App Blocking & Screen Time

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the v2 parental controls — an always-blocked app list and a daily screen-time limit with a "time's up" lock — to the SafeBrowse Android app.

**Architecture:** A foreground service polls Android's `UsageStatsManager` once per second for the current foreground app and today's usage, runs a pure decision function, and launches a full-screen `BlockActivity` when an app is blocked or the limit is reached. No Accessibility Service; `SYSTEM_ALERT_WINDOW` is declared only for the background-activity-launch exemption needed to show the block screen.

**Tech Stack:** Kotlin, Android Views, `UsageStatsManager`, foreground service, Preferences DataStore, JUnit 4.

**Reference:** Spec — `docs/superpowers/specs/2026-05-22-safebrowse-app-blocking-screentime-design.md`.

**Depends on:** Plans 1-4 (the MVP) — uses `ConfigRepository`, `ui/Style.kt`, `SafeBrowseVpnService`, `MainActivity`, `SettingsActivity`.

---

## File structure produced by this plan

```
android/app/src/main/
├─ AndroidManifest.xml          + permissions, service, 3 activities, <queries>
└─ java/uk/co/cyberheroez/safebrowse/
   ├─ config/ConfigRepository.kt   + v2 keys & accessors
   ├─ monitor/
   │  ├─ BlockDecision.kt          decideBlock() + effectiveExtraMinutes() (pure)
   │  ├─ UsageReader.kt            UsageStatsManager wrapper
   │  └─ AppMonitorService.kt      foreground poll service
   ├─ ui/
   │  ├─ BlockActivity.kt          full-screen block screen
   │  ├─ AppBlockActivity.kt       pick apps to block
   │  └─ ScreenTimeActivity.kt     usage view + daily-limit setter
   ├─ MainActivity.kt              start/stop the monitor with protection
   └─ ui/SettingsActivity.kt       + App blocking & Screen time rows

android/app/src/test/java/uk/co/cyberheroez/safebrowse/monitor/
└─ BlockDecisionTest.kt
```

---

## Task 1: Block decision logic

Pure, JVM-testable logic for what the monitor should do.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/monitor/BlockDecision.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/monitor/BlockDecisionTest.kt`

- [ ] **Step 1: Write the failing test**

Create `BlockDecisionTest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.monitor

import org.junit.Assert.assertEquals
import org.junit.Test

class BlockDecisionTest {

    @Test fun blockedAppIsBlocked() {
        assertEquals(
            BlockDecision.BLOCK_APP,
            decideBlock("com.bad.app", 10, setOf("com.bad.app"), 120, 0),
        )
    }

    @Test fun unblockedAppUnderLimitIsAllowed() {
        assertEquals(
            BlockDecision.ALLOW,
            decideBlock("com.ok.app", 10, setOf("com.bad.app"), 120, 0),
        )
    }

    @Test fun reachingTheLimitGivesTimeUp() {
        assertEquals(
            BlockDecision.TIME_UP,
            decideBlock("com.ok.app", 120, emptySet(), 120, 0),
        )
    }

    @Test fun extraMinutesPostponeTimeUp() {
        assertEquals(BlockDecision.ALLOW, decideBlock("com.ok.app", 130, emptySet(), 120, 30))
        assertEquals(BlockDecision.TIME_UP, decideBlock("com.ok.app", 150, emptySet(), 120, 30))
    }

    @Test fun zeroLimitMeansNoTimeUp() {
        assertEquals(BlockDecision.ALLOW, decideBlock("com.ok.app", 999, emptySet(), 0, 0))
    }

    @Test fun blockedAppTakesPrecedenceOverTimeUp() {
        assertEquals(
            BlockDecision.BLOCK_APP,
            decideBlock("com.bad.app", 999, setOf("com.bad.app"), 120, 0),
        )
    }

    @Test fun nullForegroundAppNeverBlocksApp() {
        assertEquals(BlockDecision.ALLOW, decideBlock(null, 10, setOf("com.bad.app"), 0, 0))
    }

    @Test fun extraMinutesOnlyCountOnTheDayGranted() {
        assertEquals(30, effectiveExtraMinutes(30, "2026-05-22", "2026-05-22"))
        assertEquals(0, effectiveExtraMinutes(30, "2026-05-21", "2026-05-22"))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*BlockDecisionTest"
```

Expected: FAIL — `BlockDecision` / `decideBlock` unresolved.

- [ ] **Step 3: Write the implementation**

Create `BlockDecision.kt`:

```kotlin
package uk.co.cyberheroez.oroq.monitor

/** What the monitor should do for the current foreground state. */
enum class BlockDecision { ALLOW, BLOCK_APP, TIME_UP }

/**
 * Pure decision. A blocked foreground app always wins; otherwise, if a daily
 * limit is set and today's usage has reached it (plus any granted extra), the
 * screen is timed out.
 */
fun decideBlock(
    foregroundApp: String?,
    todayMinutes: Int,
    blockedApps: Set<String>,
    limitMinutes: Int,
    extraMinutes: Int,
): BlockDecision {
    if (foregroundApp != null && foregroundApp in blockedApps) return BlockDecision.BLOCK_APP
    if (limitMinutes > 0 && todayMinutes >= limitMinutes + extraMinutes) return BlockDecision.TIME_UP
    return BlockDecision.ALLOW
}

/** Parent-granted extra minutes only count on the day they were granted. */
fun effectiveExtraMinutes(extraMinutes: Int, extraDate: String, today: String): Int =
    if (extraDate == today) extraMinutes else 0
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*BlockDecisionTest"
```

Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): app-block / screen-time decision logic"
```

---

## Task 2: Config keys for v2

Extends `ConfigRepository` with the blocked-app list, the daily limit, and the
parent-granted extra time.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/config/ConfigRepository.kt`

- [ ] **Step 1: Add the imports**

In `ConfigRepository.kt`, add to the existing imports:

```kotlin
import androidx.datastore.preferences.core.intPreferencesKey
import uk.co.cyberheroez.oroq.monitor.effectiveExtraMinutes
import java.time.LocalDate
```

- [ ] **Step 2: Add the keys**

Inside the `Keys` object, add:

```kotlin
        val BLOCKED_APPS = stringSetPreferencesKey("blocked_apps")
        val DAILY_LIMIT = intPreferencesKey("daily_limit_minutes")
        val EXTRA_MINUTES = intPreferencesKey("extra_minutes")
        val EXTRA_DATE = stringPreferencesKey("extra_date")
```

- [ ] **Step 3: Add the accessors**

Add these functions to the `ConfigRepository` class, before the closing brace:

```kotlin
    suspend fun getBlockedApps(): Set<String> =
        store.data.first()[Keys.BLOCKED_APPS] ?: emptySet()

    suspend fun setBlockedApps(apps: Set<String>) {
        store.edit { it[Keys.BLOCKED_APPS] = apps }
    }

    suspend fun getDailyLimitMinutes(): Int =
        store.data.first()[Keys.DAILY_LIMIT] ?: 0

    suspend fun setDailyLimitMinutes(minutes: Int) {
        store.edit { it[Keys.DAILY_LIMIT] = minutes }
    }

    /** Extra minutes still valid today (0 if the grant was on an earlier day). */
    suspend fun getExtraMinutes(): Int {
        val prefs = store.data.first()
        val minutes = prefs[Keys.EXTRA_MINUTES] ?: return 0
        val date = prefs[Keys.EXTRA_DATE] ?: return 0
        return effectiveExtraMinutes(minutes, date, LocalDate.now().toString())
    }

    /** Adds [minutes] of bonus time for today (accumulates if granted again). */
    suspend fun grantExtraMinutes(minutes: Int) {
        val today = LocalDate.now().toString()
        store.edit { prefs ->
            val existing = if (prefs[Keys.EXTRA_DATE] == today) prefs[Keys.EXTRA_MINUTES] ?: 0 else 0
            prefs[Keys.EXTRA_MINUTES] = existing + minutes
            prefs[Keys.EXTRA_DATE] = today
        }
    }
```

- [ ] **Step 4: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): config keys for app blocking & screen-time limit"
```

---

## Task 3: Usage reader

Wraps `UsageStatsManager` — the foreground app, today's usage, and whether the
Usage Access permission is granted.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/monitor/UsageReader.kt`

- [ ] **Step 1: Write `UsageReader.kt`**

```kotlin
package uk.co.cyberheroez.oroq.monitor

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import java.util.Calendar

/** Reads device-usage data from Android's UsageStatsManager. */
class UsageReader(private val context: Context) {

    private val usm =
        context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

    /** True if the user has granted Usage Access to this app. */
    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName,
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** True if the app may draw over other apps — needed to show the block screen. */
    fun canShowBlockScreen(): Boolean = Settings.canDrawOverlays(context)

    /** True when both monitoring permissions are granted. */
    fun monitoringReady(): Boolean = hasUsageAccess() && canShowBlockScreen()

    /** The package most recently moved to the foreground, or null. */
    fun currentForegroundApp(): String? {
        val end = System.currentTimeMillis()
        val events = usm.queryEvents(end - 10_000, end)
        val event = UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                last = event.packageName
            }
        }
        return last
    }

    /** Total foreground time across all apps since midnight, in minutes. */
    fun todayForegroundMinutes(): Int = todayUsageByApp().values.sum()

    /** Per-package foreground minutes since midnight (descending elsewhere). */
    fun todayUsageByApp(): Map<String, Int> {
        val start = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val now = System.currentTimeMillis()
        val totals = HashMap<String, Long>()
        for (stat in usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, now)) {
            if (stat.totalTimeInForeground <= 0) continue
            totals[stat.packageName] = (totals[stat.packageName] ?: 0L) + stat.totalTimeInForeground
        }
        return totals.mapValues { (it.value / 60_000L).toInt() }
    }

    companion object {
        /** Intent for the system Usage Access settings screen. */
        fun usageAccessIntent(): Intent =
            Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)

        /** Intent for the "display over other apps" settings screen for this app. */
        fun overlayIntent(context: Context): Intent =
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:${context.packageName}"),
            )
    }
}
```

> The block screen and the parent configuration screens use `monitoringReady()`
> to gate themselves and offer the two settings buttons when a permission is
> missing (Tasks 7 and 8).

- [ ] **Step 2: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): UsageStatsManager reader"
```

---

## Task 4: App-monitor service

A foreground service that polls every second and shows the block screen when
needed.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/monitor/AppMonitorService.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Declare permissions and the service in the manifest**

In `AndroidManifest.xml`, add these `<uses-permission>` lines after the existing
ones (before `<application>`):

```xml
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission
        android:name="android.permission.PACKAGE_USAGE_STATS"
        tools:ignore="ProtectedPermissions" />
```

Add this `<service>` inside `<application>`, after the `SafeBrowseVpnService`
service:

```xml
        <service
            android:name=".monitor.AppMonitorService"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="On-device app blocking and screen-time limits" />
        </service>
```

- [ ] **Step 2: Write `AppMonitorService.kt`**

```kotlin
package uk.co.cyberheroez.oroq.monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.runBlocking
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.ui.BlockActivity
import java.util.concurrent.atomic.AtomicBoolean

/** Foreground service: polls usage and shows the block screen when needed. */
class AppMonitorService : android.app.Service() {

    private val running = AtomicBoolean(false)
    private var worker: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running.compareAndSet(false, true)) {
            startForeground(NOTIFICATION_ID, buildNotification())
            worker = Thread { runLoop() }.also { it.start() }
        }
        return START_STICKY
    }

    private fun runLoop() {
        val usage = UsageReader(this)
        val config = ConfigRepository(applicationContext)
        while (running.get()) {
            try {
                if (usage.hasUsageAccess()) {
                    val foreground = usage.currentForegroundApp()
                    // Never block our own screens (incl. BlockActivity itself).
                    if (foreground != packageName) {
                        val decision = runBlocking {
                            decideBlock(
                                foregroundApp = foreground,
                                todayMinutes = usage.todayForegroundMinutes(),
                                blockedApps = config.getBlockedApps(),
                                limitMinutes = config.getDailyLimitMinutes(),
                                extraMinutes = config.getExtraMinutes(),
                            )
                        }
                        when (decision) {
                            BlockDecision.BLOCK_APP -> showBlock(BlockActivity.REASON_APP)
                            BlockDecision.TIME_UP -> showBlock(BlockActivity.REASON_TIME)
                            BlockDecision.ALLOW -> {}
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "monitor tick failed", e)
            }
            try {
                Thread.sleep(1000)
            } catch (e: InterruptedException) {
                break
            }
        }
    }

    private fun showBlock(reason: String) {
        try {
            startActivity(
                Intent(this, BlockActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(BlockActivity.EXTRA_REASON, reason)
            )
        } catch (e: Exception) {
            Log.w(TAG, "could not show block screen", e)
        }
    }

    override fun onDestroy() {
        running.set(false)
        worker?.interrupt()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "App & screen-time limits", NotificationManager.IMPORTANCE_LOW)
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("SafeBrowse limits are active")
            .setContentText("App blocking and screen-time limits are running")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "AppMonitor"
        private const val NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "safebrowse_monitor"
    }
}
```

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: FAIL — `BlockActivity` is unresolved (created in Task 5). Expected;
passes after Task 5.

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): app-monitor foreground service"
```

---

## Task 5: Block screen

The full-screen screen shown when an app is blocked or the limit is reached.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/BlockActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Declare the activity in the manifest**

In `AndroidManifest.xml`, add inside `<application>`, after the
`SettingsActivity` activity:

```xml
        <activity
            android:name=".ui.BlockActivity"
            android:exported="false"
            android:excludeFromRecents="true"
            android:launchMode="singleTask" />
```

- [ ] **Step 2: Write `BlockActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.ghostButton
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Full-screen screen shown when an app is blocked or screen time is up. */
class BlockActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val reason = intent.getStringExtra(EXTRA_REASON) ?: REASON_APP
        setContentView(if (reason == REASON_TIME) timeUpView() else appBlockedView())
    }

    /** Back returns to the launcher, never to the blocked app. */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = goHome()

    private fun appBlockedView(): View = screen(this) {
        card {
            cardTitle("App blocked")
            body("This app has been blocked by SafeBrowse.")
        }
        primaryButton("Go to home screen") { goHome() }
    }

    private fun timeUpView(): View = screen(this) {
        card {
            cardTitle("Screen time is up")
            body("Today's screen-time limit has been reached. A parent can grant more time with the PIN.")
        }
        primaryButton("Parent: grant 30 more minutes") { promptForExtraTime() }
        ghostButton("Go to home screen") { goHome() }
    }

    private fun promptForExtraTime() {
        showPinPrompt(
            context = this,
            title = "Enter parent PIN",
            onEntered = { pin ->
                lifecycleScope.launch {
                    if (config.verifyPin(pin)) {
                        config.grantExtraMinutes(30)
                        Toast.makeText(this@BlockActivity, "30 minutes granted", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        Toast.makeText(this@BlockActivity, "Wrong PIN", Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
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

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` (Task 4's `BlockActivity` reference now resolves).

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): block screen"
```

---

## Task 6: Start the monitor with protection

The Home screen's protection toggle should start and stop `AppMonitorService`
alongside the VPN.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/MainActivity.kt`

- [ ] **Step 1: Add the import**

In `MainActivity.kt`, add to the imports:

```kotlin
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
```

- [ ] **Step 2: Start/stop the monitor alongside the VPN**

In `MainActivity.kt`, replace `startVpnService` and `stopVpnService` with:

```kotlin
    private fun startVpnService() {
        startService(Intent(this, SafeBrowseVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
    }

    private fun stopVpnService() {
        startService(
            Intent(this, SafeBrowseVpnService::class.java)
                .setAction(SafeBrowseVpnService.ACTION_STOP)
        )
        stopService(Intent(this, AppMonitorService::class.java))
    }
```

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): run the app monitor with protection"
```

---

## Task 7: App-blocking screen

A parent screen that lists installed apps and saves which ones to block.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/MonitorPermissions.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/AppBlockActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/SettingsActivity.kt`

- [ ] **Step 1: Declare the activity and app-query visibility**

In `AndroidManifest.xml`, add this `<queries>` element as a direct child of
`<manifest>` (after the `<uses-permission>` lines, before `<application>`):

```xml
    <queries>
        <intent>
            <action android:name="android.intent.action.MAIN" />
            <category android:name="android.intent.category.LAUNCHER" />
        </intent>
    </queries>
```

Add this activity inside `<application>`, after `BlockActivity`:

```xml
        <activity
            android:name=".ui.AppBlockActivity"
            android:exported="false" />
```

- [ ] **Step 2: Write `MonitorPermissions.kt` (shared permission screen)**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Context
import android.view.View
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.ghostButton
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/**
 * A screen asking the parent to grant the two permissions app blocking and
 * screen time need: Usage Access and "display over other apps".
 */
fun monitorPermissionView(context: Context): View = screen(context) {
    card {
        cardTitle("Two permissions needed")
        body(
            "App blocking and screen-time limits need Usage Access (to see which " +
                "app is open) and permission to display over other apps (to show " +
                "the block screen)."
        )
    }
    primaryButton("Grant Usage Access") {
        context.startActivity(UsageReader.usageAccessIntent())
    }
    ghostButton("Grant display-over-apps") {
        context.startActivity(UsageReader.overlayIntent(context))
    }
}
```

- [ ] **Step 3: Write `AppBlockActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Parent screen: choose which installed apps to block. */
class AppBlockActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val usage by lazy { UsageReader(this) }
    private val boxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "App blocking"
    }

    override fun onResume() {
        super.onResume()
        // Re-checked each time so it updates after the user returns from settings.
        if (usage.monitoringReady()) {
            lifecycleScope.launch { setContentView(buildLayout(config.getBlockedApps())) }
        } else {
            setContentView(monitorPermissionView(this))
        }
    }

    /** Installed launchable apps as (packageName, label), excluding our own. */
    private fun launchableApps(): List<Pair<String, String>> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return packageManager.queryIntentActivities(intent, 0)
            .map { it.activityInfo.packageName to it.loadLabel(packageManager).toString() }
            .filter { it.first != packageName }
            .distinctBy { it.first }
            .sortedBy { it.second.lowercase() }
    }

    private fun buildLayout(blocked: Set<String>): View = screen(this) {
        card {
            cardTitle("Block these apps")
            for ((pkg, label) in launchableApps()) {
                val box = CheckBox(context).apply {
                    text = label
                    textSize = 15f
                    isChecked = pkg in blocked
                }
                boxes[pkg] = box
                addView(box, LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(2) })
            }
        }
        primaryButton("Save") {
            val selected = boxes.filterValues { it.isChecked }.keys.toSet()
            lifecycleScope.launch {
                config.setBlockedApps(selected)
                Toast.makeText(this@AppBlockActivity, "Saved", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }
}
```

- [ ] **Step 4: Add an "App blocking" row to Settings**

In `SettingsActivity.kt`, add to the imports:

```kotlin
import uk.co.cyberheroez.oroq.ui.Style.ghostButton
```

(if not already imported), and in `buildLayout`, immediately before the
`primaryButton("Save categories")` line, add:

```kotlin
        ghostButton("App blocking") {
            startActivity(Intent(this@SettingsActivity, AppBlockActivity::class.java))
        }
```

- [ ] **Step 5: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): app-blocking screen"
```

---

## Task 8: Screen-time screen

A parent screen showing today's usage and a control to set the daily limit, with
the Usage Access permission prompt.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/ScreenTimeActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/SettingsActivity.kt`

- [ ] **Step 1: Declare the activity**

In `AndroidManifest.xml`, add inside `<application>`, after `AppBlockActivity`:

```xml
        <activity
            android:name=".ui.ScreenTimeActivity"
            android:exported="false" />
```

- [ ] **Step 2: Write `ScreenTimeActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Parent screen: today's usage and the daily screen-time limit. */
class ScreenTimeActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val usage by lazy { UsageReader(this) }
    private lateinit var limitField: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Screen time"
    }

    override fun onResume() {
        super.onResume()
        // Re-checked each time so it updates after the user returns from settings.
        if (usage.monitoringReady()) {
            lifecycleScope.launch { setContentView(mainView(config.getDailyLimitMinutes())) }
        } else {
            setContentView(monitorPermissionView(this))
        }
    }

    private fun mainView(limitMinutes: Int): View = screen(this) {
        card {
            cardTitle("Today")
            body("Total screen time: ${formatMinutes(usage.todayForegroundMinutes())}")
            val top = usage.todayUsageByApp().entries.sortedByDescending { it.value }.take(5)
            for ((pkg, minutes) in top) {
                body("${appLabel(pkg)} — ${formatMinutes(minutes)}", Style.MUTED, 4)
            }
        }
        card {
            cardTitle("Daily limit")
            body("Minutes per day (0 = no limit)", topGap = 14)
            limitField = EditText(context).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                setText(limitMinutes.toString())
            }
            addView(limitField, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) })
        }
        primaryButton("Save limit") {
            val minutes = limitField.text.toString().toIntOrNull() ?: 0
            lifecycleScope.launch {
                config.setDailyLimitMinutes(minutes)
                Toast.makeText(this@ScreenTimeActivity, "Saved", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun appLabel(pkg: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
        pkg
    }

    private fun formatMinutes(m: Int): String =
        if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
}
```

- [ ] **Step 3: Add a "Screen time" row to Settings**

In `SettingsActivity.kt`, in `buildLayout`, immediately after the
`ghostButton("App blocking")` block added in Task 7, add:

```kotlin
        ghostButton("Screen time") {
            startActivity(Intent(this@SettingsActivity, ScreenTimeActivity::class.java))
        }
```

- [ ] **Step 4: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): screen-time screen"
```

---

## Task 9: Final verification

**Files:** none.

- [ ] **Step 1: Run the full unit-test suite**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: PASS — every unit test across Plans 1-5 (including `BlockDecisionTest`).

- [ ] **Step 2: Build and install**

```bash
./gradlew :app:installDebug
```

Expected: `BUILD SUCCESSFUL`, `Installed on 1 device`.

- [ ] **Step 3: On-device verification**

Open **SafeBrowse**, complete onboarding if needed, and:

1. Tap **Start protection**, accept the VPN consent.
2. Go to **Settings** (enter PIN) → **App blocking** → tick an app (e.g. Chrome) →
   **Save**.
3. Grant the **overlay** permission if prompted by Android, and **Usage Access**
   via Settings → **Screen time** → "Open Usage Access settings".
4. Open the blocked app — within ~2s the **block screen** should appear.
5. In **Screen time**, set the daily limit to `1` minute, save. Use the device
   for a minute — the **"Screen time is up"** screen should appear; the parent
   PIN grants 30 more minutes.

If a step fails, capture `adb logcat -s AppMonitor` and stop to investigate.

- [ ] **Step 4: Final commit (only if verification fixes were needed)**

Otherwise Plan 5 is complete.

---

## Done — Plan 5 outcome (v2 complete)

SafeBrowse now does app blocking and screen-time limits on top of web filtering:
a foreground service polls usage, blocks chosen apps, and enforces a daily limit
with a parent-PIN time extension. With Plans 1-5 done, the app covers the full
original vision — web filtering plus app and screen-time control.
