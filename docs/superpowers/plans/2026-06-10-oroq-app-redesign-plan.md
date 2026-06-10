# OroQ Android App Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the OroQ Android app UI in Jetpack Compose to match design deck v1.0 — dark navy theme, Inter type, parent Cyber-Confidence dashboard suite, child onboarding/pairing flow with QR — with real child-side enforcement for the four Device Details toggles.

**Architecture:** Two single-activity Compose hosts (`ChildActivity`, `ParentActivity` with 5-tab bottom nav + NavHost) over the untouched `family/`, `vpn/`, `filter/`, `monitor/` layers, reached through thin ViewModels. Pure-Kotlin stat derivation (`Insights`, `ConfidenceScore`) is TDD'd first; new `FamilyCommand` types and DNS rewrites give the toggles real teeth.

**Tech Stack:** Kotlin (AGP 9.1.1 built-in), Jetpack Compose (BOM), navigation-compose, CameraX + ZXing core (QR), DataStore (existing), JUnit.

**Spec:** `docs/superpowers/specs/2026-06-10-oroq-app-redesign-design.md` — read it first.

**Conventions for every task:** run commands from `android/`; `./gradlew testDebugUnitTest` for unit tests, `./gradlew assembleDebug` to compile. Commit after each green task (no `Co-Authored-By` trailer — repo convention). The deck spec's copy strings are quoted exactly; do not paraphrase them.

---

### Task 1: Compose toolchain

**Files:**
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`

- [ ] **Step 1: Add versions/plugins/libraries to `libs.versions.toml`**

Append to `[versions]`:
```toml
composeBom = "2025.05.00"
activityCompose = "1.10.1"
navigationCompose = "2.8.9"
kotlinComposePlugin = "2.2.20"
camerax = "1.4.2"
zxing = "3.5.3"
```
Append to `[libraries]`:
```toml
androidx-compose-bom = { group = "androidx.compose", name = "compose-bom", version.ref = "composeBom" }
androidx-compose-ui = { group = "androidx.compose.ui", name = "ui" }
androidx-compose-foundation = { group = "androidx.compose.foundation", name = "foundation" }
androidx-compose-material3 = { group = "androidx.compose.material3", name = "material3" }
androidx-compose-ui-tooling = { group = "androidx.compose.ui", name = "ui-tooling" }
androidx-compose-ui-tooling-preview = { group = "androidx.compose.ui", name = "ui-tooling-preview" }
androidx-compose-ui-test-junit4 = { group = "androidx.compose.ui", name = "ui-test-junit4" }
androidx-compose-ui-test-manifest = { group = "androidx.compose.ui", name = "ui-test-manifest" }
androidx-activity-compose = { group = "androidx.activity", name = "activity-compose", version.ref = "activityCompose" }
androidx-navigation-compose = { group = "androidx.navigation", name = "navigation-compose", version.ref = "navigationCompose" }
androidx-lifecycle-viewmodel-compose = { group = "androidx.lifecycle", name = "lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-camera-camera2 = { group = "androidx.camera", name = "camera-camera2", version.ref = "camerax" }
androidx-camera-lifecycle = { group = "androidx.camera", name = "camera-lifecycle", version.ref = "camerax" }
androidx-camera-view = { group = "androidx.camera", name = "camera-view", version.ref = "camerax" }
zxing-core = { group = "com.google.zxing", name = "core", version.ref = "zxing" }
```
Append to `[plugins]`:
```toml
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlinComposePlugin" }
```

- [ ] **Step 2: Wire the plugin and dependencies in `app/build.gradle.kts`**

Plugins block becomes:
```kotlin
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}
```
Inside `android { }` add:
```kotlin
    buildFeatures {
        compose = true
    }
```
Add to `dependencies { }`:
```kotlin
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.zxing.core)
    debugImplementation(libs.androidx.compose.ui.tooling)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
```

- [ ] **Step 3: Verify the build (spec risk R1)**

Run: `./gradlew assembleDebug -q`
Expected: BUILD SUCCESSFUL. If the compose plugin version clashes with AGP 9.1.1's built-in Kotlin, the error names the built-in Kotlin version — set `kotlinComposePlugin` to exactly that version and re-run. Record the working version in the commit message.

- [ ] **Step 4: Commit**

```bash
git add gradle/libs.versions.toml app/build.gradle.kts
git commit -m "build(android): add Compose, navigation, CameraX and ZXing toolchain"
```

---

### Task 2: Inter fonts + theme tokens

**Files:**
- Create: `android/app/src/main/res/font/inter_regular.ttf` (+ medium/semibold/bold)
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/theme/OroqTheme.kt`

- [ ] **Step 1: Download Inter static weights (OFL licence)**

```bash
cd app/src/main/res && mkdir -p font && cd font
curl -fsSL -o inter_regular.ttf  https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf
curl -fsSL -o inter_medium.ttf   https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-500-normal.ttf
curl -fsSL -o inter_semibold.ttf https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.ttf
curl -fsSL -o inter_bold.ttf     https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf
curl -fsSL -o OFL.txt https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/LICENSE 2>/dev/null || true
```
Verify each file is a TTF: `file *.ttf` → "TrueType Font data". If the CDN path 404s, fetch the static TTFs from https://github.com/rsms/inter/releases (Inter-4.x zip, `extras/ttf/`).

- [ ] **Step 2: Write `OroqTheme.kt` (deck §0 tokens, verbatim)**

```kotlin
package uk.co.cyberheroez.oroq.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.R

/** Deck §0.1 — colors. Dark is the only mobile theme. */
object OroqColors {
    val BgPrimary = Color(0xFF010715)
    val BgSurface = Color(0xFF0A1420)
    val BgSurface2 = Color(0xFF111A29)
    val BluePrimary = Color(0xFF0A67F3)
    val BlueAccent = Color(0xFF2563EB)
    val BlueLight = Color(0xFF60A5FA)
    val BlueDeep = Color(0xFF1E3A8A)
    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFF8B94A3)
    val Success = Color(0xFF22C55E)
    val Danger = Color(0xFFEF4444)
    val Warning = Color(0xFFF59E0B)
    val PurpleInfo = Color(0xFF8B5CF6)
    val Border = Color.White.copy(alpha = 0.08f)
    val Track = Color.White.copy(alpha = 0.08f)
    /** Status pills: 10–15% alpha fill, full-opacity content (deck rule). */
    fun pill(c: Color) = c.copy(alpha = 0.14f)
    val QTail = Brush.linearGradient(listOf(BlueLight, BlueAccent, BlueDeep))
}

/** Deck §0.2 — Inter, weights 400/500/600/700. */
object OroqType {
    val Inter = FontFamily(
        Font(R.font.inter_regular, FontWeight.Normal),
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold),
        Font(R.font.inter_bold, FontWeight.Bold),
    )
    val Display = TextStyle(Inter, fontSize = 56.sp, fontWeight = FontWeight.Bold, letterSpacing = (-1.1).sp, lineHeight = 62.sp, color = OroqColors.TextPrimary)
    val H1 = TextStyle(Inter, fontSize = 32.sp, fontWeight = FontWeight.Bold, color = OroqColors.TextPrimary)
    val H2 = TextStyle(Inter, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, color = OroqColors.TextPrimary)
    val Body = TextStyle(Inter, fontSize = 15.sp, fontWeight = FontWeight.Normal, color = OroqColors.TextSecondary)
    val BodyOnDark = Body.copy(color = OroqColors.TextPrimary)
    val Caption = TextStyle(Inter, fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.9.sp, color = OroqColors.TextSecondary)
    val Metric = TextStyle(Inter, fontSize = 48.sp, fontWeight = FontWeight.Bold, color = OroqColors.TextPrimary)
    val MetricSmall = TextStyle(Inter, fontSize = 28.sp, fontWeight = FontWeight.Bold, color = OroqColors.TextPrimary)
}

/** Deck §0.3 — shape & spacing. */
object OroqDimens {
    val RadiusCard = 16.dp
    val RadiusTile = 12.dp
    val RadiusButton = 10.dp
    val PadCard = 16.dp
    val PadScreen = 20.dp
    val GapGrid = 12.dp
}
```
(No Material `ColorScheme`; screens use these objects directly. `material3` is only for `Scaffold`/`Switch` plumbing.)

- [ ] **Step 3: Compile**

Run: `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/res/font app/src/main/java/uk/co/cyberheroez/oroq/ui/theme/OroqTheme.kt
git commit -m "feat(android): deck design tokens — Inter fonts, OroQ dark palette, type scale"
```

---

### Task 3: Stat derivation — `ChildSnapshot`, `Insights`, `ConfidenceScore` (TDD)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/Insights.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/parent/InsightsTest.kt`

- [ ] **Step 1: Write the failing tests**

