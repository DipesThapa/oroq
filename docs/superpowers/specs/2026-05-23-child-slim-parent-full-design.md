# Child-slim, Parent-full — design

**Date:** 2026-05-23
**Status:** Approved (brainstorming)
**Predecessors:** [Family Link spec](2026-05-22-safebrowse-parent-remote-view-design.md), Plans A1/A2a/A2b/B/C all implemented.

## Why

The current child-side `SettingsActivity` (PIN-locked) lets the child themselves change blocked categories, blocked apps, daily limit, and PIN. Once the device is paired to a parent, those controls should only exist on the parent's side — so a parent never needs to physically pick up the child's phone to adjust anything. The child sees only their protection status.

This also removes the local PIN escape hatch on the time's-up screen: the only way to get more time is for the parent to grant it remotely (already supported via Plan C).

## Scope

This pass:

- Strip child phone down to a single screen ("Protected" status + linked-parent line) plus a one-time onboarding for permissions and pairing.
- Move blocked-categories control to the parent dashboard. Daily-limit and grant-extra-time are already there from Plan C; the dashboard gains a visible *current value* for the daily limit so the parent knows what's set.
- Add one new remote command type: `set_categories`.

**Explicitly out of scope (deferred):**

- Remote *app* blocking. It needs the child's installed-app inventory to be synced to the parent first — a separate plan.
- A "toggle protection on/off" remote. Protection is on iff the child has granted VPN permission; revoking it is a system-level action that the parent can't do remotely either way. Parent dashboard shows `NOT PROTECTED` when it happens.

## Architecture

### Child phone — final shape

**One screen only:** `ChildHomeActivity`.

```
        SAFEBROWSE

     ┌─────────────┐
     │             │
     │ ✅ PROTECTED │
     │             │
     └─────────────┘

   Linked to mom@x.com
```

- Status badge is `PROTECTED` when both: (a) `SafeBrowseVpnService.isActive` is true, and (b) all monitoring permissions still granted. Otherwise `NOT PROTECTED` in red — tapping it opens the relevant system-permission screen so the child can restore it.
- Linked-parent line shows the parent email captured during pairing. Non-interactive.
- No menu, no buttons, no PIN prompt anywhere in child mode.

**First run (child role):** `ChildOnboardingActivity` (new):

1. Intro: "This is the child's phone."
2. Walk through system permissions one by one — VPN consent, Usage Access, Display over other apps, Battery exemption. Each step is "Open settings" → returns → "Granted, next".
3. `LinkParentActivity` (existing, unchanged) — pair with a parent via the short code.
4. Start `SafeBrowseVpnService` + `AppMonitorService`.
5. Arrive at `ChildHomeActivity`.

If permissions are revoked or pairing lost later, `ChildHomeActivity` shows the corresponding red status and tap-to-fix. No need to re-onboard.

### Parent dashboard — new controls

`ChildDashboardActivity` adds two visible blocks beside the existing remote-control row:

```
REMOTE CONTROL
[ Grant 30 minutes ]
[ Change daily limit ]
   currently: 90 min        ← NEW: visible current value

BLOCKED CATEGORIES           ← NEW section
☑ Adult content
☑ Gambling
☐ Social media
☐ Gaming
[ Save categories ]
```

Current values for both come from the child's most recent uploaded `FamilySummary` (next section).

## Data flow

### New remote command: `set_categories`

`FamilyCommand` is extended with an optional string payload:

```kotlin
data class FamilyCommand(
    val type: String,
    val intValue: Int = 0,
    val stringValue: String = "",
)
```

JSON serializer always writes both fields. Parser tolerates either missing — old queued `grant_extra_time` / `set_daily_limit` commands (which only carry `intValue`) keep working unchanged.

Constants:

```kotlin
companion object {
    const val GRANT_EXTRA_TIME = "grant_extra_time"
    const val SET_DAILY_LIMIT = "set_daily_limit"
    const val SET_CATEGORIES = "set_categories"   // NEW
}
```

For `SET_CATEGORIES`, `stringValue` is the comma-joined category ids — e.g. `"adult,gambling"`. Empty string means "no categories" (allow everything).

**Transport is unchanged from Plan C:** parent encrypts with child's pubkey → POST `/cmd/:pairingId` → child sync polls → decrypts → applies → acks. `AppliedCommandLog` already dedupes by id.

### Applying `SET_CATEGORIES` on child

`CommandSync.pollAndApplyCommands` gains one new branch:

```kotlin
FamilyCommand.SET_CATEGORIES -> {
    val ids = command.stringValue.split(",").filter { it.isNotBlank() }.toSet()
    config.setEnabledCategories(ids)
    restartVpnIfActive(context)
}
```

`restartVpnIfActive` does:

```kotlin
if (SafeBrowseVpnService.isActive) {
    context.startService(
        Intent(context, SafeBrowseVpnService::class.java)
            .setAction(SafeBrowseVpnService.ACTION_STOP)
    )
    context.startService(Intent(context, SafeBrowseVpnService::class.java))
}
```

The 1–2 second window between stop and restart leaves the device unfiltered — accepted trade-off, since this only happens when the parent explicitly changes categories.

If restart fails (e.g., VPN permission revoked), the command still acks. The protection status in the next sync will be `false`, which surfaces on the parent dashboard as `NOT PROTECTED` — the parent's signal to ask the child to fix permissions.

