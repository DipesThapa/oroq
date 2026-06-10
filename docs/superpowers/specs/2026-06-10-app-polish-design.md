# OroQ App Polish — Design

**Date:** 2026-06-10
**Goal:** Take the deck-faithful Compose app beyond the static mockups — proper empty/loading states, motion, and a visual-refinement pass — without changing behaviour or data flows.

**Scope:** Parent and child UI only. No backend, no new permissions, no logic changes. Pure presentation. Brand assets (real `oroq_logo.svg`) explicitly **out** — owner will supply later.

## 1. Empty & loading states

**Principle:** an empty screen is an invitation, never a broken dashboard. No alarming red or dead zeros before there is real data.

- **Home (approved direction B):** when `snapshots` is empty, replace the gauge+stats card with an `OnboardingCard` — white Q-ring over the deck's radial blue glow, "Add your first device", subcopy, and a primary "Add a child device" button routing to `addchild`. Below it, a muted "What you'll see here" card with three pill icons (Protection / Threats / Screen time). The real gauge+stat grid render unchanged the moment a device pairs.
- **Activity / Notifications / Timeline (empty):** centered icon-in-pill + one-line headline + subcopy ("No activity yet" → "Nothing's been blocked — that's good news."). Replaces the bare left-aligned grey text.
- **Devices (empty):** reuse the Home onboarding card's "Add a child device" CTA (deduped into one `EmptyState` composable).
- **Insights (empty):** "Insights appear once there's a week of activity" with the same calm treatment.
- **Loading (first fetch, no cache yet):** a `Skeleton` composable — rounded shimmer blocks matching card/tile shapes — shown while `refreshing && lastRefresh == 0L`. Subsequent refreshes keep showing cached data (no skeleton flash), per the existing stale-while-refresh behaviour.

New shared composables in `ui/components/`: `EmptyState(icon, title, subtitle, action?)`, `OnboardingCard(...)`, `Skeleton(...)`, `GlowBox(...)` (see §3).

## 2. Motion & micro-interactions

All durations short and interruptible; respect the system "remove animations" setting (`Settings.Global.ANIMATOR_DURATION_SCALE` → if 0, skip).

- **Tab + screen transitions:** `NavHost` gets a cross-fade (`fadeIn/fadeOut`, 200ms) for tab switches and a subtle slide-in-from-end (≤16dp) + fade for pushed detail screens. Back reverses it.
- **Pull-to-refresh:** Home (and Activity/Devices) wrap their scroll in Material3 `PullToRefreshBox` bound to `vm.refresh()` / `state.refreshing`. The text "Refresh" link is removed from Home (gesture replaces it; keep a "Refresh" affordance in `More` for discoverability).
- **Press & toggle feedback:** tappable cards/rows get a press scale (0.98, spring) via a shared `Modifier.pressable()`; buttons get a ripple in `BluePrimary`; the Material `Switch` already animates its thumb — confirm colors animate too.
- **Card entrance stagger:** on a screen's first composition, cards `fadeIn + slideInVertically` (12dp) staggered ~50ms each, capped at the first 4 cards so it never feels slow. Only on first load, not on every recomposition or refresh.

New: `ui/motion/Transitions.kt` (nav transition specs), `Modifier.pressable()`, `Modifier.staggeredEntrance(index)`.

## 3. Visual refinement

- **Deck gradient glows:** `GlowBox` — a radial `BluePrimary → transparent` behind the Home gauge and the child-flow Q marks, matching deck §0.1. Drawn on the Canvas/Box background, low opacity (~0.3), never behind text.
- **Spacing & rhythm:** introduce `OroqDimens` additions — `SectionGap = 12.dp`, `ScreenTop = 16.dp`, consistent `PadScreen` everywhere. Audit every screen to use these instead of ad-hoc values. One screen scaffold helper `ScreenColumn(title) { }` so titles/padding are identical across tabs.
- **Status-pill consistency:** one `StatusPill(label, color)` composable (shape 999dp, 14% fill, full-opacity text, fixed vertical padding) used by activity severity, device Protected/Unprotected, and category tags. Removes the three slightly-different pill styles today.
- **Typography:** verify every `Text` uses an `OroqType` style (no inline `fontSize` except the gauge's intentional composite). Tighten `Caption` tracking and `H2` sizes to deck §0.2 exactly. Add `OroqType.H3` (18/600) for in-card titles currently using ad-hoc weights.

## Error handling & accessibility

- Motion gated on the OS animation-scale setting (no jank for users who disable animations).
- `EmptyState` / `OnboardingCard` actions are real buttons (TalkBack-labelled), not tap-only boxes.
- Skeletons carry a `contentDescription` of "Loading".

## Testing

- **Compose UI tests:** Home shows `OnboardingCard` when no devices and the gauge when ≥1 device; `EmptyState` renders on each empty tab; `Skeleton` shows only on first load.
- **Existing tests** stay green (no logic touched).
- **Manual:** emulator walkthrough of every screen empty→populated; verify stagger plays once; verify "remove animations" disables motion.

## Risks

- **R1 — over-animation:** stagger + transitions can feel sluggish. Mitigation: short durations, 4-card cap, first-load-only, and a device eyeball pass before merge.
- **R2 — PullToRefresh API:** Material3 `PullToRefreshBox` is the current API on the Compose BOM in use; confirm at implementation, fall back to `pullRefresh` modifier if signatures differ.