```kotlin
package uk.co.cyberheroez.oroq.parent

import org.junit.Assert.assertEquals
import org.junit.Test
import uk.co.cyberheroez.oroq.family.BlockEvent
import uk.co.cyberheroez.oroq.family.FamilySummary

class InsightsTest {
    private val now = 1_700_000_000_000L
    private val hour = 3_600_000L
    private val day = 24 * hour

    private fun snap(
        protectionOn: Boolean = true,
        fetchedAt: Long = now,
        events: List<BlockEvent> = emptyList(),
    ) = ChildSnapshot(
        pairingId = "p1", label = "Mia",
        summary = FamilySummary(ts = fetchedAt, protectionOn = protectionOn,
            screenTimeTodayMin = 0, dailyLimitMin = 0, recentEvents = events),
        fetchedAt = fetchedAt,
    )

    @Test fun `empty family scores zero and counts nothing`() {
        val stats = Insights.derive(emptyList(), now)
        assertEquals(0, stats.threatsBlockedWeek)
        assertEquals(0, stats.unsafeDomainsWeek)
        assertEquals(0, stats.devicesProtected)
        assertEquals(0, stats.score)
    }

    @Test fun `week window includes 6-day-old event and excludes 8-day-old`() {
        val events = listOf(
            BlockEvent(now - 6 * day, "web", "a.example", cat = "phishing"),
            BlockEvent(now - 8 * day, "web", "b.example", cat = "phishing"),
        )
        val stats = Insights.derive(listOf(snap(events = events)), now)
        assertEquals(1, stats.threatsBlockedWeek)
        assertEquals(1, stats.unsafeDomainsWeek)
    }

    @Test fun `unsafe domains are distinct, threats are total`() {
        val events = listOf(
            BlockEvent(now - hour, "web", "same.example", cat = "malware"),
            BlockEvent(now - 2 * hour, "web", "same.example", cat = "malware"),
        )
        val stats = Insights.derive(listOf(snap(events = events)), now)
        assertEquals(2, stats.threatsBlockedWeek)
        assertEquals(1, stats.unsafeDomainsWeek)
    }

    @Test fun `app blocks and catless events do not count as threats`() {
        val events = listOf(
            BlockEvent(now - hour, "app", "TikTok"),
            BlockEvent(now - hour, "web", "legacy.example"), // no cat — legacy child
        )
        val stats = Insights.derive(listOf(snap(events = events)), now)
        assertEquals(0, stats.threatsBlockedWeek)
        assertEquals(0, stats.unsafeDomainsWeek)
    }

    @Test fun `device protected only when protection on and sync fresh`() {
        val fresh = snap(protectionOn = true, fetchedAt = now - hour)
        val stale = snap(protectionOn = true, fetchedAt = now - 2 * day)
        val off = snap(protectionOn = false, fetchedAt = now)
        assertEquals(1, Insights.derive(listOf(fresh, stale, off), now).devicesProtected)
    }

    @Test fun `perfect family scores 100 and threshold words match deck`() {
        val stats = Insights.derive(listOf(snap()), now)
        assertEquals(100, stats.score)
        assertEquals("Excellent", ConfidenceScore.statusWord(100))
        assertEquals("Excellent", ConfidenceScore.statusWord(80))
        assertEquals("Fair", ConfidenceScore.statusWord(79))
        assertEquals("Fair", ConfidenceScore.statusWord(60))
        assertEquals("At risk", ConfidenceScore.statusWord(59))
    }

    @Test fun `score degrades with stale sync and protection off`() {
        val all = Insights.derive(listOf(snap()), now).score
        val staleScore = Insights.derive(listOf(snap(fetchedAt = now - 3 * day)), now).score
        val offScore = Insights.derive(listOf(snap(protectionOn = false)), now).score
        org.junit.Assert.assertTrue(staleScore < all)
        org.junit.Assert.assertTrue(offScore < staleScore)
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew testDebugUnitTest --tests '*InsightsTest*' -q`
Expected: FAIL — `Unresolved reference: ChildSnapshot` / `cat` (the `cat` param lands in Task 4; for now add it here and let both tasks' code merge — if executing tasks strictly in order, write `BlockEvent(now - 6 * day, "web", "a.example", cat = "phishing")` and accept the compile failure until Step 3 of Task 4; **alternatively run Task 4 first**. Recommended order: do Task 4 Steps 1–4, then this task end-to-end.)

- [ ] **Step 3: Implement `Insights.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import uk.co.cyberheroez.oroq.family.FamilySummary

/** One paired child's latest summary plus when the parent fetched it. */
data class ChildSnapshot(
    val pairingId: String,
    val label: String,
    val summary: FamilySummary?,
    val fetchedAt: Long,
)

/** Derived dashboard stats (deck panel 06). All windows are 7 days. */
data class FamilyStats(
    val threatsBlockedWeek: Int,
    val unsafeDomainsWeek: Int,
    val devicesProtected: Int,
    val deviceCount: Int,
    val uptimePercent: Int,
    val score: Int,
)

/**
 * Confidence score 0–100 (deck §4): weighted sum of protections enabled,
 * device coverage, sync freshness, and threat handling. Weights are product
 * constants; the formula moves server-side in sub-project 3.
 */
object ConfidenceScore {
    const val W_PROTECTION = 40
    const val W_COVERAGE = 25
    const val W_FRESHNESS = 20
    const val W_THREATS = 15
    const val FRESH_MS = 24 * 3_600_000L

    fun compute(snapshots: List<ChildSnapshot>, now: Long): Int {
        if (snapshots.isEmpty()) return 0
        val n = snapshots.size.toDouble()
        val protectionFrac = snapshots.count { it.summary?.protectionOn == true } / n
        val freshFrac = snapshots.count { now - it.fetchedAt < FRESH_MS } / n
        val coveredFrac = snapshots.count { it.summary != null } / n
        // Threat handling: full credit unless we have no signal at all.
        val threatFrac = if (snapshots.any { it.summary != null }) 1.0 else 0.0
        return (W_PROTECTION * protectionFrac + W_COVERAGE * coveredFrac +
            W_FRESHNESS * freshFrac + W_THREATS * threatFrac).toInt()
    }

    /** Deck thresholds: ≥80 Excellent (blue), 60–79 Fair (amber), <60 At risk (red). */
    fun statusWord(score: Int): String = when {
        score >= 80 -> "Excellent"
        score >= 60 -> "Fair"
        else -> "At risk"
    }
}

object Insights {
    private const val WEEK_MS = 7 * 24 * 3_600_000L
    private val THREAT_CATS = setOf("phishing", "malware", "scam", "adult")

    fun derive(snapshots: List<ChildSnapshot>, now: Long): FamilyStats {
        val weekEvents = snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
            .filter { now - it.ts < WEEK_MS }
        val threats = weekEvents.filter { it.type == "web" && it.cat in THREAT_CATS }
        val protectedCount = snapshots.count {
            it.summary?.protectionOn == true && now - it.fetchedAt < ConfidenceScore.FRESH_MS
        }
        val uptime = if (snapshots.isEmpty()) 0
        else (100.0 * protectedCount / snapshots.size).toInt()
        return FamilyStats(
            threatsBlockedWeek = threats.size,
            unsafeDomainsWeek = threats.map { it.label }.toSet().size,
            devicesProtected = protectedCount,
            deviceCount = snapshots.size,
            uptimePercent = uptime,
            score = ConfidenceScore.compute(snapshots, now),
        )
    }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew testDebugUnitTest --tests '*InsightsTest*' -q`
Expected: PASS (after Task 4's `cat` field exists).

- [ ] **Step 5: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/parent/Insights.kt app/src/test/java/uk/co/cyberheroez/oroq/parent/InsightsTest.kt
git commit -m "feat(android): derive dashboard stats and confidence score from child snapshots"
```

---

### Task 4: `BlockEvent.cat` — threat categories on the wire (TDD)

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilySummary.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/BlockEventLog.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/BlocklistRepository.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/DnsFilter.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt:106`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/family/SummaryCatTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SummaryCatTest {
    @Test fun `cat field round-trips through json`() {
        val s = FamilySummary(ts = 1L, protectionOn = true, screenTimeTodayMin = 0,
            dailyLimitMin = 0,
            recentEvents = listOf(BlockEvent(2L, "web", "x.example", cat = "phishing")))
        val parsed = parseSummary(s.toJson())
        assertEquals("phishing", parsed.recentEvents[0].cat)
    }

    @Test fun `legacy json without cat parses as null`() {
        val legacy = """{"ts":1,"protectionOn":true,"screenTimeTodayMin":0,
            "dailyLimitMin":0,"webBlockedToday":0,"appBlockedToday":0,
            "recentEvents":[{"ts":2,"type":"web","label":"x.example"}]}"""
        assertNull(parseSummary(legacy).recentEvents[0].cat)
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew testDebugUnitTest --tests '*SummaryCatTest*' -q`
Expected: FAIL — no value passed for parameter `cat` / unresolved.

- [ ] **Step 3: Implement**

In `FamilySummary.kt`, change `BlockEvent` and its (de)serialisation:
```kotlin
/** A single blocked attempt — [type] is "web" or "app", [label] a domain or app
 *  name, [cat] the blocklist category that matched ("phishing", "malware",
 *  "adult", …) or null for app blocks and events from older children. */
data class BlockEvent(val ts: Long, val type: String, val label: String, val cat: String? = null)
```
In `toJson()` events loop:
```kotlin
    for (event in recentEvents) {
        val o = JSONObject().put("ts", event.ts).put("type", event.type).put("label", event.label)
        if (event.cat != null) o.put("cat", event.cat)
        events.put(o)
    }
```
In `parseSummary` events loop:
```kotlin
            events.add(BlockEvent(o.getLong("ts"), o.getString("type"), o.getString("label"),
                o.optString("cat").ifEmpty { null }))
```
In `BlockEventLog.kt`: `record` gains `cat: String? = null`, stored/loaded the same way:
```kotlin
    fun record(type: String, label: String, cat: String? = null, at: Long = System.currentTimeMillis()) {
        synchronized(lock) {
            val events = readUnlocked().toMutableList()
            events.add(BlockEvent(at, type, label, cat))
            while (events.size > maxEvents) events.removeAt(0)
            writeUnlocked(events)
        }
    }
```
…and in `readUnlocked`/`writeUnlocked` mirror the optional `cat` exactly as in `FamilySummary` above.

In `BlocklistRepository.kt` add (next to `isBlocked`, reusing its loop):
```kotlin
    /** The first enabled category whose list matches [rawDomain], or null. */
    fun blockedCategory(rawDomain: String, enabledCategories: Set<String>): String? {
        val domain = DomainName.normalize(rawDomain) ?: return null
        for (category in enabledCategories) {
            val set = categories[category] ?: continue
            if (isDomainBlocked(domain, set)) return category
        }
        return null
    }
```
(Match the existing `isBlocked` body for normalisation — open the file and reuse whatever it calls; if `isBlocked` normalises differently, copy that exact logic so both agree. Then rewrite `isBlocked` as `blockedCategory(...) != null` — DRY.)

In `DnsFilter.kt`, carry the category:
```kotlin
        /** Block the query; [response] is the NXDOMAIN answer, [category] which list matched. */
        class Block(val response: ByteArray, val category: String?) : Decision
```
```kotlin
    fun decide(dnsQuery: ByteArray): Decision {
        val domain = DnsMessage.parseQuestionDomain(dnsQuery) ?: return Decision.Allow
        val category = repository.blockedCategory(domain, enabledCategories())
        return if (category != null) {
            Decision.Block(DnsMessage.buildNxdomainResponse(dnsQuery), category)
        } else {
            Decision.Allow
        }
    }
```
In `OroQVpnService.kt:106`, the call site becomes (where `decision` is the `Decision.Block` instance in scope — adapt the local variable name to what the surrounding `when`/`if` binds):
```kotlin
blockLog.record("web", d, decision.category)
```

- [ ] **Step 4: Run all unit tests (existing DnsFilter/blocklist tests must stay green)**

Run: `./gradlew testDebugUnitTest -q`
Expected: PASS, including `SummaryCatTest`. If existing tests construct `Decision.Block(...)` with one arg, update them with `category = null`.

- [ ] **Step 5: Commit**

```bash
git add -A app/src/main app/src/test
git commit -m "feat(android): record which blocklist category matched on every web block"
```

### Task 5: New commands + Safe-Search/YouTube DNS enforcement (TDD)

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyCommand.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/config/ConfigRepository.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/CommandSync.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/DnsMessage.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/DnsFilter.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/SafeSearchRewriter.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/filter/SafeSearchRewriterTest.kt`

- [ ] **Step 1: Write the failing test**

```kotlin
package uk.co.cyberheroez.oroq.filter

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SafeSearchRewriterTest {
    @Test fun `google domains rewrite when safe search on`() {
        assertArrayEquals(SafeSearchRewriter.FORCE_SAFESEARCH_IP,
            SafeSearchRewriter.rewriteIp("www.google.com", safeSearch = true, ytRestricted = false))
        assertArrayEquals(SafeSearchRewriter.FORCE_SAFESEARCH_IP,
            SafeSearchRewriter.rewriteIp("www.google.co.uk", safeSearch = true, ytRestricted = false))
    }

    @Test fun `youtube domains rewrite when restricted on`() {
        assertArrayEquals(SafeSearchRewriter.RESTRICT_MODERATE_IP,
            SafeSearchRewriter.rewriteIp("www.youtube.com", safeSearch = false, ytRestricted = true))
        assertArrayEquals(SafeSearchRewriter.RESTRICT_MODERATE_IP,
            SafeSearchRewriter.rewriteIp("m.youtube.com", safeSearch = false, ytRestricted = true))
    }

    @Test fun `nothing rewrites when flags off or domain unrelated`() {
        assertNull(SafeSearchRewriter.rewriteIp("www.google.com", safeSearch = false, ytRestricted = false))
        assertNull(SafeSearchRewriter.rewriteIp("www.youtube.com", safeSearch = true, ytRestricted = false))
        assertNull(SafeSearchRewriter.rewriteIp("example.com", safeSearch = true, ytRestricted = true))
        assertNull(SafeSearchRewriter.rewriteIp("maps.google.com", safeSearch = true, ytRestricted = false))
    }
}
```

- [ ] **Step 2: Run to verify failure**

Run: `./gradlew testDebugUnitTest --tests '*SafeSearchRewriterTest*' -q`
Expected: FAIL — `Unresolved reference: SafeSearchRewriter`.

- [ ] **Step 3: Implement `SafeSearchRewriter.kt`**

```kotlin
package uk.co.cyberheroez.oroq.filter

/**
 * DNS-level Safe Search / YouTube Restricted Mode, the mechanism Google
 * documents for networks: answer the search domain's A query with the
 * enforcement VIP instead of forwarding upstream. Certificates stay valid —
 * Google serves the real hostnames on these VIPs.
 */
object SafeSearchRewriter {
    /** forcesafesearch.google.com */
    val FORCE_SAFESEARCH_IP = byteArrayOf(216.toByte(), 239.toByte(), 38, 120)
    /** restrictmoderate.youtube.com */
    val RESTRICT_MODERATE_IP = byteArrayOf(216.toByte(), 239.toByte(), 38, 119)
    /** strict.bing.com */
    val BING_STRICT_IP = byteArrayOf(204.toByte(), 79, 197.toByte(), 220.toByte())

    private val YOUTUBE = setOf(
        "www.youtube.com", "m.youtube.com", "youtubei.googleapis.com",
        "youtube.googleapis.com", "www.youtube-nocookie.com",
    )

    /** Google web search hosts: `www.google.<tld>` (search), not other subdomains. */
    private fun isGoogleSearch(domain: String) =
        domain == "google.com" || (domain.startsWith("www.google.") && domain.count { it == '.' } <= 3)

    fun rewriteIp(domain: String, safeSearch: Boolean, ytRestricted: Boolean): ByteArray? {
        val d = domain.lowercase().trimEnd('.')
        if (ytRestricted && d in YOUTUBE) return RESTRICT_MODERATE_IP
        if (safeSearch && isGoogleSearch(d)) return FORCE_SAFESEARCH_IP
        if (safeSearch && d == "www.bing.com") return BING_STRICT_IP
        return null
    }
}
```

- [ ] **Step 4: Run the rewriter test**

Run: `./gradlew testDebugUnitTest --tests '*SafeSearchRewriterTest*' -q` — Expected: PASS.

- [ ] **Step 5: Add the A-record builder to `DnsMessage.kt`**

Append inside the `DnsMessage` object (mirror the style of `buildNxdomainResponse`; it transforms the query's 12-byte header + question into a response):
```kotlin
    /** True when the query's first question is an A (IPv4) question. */
    fun isAQuery(bytes: ByteArray): Boolean {
        // QTYPE sits right after the QNAME, which starts at offset 12.
        var i = 12
        while (i < bytes.size && bytes[i].toInt() != 0) i += (bytes[i].toInt() and 0xFF) + 1
        if (i + 2 >= bytes.size) return false
        return bytes[i + 1].toInt() == 0 && bytes[i + 2].toInt() == 1
    }

    /** Builds a response answering the query's question with a single A record. */
    fun buildARecordResponse(query: ByteArray, ipv4: ByteArray, ttlSeconds: Int = 300): ByteArray {
        require(ipv4.size == 4)
        // End of question section: header(12) + QNAME + QTYPE(2) + QCLASS(2).
        var i = 12
        while (i < query.size && query[i].toInt() != 0) i += (query[i].toInt() and 0xFF) + 1
        val questionEnd = i + 5
        val out = java.io.ByteArrayOutputStream()
        out.write(query, 0, 2)                       // ID echoed
        out.write(0x81); out.write(0x80)             // QR=1, RD=1, RA=1, RCODE=0
        out.write(0); out.write(1)                   // QDCOUNT 1
        out.write(0); out.write(1)                   // ANCOUNT 1
        out.write(0); out.write(0)                   // NSCOUNT 0
        out.write(0); out.write(0)                   // ARCOUNT 0
        out.write(query, 12, questionEnd - 12)       // question echoed
        out.write(0xC0); out.write(0x0C)             // NAME: pointer to offset 12
        out.write(0); out.write(1)                   // TYPE A
        out.write(0); out.write(1)                   // CLASS IN
        out.write(ttlSeconds ushr 24); out.write(ttlSeconds ushr 16)
        out.write(ttlSeconds ushr 8); out.write(ttlSeconds)
        out.write(0); out.write(4)                   // RDLENGTH 4
        out.write(ipv4)                              // RDATA
        return out.toByteArray()
    }
```

- [ ] **Step 6: Integrate into `DnsFilter`**

Constructor gains two suppliers; rewrite wins over blocklists:
```kotlin
class DnsFilter(
    private val repository: BlocklistRepository,
    private val enabledCategories: () -> Set<String>,
    private val safeSearchOn: () -> Boolean = { false },
    private val ytRestrictedOn: () -> Boolean = { false },
) {
    sealed interface Decision {
        class Block(val response: ByteArray, val category: String?) : Decision
        /** Answer locally with [response] (Safe-Search rewrite) — not a block. */
        class Rewrite(val response: ByteArray) : Decision
        data object Allow : Decision
    }

    fun decide(dnsQuery: ByteArray): Decision {
        val domain = DnsMessage.parseQuestionDomain(dnsQuery) ?: return Decision.Allow
        val ip = SafeSearchRewriter.rewriteIp(domain, safeSearchOn(), ytRestrictedOn())
        if (ip != null) {
            // A queries get the VIP; AAAA gets NXDOMAIN so clients fall back to A.
            return if (DnsMessage.isAQuery(dnsQuery)) {
                Decision.Rewrite(DnsMessage.buildARecordResponse(dnsQuery, ip))
            } else {
                Decision.Rewrite(DnsMessage.buildNxdomainResponse(dnsQuery))
            }
        }
        val category = repository.blockedCategory(domain, enabledCategories())
        return if (category != null) {
            Decision.Block(DnsMessage.buildNxdomainResponse(dnsQuery), category)
        } else {
            Decision.Allow
        }
    }
}
```
In `OroQVpnService.kt`: construct the filter with the two new suppliers reading `ConfigRepository` (cache the values in fields refreshed on service (re)start, same pattern the service uses for categories — find where `DnsFilter(` is constructed and where categories are loaded, and load `isSafeSearchOn()`/`isYtRestrictedOn()` the same way). Handle `Decision.Rewrite` exactly like `Decision.Block`'s packet-write path but **without** calling `blockLog.record` (a rewrite is not a block).

- [ ] **Step 7: Command types + config + application**

`FamilyCommand.kt` companion gains:
```kotlin
        const val SET_PROTECTION = "set_protection"
        const val SET_SAFE_SEARCH = "set_safe_search"
        const val SET_YT_RESTRICTED = "set_yt_restricted"
```
`ConfigRepository.kt` — add keys and accessors (same style as existing pairs):
```kotlin
        val SAFE_SEARCH = booleanPreferencesKey("safe_search_on")
        val YT_RESTRICTED = booleanPreferencesKey("yt_restricted_on")
```
```kotlin
    suspend fun isSafeSearchOn(): Boolean = store.data.first()[Keys.SAFE_SEARCH] ?: false
    suspend fun setSafeSearchOn(on: Boolean) { store.edit { it[Keys.SAFE_SEARCH] = on } }
    suspend fun isYtRestrictedOn(): Boolean = store.data.first()[Keys.YT_RESTRICTED] ?: false
    suspend fun setYtRestrictedOn(on: Boolean) { store.edit { it[Keys.YT_RESTRICTED] = on } }
```
(Adapt `store.data.first()` to the field name the file actually uses.)

`CommandSync.kt` — three new `when` branches:
```kotlin
            FamilyCommand.SET_PROTECTION -> {
                if (command.intValue == 1) {
                    context.startService(Intent(context, OroQVpnService::class.java))
                } else {
                    context.startService(
                        Intent(context, OroQVpnService::class.java).setAction(OroQVpnService.ACTION_STOP)
                    )
                }
            }
            FamilyCommand.SET_SAFE_SEARCH -> {
                config.setSafeSearchOn(command.intValue == 1)
                restartVpnIfActive(context)
            }
            FamilyCommand.SET_YT_RESTRICTED -> {
                config.setYtRestrictedOn(command.intValue == 1)
                restartVpnIfActive(context)
            }
```
Note: `SET_PROTECTION 1` can only prepare/start if the VPN consent already exists; if `VpnService.prepare(context) != null` the child must re-consent — in that case do nothing and let the next summary's `protectionOn=false` tell the parent.

- [ ] **Step 8: Report toggle states in the summary**

`FamilySummary` gains two optional fields (and `toJson`/`parseSummary` mirror them with `optBoolean(name, false)`):
```kotlin
    val safeSearchOn: Boolean = false,
    val ytRestrictedOn: Boolean = false,
```
`buildSummary(...)` gains `safeSearchOn: Boolean = false, ytRestrictedOn: Boolean = false` parameters passed straight through. In `FamilySyncWorker` (where `buildSummary` is called), read both from `ConfigRepository` and pass them.

- [ ] **Step 9: Run everything**

Run: `./gradlew testDebugUnitTest -q && ./gradlew assembleDebug -q`
Expected: all PASS, build green. Fix any `Decision.Block` exhaustive-`when` errors in the VPN service by adding the `Rewrite` branch.

- [ ] **Step 10: Commit**

```bash
git add -A app/src/main app/src/test
git commit -m "feat(android): remote protection/safe-search/yt-restricted commands with DNS enforcement"
```

---

### Task 6: Brand vectors + core components

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Brand.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Buttons.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Tiles.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Rows.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Nav.kt`

If the product owner has supplied `oroq_logo.svg` / Q-mark SVG (spec risk R2), import via Android Studio's Vector Asset tool into `res/drawable` and wrap; otherwise draw as below (ring-O + blue needle per deck §1).

- [ ] **Step 1: `Brand.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** The Q mark: white ring with the blue needle tail breaking out bottom-right (deck §1). */
@Composable
fun QSymbol(size: Dp, ring: Color = Color.White) {
    Canvas(Modifier.size(size)) {
        val stroke = this.size.minDimension * 0.12f
        val r = this.size.minDimension / 2 - stroke
        drawCircle(color = ring, radius = r, style = Stroke(stroke))
        val c = center
        val edge = Offset(c.x + r * 0.707f, c.y + r * 0.707f)
        val tip = Offset(c.x + r * 1.45f, c.y + r * 1.45f)
        drawLine(brush = OroqColors.QTail, start = edge, end = tip,
            strokeWidth = stroke * 1.1f, cap = StrokeCap.Round)
    }
}

/** Wordmark `OROQ` — all-caps, tracked-out; prose copy uses "OroQ" (deck defect fix). */
@Composable
fun OroqWordmark(fontSize: androidx.compose.ui.unit.TextUnit = 16.sp) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("OROQ", style = OroqType.H2.copy(
            fontSize = fontSize, fontWeight = FontWeight.Bold, letterSpacing = 2.sp))
    }
}
```

- [ ] **Step 2: `Buttons.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusButton))
            .background(if (enabled) OroqColors.BluePrimary else OroqColors.BgSurface2)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
    }
}

