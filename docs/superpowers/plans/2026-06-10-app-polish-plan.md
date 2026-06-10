# OroQ App Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add empty/loading states, motion, and a visual-refinement pass to the deck-faithful Compose app — presentation only, no behaviour, backend, or permission changes.

**Architecture:** New shared composables (`EmptyState`, `OnboardingCard`, `Skeleton`, `GlowBox`, `StatusPill`, `ScreenColumn`) and motion helpers (`Modifier.pressable`, `Modifier.staggeredEntrance`, nav transition specs), then applied across the parent screens. All motion is gated on the OS animation-scale setting.

**Tech Stack:** Jetpack Compose (BOM 2025.05.00), Material3 (`PullToRefreshBox`), existing `OroqTheme`.

**Spec:** `docs/superpowers/specs/2026-06-10-app-polish-design.md`.

**Conventions:** branch `feat/app-polish`; run from `android/` (`./gradlew testDebugUnitTest assembleDebug -q`, `connectedDebugAndroidTest` for Compose UI tests with the emulator running). Commit per task, no Co-Authored-By trailer. Touch only presentation — if a change needs a ViewModel/logic edit, stop; it's out of scope.

---

### Task 1: Branch + theme additions

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/theme/OroqTheme.kt`

- [ ] **Step 1:** `git checkout -b feat/app-polish` from up-to-date `main`.

- [ ] **Step 2: Add spacing tokens + H3 to the theme.** In `OroqType` (after `H2`):
```kotlin
    val H3 = TextStyle(fontFamily = Inter, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, color = OroqColors.TextPrimary)
```
In `OroqDimens`:
```kotlin
    val SectionGap = 12.dp
    val ScreenTop = 16.dp
```

- [ ] **Step 3:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 4:** Commit: `feat(android): add H3 type + spacing tokens for the polish pass`

---

### Task 2: `GlowBox` + `StatusPill`

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Glow.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/StatusPill.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Rows.kt`

- [ ] **Step 1: `Glow.kt`** — radial blue glow drawn behind content (deck §0.1).
```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

/** Wraps [content] with a soft radial blue glow rising from bottom-centre. */
@Composable
fun GlowBox(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier.drawBehind {
            drawRect(
                Brush.radialGradient(
                    colors = listOf(OroqColors.BluePrimary.copy(alpha = 0.30f), OroqColors.BluePrimary.copy(alpha = 0f)),
                    center = Offset(size.width / 2f, size.height),
                    radius = size.width * 0.75f,
                ),
            )
        },
        content = content,
    )
}
```

- [ ] **Step 2: `StatusPill.kt`** — the single pill used everywhere.
```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** One pill shape for every status/severity/category tag: 999dp, 14% fill, full-opacity text. */
@Composable
fun StatusPill(label: String, color: Color, modifier: Modifier = Modifier) {
    Text(
        label,
        style = OroqType.Caption.copy(color = color, fontWeight = FontWeight.SemiBold),
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(OroqColors.pill(color))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}
```

- [ ] **Step 3: Route `DeviceRow`'s pill through `StatusPill`.** In `Rows.kt`, replace the inline `Text(... if (isProtected) "Protected" ...)` pill with:
```kotlin
        StatusPill(
            label = if (isProtected) "Protected" else "Unprotected",
            color = if (isProtected) OroqColors.Success else OroqColors.Danger,
        )
```
(Remove the now-unused `pillColor`/`RoundedCornerShape`/`clip`/`background` imports only if nothing else in the file uses them — verify before deleting.)

- [ ] **Step 4:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 5:** Commit: `feat(android): GlowBox + unified StatusPill component`

---

### Task 3: `EmptyState` + `OnboardingCard` + `Skeleton`

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/EmptyState.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/components/Skeleton.kt`

- [ ] **Step 1: `EmptyState.kt`** — calm centred empty + the Home onboarding card.
```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Calm centred empty state for a tab with no data yet. */
@Composable
fun EmptyState(title: String, subtitle: String, accent: Color = OroqColors.BlueAccent, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().padding(top = 64.dp, start = 24.dp, end = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(56.dp).clip(CircleShape).background(OroqColors.pill(accent)))
        Spacer(Modifier.height(16.dp))
        Text(title, style = OroqType.H3, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(subtitle, style = OroqType.Body, textAlign = TextAlign.Center)
    }
}