### Syncing current values to parent

`FamilySummary` gains one field:

```kotlin
data class FamilySummary(
    // ... existing fields ...
    val categories: Set<String>,   // NEW: currently enabled category ids
)
```

`dailyLimitMin` is already in the summary. The builder (`buildSummary` in `family/SummaryBuilder.kt` or equivalent — confirm at implementation time) populates `categories` from `ConfigRepository.getEnabledCategories()`. Encrypted payload format absorbs the new key; parser tolerates absence for back-compat with summaries written before this change.

Parent dashboard reads `summary.categories` to pre-tick the checkboxes and `summary.dailyLimitMin` for the current-limit caption.

### Parent command send

`ParentRepository` gains:

```kotlin
fun sendSetCategories(pairingId: String, categories: Set<String>): Boolean {
    val command = FamilyCommand(
        type = FamilyCommand.SET_CATEGORIES,
        stringValue = categories.joinToString(","),
    )
    return sendCommand(pairingId, command)   // reuse existing encrypt+enqueue
}
```

Dashboard "Save categories" button calls this. After success, optimistically updates the UI to the saved set and shows a toast: "Sent — categories update reaches the phone shortly". The actual confirmation is implicit: the next summary upload (≤15 min) reflects the new value.

## Files affected

**Deleted (child no longer needs them):**

- `ui/OnboardingActivity.kt`
- `ui/SettingsActivity.kt`
- `ui/AppBlockActivity.kt`
- `ui/ScreenTimeActivity.kt`
- `ui/PinPrompt.kt`

**New:**

- `ui/ChildHomeActivity.kt` — pure status screen.
- `ui/ChildOnboardingActivity.kt` — guided permissions + pair flow.

**Modified:**

- `MainActivity.kt` — routing only: no role → RolePicker; role=Child → ChildHome (or ChildOnboarding if not ready); role=Parent → ParentActivity. PIN unlock removed.
- `family/FamilyCommand.kt` — add `stringValue` field + `SET_CATEGORIES` constant; update JSON serializer/parser.
- `family/CommandSync.kt` — handle `SET_CATEGORIES` (set categories + restart VPN).
- `family/FamilySummary.kt` — add `categories: Set<String>` field; update serializer/parser.
- `family/SummaryBuilder.kt` + `family/FamilySyncWorker.kt` — `buildSummary` takes the current categories; the worker reads them from `ConfigRepository` and passes them in.
- `parent/ChildDashboardActivity.kt` — new BLOCKED CATEGORIES section + current-limit line.
- `parent/ParentRepository.kt` — add `sendSetCategories`.
- `ui/BlockActivity.kt` — remove the PIN-grant "Grant 30 more minutes" button; only "Go to home screen" remains. (Remote grant still works via the 30-second poll.)
- `AndroidManifest.xml` — remove deleted activities; register ChildHome/ChildOnboarding.
- `config/Categories.kt` — already exposes `SELECTABLE`; parent dashboard will import it to render the picker (no change needed unless an `id` is missing).

**Roughly:** 5 deleted, 2 new, ~9 modified.

## Migration

No production users yet — emulator + Vivo are the only paired devices. Plan:

1. On the emulator (child), `adb uninstall` then fresh install — new ChildOnboarding runs, re-pair.
2. On Vivo (parent), reinstall — role already PARENT, login session may need re-entry, paired-children list preserved (or re-add via the new pairing).
3. Old PIN / categories in DataStore on the child are unused after the cut; harmless leftover.

A note in the changelog/commit covers this for future re-runs.

## Security & privacy

- Zero-retention property preserved: `set_categories` is end-to-end encrypted just like the existing two commands; the Worker still only sees ciphertext.
- Removing the local PIN doesn't open a new attack vector — the child was never able to *grant themselves more time without the PIN*; with this change, no one on the device can. Time grant is purely remote.
- The "linked to *parent email*" line on child home is the only personal data displayed; it's the email the child's parent typed when pairing, already on the child's device.
- Non-covert / transparency: child still clearly knows they're managed (the home screen says so explicitly).

## Testing

- Unit (`FamilyCommandTest`): round-trip parse/serialize of `SET_CATEGORIES` with stringValue; old commands without stringValue still parse (back-compat).
- Unit (`FamilySummaryTest` or equivalent): summary JSON round-trips with new `categories` field; parser tolerates absence (back-compat).
- Unit (`ParentRepositoryTest` or similar): `sendSetCategories` encodes the set as comma-joined `stringValue`.
- Manual on emulator + Vivo:
  1. Parent toggles "Adult" off, saves → within ~30 s the child VPN restarts and a previously-blocked adult domain now resolves; protection status stays `PROTECTED`.
  2. Parent ticks "Adult" back on → VPN restarts → domain blocked again.
  3. Child home shows `PROTECTED` and the parent email; no menu reachable.
  4. Time's-up screen on child has only "Go to home screen" — no PIN prompt; parent grant still arrives within 30 s and dismisses it.

## Open items (not blocking)

- Remote app blocking — needs app-inventory sync (separate spec).
- Hardening: per-pairing `/cmd` and `/sync` upload tokens (already noted as a follow-up in `project-native-app-direction`).
- Wrap private keyset with Android Keystore (existing follow-up).