@Composable
fun SecondaryLink(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(text, style = OroqType.Body.copy(color = OroqColors.BlueAccent, fontWeight = FontWeight.Medium),
        modifier = modifier.clickable(onClick = onClick).padding(8.dp))
}
```

- [ ] **Step 3: `Tiles.kt` — surface card, stat tile, filter chips, toggle row**

```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Dark card: surface bg, 1px white-8% border, 16dp radius — no shadows (deck §0.3). */
@Composable
fun OroqCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusCard))
            .background(OroqColors.BgSurface)
            .border(BorderStroke(1.dp, OroqColors.Border), RoundedCornerShape(OroqDimens.RadiusCard))
            .padding(OroqDimens.PadCard),
        content = content,
    )
}

@Composable
fun StatTile(label: String, value: String, meta: String, metaColor: Color = OroqColors.TextSecondary, modifier: Modifier = Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(OroqDimens.RadiusTile))
            .background(OroqColors.BgSurface2)
            .padding(12.dp),
    ) {
        Text(value, style = OroqType.MetricSmall)
        Spacer(Modifier.height(2.dp))
        Text(label, style = OroqType.Caption)
        Text(meta, style = OroqType.Caption.copy(color = metaColor))
    }
}

@Composable
fun FilterChips(options: List<String>, active: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (option in options) {
            val isActive = option == active
            Text(
                option,
                style = OroqType.Caption.copy(
                    color = if (isActive) Color.White else OroqColors.TextSecondary,
                    letterSpacing = 0.2.sp,
                ),
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (isActive) OroqColors.BluePrimary else OroqColors.BgSurface2)
                    .clickable { onSelect(option) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            )
        }
    }
}

