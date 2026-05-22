# SafeBrowse Android v2 — App Blocking & Screen Time Design

> **For agentic workers:** the next step after this spec is the `superpowers:writing-plans`
> skill — turn this design into Plan 5. Do not start implementation from this document.

**Date:** 2026-05-22
**Status:** Approved design, pending implementation plan (Plan 5).

---

## 1. Overview & goal

Add the two parental-control capabilities deliberately deferred from the MVP:

- **App blocking** — the parent picks apps the child can never open.
- **Screen time** — track daily on-device usage, show it to the parent, and
  enforce a daily limit; when the limit is reached the device locks until the
  parent grants more time or the next day begins.

This is **v2** of the SafeBrowse Android app. The MVP (Plans 1-4) shipped web
content filtering only; that scope note explicitly listed app blocking and
screen-time limits as v2.

## 2. Background

- The app is a native Android (Kotlin, Views) parental-control app. The MVP does
  on-device DNS web filtering via a `VpnService`, with onboarding, a PIN-locked
  parent area, and weekly blocklist updates.
- App blocking and screen time use a **different mechanism** from the DNS filter
  — they need Android's `UsageStatsManager`, not the VPN.
- During brainstorming the parent's goals were settled: screen time should both
  *show* usage and *enforce* a daily limit; app blocking is a simple
  always-blocked list (no schedules).

## 3. Scope

### In scope (v2)

- An **always-blocked app list** — chosen apps cannot be opened.
- **Screen-time tracking** — today's total usage and top apps, shown to the
  parent on the child's device.
- A **daily screen-time limit** — when reached, all apps are blocked behind a
  "Time's up" screen; the parent can enter the PIN to grant extra minutes.
- New parent-area screens to configure both.

### Out of scope (deferred)

- Time-of-day **schedules** (bedtime/school windows) and **per-app time limits**.
- A separate **parent app**, remote viewing, or device pairing.
- **Tamper hardening** beyond the MVP level (Device Owner mode) — a determined
  user can still revoke Usage Access or uninstall the app.

## 4. Core constraints (carried from the MVP)

1. **On-device, zero-retention.** Usage data is read live from Android's
   `UsageStatsManager`; it is shown to the parent on the child's device and is
   never transmitted or persisted long-term. Only the parent's *configuration*
   (blocked apps, the limit) is stored locally.
2. **Non-covert.** The child can see SafeBrowse and its block screens.
3. The app must remain **Play Store-publishable** — see §10.

## 5. Architecture — UsageStats polling

The chosen approach (Approach A from brainstorming): a foreground service polls
Android's `UsageStatsManager`; no Accessibility Service and no overlay window.

### 5.1 Components