/** Home/Devices first-run invitation (approved direction B): glow, Q ring, one CTA. */
@Composable
fun OnboardingCard(onAddChild: () -> Unit) {
    GlowBox(Modifier.fillMaxWidth().clip(
        androidx.compose.foundation.shape.RoundedCornerShape(OroqDimens.RadiusCard),
    ).background(OroqColors.BgSurface)) {
        Column(
            Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            QSymbol(size = 56.dp)
            Spacer(Modifier.height(14.dp))
            Text("Add your first device", style = OroqType.H3)
            Spacer(Modifier.height(6.dp))
            Text(
                "Pair a child's phone to start seeing protection, blocked threats and screen time here.",
                style = OroqType.Body, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(16.dp))
            PrimaryButton("Add a child device", onClick = onAddChild)
        }
    }
}

/** The muted "What you'll see here" teaser below the onboarding card. */
@Composable
fun WhatYouWillSeeCard() {
    OroqCard {
        Text("What you'll see here", style = OroqType.BodyOnDark)
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for ((label, color) in listOf(
                "Protection" to OroqColors.Success,
                "Threats" to OroqColors.Danger,
                "Screen time" to OroqColors.Warning,
            )) {
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(OroqColors.pill(color)))
                    Spacer(Modifier.height(4.dp))
                    Text(label, style = OroqType.Caption)
                }
            }
        }
    }
}
```

- [ ] **Step 2: `Skeleton.kt`** — shimmer placeholder for first load.
```kotlin
package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

/** A single shimmering placeholder block. */
@Composable
fun Skeleton(height: Dp, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val alpha by transition.animateFloat(
        initialValue = 0.04f, targetValue = 0.12f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "shimmer",
    )
    Box(
        modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(OroqDimens_RadiusTile))
            .background(OroqColors.TextPrimary.copy(alpha = alpha))
            .semantics { contentDescription = "Loading" },
    )
}

private val OroqDimens_RadiusTile = 12.dp
```
(Use `uk.co.cyberheroez.oroq.ui.theme.OroqDimens.RadiusTile` if you prefer the import over the local val — either compiles; the import is cleaner, swap it.)

- [ ] **Step 3:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 4:** Commit: `feat(android): EmptyState, OnboardingCard, Skeleton components`

---

### Task 4: Home — onboarding card, glow, skeleton (with UI test)

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/screens/HomeScreen.kt`
- Test: `android/app/src/androidTest/java/uk/co/cyberheroez/oroq/ui/HomeEmptyTest.kt`

- [ ] **Step 1: Write the UI test** — empty shows onboarding, populated shows the gauge. The screen takes a `ParentViewModel`; the test drives it through a fake by constructing the composable with a stubbed state. Since `HomeScreen` reads `vm.state`, test via a thin seam: extract the body into `HomeContent(state, onAddChild, onViewAll, onRefresh, onBell)` and test that.

```kotlin
package uk.co.cyberheroez.oroq.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import uk.co.cyberheroez.oroq.parent.ChildSnapshot
import uk.co.cyberheroez.oroq.parent.HomeContent
import uk.co.cyberheroez.oroq.parent.Insights
import uk.co.cyberheroez.oroq.parent.ParentUiState
import uk.co.cyberheroez.oroq.family.FamilySummary

class HomeEmptyTest {
    @get:Rule val rule = createComposeRule()

    @Test fun empty_shows_onboarding_not_gauge() {
        rule.setContent { HomeContent(ParentUiState(), {}, {}, {}, {}) }
        rule.onNodeWithText("Add your first device").assertIsDisplayed()
    }

    @Test fun populated_shows_gauge_not_onboarding() {
        val now = 1_700_000_000_000L
        val snap = ChildSnapshot("p1", "Mia",
            FamilySummary(ts = now, protectionOn = true, screenTimeTodayMin = 0, dailyLimitMin = 0), now)
        val state = ParentUiState(listOf(snap), Insights.derive(listOf(snap), now), false, now)
        rule.setContent { HomeContent(state, {}, {}, {}, {}) }
        rule.onNodeWithText("CYBER CONFIDENCE").assertIsDisplayed()
    }
}
```

- [ ] **Step 2:** `./gradlew compileDebugAndroidTestKotlin` — Expected: FAIL (`HomeContent` not found).

- [ ] **Step 3: Refactor `HomeScreen` into `HomeScreen(vm, nav)` + `HomeContent(state, …)`.** `HomeScreen` collects state and passes callbacks; `HomeContent` is the existing body but, when `state.snapshots.isEmpty()`, renders `OnboardingCard(onAddChild) + Spacer + WhatYouWillSeeCard()` in place of the gauge card + recent-activity card. When non-empty, the current gauge/stats/recent-activity render unchanged. Wrap the gauge in `GlowBox`. Keep the existing top bar (wordmark + bell) in both states.