@Composable
fun ToggleRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = OroqType.BodyOnDark, modifier = Modifier.weight(1f))
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedTrackColor = OroqColors.BluePrimary,
                uncheckedTrackColor = OroqColors.BgSurface2,
            ),
        )
    }
}
```
(`0.2.sp` needs `import androidx.compose.ui.unit.sp`.)

- [ ] **Step 4: `Rows.kt` — activity row, device row, recommendation card, timeline group**

```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Deck panel 07 category→color map. Null/unknown renders as info blue. */
fun categoryColor(cat: String?): Color = when (cat) {
    "phishing", "malware" -> OroqColors.Danger
    "scam" -> OroqColors.Warning
    "adult" -> OroqColors.PurpleInfo
    "ok", "allowed" -> OroqColors.Success
    else -> OroqColors.BlueAccent
}

fun categoryTitle(cat: String?, type: String): String = when {
    cat == "phishing" -> "Phishing blocked"
    cat == "malware" -> "Malware blocked"
    cat == "scam" -> "Scam site blocked"
    cat == "adult" -> "Adult content blocked"
    type == "app" -> "App blocked"
    else -> "Site blocked"
}

/** "9m ago" / "2h ago" / "1d ago" relative times used across all lists. */
fun relativeTime(ts: Long, now: Long = System.currentTimeMillis()): String {
    val mins = ((now - ts) / 60_000L).coerceAtLeast(0)
    return when {
        mins < 60 -> "${mins}m ago"
        mins < 60 * 24 -> "${mins / 60}h ago"
        else -> "${mins / (60 * 24)}d ago"
    }
}

@Composable
fun ActivityRow(category: String?, type: String, domain: String, ts: Long) {
    val color = categoryColor(category)
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(32.dp).clip(CircleShape).background(OroqColors.pill(color)),
            contentAlignment = Alignment.Center,
        ) { Box(Modifier.size(10.dp).clip(CircleShape).background(color)) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(categoryTitle(category, type), style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.Medium))
            Text(domain, style = OroqType.Caption, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(relativeTime(ts), style = OroqType.Caption)
    }
}

@Composable
fun DeviceRow(name: String, statusLine: String, isProtected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(name, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.Medium))
            Text(statusLine, style = OroqType.Caption)
        }
        val pillColor = if (isProtected) OroqColors.Success else OroqColors.Danger
        Text(
            if (isProtected) "Protected" else "Unprotected",
            style = OroqType.Caption.copy(color = pillColor, fontWeight = FontWeight.SemiBold),
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(OroqColors.pill(pillColor))
                .padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

@Composable
fun RecommendationCard(title: String, sub: String, enabled: Boolean, onEnable: () -> Unit) {
    OroqCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                Text(sub, style = OroqType.Caption)
            }
            if (enabled) {
                Text("Enabled", style = OroqType.Caption.copy(color = OroqColors.Success, fontWeight = FontWeight.SemiBold))
            } else {
                Text(
                    "Enable",
                    style = OroqType.Caption.copy(color = Color.White, fontWeight = FontWeight.SemiBold),
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(OroqColors.BluePrimary)
                        .clickable(onClick = onEnable)
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                )
            }
        }
    }
}

/** Vertical rail with colored dots, grouped by day label (deck panel 12). */
@Composable
fun TimelineGroup(day: String, events: List<Triple<String, String, Color>>) {
    Column {
        Text(day.uppercase(), style = OroqType.Caption)
        Spacer(Modifier.height(8.dp))
        for ((title, meta, color) in events) {
            Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                Box(Modifier.padding(top = 4.dp).size(8.dp).clip(CircleShape).background(color))
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(title, style = OroqType.BodyOnDark)
                    Text(meta, style = OroqType.Caption)
                }
            }
        }
    }
}
```

- [ ] **Step 5: `Nav.kt` — the 5-tab bottom bar**

```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

enum class ParentTab(val label: String, val glyph: String) {
    HOME("Home", "⌂"), ACTIVITY("Activity", "≋"), DEVICES("Devices", "▢"),
    INSIGHTS("Insights", "◔"), MORE("More", "⋯"),
}

/** Deck: 5 tabs everywhere (panel 08's 4-tab bar is a deck defect). */
@Composable
fun BottomNav(active: ParentTab, onSelect: (ParentTab) -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(OroqColors.BgPrimary).padding(top = 8.dp, bottom = 14.dp),
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        for (tab in ParentTab.entries) {
            val color = if (tab == active) OroqColors.BluePrimary else OroqColors.TextSecondary
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.clickable { onSelect(tab) }.padding(horizontal = 10.dp),
            ) {
                Text(tab.glyph, style = OroqType.BodyOnDark.copy(color = color))
                Text(tab.label, style = OroqType.Caption.copy(color = color, fontWeight = FontWeight.Medium))
            }
        }
    }
}
```
(Tab glyphs are placeholder text glyphs; if the owner supplies icon SVGs later, swap inside `BottomNav` only — call sites don't change.)

- [ ] **Step 6: Compile**

Run: `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/ui/components
git commit -m "feat(android): deck component library — brand marks, cards, rows, chips, bottom nav"
```

---

### Task 7: `ConfidenceGauge` with animation + UI test

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/ConfidenceGauge.kt`
- Test: `android/app/src/androidTest/java/uk/co/cyberheroez/oroq/ui/GaugeTest.kt`

- [ ] **Step 1: Implement the gauge**

```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.parent.ConfidenceScore
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/**
 * Deck panel 06: circular gauge, track white-8%, sweep starts at 135°, round
 * caps, 800ms ease-out on first composition. Color follows the deck thresholds.
 */
@Composable
fun ConfidenceGauge(score: Int, size: Dp = 140.dp) {
    val color = when {
        score >= 80 -> OroqColors.BluePrimary
        score >= 60 -> OroqColors.Warning
        else -> OroqColors.Danger
    }
    var target by remember { mutableStateOf(0f) }
    val sweep by animateFloatAsState(target, tween(800), label = "gauge")
    LaunchedEffect(score) { target = score / 100f }

    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = this.size.minDimension * 0.085f
            val inset = stroke / 2
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            val topLeft = Offset(inset, inset)
            drawArc(OroqColors.Track, startAngle = 135f, sweepAngle = 270f, useCenter = false,
                topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
            drawArc(color, startAngle = 135f, sweepAngle = 270f * sweep, useCenter = false,
                topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(buildAnnotatedString {
                append(AnnotatedString("$score", SpanStyle(fontSize = 48.sp)))
                append(AnnotatedString("/100", SpanStyle(fontSize = 14.sp, color = OroqColors.TextSecondary)))
            }, style = OroqType.Metric)
            Text(ConfidenceScore.statusWord(score), style = OroqType.Caption.copy(color = color))
        }
    }
}
```

- [ ] **Step 2: Write the UI test**

```kotlin
package uk.co.cyberheroez.oroq.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import uk.co.cyberheroez.oroq.ui.components.ConfidenceGauge

class GaugeTest {
    @get:Rule val rule = createComposeRule()

    @Test fun gauge_shows_score_and_threshold_word() {
        rule.setContent { ConfidenceGauge(score = 91) }
        rule.onNodeWithText("91/100").assertExists()
        rule.onNodeWithText("Excellent").assertExists()
    }

    @Test fun gauge_at_risk_below_sixty() {
        rule.setContent { ConfidenceGauge(score = 42) }
        rule.onNodeWithText("At risk").assertExists()
    }
}
```

- [ ] **Step 3: Run the UI test on the emulator (must be running)**

