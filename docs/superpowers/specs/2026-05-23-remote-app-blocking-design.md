# Remote app blocking — design

**Date:** 2026-05-23
**Status:** Approved (brainstorming)
**Predecessors:** [Child-slim, parent-full](2026-05-23-child-slim-parent-full-design.md). That iteration deliberately deferred remote app blocking because it requires an inventory sync this spec adds.

## Why

After the child-slim iteration, the parent dashboard can change categories and screen-time limits remotely — but not which apps are blocked. The child's `AppMonitorService` still enforces a blocked-apps set, but no UI on either side can populate it. To let the parent pick from the child's actual apps, the parent needs to see what's installed; that means a new child→parent inventory sync.

## Scope

This pass:

- Sync the child's user-installed apps (package name + label, no icons) to the parent inside the existing `FamilySummary` blob.
- Sync the child's currently-blocked-apps set too, so the parent UI shows the existing selection pre-ticked.
- Add one new remote command, `SET_BLOCKED_APPS`, structurally identical to `SET_CATEGORIES`.
- Add a "BLOCKED APPS" section on the parent's child-dashboard.

**Explicitly out of scope:**

- App **icons**. Sending icon PNGs (~5–20 KB each × 40+ apps) would balloon every summary upload to 1–2 MB. Text-only picker for v1; icons via a separate streamed endpoint if we ever want them.
- System apps (Settings, Phone, Camera, etc.). Filtered out on the child so the parent cannot accidentally lock essential comms — a Children's-Code "essential communications" concern.
- Search/filter UI in the picker. A scrolling alphabetical list is fine for typical child phones (~20–60 user apps).

## Architecture

### Child — inventory and reading

A new file, `monitor/InstalledAppReader.kt`, exposes one function:

```kotlin
fun listUserApps(context: Context): List<InstalledApp>
```

Reads `context.packageManager.getInstalledApplications(0)`, filters out anything with `ApplicationInfo.FLAG_SYSTEM` (and `FLAG_UPDATED_SYSTEM_APP`, since some preinstalled-then-updated apps lose `FLAG_SYSTEM` — using both catches them), pulls `loadLabel(packageManager).toString()` for each, returns a list sorted alphabetically by label. The class itself stays in `family/` near the rest of the inventory plumbing — separating it from `UsageReader` keeps each file responsible for one Android system service.

`InstalledApp` is a tiny new data class:

```kotlin
data class InstalledApp(val packageName: String, val label: String)
```

`FamilySyncWorker` calls `listUserApps(applicationContext)` once per cycle and threads the result through `buildSummary`. The cost (~30–60 PM lookups + label loads) happens on a WorkManager thread every 15 min — fine.

### `FamilySummary` additions

Two new fields:

```kotlin
data class FamilySummary(
    // ... existing ...
    val installedApps: List<InstalledApp> = emptyList(),
    val blockedApps: Set<String> = emptySet(),
)
```

`installedApps` is the inventory. `blockedApps` is the current selection on the child — needed so the parent picker pre-ticks the right boxes (mirror of how `categories` is exposed).

JSON wire format gains:

```json
"installedApps": [{"pkg": "...", "label": "..."}, ...],
"blockedApps": ["com.zhiliaoapp.musically", ...]
```

Parser tolerates either field's absence — old summaries from pre-update children still parse.

### New command — `SET_BLOCKED_APPS`

Reuses the `stringValue` slot added for `SET_CATEGORIES`. Payload is the comma-joined package set, empty string = no apps blocked.

```kotlin
companion object {
    const val GRANT_EXTRA_TIME = "grant_extra_time"
    const val SET_DAILY_LIMIT = "set_daily_limit"
    const val SET_CATEGORIES = "set_categories"
    const val SET_BLOCKED_APPS = "set_blocked_apps"   // new
}
```

`CommandSync` gets a fourth `when` branch:

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

No service restart needed — `AppMonitorService` re-reads `getBlockedApps()` every 1-second tick.

### Parent — repository + UI

`ParentRepository` gets:

```kotlin
fun sendSetBlockedApps(pairingId: String, packageNames: Set<String>): Boolean
```

Identical structure to `sendSetCategories`.

`ChildDashboardActivity` gets one new section after BLOCKED CATEGORIES:

```
BLOCKED APPS
☐ Chrome
☑ Instagram
☐ Maps
☑ TikTok
☐ WhatsApp
[ Save blocked apps ]
```

If `summary.installedApps.isEmpty()` (child hasn't synced inventory yet — they're on an old build, or first sync hasn't happened), the section renders one caption: "Waiting for the child phone to sync its app list…" with no checkboxes, no save button.

Picker reuses the same visual treatment as the categories picker (`WHITE_CHIP` rounded box, plain checkboxes), so the two pickers feel like one consistent form.

## Data flow

```
Child                            Server                       Parent
─────                            ──────                       ──────
listUserApps()                                                
buildSummary(installedApps,                                   
            blockedApps, …)                                   
encrypt + POST /sync ──────────► (stores ciphertext)         
                                                              
                                  (GET /sync ◄────── fetchSummary)
                                                              parseSummary →
                                                              renders picker
                                                              with installedApps
                                                              and blockedApps
                                                              
                                                              parent taps Save
                                                              encrypt + POST
                                                ◄────────────  /cmd
GET /cmd ──────────────────────► (returns queue)              
decrypt                                                       
config.setBlockedApps(set)                                    
ack                                                           
                                                              
AppMonitorService next tick                                   
sees new blocked set,                                         
shows BlockActivity if                                        
foreground app is blocked.                                    
```

No Worker change. No new endpoint.

## Security & privacy

- Inventory list is **end-to-end encrypted** — Worker only sees ciphertext, same as the rest of the summary.
- Inventory is a list of *what's on the phone*, not *what's being used*. Usage data still stays on-device.
- Zero-retention property unchanged: parent device decrypts and renders; nothing about installed apps lives on company servers in decryptable form.
- System apps are deliberately not synced so the parent UI cannot surface — let alone block — Settings, Phone, Messages.

## Testing

- Unit (`FamilyCommandTest`): `SET_BLOCKED_APPS` round-trip with stringValue; legacy commands without the new constant still parse.
- Unit (`FamilySummaryTest`): summary JSON round-trips with `installedApps` and `blockedApps` fields; parser tolerates absence of both.
- Manual on emulator + Vivo:
  1. Open parent dashboard for the child. Expect a populated BLOCKED APPS section listing the child's user apps alphabetically.
  2. Tick Chrome, save. Within ~30 s, opening Chrome on the emulator shows the block screen.
  3. Untick Chrome, save. Within ~30 s, Chrome opens normally.
  4. Sideload a new app on the emulator (any APK), wait one sync cycle (or trigger an immediate sync), confirm it appears in the parent picker.

## Open items (not blocking)

- App icons via a follow-up streamed inventory endpoint.
- Search/filter in the picker once a user complains (~50+ apps).
- Per-app schedule (e.g. "block TikTok 9 pm–7 am") — a separate, larger feature.