Skeleton: when `state.refreshing && state.lastRefresh == 0L`, render three `Skeleton(height = …)` blocks instead of either branch.

```kotlin
@Composable
fun HomeScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    HomeContent(
        state = state,
        onAddChild = { nav.navigate("addchild") },
        onViewAll = { nav.navigate("activity") },
        onRefresh = { vm.refresh() },
        onBell = { nav.navigate("notifications") },
    )
}

@Composable
fun HomeContent(
    state: ParentUiState,
    onAddChild: () -> Unit,
    onViewAll: () -> Unit,
    onRefresh: () -> Unit,
    onBell: () -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = OroqDimens.PadScreen)) {
        // top bar (wordmark + bell) — unchanged from current implementation
        // …
        when {
            state.refreshing && state.lastRefresh == 0L -> {
                Spacer(Modifier.height(OroqDimens.ScreenTop))
                Skeleton(height = 150.dp); Spacer(Modifier.height(OroqDimens.SectionGap))
                Skeleton(height = 90.dp)
            }
            state.snapshots.isEmpty() -> {
                Spacer(Modifier.height(OroqDimens.ScreenTop))
                OnboardingCard(onAddChild)
                Spacer(Modifier.height(OroqDimens.SectionGap))
                WhatYouWillSeeCard()
            }
            else -> {
                // existing gauge card (wrapped in GlowBox) + recent-activity card,
                // with onViewAll / onRefresh / onBell wired to the params.
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
```
(Port the existing top-bar, gauge card, and recent-activity card verbatim into the `else` branch and the shared top — only the empty/skeleton branches are new. Replace the old "Refresh" `SecondaryLink` call with `onRefresh`; pull-to-refresh lands in Task 7.)

- [ ] **Step 4:** `./gradlew connectedDebugAndroidTest --tests '*HomeEmptyTest*'` (emulator running) — Expected: PASS. If no device, `./gradlew assembleDebugAndroidTest -q` to compile and defer the run to Task 8.

- [ ] **Step 5:** Install + eyeball both states on the emulator (it currently has a paired child → gauge; use a second fresh run or clear data to see onboarding).

- [ ] **Step 6:** Commit: `feat(android): Home onboarding/skeleton states + gauge glow (deck polish)`

---

### Task 5: Empty states on Activity, Devices, Insights, Notifications, Timeline

**Files:**
- Modify: `parent/screens/ActivityScreen.kt`, `DevicesScreen.kt`, `InsightsScreen.kt`, `NotificationsScreen.kt`, `TimelineScreen.kt`

- [ ] **Step 1:** Replace each screen's bare empty text with `EmptyState`:
  - **Activity / Notifications:** `EmptyState("Nothing blocked yet", "When OroQ blocks something, it shows up here.")` when the list is empty.
  - **Timeline:** `EmptyState("No events yet", "Pairing, blocks and protection changes will appear over time.")`.
  - **Insights:** when no week events, `EmptyState("Insights are coming", "Once there's a week of activity, you'll see trends here.")`.
  - **Devices:** when `snaps.isEmpty()`, render `OnboardingCard { nav.navigate("addchild") }` instead of the "No devices here yet." text (dedupes the CTA). Keep the bottom "Add a child device" button only when devices exist.

- [ ] **Step 2:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 3:** Commit: `feat(android): calm empty states across parent tabs`

---

### Task 6: Motion — nav transitions + Modifier helpers

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/motion/Motion.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentActivity.kt`

- [ ] **Step 1: `Motion.kt`** — animation-scale gate + Modifier helpers.
```kotlin
package uk.co.cyberheroez.oroq.ui.motion

import android.provider.Settings
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.scale
import androidx.compose.ui.platform.LocalContext

/** True unless the user has disabled animations system-wide. */
@Composable
fun animationsEnabled(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) != 0f
    }
}