Run: `./gradlew connectedDebugAndroidTest --tests '*GaugeTest*' 2>/dev/null || ./gradlew connectedDebugAndroidTest`
Expected: PASS. (If no device is attached, run `./gradlew assembleDebug assembleDebugAndroidTest -q` to at least compile the test, note the skip in the commit body, and run it at Task 18.)

- [ ] **Step 4: Commit**

```bash
git add app/src/main/java/uk/co/cyberheroez/oroq/ui/components/ConfidenceGauge.kt app/src/androidTest/java/uk/co/cyberheroez/oroq/ui/GaugeTest.kt
git commit -m "feat(android): animated Cyber Confidence gauge with deck thresholds"
```

### Task 8: Parent ViewModel + tabbed shell

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentViewModel.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentHomeActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

The new Compose host is `ParentHomeActivity` (the old view-based `parent.ParentActivity` keeps working until Task 17 deletes it and the new activity takes its manifest slot — at which point rename `ParentHomeActivity` to `ParentActivity`; until then `MainActivity` still routes to the old one, and you manually launch the new one for testing via the `adb` command in Step 4).

- [ ] **Step 1: `ParentViewModel.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.family.FamilyStore

data class ParentUiState(
    val snapshots: List<ChildSnapshot> = emptyList(),
    val stats: FamilyStats = Insights.derive(emptyList(), 0L),
    val refreshing: Boolean = false,
    val lastRefresh: Long = 0L,
)

class ParentViewModel(app: Application) : AndroidViewModel(app) {
    private val store = FamilyStore(app)
    private val repo = ParentRepository(app)
    private val _state = MutableStateFlow(ParentUiState())
    val state: StateFlow<ParentUiState> = _state

    init { refresh() }

    fun refresh() {
        _state.value = _state.value.copy(refreshing = true)
        viewModelScope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val snapshots = store.getChildren().map { child ->
                ChildSnapshot(
                    pairingId = child.pairingId,
                    label = child.label,
                    summary = repo.fetchSummary(child.pairingId),
                    fetchedAt = now,
                )
            }
            _state.value = ParentUiState(
                snapshots = snapshots,
                stats = Insights.derive(snapshots, now),
                refreshing = false,
                lastRefresh = now,
            )
        }
    }

    /** Sends [command] to one child (or every child when [pairingId] is null), then refreshes. */
    fun send(pairingId: String?, command: FamilyCommand) {
        viewModelScope.launch(Dispatchers.IO) {
            val targets = if (pairingId != null) listOf(pairingId)
            else _state.value.snapshots.map { it.pairingId }
            for (id in targets) repo.sendCommand(id, command)
            refresh()
        }
    }
}
```

- [ ] **Step 2: `ParentHomeActivity.kt` — Scaffold + tabs + NavHost**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import uk.co.cyberheroez.oroq.parent.screens.*
import uk.co.cyberheroez.oroq.ui.components.BottomNav
import uk.co.cyberheroez.oroq.ui.components.ParentTab
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

class ParentHomeActivity : ComponentActivity() {
    private val viewModel: ParentViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val nav = rememberNavController()
            var tab by remember { mutableStateOf(ParentTab.HOME) }
            Column(Modifier.fillMaxSize().background(OroqColors.BgPrimary)) {
                Box(Modifier.weight(1f)) {
                    NavHost(nav, startDestination = "home") {
                        composable("home") { HomeScreen(viewModel, nav) }
                        composable("activity") { ActivityScreen(viewModel) }
                        composable("devices") { DevicesScreen(viewModel, nav) }
                        composable("insights") { InsightsScreen(viewModel, nav) }
                        composable("more") { MoreScreen(viewModel, nav) }
                        composable("device/{id}") { entry ->
                            DeviceDetailScreen(viewModel, entry.arguments?.getString("id").orEmpty(), nav)
                        }
                        composable("recommendations") { RecommendationsScreen(viewModel) }
                        composable("timeline") { TimelineScreen(viewModel) }
                        composable("notifications") { NotificationsScreen(viewModel) }
                        composable("addchild") { AddChildScreen(viewModel, nav) }
                    }
                }
                BottomNav(active = tab) { selected ->
                    tab = selected
                    val route = when (selected) {
                        ParentTab.HOME -> "home"; ParentTab.ACTIVITY -> "activity"
                        ParentTab.DEVICES -> "devices"; ParentTab.INSIGHTS -> "insights"
                        ParentTab.MORE -> "more"
                    }
                    nav.navigate(route) { popUpTo("home"); launchSingleTop = true }
                }
            }
        }
    }
}
```
The `screens` package doesn't exist yet — create stub composables for all nine screens in one file `parent/screens/Stubs.kt` so this compiles, then Tasks 9–13 replace them one screen at a time (delete each stub as its real screen lands):
```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentViewModel

@Composable fun HomeScreen(vm: ParentViewModel, nav: NavController) { Text("home") }
@Composable fun ActivityScreen(vm: ParentViewModel) { Text("activity") }
@Composable fun DevicesScreen(vm: ParentViewModel, nav: NavController) { Text("devices") }
@Composable fun InsightsScreen(vm: ParentViewModel, nav: NavController) { Text("insights") }
@Composable fun MoreScreen(vm: ParentViewModel, nav: NavController) { Text("more") }
@Composable fun DeviceDetailScreen(vm: ParentViewModel, id: String, nav: NavController) { Text("device") }
@Composable fun RecommendationsScreen(vm: ParentViewModel) { Text("recs") }
@Composable fun TimelineScreen(vm: ParentViewModel) { Text("timeline") }
@Composable fun NotificationsScreen(vm: ParentViewModel) { Text("notifications") }
@Composable fun AddChildScreen(vm: ParentViewModel, nav: NavController) { Text("addchild") }
```

- [ ] **Step 3: Manifest entry**

Add next to the other activities:
```xml
        <activity android:name=".parent.ParentHomeActivity" android:exported="false" />
```

- [ ] **Step 4: Compile and smoke-launch**

```bash
./gradlew assembleDebug -q && adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n uk.co.cyberheroez.oroq/.parent.ParentHomeActivity
```
Expected: dark screen, stub text, working tab bar.

- [ ] **Step 5: Commit**

```bash
git add -A app/src/main
git commit -m "feat(android): Compose parent shell — 5-tab bottom nav, NavHost, family view model"
```

---

### Task 9: Home screen (deck panel 06)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/HomeScreen.kt` (remove the stub from `Stubs.kt`)