| Component | Responsibility |
|-----------|----------------|
| `AppMonitorService` | Foreground service; polls usage every ~1s and acts on the decision |
| `BlockDecision` (pure) | `decide(...)` — given current state, returns ALLOW / BLOCK_APP / TIME_UP |
| `UsageReader` | Wraps `UsageStatsManager`: current foreground app + today's usage |
| `BlockActivity` | Full-screen block screen — two modes (app blocked, time's up) |
| `AppBlockActivity` | Parent screen: pick apps to block |
| `ScreenTimeActivity` | Parent screen: today's usage + set the daily limit |
| `ConfigRepository` | Extended with the v2 keys (§6) |

### 5.2 The monitor loop

`AppMonitorService` runs as a foreground service and, roughly once per second:

1. Reads the current foreground app package and today's total foreground
   minutes from `UsageReader`.
2. Calls `BlockDecision.decide(foregroundApp, todayMinutes, blockedApps,
   limitMinutes, extraMinutes)`.
3. If the result is `BLOCK_APP` or `TIME_UP`, launches `BlockActivity` with that
   reason. `ALLOW` does nothing.

Launching an Activity from a background service is restricted on Android 10+
(background-activity-launch). The app declares the `SYSTEM_ALERT_WINDOW`
("display over other apps") permission, which grants the exemption needed to
show the block screen reliably. The permission is used **only** for that
exemption — the block screen is a normal full-screen Activity, not a drawn
overlay window.

The decision function is pure and unit-tested:

```
decide(foregroundApp, todayMinutes, blockedApps, limitMinutes, extraMinutes):
  if foregroundApp in blockedApps            -> BLOCK_APP
  if limitMinutes > 0
     and todayMinutes >= limitMinutes + extraMinutes -> TIME_UP
  else                                       -> ALLOW
```

### 5.3 Lifecycle

The monitor runs **alongside web protection** — the Home screen's "Start
protection" starts both the `VpnService` and the `AppMonitorService`; "Stop"
stops both. The user sees a single protection toggle. `AppMonitorService` and
`SafeBrowseVpnService` are separate service classes (separation of concerns —
DNS filtering vs usage polling) but share that one on/off state.

### 5.4 Trade-offs

- A blocked app is caught on the next poll tick — a ~1-2 second delay before the
  block screen appears. Acceptable for parental control.
- A second foreground service adds minor battery cost; the VPN foreground
  service is already running, so the incremental cost is small.

## 6. Data model

`ConfigRepository` (Preferences DataStore) gains:

| Key | Type | Meaning |
|-----|------|---------|
| `blocked_apps` | string set | Package names the child cannot open |
| `daily_limit_minutes` | int | Daily screen-time limit; `0` means no limit |
| `extra_minutes` | int | Extra minutes the parent granted today |
| `extra_date` | string | The date `extra_minutes` applies to (ISO `yyyy-MM-dd`) |

`extra_minutes` only counts when `extra_date` equals the current date — this is
how the grant resets each day. Today's *usage* is not stored; it is read live
from `UsageStatsManager` each tick.

## 7. The block screen

`BlockActivity` is full-screen, launched by `AppMonitorService`, and has two
modes:

- **App blocked** — "This app is blocked" with a single "Go to home" action.
  No PIN override: the parent chose to block it; they unblock it in Settings.
- **Time's up** — "Screen time is up for today" with a parent PIN field.
  Entering the correct PIN grants extra time (`+15` / `+30` minutes — written to
  `extra_minutes` / `extra_date`), after which the child may continue.

To resist dodging: `BlockActivity` is launched with `FLAG_ACTIVITY_NEW_TASK` and
covers the screen; if the child navigates away while still in violation, the
next poll tick re-launches it. Going to the launcher clears the block (the
launcher is not a blocked app); reopening a blocked app blocks again.

`BlockActivity` is styled with the existing `ui/Style.kt` design system.

## 8. UI additions

The PIN-locked **Settings** screen gains two rows (alongside the existing
Categories and Reliability sections):

- **App blocking** → `AppBlockActivity` — a list of installed *launchable* apps
  (icon + name + checkbox; system apps excluded). Ticked apps are saved to
  `blocked_apps`.
- **Screen time** → `ScreenTimeActivity` — shows today's total screen time and
  top apps (from `UsageStatsManager`), and a control to set the daily limit
  (hours/minutes; off = no limit), saved to `daily_limit_minutes`.

Both are reached only from the already-PIN-gated Settings, so they inherit that
gate.

### Usage Access permission

App blocking and screen time need the `PACKAGE_USAGE_STATS` permission, which is
granted by the user on a system settings screen (not a normal runtime
permission). When the parent opens App blocking or Screen time, or starts
protection, and the permission is not granted, the app shows a clear prompt with
a button that deep-links to the Usage Access settings screen
(`Settings.ACTION_USAGE_ACCESS_SETTINGS`). Until it is granted, the monitor and
the screen-time view cannot function.

## 9. Testing strategy

1. **Unit tests** (JVM, no emulator): `BlockDecision.decide` across boundaries —
   exactly at the limit, at limit+extra, a blocked app, limit disabled; and the
   "extra time only counts today" date logic.
2. **Instrumented / manual** (developer, on a device): the Usage Access
   permission flow; `AppMonitorService` launching `BlockActivity` over a blocked
   app; the time's-up flow including PIN grant; the screen-time view showing
   real usage.

The decision logic is pure and TDD-friendly; the `UsageStatsManager`,
foreground-service, and Activity behaviour are verified manually on the
emulator, as in Plans 2-3.

## 10. Play Store considerations

- The approach uses **`PACKAGE_USAGE_STATS`**, a foreground service, and
  **`SYSTEM_ALERT_WINDOW`** (the latter only for the background-activity-launch
  exemption — see §5.2 — not to draw overlays). It does **not** use an
  Accessibility Service — deliberately, to avoid the heavy Play Store review
  scrutiny that Accessibility-based parental apps face. This was the decisive
  reason this approach was chosen over an Accessibility-based design.
- The app must declare the foreground service and its type, and present Usage
  Access honestly to the user.
- Standard child-safety / UK Children's Code obligations from the MVP spec still
  apply; v2 collects no additional data off-device.

## 11. Out-of-scope / future

- Time-of-day schedules and per-app limits.
- A parent app and remote management.
- Device Owner provisioning for tamper-proof enforcement.
