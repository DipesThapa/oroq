# OroQ → OroQ rename — design

**Date:** 2026-06-04
**Status:** Approved (brainstorming)
**Predecessors:** [Release signing + AAB](2026-06-01-release-signing-aab-design.md) (paused at Task 1; will resume post-rename).

## Why

The product is being renamed from **OroQ** to **OroQ** before any Play Store submission. Caught just before the first signed AAB would have locked the `uk.co.cyberheroez.oroq` package name on Play — Android `applicationId` becomes a permanent identity once published, so this is the last chance to rename without forever-mismatched brand and package.

## Scope

This pass executes a coordinated rename across four surfaces:

- **Android app** — package, applicationId, Kotlin namespace, classes, manifest, strings, UI brand strings, DataStore file names.
- **Backend** — new Cloudflare Worker name + URL (`oroq-family.cyberheroez.workers.dev`), reusing the existing D1 + KV by ID.
- **Blocklists** — new Cloudflare Pages project (`oroq-blocklists.pages.dev`), redeployed assets.
- **Docs + memory + repo dir** — string replacements through in-repo docs; Claude memory directory + repo directory moved.

**Explicitly out of scope:**

- Re-running the release-signing + AAB plan. That plan is paused at Task 1 (no key generated) and will resume with updated alias `oroq-upload` once this rename completes.
- Privacy policy / store listing rewrites for OroQ copy — these were already out-of-scope of the release-signing plan and remain so; their separate specs will use the new name.
- A logo/visual rebrand. The bold-and-playful design language and colours stay; only strings change.
- Migration of paired data in DataStore. Old build installs lose their pairings; new build (different applicationId) installs fresh. Re-pairing on test devices is the acknowledged cost.

## Final naming

| Surface | Old | New |
|---|---|---|
| Local repo dir | `/Users/apple/Desktop/Projects/oroq` | `/Users/apple/Desktop/Projects/oroq` |
| Android applicationId | `uk.co.cyberheroez.oroq` | `uk.co.cyberheroez.oroq` |
| Android Kotlin namespace | `uk.co.cyberheroez.oroq` | `uk.co.cyberheroez.oroq` |
| App display name | `OroQ` | `OroQ` |
| In-UI brand string | `OROQ` | `OROQ` |
| VPN service class | `OroQVpnService` | `OroQVpnService` |
| VPN STOP intent action | `uk.co.cyberheroez.oroq.STOP_VPN` | `uk.co.cyberheroez.oroq.STOP_VPN` |
| Worker name | `oroq-family` | `oroq-family` |
| Worker URL | `oroq-family.cyberheroez.workers.dev` | `oroq-family.cyberheroez.workers.dev` |
| Pages project | `oroq-blocklists` | `oroq-blocklists` |
| Pages URL | `oroq-blocklists.pages.dev` | `oroq-blocklists.pages.dev` |
| DataStore name (config) | `oroq_config` | `oroq_config` |
| Claude memory dir | `~/.claude/projects/-Users-apple-Desktop-Projects-oroq` | `~/.claude/projects/-Users-apple-Desktop-Projects-oroq` |

D1 database ID `6ff2b5f1-…` and KV namespace ID `b101d3dc…` are permanent and reused via binding from the new Worker — same data, same JWT_SECRET, no migration.

## Architecture

### Android changes

`uk.co.cyberheroez.oroq` exists in 81 files. The mechanical sequence:

```bash
# 1. Rename source directories — git tracks moves
git mv android/app/src/main/java/uk/co/cyberheroez/oroq \
       android/app/src/main/java/uk/co/cyberheroez/oroq
git mv android/app/src/test/java/uk/co/cyberheroez/oroq \
       android/app/src/test/java/uk/co/cyberheroez/oroq

# 2. Rewrite every internal reference
grep -rl "uk.co.cyberheroez.oroq" android/ docs/ backend/ \
  | xargs sed -i '' 's/uk\.co\.cyberheroez\.oroq/uk.co.cyberheroez.oroq/g'

# 3. Replace brand strings, case-aware
grep -rl "OroQ" android/app/src/main/java android/app/src/main/res \
  | xargs sed -i '' 's/OroQ/OroQ/g'
grep -rl "OROQ" android/app/src/main/java \
  | xargs sed -i '' 's/OROQ/OROQ/g'
```

**Class rename:** `OroQVpnService` → `OroQVpnService`. The file and all 8+ in-code references update via `sed`. After Section 1 finishes, the file at `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt` gets renamed:

```bash
git mv android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt \
       android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt
sed -i '' 's/OroQVpnService/OroQVpnService/g' \
  $(grep -rl "OroQVpnService" android/)
```

**`AndroidManifest.xml`:** the `namespace` is set in `build.gradle.kts`, not the manifest — only the `<service android:name=".vpn.OroQVpnService" />` reference changes (handled by the class-rename sed above). The intent action constant `ACTION_STOP = "uk.co.cyberheroez.oroq.STOP_VPN"` updates as part of the package-name sed.

**`build.gradle.kts`:**

```kotlin
android {
    namespace = "uk.co.cyberheroez.oroq"
    // ...
    defaultConfig {
        applicationId = "uk.co.cyberheroez.oroq"
        // ...
    }
}
```

**`strings.xml`:** `<string name="app_name">OroQ</string>` → `OroQ`.

**UI brand strings** living in Kotlin source files (`MainActivity` "OROQ" badge, `BlockActivity` "blocked by OroQ", `AppMonitorService` notification "OroQ limits are active", `RolePickerActivity` welcome copy) are caught by the case-aware `OroQ` → `OroQ` and `OROQ` → `OROQ` sweeps.

**DataStore file names** change automatically because the dataStore delegate uses literal strings:

```kotlin
private val Context.dataStore by preferencesDataStore(name = "oroq_config")
```

→

```kotlin
private val Context.dataStore by preferencesDataStore(name = "oroq_config")
```

Done via targeted sed `oroq_config` → `oroq_config`. The `family_config` DataStore name has no brand and stays.

### Backend (Cloudflare Worker)

`backend/wrangler.toml`:

```toml
name = "oroq-family"
main = "src/index.ts"
compatibility_date = "2025-09-06"

[[d1_databases]]
binding = "DB"
database_name = "oroq-family"   # cosmetic; the id is what binds
database_id = "6ff2b5f1-ce1c-4f70-9157-f2929f526bb0"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "b101d3dc0103425cb8ca29b7ed102d1a"
```

`npx wrangler deploy` produces a **new** Worker at `oroq-family.cyberheroez.workers.dev`. The old `oroq-family` Worker remains alive at its old URL until explicitly deleted in Section 5.

Both Workers bind the same D1 + KV via shared IDs. Pairings, sessions, OTP state, command queues — all single-source.

**Secrets must be re-set** on the new Worker:

```bash
npx wrangler secret put JWT_SECRET --name oroq-family
npx wrangler secret put RESEND_API_KEY --name oroq-family
npx wrangler secret put RESEND_FROM --name oroq-family
```

`JWT_SECRET` **must equal** the value on the old Worker. Otherwise existing parent JWTs (signed by old Worker) fail signature verification on the new Worker, forcing every parent to re-login. We use `wrangler secret bulk` to copy across, or print the old value once and re-enter manually.

### Blocklists (Cloudflare Pages)

Pages projects don't support rename. Create new, deploy same assets:

```bash
npx wrangler pages project create oroq-blocklists --production-branch=main
npx wrangler pages deploy android/app/src/main/assets/blocklists \
  --project-name=oroq-blocklists --branch=main --commit-dirty=true
```

Verify:

```bash
for f in manifest social gaming violence; do
  printf "%-12s %s\n" "$f" \
    "$(curl -s -o /dev/null -w "%{http_code}" https://oroq-blocklists.pages.dev/$f.txt)"
done
```

Expected: `200` for each.

Then update the two constants in the Android source:

```kotlin
// android/app/.../family/FamilyConfig.kt
const val WORKER_BASE_URL = "https://oroq-family.cyberheroez.workers.dev"

// android/app/.../update/BlocklistUpdater.kt
const val BASE_URL = "https://oroq-blocklists.pages.dev"
```

### Docs + memory + repo dir

In-repo docs string-replace (case-aware sed across all `.md` files outside the historical record):

- `PRIVACY.md`, `README.md`, all `docs/*.md` except `docs/superpowers/specs/2026-05-*.md` and `docs/superpowers/plans/2026-05-*.md` and any pre-`2026-06-04` superpowers files — those are historical records of work done as OroQ and stay verbatim.
- `docs/superpowers/specs/2026-06-01-release-signing-aab-design.md` — this is a paused future plan; sed updates it.
- `docs/superpowers/plans/2026-06-04-release-signing-aab-plan.md` — same; alias `oroq-upload` → `oroq-upload` plus all path references.

The `project_native_app_direction.md` memory file gets a header line:

```
**Note:** Renamed to OroQ 2026-06-04 (see [[project-shield-pilot-rename]]). Paragraphs below describing past events use the old name verbatim.
```

…and the `project_shield_pilot_rename.md` memory file (already created) is the canonical rename record.

**Repo directory move** (last, after all in-repo work committed):

```bash
mv /Users/apple/Desktop/Projects/oroq \
   /Users/apple/Desktop/Projects/oroq
mv ~/.claude/projects/-Users-apple-Desktop-Projects-oroq \
   ~/.claude/projects/-Users-apple-Desktop-Projects-oroq
```

git history fully preserved; parent-dir name is not tracked.

## Verification

After each section commits, before claiming done:

1. **Backend tests** — `cd backend && npm run test` — all Vitest cases pass (no logic change, only `name` field).
2. **Backend deploy** — `npx wrangler deploy` succeeds; new Worker reachable; `curl https://oroq-family.cyberheroez.workers.dev/auth/request -X POST -d '{}' -H 'content-type: application/json'` returns a `4xx` response, not a DNS/connect error.
3. **Pages deploy + smoke** — the 4 `curl` checks above all return 200.
4. **Android compile** — `./gradlew :app:compileDebugKotlin` succeeds.
5. **Android tests** — `./gradlew :app:testDebugUnitTest` — all unit tests pass.
6. **Android debug APK builds** — `./gradlew :app:assembleDebug` succeeds.
7. **Install fresh** on emulator — `adb install -r app-debug.apk` succeeds; launcher shows the new "OroQ" icon alongside (or replacing, if old uninstalled) the old "OroQ" icon. Different applicationId means side-by-side install.
8. **Onboarding + pair** — open OroQ on emulator, walk through ChildOnboarding, pair with parent on Vivo (also OroQ). New build talks to new Worker — verify via `npx wrangler tail --name oroq-family` showing `POST /pair/join - Ok`.
9. **Family-link round-trip** — the same 4 flows from release-signing plan Task 6: categories, daily limit + grant, blocked apps, state sync. All complete on the new Worker.
10. **Old build verification** — confirm the old OroQ install on emulator (if kept side-by-side) still talks to the old Worker — rollback path intact.

If step 9 fails most likely due to mismatched JWT_SECRET; re-set it from Section "Backend" instructions.

## Cleanup (post-verification)

After 24 hours of clean operation on the new build:

| Resource | Action |
|---|---|
| Old `oroq-family` Worker | `npx wrangler delete oroq-family` |
| Old `oroq-blocklists` Pages project | Cloudflare dashboard → Pages → Delete |
| D1 database | **Keep** (reused) |
| KV namespace | **Keep** (reused) |
| Old `uk.co.cyberheroez.oroq` APK | `adb uninstall uk.co.cyberheroez.oroq` on each device |

## Files affected

**Modified (mass string replace):**

- ~81 Kotlin files (package declarations + internal references)
- `android/app/src/main/AndroidManifest.xml`
- `android/app/src/main/res/values/strings.xml`
- `android/app/build.gradle.kts`
- `backend/wrangler.toml`
- `android/app/src/main/java/.../family/FamilyConfig.kt`
- `android/app/src/main/java/.../update/BlocklistUpdater.kt`
- All in-repo docs that reference the brand (~30 files, narrative copy only — historical specs/plans for completed work stay verbatim)

**Renamed (git mv):**

- `android/app/src/main/java/uk/co/cyberheroez/oroq/` → `…/oroq/`
- Same under `src/test/`
- `OroQVpnService.kt` → `OroQVpnService.kt` (file + class)

**Created:**

- New Cloudflare Worker `oroq-family`
- New Cloudflare Pages project `oroq-blocklists`

**Deleted (post-verification):**

- Old Worker, old Pages project, old APK installs on test devices
- Old repo directory (after move)

## Security & privacy

- Zero-retention property preserved: same E2E encryption, same Tink keys, same JWT mechanism.
- `JWT_SECRET` carried verbatim from old Worker to new — no key rotation hidden under the rename.
- D1 + KV physical storage unchanged; access control unchanged.
- No new endpoints, no new permissions, no new data collection.

## Open items (not blocking)

- Logo / icon rebrand — kept for a later visual pass.
- After rename, the paused release-signing plan resumes; that plan's alias `oroq-upload` is part of this rename's sed pass and becomes `oroq-upload`.
- A future memory cleanup pass to update `[[project-business-model]]` and other indirect references to the brand.