- [ ] **Step 1: Implement**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.*
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun HomeScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    val stats = state.stats
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        // Top bar: wordmark left, bell right (red dot = any event in the last day).
        Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            OroqWordmark()
            Spacer(Modifier.weight(1f))
            Box(Modifier.clickable { nav.navigate("notifications") }) {
                Text("🔔", style = OroqType.BodyOnDark)
                val hasRecent = state.snapshots.any { snap ->
                    snap.summary?.recentEvents?.any { state.lastRefresh - it.ts < 86_400_000L } == true
                }
                if (hasRecent) Box(
                    Modifier.align(Alignment.TopEnd).size(7.dp).clip(CircleShape)
                        .background(OroqColors.Danger)
                )
            }
        }

        // Hero card — Cyber Confidence.
        OroqCard {
            Text("CYBER CONFIDENCE", style = OroqType.Caption)
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ConfidenceGauge(score = stats.score, size = 130.dp)
                Spacer(Modifier.width(OroqDimens.GapGrid))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
                        StatTile("Threats Blocked", "${stats.threatsBlockedWeek}", "This week", modifier = Modifier.weight(1f))
                        StatTile("Unsafe Domains", "${stats.unsafeDomainsWeek}", "This week", modifier = Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
                        StatTile(
                            "Devices Protected", "${stats.devicesProtected}",
                            if (stats.devicesProtected == stats.deviceCount && stats.deviceCount > 0) "All secure" else "of ${stats.deviceCount}",
                            metaColor = OroqColors.Success, modifier = Modifier.weight(1f),
                        )
                        StatTile("Uptime", "${stats.uptimePercent}%", "This week", modifier = Modifier.weight(1f))
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Row {
                Text("Updated ${relativeTime(state.lastRefresh)}", style = OroqType.Caption)
                Spacer(Modifier.weight(1f))
                // Spec error-handling rule: manual refresh affordance; shows
                // stale state honestly instead of pretending freshness.
                SecondaryLink(if (state.refreshing) "Refreshing…" else "Refresh") { vm.refresh() }
            }
        }

        Spacer(Modifier.height(12.dp))

        // Recent Activity — 3 latest events across all children.
        OroqCard {
            Row {
                Text("Recent Activity", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                Spacer(Modifier.weight(1f))
                SecondaryLink("View all") { nav.navigate("activity") }
            }
            val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
                .sortedByDescending { it.ts }.take(3)
            if (events.isEmpty()) {
                Text("No activity yet — you're all set.", style = OroqType.Body)
            } else {
                for (e in events) ActivityRow(e.cat, e.type, e.label, e.ts)
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
```
Delete `HomeScreen` from `Stubs.kt`.

- [ ] **Step 2: Compile + launch + eyeball against deck panel 06**

```bash
./gradlew assembleDebug -q && adb install -r app/build/outputs/apk/debug/app-debug.apk && adb shell am start -n uk.co.cyberheroez.oroq/.parent.ParentHomeActivity
```
Expected: gauge animates to the derived score; tiles show derived numbers; empty-family shows score 0 / "At risk" honestly.

- [ ] **Step 3: Commit**

```bash
git add -A app/src/main
git commit -m "feat(android): parent Home — confidence gauge, stat grid, recent activity (deck 06)"
```

---

### Task 10: Activity screen (deck panel 07)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/ActivityScreen.kt` (remove stub)

- [ ] **Step 1: Implement**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.ActivityRow
import uk.co.cyberheroez.oroq.ui.components.FilterChips
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

private val THREATS = setOf("phishing", "malware")
private val WARNINGS = setOf("scam", "adult")

@Composable
fun ActivityScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    var filter by remember { mutableStateOf("All") }
    val week = state.lastRefresh - 7 * 86_400_000L
    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
        .filter { it.ts >= week }
        .sortedByDescending { it.ts }
        .filter {
            when (filter) {
                "Threats" -> it.cat in THREATS
                "Warnings" -> it.cat in WARNINGS
                "Info" -> it.cat !in THREATS && it.cat !in WARNINGS
                else -> true
            }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Activity", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        FilterChips(listOf("All", "Threats", "Warnings", "Info"), filter) { filter = it }
        Spacer(Modifier.height(8.dp))
        Text("Last 7 days", style = OroqType.Caption)
        if (events.isEmpty()) {
            Spacer(Modifier.height(24.dp))
            Text("Nothing in this window.", style = OroqType.Body)
        } else {
            LazyColumn { items(events) { e -> ActivityRow(e.cat, e.type, e.label, e.ts) } }
        }
    }
}
```
(The deck shows a `Last 7 days ▾` dropdown; the child only syncs the most recent 50 events, so other windows would lie — render it as a static label until the backend sub-project adds history. Note this in the commit body.)

- [ ] **Step 2: Compile + commit**

```bash
./gradlew assembleDebug -q
git add -A app/src/main
git commit -m "feat(android): parent Activity feed with category filter chips (deck 07)"
```

---

### Task 11: Devices + Device Details (deck panels 08–09)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/DevicesScreen.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/DeviceDetailScreen.kt` (remove both stubs)

- [ ] **Step 1: `DevicesScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ConfidenceScore
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.DeviceRow
import uk.co.cyberheroez.oroq.ui.components.FilterChips
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun DevicesScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    // The chip labels carry live counts, so track the selected *prefix* and
    // resolve the active label per composition — otherwise "All" never matches
    // "All (2)" and no chip highlights.
    var filterPrefix by remember { mutableStateOf("All") }
    val snaps = state.snapshots
    val active = snaps.filter { state.lastRefresh - it.fetchedAt < ConfidenceScore.FRESH_MS && it.summary != null }
    val shown = when (filterPrefix) {
        "Active" -> active
        "Inactive" -> snaps - active.toSet()
        else -> snaps
    }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Devices", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        val options = listOf("All (${snaps.size})", "Active (${active.size})", "Inactive (${snaps.size - active.size})")
        FilterChips(
            options,
            active = options.first { it.startsWith(filterPrefix) },
        ) { filterPrefix = it.substringBefore(" (") }
        Spacer(Modifier.height(8.dp))
        LazyColumn(Modifier.weight(1f)) {
            items(shown) { snap ->
                val fresh = snap.summary != null
                DeviceRow(
                    name = snap.label,
                    statusLine = if (fresh) "Active • Last seen ${relativeTime(snap.summary!!.ts)}" else "No data yet",
                    isProtected = snap.summary?.protectionOn == true,
                ) { nav.navigate("device/${snap.pairingId}") }
            }
        }
        PrimaryButton("Add a child device") { nav.navigate("addchild") }
        Spacer(Modifier.height(12.dp))
    }
}
```

- [ ] **Step 2: `DeviceDetailScreen.kt` — the four real toggles + existing editors**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.ToggleRow
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun DeviceDetailScreen(vm: ParentViewModel, pairingId: String, nav: NavController) {
    val state by vm.state.collectAsState()
    val snap = state.snapshots.firstOrNull { it.pairingId == pairingId } ?: return
    val summary = snap.summary
    // Optimistic local toggle state, reconciled on every refresh.
    var protection by remember(summary) { mutableStateOf(summary?.protectionOn == true) }
    var webFiltering by remember(summary) { mutableStateOf(summary?.categories?.isNotEmpty() == true) }
    var safeSearch by remember(summary) { mutableStateOf(summary?.safeSearchOn == true) }
    var ytRestricted by remember(summary) { mutableStateOf(summary?.ytRestrictedOn == true) }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = OroqDimens.PadScreen)) {
        SecondaryLink("‹ Back") { nav.popBackStack() }
        Text(snap.label, style = OroqType.H2)
        Text(
            if (summary != null) "Active • Last seen ${relativeTime(summary.ts)}" else "No data yet",
            style = OroqType.Caption,
        )
        Spacer(Modifier.height(16.dp))
        OroqCard {
            Text("PROTECTION", style = OroqType.Caption)
            Spacer(Modifier.height(6.dp))
            ToggleRow("AI Protection", protection) { on ->
                protection = on
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_PROTECTION, intValue = if (on) 1 else 0))
            }
            ToggleRow("Web Filtering", webFiltering) { on ->
                webFiltering = on
                // Off = clear categories; on = restore the default set the child app ships with.
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_CATEGORIES,
                    stringValue = if (on) "adult,phishing,malware" else ""))
            }
            ToggleRow("Safe Search", safeSearch) { on ->
                safeSearch = on
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_SAFE_SEARCH, intValue = if (on) 1 else 0))
            }
            ToggleRow("YouTube Restricted", ytRestricted) { on ->
                ytRestricted = on
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_YT_RESTRICTED, intValue = if (on) 1 else 0))
            }
        }
        Spacer(Modifier.height(12.dp))
        // Existing functionality, restyled (deck omits these; spec keeps them).
        CategoryEditor(vm, pairingId, summary?.categories ?: emptySet())
        Spacer(Modifier.height(12.dp))
        BlockedAppsEditor(vm, pairingId, summary?.installedApps ?: emptyList(), summary?.blockedApps ?: emptySet())
        Spacer(Modifier.height(16.dp))
    }
}
```
Port `CategoryEditor` and `BlockedAppsEditor` from the old `ChildDashboardActivity.kt` (sections `BLOCKED CATEGORIES` and `BLOCKED APPS` — read that file and translate each row to an `OroqCard` of `ToggleRow`s; categories come from `uk.co.cyberheroez.oroq.config.Categories`, commit via `vm.send(pairingId, FamilyCommand(SET_CATEGORIES/SET_BLOCKED_APPS, stringValue = joined))`). Put both in `DeviceDetailScreen.kt` below the main composable.
Also port the old dashboard's `REMOTE CONTROL` rows (grant extra time / daily limit) as a third card with the same commands (`GRANT_EXTRA_TIME`, `SET_DAILY_LIMIT`) — existing functionality is never dropped.

- [ ] **Step 3: Compile + commit**

```bash
./gradlew assembleDebug -q
git add -A app/src/main
git commit -m "feat(android): Devices list and Device Details with live protection toggles (deck 08-09)"
```

---

### Task 12: Insights + Recommendations (deck panels 10–11)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/InsightsScreen.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/RecommendationsScreen.kt` (remove stubs)

- [ ] **Step 1: `InsightsScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.categoryColor
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun InsightsScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    val week = state.lastRefresh - 7 * 86_400_000L
    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }.filter { it.ts >= week }
    val webThreats = events.filter { it.type == "web" && it.cat != null }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = OroqDimens.PadScreen)) {
        Text("Insights", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        Text("This week", style = OroqType.Caption)
        Spacer(Modifier.height(8.dp))
        OroqCard {
            Text("OroQ blocked", style = OroqType.Body)
            Text("${events.size}", style = OroqType.Metric)
            Text("potential threats", style = OroqType.Body)
        }
        Spacer(Modifier.height(12.dp))
        // Mini-stats row (deck-illegible; explicit assumption per spec):
        // threats / warnings / devices flagged.
        Row(horizontalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
            val threats = webThreats.count { it.cat in setOf("phishing", "malware") }
            val warnings = webThreats.count { it.cat in setOf("scam", "adult") }
            val flagged = state.snapshots.count { s -> s.summary?.recentEvents?.any { it.ts >= week } == true }
            for ((label, n) in listOf("Threats" to threats, "Warnings" to warnings, "Devices flagged" to flagged)) {
                OroqCard(Modifier.weight(1f)) {
                    Text("$n", style = OroqType.MetricSmall)
                    Text(label, style = OroqType.Caption)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        OroqCard {
            Text("Top categories", style = OroqType.BodyOnDark)
            Spacer(Modifier.height(8.dp))
            val byCat = webThreats.groupingBy { it.cat!! }.eachCount().entries.sortedByDescending { it.value }
            val total = webThreats.size.coerceAtLeast(1)
            if (byCat.isEmpty()) Text("No blocked threats this week.", style = OroqType.Body)
            for ((cat, n) in byCat) {
                val frac = n.toFloat() / total
                Row(Modifier.padding(vertical = 4.dp)) {
                    Text(cat.replaceFirstChar { it.uppercase() }, style = OroqType.Body, modifier = Modifier.width(110.dp))
                    Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(999.dp)).background(OroqColors.BgSurface2)) {
                        Box(Modifier.fillMaxWidth(frac).fillMaxHeight().clip(RoundedCornerShape(999.dp)).background(categoryColor(cat)))
                    }
                    Text(" ${(frac * 100).toInt()}%", style = OroqType.Caption)
                }
            }
        }
        SecondaryLink("View all recommendations") { nav.navigate("recommendations") }
        Spacer(Modifier.height(16.dp))
    }
}
```
(Deck's `Apps · Times · Websites` chips imply usage analytics the summary doesn't carry per-window; the Top-categories bars are the implemented core. Note in commit body.)

- [ ] **Step 2: `RecommendationsScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.RecommendationCard
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Deck panel 11 — each Enable pushes the real command to every child. */
@Composable
fun RecommendationsScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    val snaps = state.snapshots
    val allSafeSearch = snaps.isNotEmpty() && snaps.all { it.summary?.safeSearchOn == true }
    val allAdult = snaps.isNotEmpty() && snaps.all { it.summary?.categories?.contains("adult") == true }
    val allYt = snaps.isNotEmpty() && snaps.all { it.summary?.ytRestrictedOn == true }
    Column(
        Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Recommended for you", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        RecommendationCard("Enable Safe Search", "Helps filter explicit content", allSafeSearch) {
            vm.send(null, FamilyCommand(FamilyCommand.SET_SAFE_SEARCH, intValue = 1))
        }
        RecommendationCard("Block Adult Content", "Restrict access to adult websites", allAdult) {
            for (snap in snaps) {
                val cats = (snap.summary?.categories ?: emptySet()) + "adult"
                vm.send(snap.pairingId, FamilyCommand(FamilyCommand.SET_CATEGORIES, stringValue = cats.joinToString(",")))
            }
        }
        RecommendationCard("Enable YouTube Restricted Mode", "Additional protection for videos", allYt) {
            vm.send(null, FamilyCommand(FamilyCommand.SET_YT_RESTRICTED, intValue = 1))
        }
    }
}
```
Category id caveat: confirm `"adult"` matches an id in `config/Categories.kt` / the blocklist asset folder names (`android/app/src/main/assets/blocklists/`). If the real id differs (e.g. `adult_content`), use the real id here, in `THREAT_CATS` (Task 3), in `WARNINGS` (Task 10), and in `categoryColor`/`categoryTitle` (Task 6) — grep for them all in one pass.

- [ ] **Step 3: Compile + commit**

```bash
./gradlew assembleDebug -q
git add -A app/src/main
git commit -m "feat(android): Insights aggregations and live Recommendations (deck 10-11)"
```

---

### Task 13: Timeline, Notifications, More (deck panels 12–13)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/TimelineScreen.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/NotificationsScreen.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/MoreScreen.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/AddChildScreen.kt` (remove stubs)

