# App-wise controls — per-app schedules, app approval, and protection heartbeat

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan
**Area:** Android child + parent (`android/app/src/main/java/uk/co/cyberheroez/oroq`)

## 1. Summary

Today OroQ enforces a **device-wide** daily screen-time limit plus a **binary
per-app blocklist** (an app is blocked or not). This spec adds three connected,
per-app capabilities, all built on the **existing overlay-block mechanism**
(`AppMonitorService` → `BlockActivity`) — no new high-risk Android APIs
(no AccessibilityService, no Device Admin/Owner):

1. **Per-app schedule** — a parent can give an approved app *blocked time
   windows* (curfew style; the app works outside the windows).
2. **App approval (default-deny new apps)** — every launchable app is either
   *Approved* or *Unapproved*. Newly installed apps default to *Unapproved* and
   are blocked by the overlay until the parent approves them.
3. **Protection heartbeat** — the child device periodically reports that it is
   alive and its permissions are intact; the parent sees protection status and
   is alerted when it drops (the realistic, Play-compliant answer to "child
   uninstalls/disables OroQ", since true uninstall-prevention is not possible
   for a consumer Play app).

## 2. Motivation & constraints

- **Why schedule, not minute-cap:** the requested model is time-of-day windows
  (e.g. "TikTok blocked 21:00–07:00"), not a per-app minute quota. Schedules are
  also **reinstall-proof** — they key on package name + clock, so uninstalling
  and reinstalling a blocked app does not bypass them.
- **Why heartbeat, not Device Admin:** Google Play restricts/deprecates Device
  Admin and does not grant consumer apps the power to prevent their own
  uninstall (that needs Device Owner via enterprise provisioning). The
  Play-safe mitigation is to **detect and notify**, not to block.
- **Why default-deny is Play-safe:** it reuses the same overlay-block primitive
  already shipping for the binary blocklist. It blocks *running* an app, never
  its *installation*, and uses no new sensitive API. Compliance still requires:
  app stays visible, permissions disclosed with a privacy policy (Parental
  Control category), no AccessibilityService.
- **Install control reality:** OroQ cannot stop the child installing apps from
  Play. It can *detect* new installs (already syncs `installedApps`) and *block
  running* them via default-deny. True install-approval at the Play layer is
  Google Family Link territory and out of scope.

## 3. Unified per-app model

Each launchable package on the child resolves to exactly one runtime state:

| State | Meaning | Runtime effect |
|---|---|---|
| **System-critical** | On a hard allowlist | Always ALLOW (never blocked, regardless of any rule) |
| **Unapproved** | Parent has not approved it (default for new apps) | BLOCK ("Not allowed yet") |
| **Approved, no schedule** | Parent approved, no windows | ALLOW (still subject to existing device-wide limit + legacy blocklist) |
| **Approved, in a blocked window** | Approved but current time falls in a blocked window for the app | BLOCK ("Blocked right now") |
| **Approved, outside windows** | Approved, windows exist but now is outside them | ALLOW |

**System-critical allowlist (never blocked):** the launcher/home package, the
Settings package, the default dialer/Phone + emergency dialer, the Play Store,
and OroQ itself. Resolved on the child (querying the system for the current
home/dialer where possible, plus a static fallback set). This guards against
bricking the device and against Play-review red flags.

### Schedule window shape

```
Window {
  startMinute: Int   // minutes since local midnight, 0..1439
  endMinute:   Int   // minutes since local midnight, 0..1439
  days:        Set<DayOfWeek>   // default = all 7 days
}
```

- **Overnight windows** (e.g. 21:00–07:00 where `end < start`) are valid and
  wrap past midnight. A window "belongs to" the day its `startMinute` falls on;
  enforcement checks both today's windows and yesterday's wrapping windows.
- **Default = every day:** a new window defaults to all 7 days, giving the
  "same every day" behaviour. The parent can deselect days to make it weekly
  (e.g. school nights only). This single shape covers both requested cases.
- Multiple windows per app are allowed (e.g. a midday and a night window).

## 4. Enforcement (child)

Extend the existing decision function and monitor loop. Current code:

- `monitor/BlockDecision.kt` — `decideBlock(foregroundApp, todayMinutes,
  blockedApps, limitMinutes, extraMinutes): BlockDecision` with hierarchy
  blocked-app > time-up > allow.
- `monitor/AppMonitorService.kt` — 1-second tick reads
  `UsageReader.currentForegroundApp()` and `todayForegroundMinutes()`, calls
  `decideBlock`, and shows `BlockActivity` on a non-ALLOW result.

### Changes

- Add a `nowMinuteOfDay` + `dayOfWeek` input (local time) and the new per-app
  inputs (`approvedApps`, `schedules`, `systemCriticalApps`) to the decision.
- New decision precedence (first match wins):
  1. `foregroundApp` is system-critical → **ALLOW**
  2. `foregroundApp` is OroQ itself → **ALLOW** (already handled)
  3. `foregroundApp` not in `approvedApps` → **BLOCK_UNAPPROVED**
  4. `foregroundApp` in a blocked schedule window for *now* → **BLOCK_SCHEDULE**
  5. legacy `foregroundApp in blockedApps` → **BLOCK_APP**
  6. device-wide `todayMinutes >= limit + extra` → **TIME_UP**
  7. else → **ALLOW**
- `BlockDecision` enum gains `BLOCK_UNAPPROVED` and `BLOCK_SCHEDULE`.
- `BlockActivity` gains copy for the two new reasons (e.g. "Not allowed yet —
  ask a parent to approve this app" and "Blocked right now — it's outside the
  allowed hours"). The existing 30-second poll-for-grant loop stays for
  `TIME_UP`; the schedule reasons clear themselves automatically when the clock
  leaves the window (the 1-second tick re-evaluates and dismisses).
- The decision function stays **pure** (no Android deps) so it is unit-testable;
  the service supplies the clock and config.

### Migration of the existing blocklist

The legacy binary blocklist (`blockedApps` / `SET_BLOCKED_APPS`) is retained for
backward compatibility and continues to work as step 5. New UI is built around
approval + schedules; the binary blocklist is not removed in this spec.

## 5. Data & sync

### Child storage — `config/ConfigRepository.kt` (DataStore)

Add:

- `approvedApps: Set<String>` — packages the parent has approved.
  `getApprovedApps()/setApprovedApps(Set<String>)`.
- `schedules: Map<String, List<Window>>` — per package. Stored as a single
  JSON string preference (`stringPreferencesKey`), encoded/decoded with the
  existing JSON helper style used elsewhere (`org.json`).
  `getSchedules()/setAppSchedule(pkg, List<Window>)`.

Defaults: an app **absent** from `approvedApps` is Unapproved. There is no
"approved by default" — that is the whole point of default-deny. (System-critical
apps are allowed regardless of this set, so the device stays usable from first
boot.)

### Command schema — `family/FamilyCommand.kt`

`FamilyCommand(type, intValue, stringValue)` is unchanged in shape. New types:

- `SET_APPROVED_APPS` — `stringValue` = comma-joined package names (full set,
  replace semantics, mirroring `SET_BLOCKED_APPS`).
- `SET_APP_SCHEDULE` — `stringValue` = JSON `{ "pkg": "...", "windows": [ {s,e,days[]} ] }`.
  Replace semantics for that one package. An empty `windows` array clears the
  app's schedule.

Applied in `family/CommandSync.kt#pollAndApplyCommands` alongside the existing
`SET_BLOCKED_APPS` / `SET_DAILY_LIMIT` handlers, writing through
`ConfigRepository`.

### Parent → child send — `parent/ParentRepository.kt`

Add convenience senders mirroring `sendSetBlockedApps`:
`sendSetApprovedApps(pairingId, Set<String>)` and
`sendSetAppSchedule(pairingId, pkg, List<Window>)`, both routing through the
existing encrypted `sendCommand` path (`FamilyApi.cmdSend`).

### Child → parent status (already partly present)

`family/FamilySummary.kt` already carries `installedApps` and per-app usage
top-list. No new per-app *usage* sync is required for this spec; the parent
already receives the installed-app list to drive the approval UI. (Showing
friendly labels for top apps is a known pre-existing gap, not in scope here.)

## 6. Parent UI — `parent/screens/DeviceDetailScreen.kt`

Replace/augment the current "Blocked apps" card with an **Apps** section driven
by `summary.installedApps`:

- Each app row shows label + an **Approve** toggle (off = Unapproved = blocked).
- An approved row exposes **Set schedule** → a window editor:
  - list of windows; each window has a start and end **time picker** and a row
    of **day chips** (S M T W T F S), all selected by default.
  - add/remove window; save sends `SET_APP_SCHEDULE`.
- Toggling Approve sends the updated full `SET_APPROVED_APPS` set.
- A short helper line explains default-deny ("New apps your child installs stay
  blocked until you approve them here").

The existing device-wide limit + grant card is unchanged.

## 7. Heartbeat

Goal: the parent learns when the child's protection stops (app uninstalled,
force-stopped, or core permissions revoked) even though OroQ cannot prevent it.

- **Child:** extend `family/FamilySyncWorker.kt` (already periodic, ~15 min) to
  include a status payload in its upload: `lastSeen` timestamp +
  `permissionsOk` (VPN prepared, usage access, overlay all granted — the same
  checks `MainActivity.isReadyToShowHome()` / `permissionsGranted()` already
  perform). If a permission is missing, the worker still reports (so the parent
  sees `permissionsOk = false`).
- **Parent:** `DeviceDetailScreen` shows a protection banner derived from the
  child summary: **Active** (recent `lastSeen`, `permissionsOk = true`),
  **Permissions off** (`permissionsOk = false`), or **Offline since X** (no
  check-in beyond a threshold, e.g. 2× the sync interval).
- **Alert:** when status transitions to Offline or Permissions-off, the parent
  is notified via the existing push channel (`push/OroqMessagingService.kt`).
  The exact server-side trigger (relay detects a stale/declining heartbeat and
  pushes) is delegated to the implementation plan; the client contract here is
  the heartbeat fields and the parent banner.

## 8. Testing

Pure-logic, no-Android tests carry the weight:

- `decideBlock` boundary tests for the new precedence: system-critical wins over
  everything; unapproved blocks; in-window vs out-of-window (including the
  exact start/end minute boundaries); overnight wrap (yesterday's window still
  blocking after midnight); day-of-week filtering; legacy blocklist + time-up
  still honoured after the new rules.
- Window encode/decode round-trip (JSON), including overnight and multi-window.
- `ConfigRepository` approved-apps + schedule persistence round-trip.
- `CommandSync` applies `SET_APPROVED_APPS` / `SET_APP_SCHEDULE` correctly
  (including the clear-schedule empty-array case).
- Heartbeat: `permissionsOk` reflects each missing permission; parent banner
  state derivation (active / permissions-off / offline) from a summary.

## 9. Out of scope (explicit)

- Per-app **minute quotas** (only schedules in this spec).
- Device Admin / Device Owner / any uninstall-prevention.
- Hiding the app icon (forbidden by Play policy).
- Play-layer install approval (Google Family Link territory).
- Server/relay implementation details of the heartbeat push trigger (named, but
  specified at the client contract level only).
- Friendly-label fix for the existing top-apps summary.

## 10. Affected files (reference)

- `monitor/BlockDecision.kt` — new inputs, precedence, enum values
- `monitor/AppMonitorService.kt` — supply clock + per-app config to the decision
- `monitor/UsageReader.kt` — reuse `currentForegroundApp()` (no change expected)
- `ui/BlockActivity.kt` — copy for `BLOCK_UNAPPROVED` / `BLOCK_SCHEDULE`
- `config/ConfigRepository.kt` — approvedApps + schedules storage
- `family/FamilyCommand.kt` — new command types (constants only)
- `family/CommandSync.kt` — apply new commands
- `family/FamilySyncWorker.kt` — heartbeat fields in upload
- `family/FamilySummary.kt` — heartbeat status fields
- `parent/ParentRepository.kt` — new senders
- `parent/screens/DeviceDetailScreen.kt` — Apps section + schedule editor + status banner
- `push/OroqMessagingService.kt` — receive protection-down alert (no new channel)
- New: a `Window`/schedule model + JSON codec (likely under `config/` or `monitor/`)