/** Press-scale feedback for tappable surfaces. */
fun Modifier.pressable(interaction: MutableInteractionSource): Modifier = composed {
    val pressed by interaction.collectIsPressedAsState()
    val enabled = animationsEnabled()
    val scale by animateFloatAsState(
        if (pressed && enabled) 0.98f else 1f,
        spring(stiffness = Spring.StiffnessMedium), label = "press",
    )
    this.scale(scale)
}
```

- [ ] **Step 2: Nav transitions** in `ParentActivity`'s `NavHost`. Add `enterTransition`/`exitTransition` on the `NavHost` (cross-fade for tabs) and on pushed `composable`s a slide+fade. Gate behind `animationsEnabled()`:
```kotlin
val anim = animationsEnabled()
NavHost(
    nav, startDestination = "home",
    enterTransition = { if (anim) fadeIn(tween(200)) else EnterTransition.None },
    exitTransition = { if (anim) fadeOut(tween(200)) else ExitTransition.None },
) { /* … */ }
```
(Imports: `androidx.compose.animation.*`, `androidx.compose.animation.core.tween`.)

- [ ] **Step 3:** `./gradlew assembleDebug -q` — Expected: BUILD SUCCESSFUL.
- [ ] **Step 4:** Commit: `feat(android): nav transitions + pressable feedback, gated on OS animation scale`

---

### Task 7: Pull-to-refresh + card entrance stagger

**Files:**
- Modify: `parent/screens/HomeScreen.kt`, `ActivityScreen.kt`, `DevicesScreen.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/motion/Motion.kt`

- [ ] **Step 1: `staggeredEntrance`** in `Motion.kt`:
```kotlin
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.layout

/** Fade + 12dp rise, staggered by [index] (first 4 only), once per first composition. */
fun Modifier.staggeredEntrance(index: Int): Modifier = composed {
    if (!animationsEnabled() || index > 3) return@composed this
    val progress = remember { androidx.compose.animation.core.Animatable(0f) }
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(index * 50L)
        progress.animateTo(1f, tween(260, easing = LinearOutSlowInEasing))
    }
    this.alpha(progress.value).layout { measurable, constraints ->
        val placeable = measurable.measure(constraints)
        val dy = ((1f - progress.value) * 12.dp.toPx()).toInt()
        layout(placeable.width, placeable.height) { placeable.place(0, dy) }
    }
}
```

- [ ] **Step 2: Pull-to-refresh on Home.** Wrap `HomeContent`'s scroll in Material3 `PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh)`. Remove the inline "Refresh" link from the populated gauge card (gesture replaces it). Keep a "Refresh" row in `MoreScreen` for discoverability.
```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh() }) {
        HomeContent(state, { nav.navigate("addchild") }, { nav.navigate("activity") }, { nav.navigate("notifications") })
    }
}
```
(Drop the `onRefresh` param from `HomeContent` since the gesture owns it; update the Task-4 test call sites to the new arity. Verify `PullToRefreshBox` exists in BOM 2025.05.00 — it does as `androidx.compose.material3.pulltorefresh.PullToRefreshBox`; if the signature differs, use the `Modifier.pullRefresh` + `PullToRefreshContainer` form.)

- [ ] **Step 3: Apply `staggeredEntrance` to cards** on Home (`else` branch cards), Activity rows are a `LazyColumn` (skip — list items animate via the list), Devices and Insights top cards. Index them 0,1,2,… in composition order.

- [ ] **Step 4:** `./gradlew assembleDebug -q` and re-run `*HomeEmptyTest*` (fix arity) — Expected: green.
- [ ] **Step 5:** Commit: `feat(android): pull-to-refresh + first-load card stagger`

---

### Task 8: Full verification

- [ ] **Step 1:** `./gradlew testDebugUnitTest connectedDebugAndroidTest assembleDebug -q` — Expected: all green (HomeEmptyTest + GaugeTest + unit suites).
- [ ] **Step 2: Device eyeball (R1 mitigation):** install on the emulator; walk every tab. Confirm: empty Home shows the onboarding card; a paired child shows the glowing gauge; tab switches cross-fade; pull-to-refresh works; stagger plays once and isn't sluggish; toggling "Settings → Developer options → Animator duration scale = off" disables all motion.
- [ ] **Step 3:** Lint: `./gradlew lintDebug -q` — fix any newly-unused resource/import warnings.
- [ ] **Step 4:** Final commit for any eyeball fixes; branch ready for review/merge.

## Self-review notes

- Spec coverage: empty states §1 → Tasks 3–5; Home direction-B → Task 4; skeleton → Tasks 3–4; motion §2 (transitions/pull-to-refresh/press/stagger) → Tasks 6–7; refinement §3 (glow/spacing/StatusPill/typography) → Tasks 1–2 + applied in 4–5; accessibility (animation gate, button labels, skeleton contentDescription) → Tasks 3,6.
- The `HomeContent` seam is introduced in Task 4 and its arity changes in Task 7 (pull-to-refresh removes `onRefresh`) — Task 7 Step 2 explicitly updates the test call sites; param order elsewhere: `HomeContent(state, onAddChild, onViewAll, onBell)` after Task 7.
- No backend/ViewModel logic changed; if any step appears to need it, that's a signal to stop (stated in conventions).
- `PullToRefreshBox` availability flagged as the one API risk (spec R2) with a documented fallback.