- [ ] **Step 1: `TimelineScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.TimelineGroup
import uk.co.cyberheroez.oroq.ui.components.categoryColor
import uk.co.cyberheroez.oroq.ui.components.categoryTitle
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TimelineScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    val fmt = SimpleDateFormat("EEE d MMM", Locale.UK)
    val now = state.lastRefresh
    val groups = state.snapshots.flatMap { snap ->
        (snap.summary?.recentEvents ?: emptyList()).map { snap.label to it }
    }.sortedByDescending { it.second.ts }
        .groupBy { (_, e) ->
            val days = (now - e.ts) / 86_400_000L
            when (days) { 0L -> "Today"; 1L -> "Yesterday"; else -> fmt.format(Date(e.ts)) }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Timeline", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            items(groups.entries.toList()) { (day, entries) ->
                TimelineGroup(day, entries.map { (label, e) ->
                    Triple(categoryTitle(e.cat, e.type), "$label • ${e.label} • ${relativeTime(e.ts)}", categoryColor(e.cat))
                })
            }
        }
    }
}
```

- [ ] **Step 2: `NotificationsScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.ActivityRow
import uk.co.cyberheroez.oroq.ui.components.FilterChips
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Deck panel 13. Local, derived from synced events — push lands in sub-project 3. */
@Composable
fun NotificationsScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    var filter by remember { mutableStateOf("All") }
    val day = state.lastRefresh - 86_400_000L
    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
        .sortedByDescending { it.ts }
        .filter {
            when (filter) {
                "Unread" -> it.ts >= day
                "Important" -> it.cat in setOf("phishing", "malware")
                else -> true
            }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Notifications", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        FilterChips(listOf("All", "Unread", "Important"), filter) { filter = it }
        Spacer(Modifier.height(8.dp))
        if (events.isEmpty()) Text("Nothing here yet.", style = OroqType.Body)
        LazyColumn { items(events) { e -> ActivityRow(e.cat, e.type, e.label, e.ts) } }
    }
}
```

- [ ] **Step 3: `MoreScreen.kt` + `AddChildScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** The deck leaves "More" undefined; spec decision: timeline, notifications,
 *  children, settings, about. */
@Composable
fun MoreScreen(vm: ParentViewModel, nav: NavController) {
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("More", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        OroqCard {
            SecondaryLink("Timeline") { nav.navigate("timeline") }
            SecondaryLink("Notifications") { nav.navigate("notifications") }
            SecondaryLink("Add a child device") { nav.navigate("addchild") }
        }
        Spacer(Modifier.height(12.dp))
        OroqCard {
            Text("OroQ", style = OroqType.BodyOnDark)
            Text("See Risk. Act With Confidence.", style = OroqType.Caption)
            SecondaryLink("Sign out") {
                // Port the old ParentActivity sign-out exactly (clear the parent
                // token in FamilyStore, then route to RolePickerActivity).
            }
        }
    }
}
```
`AddChildScreen.kt` ports the old `AddChildActivity` flow into Compose: call `FamilyApi.pairCreate` (via a small suspend wrapper in `ParentViewModel`: add `fun createPairing(label: String, onResult: (CreatePairingResult?) -> Unit)` that mirrors `ParentRepository`'s token/keys usage — read `AddChildActivity.kt` lines 1–159 and translate its exact logic), then display:
- the 8-character code in a mono, letter-spaced chip (deck 5.3 style),
- a QR code of the bare code string rendered with ZXing (`com.google.zxing.qrcode.QRCodeWriter().encode(code, BarcodeFormat.QR_CODE, 512, 512)` → map `BitMatrix` to a `Bitmap` → `Image(bitmap.asImageBitmap(), …)` on a white `OroqCard`),
- expiry countdown from `expiresInSec`.

- [ ] **Step 4: Compile + commit**

```bash
./gradlew assembleDebug -q
git add -A app/src/main
git commit -m "feat(android): Timeline, Notifications, More tab, QR-enabled Add Child (deck 12-13)"
```

### Task 14: Child flow — Welcome, Setup, Pair, Allow, All set, Home (deck panels 04–05)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/child/ChildActivity.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/child/ChildScreens.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

Same migration pattern as Task 8: new activity beside the old ones until Task 17. Before writing screens, read `ChildOnboardingActivity.kt` and `LinkParentActivity.kt` in full — the pairing call (`FamilyApi.pairJoin` + `FamilyStore.setParentLink` + key exchange) and the permission gates (`MonitorPermissions`, VPN consent, notification permission) must be ported logic-identical; only the visuals change.

- [ ] **Step 1: `ChildActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui.child

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

class ChildActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val nav = rememberNavController()
            androidx.compose.foundation.layout.Box(Modifier.fillMaxSize().background(OroqColors.BgPrimary)) {
                NavHost(nav, startDestination = "welcome") {
                    composable("welcome") { WelcomeScreen(nav) }
                    composable("setup") { SetupScreen(nav) }
                    composable("pair") { PairScreen(nav) }
                    composable("scan") { ScanScreen(nav) }
                    composable("allow") { AllowProtectionScreen(nav) }
                    composable("allset") { AllSetScreen(nav) }
                    composable("childhome") { ChildHomeScreen() }
                }
            }
        }
    }
}
```

- [ ] **Step 2: `ChildScreens.kt` — deck copy verbatim**

```kotlin
package uk.co.cyberheroez.oroq.ui.child

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.ParentLink
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.normalizeCode
import uk.co.cyberheroez.oroq.ui.components.*
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
private fun ChildScaffold(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { Spacer(Modifier.height(48.dp)); content() }
}

@Composable
fun WelcomeScreen(nav: NavController) = ChildScaffold {
    OroqWordmark()
    Spacer(Modifier.height(24.dp))
    Text("Welcome to OroQ", style = OroqType.H2)
    Text("Your digital safety companion.", style = OroqType.Body)
    Spacer(Modifier.height(24.dp))
    OroqCard {
        for (feature in listOf(
            "AI-powered threat protection",
            "Real-time activity monitoring",
            "Privacy-first by design",
        )) Text("•  $feature", style = OroqType.BodyOnDark, modifier = Modifier.padding(vertical = 6.dp))
    }
    Spacer(Modifier.weight(1f))
    PrimaryButton("Get started") { nav.navigate("setup") }
    Spacer(Modifier.height(24.dp))
}

@Composable
fun SetupScreen(nav: NavController) = ChildScaffold {
    QSymbol(48.dp)
    Spacer(Modifier.height(16.dp))
    Text("Set up OroQ", style = OroqType.H2)
    Spacer(Modifier.height(24.dp))
    OroqCard {
        Text("1. Pair with parent", style = OroqType.BodyOnDark)
        Text("Securely connect this device to your parent's account.", style = OroqType.Caption)
        Spacer(Modifier.height(10.dp))
        Text("2. Allow protection", style = OroqType.BodyOnDark)
        Text("Enable AI protection and content filtering.", style = OroqType.Caption)
        Spacer(Modifier.height(10.dp))
        Text("✓ All set", style = OroqType.BodyOnDark.copy(color = OroqColors.Success))
        Text("You're ready. We'll keep you safe online.", style = OroqType.Caption)
    }
    Spacer(Modifier.weight(1f))
    PrimaryButton("Let's go") { nav.navigate("pair") }
    Spacer(Modifier.height(24.dp))
}

@Composable
fun PairScreen(nav: NavController) = ChildScaffold {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    Text("Pair with parent", style = OroqType.H2)
    // Deck copy adapted: 8-character (owner decision 2026-06-10), not 6.
    Text(
        "Ask your parent to generate an 8-character code on their OroQ app.",
        style = OroqType.Body,
    )
    Spacer(Modifier.height(16.dp))
    OutlinedTextField(
        value = code, onValueChange = { code = it; error = null },
        placeholder = { Text("Pair code", style = OroqType.Body) },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = OroqColors.BluePrimary,
            unfocusedBorderColor = OroqColors.Border,
            focusedTextColor = OroqColors.TextPrimary,
            unfocusedTextColor = OroqColors.TextPrimary,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    if (error != null) Text(error!!, style = OroqType.Caption.copy(color = OroqColors.Danger))
    SecondaryLink("Scan QR instead") { nav.navigate("scan") }
    Spacer(Modifier.weight(1f))
    PrimaryButton(if (busy) "Pairing…" else "Continue", enabled = !busy && code.isNotBlank()) {
        busy = true
        scope.launch {
            val ok = withContext(Dispatchers.IO) { joinPairing(context, normalizeCode(code)) }
            busy = false
            if (ok) nav.navigate("allow") else error = "That code didn't work — check it and try again."
        }
    }
    Spacer(Modifier.height(24.dp))
}

/** Port of LinkParentActivity's join logic — keep behaviour identical. */
suspend fun joinPairing(context: android.content.Context, code: String): Boolean {
    val store = FamilyStore(context)
    val keys = store.getOrCreateKeyPair()
    val result = familyApi().pairJoin(code, keys.publicKeysetB64) ?: return false
    store.setParentLink(ParentLink(result.pairingId, result.parentPublicKeyB64))
    return true
}

@Composable
fun AllowProtectionScreen(nav: NavController) = ChildScaffold {
    QSymbol(48.dp, ring = OroqColors.BluePrimary)
    Spacer(Modifier.height(16.dp))
    Text("Allow protection", style = OroqType.H2)
    Text(
        "OroQ will now protect this device from harmful content and online threats.",
        style = OroqType.Body,
    )
    Spacer(Modifier.height(16.dp))
    OroqCard {
        for (item in listOf("Block harmful content", "AI Scam protection", "Real-time monitoring"))
            Text("✓  $item", style = OroqType.BodyOnDark.copy(color = OroqColors.Success),
                modifier = Modifier.padding(vertical = 4.dp))
    }
    Spacer(Modifier.weight(1f))
    val context = LocalContext.current
    PrimaryButton("Allow & Continue") {
        // Trigger the existing permission gates: VPN consent + usage access +
        // overlay (port the exact intents from ChildOnboardingActivity /
        // MonitorPermissions — UsageReader.usageAccessIntent(),
        // UsageReader.overlayIntent(context), VpnService.prepare(context)).
        nav.navigate("allset")
    }
    Spacer(Modifier.height(24.dp))
}

@Composable
fun AllSetScreen(nav: NavController) = ChildScaffold {
    Text("✓", style = OroqType.Metric.copy(color = OroqColors.Success))
    Text("All set!", style = OroqType.H2)
    Text("You're protected. You can now browse with confidence.", style = OroqType.Body)
    Spacer(Modifier.weight(1f))
    // Deck typo "Allo to Home" fixed per deck spec instruction:
    PrimaryButton("Go to Home") { nav.navigate("childhome") { popUpTo("welcome") { inclusive = true } } }
    Spacer(Modifier.height(24.dp))
}

@Composable
fun ChildHomeScreen() = ChildScaffold {
    val context = LocalContext.current
    OroqWordmark()
    Spacer(Modifier.height(32.dp))
    QSymbol(96.dp)
    Spacer(Modifier.height(24.dp))
    // Slim child surface (AADC posture): protection state + paired badge only.
    val protectionOn = uk.co.cyberheroez.oroq.vpn.OroQVpnService.isActive
    Text(if (protectionOn) "You're protected" else "Protection is off", style = OroqType.H2)
    Text(
        if (protectionOn) "Browse with confidence." else "Ask a parent to turn protection back on.",
        style = OroqType.Body,
    )
}
```
Wire the `Allow & Continue` click to the real permission sequence ported from `ChildOnboardingActivity` (VPN consent via `VpnService.prepare` + activity-result launcher, then usage access, then overlay, then `startService` for both services — replicate its ordering and `ConfigRepository.completeOnboarding` handling exactly; the old activity remains the reference until it is deleted).

- [ ] **Step 3: Manifest + compile + smoke**

```xml
        <activity android:name=".ui.child.ChildActivity" android:exported="false" />
```
```bash
./gradlew assembleDebug -q && adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n uk.co.cyberheroez.oroq/.ui.child.ChildActivity
```
Expected: dark Welcome → Setup → Pair flow; a bad code shows the inline error.

- [ ] **Step 4: Commit**

```bash
git add -A app/src/main
git commit -m "feat(android): Compose child onboarding and pairing flow (deck 04-05)"
```

---

### Task 15: QR scan screen (deck panel 5.3)

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/child/ScanScreen.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Camera permission in manifest**

```xml
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
```

- [ ] **Step 2: Implement `ScanScreen.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui.child

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.navigation.NavController
import com.google.zxing.BinaryBitmap
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.normalizeCode
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType
import java.util.concurrent.Executors

/** An OroQ pairing code: 8 chars, letters/digits after normalisation. */
fun looksLikePairCode(text: String): Boolean {
    val t = normalizeCode(text)
    return t.length == 8 && t.all { it.isLetterOrDigit() }
}

@Composable
fun ScanScreen(nav: NavController) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var error by remember { mutableStateOf<String?>(null) }
    var handled by remember { mutableStateOf(false) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        granted = ok
        if (!ok) nav.popBackStack() // deck behaviour: fall back to manual entry
    }
    LaunchedEffect(Unit) { if (!granted) ask.launch(Manifest.permission.CAMERA) }

    Column(
        Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        Text("Scan QR code", style = OroqType.H2)
        Text("Scan the QR code from your parent's OroQ app.", style = OroqType.Body)
        Spacer(Modifier.height(16.dp))
        if (granted) {
            AndroidView(factory = { ctx ->
                val view = PreviewView(ctx)
                val executor = Executors.newSingleThreadExecutor()
                ProcessCameraProvider.getInstance(ctx).addListener({
                    val provider = ProcessCameraProvider.getInstance(ctx).get()
                    val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                    val reader = MultiFormatReader()
                    analysis.setAnalyzer(executor) { proxy ->
                        if (!handled) {
                            val data = ByteArray(proxy.planes[0].buffer.remaining())
                                .also { proxy.planes[0].buffer.get(it) }
                            val source = PlanarYUVLuminanceSource(
                                data, proxy.width, proxy.height, 0, 0, proxy.width, proxy.height, false)
                            val text = runCatching {
                                reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text
                            }.getOrNull()
                            if (text != null) {
                                if (looksLikePairCode(text)) {
                                    handled = true
                                    scope.launch {
                                        val ok = withContext(Dispatchers.IO) { joinPairing(ctx, normalizeCode(text)) }
                                        if (ok) nav.navigate("allow") else { handled = false; error = "That code didn't work — ask your parent for a fresh one." }
                                    }
                                } else error = "That's not an OroQ pairing code"
                            }
                        }
                        proxy.close()
                    }
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                }, ContextCompat.getMainExecutor(ctx))
                view
            }, modifier = Modifier.weight(1f).fillMaxWidth())
        } else {
            Spacer(Modifier.weight(1f))
        }
        if (error != null) Text(error!!, style = OroqType.Caption.copy(color = OroqColors.Danger))
        Text("Or enter code manually", style = OroqType.Caption)
        SecondaryLink("Cancel") { nav.popBackStack() }
        Spacer(Modifier.height(24.dp))
    }
}
```
(If `decodeWithState` rotation issues make detection flaky on the emulator, test on the Vivo — real camera + autofocus. The rotation-robust path adds `proxy.imageInfo.rotationDegrees` handling; only add it if scanning fails in practice — YAGNI.)

- [ ] **Step 3: Compile, install on the Vivo, scan a code from the parent's Add Child screen**

Run: `./gradlew assembleDebug -q && adb -d install -r app/build/outputs/apk/debug/app-debug.apk` (USB) or the wireless serial.
Expected: camera preview opens after consent; scanning the parent's QR pairs and lands on "Allow protection"; scanning any random QR shows "That's not an OroQ pairing code".

- [ ] **Step 4: Commit**

```bash
git add -A app/src/main
git commit -m "feat(android): QR pairing scan with CameraX + ZXing (deck 5.3)"
```

---

### Task 16: Re-theme Block overlay, Role picker, Parent login

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/BlockActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/RolePickerActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentLoginActivity.kt`

- [ ] **Step 1: Rebuild each body as Compose using the existing behaviour**

For each activity: keep the class name, intent extras, and every callback/flow identical; replace `setContentView(...)`/Style-built views with `setContent { ... }` on the deck components. Read each file first; the visual mapping is:
- **BlockActivity:** full-screen `BgPrimary`, `OroqCard` with the blocked domain/app label, category pill (`categoryColor`/`categoryTitle` from Task 6), the existing override/PIN entry and dismiss actions as `PrimaryButton`/`SecondaryLink`. Change `AppCompatActivity` to `ComponentActivity` only if the file doesn't rely on AppCompat features (it must keep `excludeFromRecents` behaviour, which lives in the manifest — unchanged).
- **RolePickerActivity:** deck panel 04 mood — wordmark top, `Welcome to OroQ` / `Which phone is this?`, two `OroqCard`s ("This is my child's phone" → routes to `ChildActivity`; "I'm a parent" → existing parent login route). Keep the `FamilyStore.setRole(...)` writes exactly as they are today.
- **ParentLoginActivity:** dark restyle of the email + OTP two-step (`FamilyApi.authRequest`/`authVerify` via its existing logic), `OutlinedTextField` styled as in Task 14's `PairScreen`, `PrimaryButton` actions.

- [ ] **Step 2: Compile + smoke each of the three screens on the emulator**

```bash
./gradlew assembleDebug -q && adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n uk.co.cyberheroez.oroq/.ui.RolePickerActivity
```
Expected: deck-dark role picker; child card opens the new `ChildActivity`; parent card opens the restyled login.

- [ ] **Step 3: Commit**

```bash
git add -A app/src/main
git commit -m "refactor(android): block overlay, role picker and parent login on deck design"
```

---

### Task 17: Cut over and delete the old UI

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt`
- Delete: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/Style.kt`, `ui/ChildOnboardingActivity.kt`, `ui/LinkParentActivity.kt`, `ui/MonitorPermissions.kt`, `parent/ParentActivity.kt`, `parent/ChildDashboardActivity.kt`, `parent/AddChildActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Re-route `MainActivity`**

In the role `when`: `CHILD` (onboarding incomplete) → `ChildActivity`; `CHILD` (complete) → rebuild `MainActivity`'s status view in Compose using the deck components (it is the child's day-to-day status screen — port `buildLayout()`/`updateStatus()` behaviour onto `ChildHomeScreen`-style composables, keeping the service-start calls in `setUpChildHome()` untouched); `PARENT` → `ParentHomeActivity`; null → `RolePickerActivity`.

- [ ] **Step 2: Rename `ParentHomeActivity` → `ParentActivity`** (now that the old one is gone) and update the manifest: remove the deleted activities' entries, keep `.parent.ParentActivity` pointing at the Compose host.

- [ ] **Step 3: Delete the old files, then hunt stragglers**

```bash
grep -rn "Style\.\|ChildOnboardingActivity\|LinkParentActivity\|ChildDashboardActivity\|AddChildActivity\|monitorPermissionView" app/src/main/java | grep -v "ui/child\|parent/screens"
```
Expected: no hits. Fix any by porting the reference to the Compose equivalent.

- [ ] **Step 4: Full build + all unit tests**

Run: `./gradlew testDebugUnitTest -q && ./gradlew assembleDebug -q && ./gradlew lintDebug -q`
Expected: green. Lint may flag unused resources from the old theme (`res/values/` teal colors) — delete what lint marks unused.

- [ ] **Step 5: Commit**

```bash
git add -A app/src/main
git commit -m "refactor(android)!: cut over to Compose UI, delete view-based screens and Style.kt"
```

---

### Task 18: End-to-end verification

- [ ] **Step 1: Full automated pass**

```bash
./gradlew testDebugUnitTest connectedDebugAndroidTest assembleDebug
```
Expected: everything green, including `GaugeTest` if it was deferred at Task 7.

- [ ] **Step 2: Two-device smoke (emulator = child, Vivo = parent, or vice versa)**

1. Parent: sign in → Add child → 8-char code + QR appear.
2. Child: full onboarding → scan QR → Allow protection (grant VPN + usage + overlay) → All set → Go to Home.
3. Child: visit a known-blocked domain → block overlay in deck style; event recorded with category.
4. Parent: pull-refresh Home → gauge/stats move off zero; Activity shows the event with the right pill; Devices shows the child Active + Protected; Device Details toggles flip Safe Search on → child's `www.google.com` resolves to 216.239.38.120 (verify: `adb shell nslookup www.google.com` on the child).
5. Recommendations: Enable YouTube Restricted → child summary reflects `ytRestrictedOn=true` on next sync.

- [ ] **Step 3: Performance sanity (deck §9 targets don't bind the app, but keep it honest)**

Cold-start `ParentActivity` on the Vivo; tab switches must feel instant; gauge animation must not jank (use `adb shell dumpsys gfxinfo uk.co.cyberheroez.oroq` if in doubt).

- [ ] **Step 4: Final commit & wrap-up**

Any fixes from the smoke pass get their own commits. Then update `docs/superpowers/specs/2026-06-10-oroq-app-redesign-design.md` risk R1 with the Compose/Kotlin versions that actually worked, and commit.

---

## Plan self-review notes (kept for the executor)

- **Category id check (Task 12 caveat) applies to Tasks 3, 6, 10, 12** — single grep pass, do it during Task 3.
- The `screens/Stubs.kt` file must be **empty and deleted** by the end of Task 13 — verify with `test ! -f app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/Stubs.kt`.
- Spec coverage: deck panels 04–13 → Tasks 9–16; tokens/components → Tasks 2, 6, 7; toggles enforcement → Task 5; categories on events → Task 4; derived stats → Task 3; QR both ends → Tasks 13 (generate) and 15 (scan); old-UI deletion → Task 17. Panels 01–03, 14, 15 are deck-only/out of scope per spec.



