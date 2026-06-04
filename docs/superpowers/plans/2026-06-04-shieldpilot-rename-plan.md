# SafeBrowse → Shield Pilot Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from SafeBrowse to Shield Pilot across Android, backend, blocklists hosting, in-repo docs, repo dir, and Claude memory — preserving D1/KV data, JWT_SECRET, and git history.

**Architecture:** Backend gets a new Worker name (`shieldpilot-family`) that re-binds the same D1 database and KV namespace by ID — no data migration. Pages gets a new project (`shieldpilot-blocklists`). Android gets a coordinated `git mv` of the Kotlin package directories + mass sed across package strings, brand strings, applicationId, namespace, URL constants, and DataStore literal. Build + manual round-trip on real devices is the gate.

**Tech Stack:** Cloudflare Workers (TypeScript), Cloudflare Pages, Android Gradle (Kotlin DSL), Tink, sed/grep, git.

**Spec:** `docs/superpowers/specs/2026-06-04-shieldpilot-rename-design.md`

---

## Task 1: Deploy new Worker `shieldpilot-family`

**Files:**
- Modify: `backend/wrangler.toml`

The Worker rename is independent of any Android change. Deploying it first means the new URL is reachable when Android source updates land in later tasks.

- [ ] **Step 1: Update `wrangler.toml`**

Open `backend/wrangler.toml`. Change:
```toml
name = "safebrowse-family"
```
to:
```toml
name = "shieldpilot-family"
```
And change:
```toml
database_name = "safebrowse-family"
```
to:
```toml
database_name = "shieldpilot-family"
```
Leave `database_id`, KV `id`, `compatibility_date`, and the secret bindings comment unchanged. The file's full top should now read:

```toml
name = "shieldpilot-family"
main = "src/index.ts"
compatibility_date = "2025-09-06"

[[d1_databases]]
binding = "DB"
database_name = "shieldpilot-family"
database_id = "6ff2b5f1-ce1c-4f70-9157-f2929f526bb0"
migrations_dir = "migrations"

[[kv_namespaces]]
binding = "KV"
id = "b101d3dc0103425cb8ca29b7ed102d1a"
```

- [ ] **Step 2: Run the backend tests**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/backend && npm run test 2>&1 | tail -10
```
Expected: all Vitest cases pass (~27). The rename touches only the `name` field; Miniflare doesn't care.

- [ ] **Step 3: Capture the existing `JWT_SECRET` before redeploy**

We need the **same** JWT_SECRET on the new Worker so existing parent JWTs verify. There's no `wrangler secret read`; print from a temporary `wrangler` invocation against the old Worker by adding a one-off `/debug/jwt-hint` endpoint, or rely on the value being recorded in 1Password/`.env` from the original setup.

If the value is in 1Password: open the "SafeBrowse Worker secrets" entry, copy `JWT_SECRET`.

If it isn't recorded anywhere: this is a rotation. Acknowledge that every paired parent must re-login. Generate a new value: `openssl rand -hex 32`.

- [ ] **Step 4: Deploy the new Worker**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/backend && npx wrangler deploy 2>&1 | tail -15
```
Expected output ends with `Deployed shieldpilot-family triggers (… ms)` and prints the URL `https://shieldpilot-family.cyberheroez.workers.dev`. A new Worker is created; the old `safebrowse-family` remains alive.

- [ ] **Step 5: Set secrets on the new Worker**

Paste each secret value when prompted:

```bash
npx wrangler secret put JWT_SECRET --name shieldpilot-family
npx wrangler secret put RESEND_API_KEY --name shieldpilot-family
npx wrangler secret put RESEND_FROM --name shieldpilot-family
```

Use the **same `JWT_SECRET` value** as the old Worker (Step 3). Use the same `RESEND_API_KEY` and `RESEND_FROM` (Resend domain unchanged).

- [ ] **Step 6: Smoke-test the new Worker is reachable**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST -H 'content-type: application/json' -d '{}' \
  https://shieldpilot-family.cyberheroez.workers.dev/auth/request
```
Expected: `400` (bad request — empty email). A `0` or `5xx` indicates DNS/deploy issue.

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add backend/wrangler.toml && \
  git commit -m "rename(backend): worker safebrowse-family -> shieldpilot-family"
```

Secrets aren't repo-tracked; nothing else to stage.

---

## Task 2: Create + deploy new Pages project `shieldpilot-blocklists`

**Files:**
- None (Cloudflare-side change).

- [ ] **Step 1: Create the Pages project**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/backend && \
  npx wrangler pages project create shieldpilot-blocklists --production-branch=main 2>&1 | tail -5
```
Expected: `✨ Successfully created the 'shieldpilot-blocklists' project.`

- [ ] **Step 2: Deploy the existing blocklist assets**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  npx wrangler pages deploy app/src/main/assets/blocklists \
    --project-name=shieldpilot-blocklists --branch=main --commit-dirty=true 2>&1 | tail -10
```
Expected: `✨ Deployment complete! Take a peek over at https://<hash>.shieldpilot-blocklists.pages.dev`.

- [ ] **Step 3: Verify the production URL**

```bash
for f in manifest social gaming violence adult; do
  printf "%-12s %s\n" "$f" \
    "$(curl -s -o /dev/null -w "%{http_code}" https://shieldpilot-blocklists.pages.dev/$f.txt)"
done
```
Expected: `200` for each.

- [ ] **Step 4: No commit**

Pages is a Cloudflare-side resource; no repo state changes here. Task 4 updates the `BlocklistUpdater.BASE_URL` constant in Android source.

---

## Task 3: `git mv` Kotlin package directories

**Files:**
- Rename: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/` → `android/app/src/main/java/uk/co/cyberheroez/shieldpilot/`
- Rename: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/` → `android/app/src/test/java/uk/co/cyberheroez/shieldpilot/`

After the move, the build is broken (every `package uk.co.cyberheroez.safebrowse.…` declaration disagrees with its filesystem location). Task 4 fixes that with a mass sed.

- [ ] **Step 1: Move the main-source tree**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git mv android/app/src/main/java/uk/co/cyberheroez/safebrowse \
         android/app/src/main/java/uk/co/cyberheroez/shieldpilot
```
Expected: no output (success).

- [ ] **Step 2: Move the test-source tree**

```bash
git mv android/app/src/test/java/uk/co/cyberheroez/safebrowse \
       android/app/src/test/java/uk/co/cyberheroez/shieldpilot
```
Expected: no output.

- [ ] **Step 3: Verify the moves are staged**

```bash
git status --short | head -10
```
Expected: dozens of `R  …/safebrowse/<file>.kt -> …/shieldpilot/<file>.kt` lines. Git detected the rename and the diff is just the directory change.

- [ ] **Step 4: Do not commit yet**

Task 4 follows immediately with the sed that makes the tree compile. Commit at the end of Task 4.

---

## Task 4: Mass package-name string replace + class rename

**Files:**
- Modify (sed): every file containing `uk.co.cyberheroez.safebrowse` (~82 files)
- Rename: `android/app/src/main/java/uk/co/cyberheroez/shieldpilot/vpn/SafeBrowseVpnService.kt` → `…/ShieldPilotVpnService.kt`

- [ ] **Step 1: Replace the dotted package string everywhere**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  grep -rl 'uk\.co\.cyberheroez\.safebrowse' android backend docs 2>/dev/null \
  | xargs sed -i '' 's/uk\.co\.cyberheroez\.safebrowse/uk.co.cyberheroez.shieldpilot/g'
```
This replaces in `.kt`, `.kts`, `.xml`, `.toml`, `.md`, `.json` — anywhere the dotted form appears, including the historical superpowers spec/plan files (we accept the noise; those files are append-only history but the rename is global). Backend `wrangler.toml` is untouched because it doesn't contain the dotted form — only the Worker name was changed in Task 1.

- [ ] **Step 2: Sanity-check no occurrences remain**

```bash
grep -rln 'uk\.co\.cyberheroez\.safebrowse' android backend docs 2>/dev/null
```
Expected: no output. If any line prints, sed missed it (likely a different quote style) — handle manually.

- [ ] **Step 3: Rename the VPN service file + class**

```bash
git mv android/app/src/main/java/uk/co/cyberheroez/shieldpilot/vpn/SafeBrowseVpnService.kt \
       android/app/src/main/java/uk/co/cyberheroez/shieldpilot/vpn/ShieldPilotVpnService.kt
```

- [ ] **Step 4: Replace the class name across the codebase**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  grep -rl 'SafeBrowseVpnService' android 2>/dev/null \
  | xargs sed -i '' 's/SafeBrowseVpnService/ShieldPilotVpnService/g'
```

- [ ] **Step 5: Confirm the class is consistent**

```bash
grep -rn 'SafeBrowseVpnService' android 2>/dev/null
```
Expected: no output.

```bash
grep -rn 'ShieldPilotVpnService' android 2>/dev/null | head -3
```
Expected: ≥3 lines (the file itself + at least 2 callers — `MainActivity`, `CommandSync`, `AppMonitorService`).

- [ ] **Step 6: Verify the source still compiles**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  ./gradlew :app:compileDebugKotlin 2>&1 | tail -10
```
Expected: `BUILD SUCCESSFUL`. If errors mention unresolved `uk.co.cyberheroez.safebrowse.*`, Step 1 missed something — re-run with adjusted globs.

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add -A android docs backend && \
  git commit -m "rename(android): kotlin package safebrowse -> shieldpilot, ShieldPilotVpnService"
```

---

## Task 5: applicationId + namespace + display name + URLs + brand strings + DataStore name

**Files:**
- Modify: `android/app/build.gradle.kts`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/res/values/themes.xml`, `values-night/themes.xml`, `values/colors.xml`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/shieldpilot/family/FamilyConfig.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/shieldpilot/update/BlocklistUpdater.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/shieldpilot/config/ConfigRepository.kt` (DataStore name)
- Modify: `android/app/src/main/java/uk/co/cyberheroez/shieldpilot/MainActivity.kt` (the one `SAFEBROWSE` literal)
- Modify (sed): any remaining file with `SafeBrowse` brand string

- [ ] **Step 1: Update `build.gradle.kts`**

Edit `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/build.gradle.kts`. Find:

```kotlin
android {
    namespace = "uk.co.cyberheroez.safebrowse"
    ...
    defaultConfig {
        applicationId = "uk.co.cyberheroez.safebrowse"
```

(Task 4's sed already changed both lines.) Verify by:

```bash
grep -n "namespace\|applicationId" /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build.gradle.kts
```
Expected: both lines now reference `uk.co.cyberheroez.shieldpilot`. If not, Task 4 missed them — replace manually.

- [ ] **Step 2: Update the display name in `strings.xml`**

Edit `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/src/main/res/values/strings.xml`. Change:

```xml
<string name="app_name">SafeBrowse</string>
```
to:
```xml
<string name="app_name">Shield Pilot</string>
```

- [ ] **Step 3: Mass-replace `SafeBrowse` and `SAFEBROWSE` brand strings**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  grep -rl 'SafeBrowse' android backend 2>/dev/null \
  | xargs sed -i '' 's/SafeBrowse/Shield Pilot/g'
grep -rl 'SAFEBROWSE' android 2>/dev/null \
  | xargs sed -i '' 's/SAFEBROWSE/SHIELD PILOT/g'
```

These pick up `MainActivity` ("SAFEBROWSE" badge), `BlockActivity` ("blocked by SafeBrowse"), `AppMonitorService` ("SafeBrowse limits are active"), `RolePickerActivity` ("Welcome to SafeBrowse"), the themes, the colors comment, etc.

- [ ] **Step 4: Sanity-check no `SafeBrowse` / `SAFEBROWSE` remain in source**

```bash
grep -rln 'SafeBrowse\|SAFEBROWSE' android backend 2>/dev/null
```
Expected: no output. (If the historical specs/plans under `docs/` still contain references, leave them — Task 7 handles docs deliberately.)

- [ ] **Step 5: Update `FamilyConfig.WORKER_BASE_URL`**

Edit `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/src/main/java/uk/co/cyberheroez/shieldpilot/family/FamilyConfig.kt`. Find:

```kotlin
const val WORKER_BASE_URL = "https://safebrowse-family.cyberheroez.workers.dev"
```
Change to:
```kotlin
const val WORKER_BASE_URL = "https://shieldpilot-family.cyberheroez.workers.dev"
```

- [ ] **Step 6: Update `BlocklistUpdater.BASE_URL`**

Edit `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/src/main/java/uk/co/cyberheroez/shieldpilot/update/BlocklistUpdater.kt`. Find:

```kotlin
const val BASE_URL = "https://safebrowse-blocklists.pages.dev"
```
Change to:
```kotlin
const val BASE_URL = "https://shieldpilot-blocklists.pages.dev"
```

- [ ] **Step 7: Update the `safebrowse_config` DataStore name**

Edit `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/src/main/java/uk/co/cyberheroez/shieldpilot/config/ConfigRepository.kt`. Find:

```kotlin
private val Context.dataStore by preferencesDataStore(name = "safebrowse_config")
```
Change to:
```kotlin
private val Context.dataStore by preferencesDataStore(name = "shieldpilot_config")
```

(The `family_config` DataStore name in `FamilyStore.kt` has no brand and stays.)

- [ ] **Step 8: Verify no stray `safebrowse` lowercase remains in main source**

```bash
grep -rn 'safebrowse' /Users/apple/Desktop/Projects/safebrowse-ai/android/app/src/main 2>/dev/null
```
Expected: no output (the directory path itself has been renamed; constants and DataStore are now `shieldpilot`; package strings done in Task 4).

If a match appears under `assets/blocklists/<category>.txt` mentioning `safebrowse-` as a domain, that's fine — they're just unrelated blocked domains, not brand references.

- [ ] **Step 9: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add -A android && \
  git commit -m "rename(android): applicationId, display name, URLs, DataStore, brand strings"
```

---

## Task 6: Verify the Android build

**Files:**
- None (verification).

- [ ] **Step 1: Compile**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  ./gradlew :app:compileDebugKotlin 2>&1 | tail -8
```
Expected: `BUILD SUCCESSFUL`. If errors mention an unresolved reference, Task 4 or 5 missed it — `grep` the unresolved symbol and fix.

- [ ] **Step 2: Run unit tests**

```bash
./gradlew :app:testDebugUnitTest 2>&1 | tail -10
```
Expected: `BUILD SUCCESSFUL`, every test in the suite passes.

- [ ] **Step 3: Build the debug APK**

```bash
./gradlew :app:assembleDebug 2>&1 | tail -8
```
Expected: `BUILD SUCCESSFUL`. New APK at `app/build/outputs/apk/debug/app-debug.apk`. Its installed package name is now `uk.co.cyberheroez.shieldpilot`.

- [ ] **Step 4: Confirm the new applicationId is baked in**

```bash
unzip -p /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/apk/debug/app-debug.apk \
  AndroidManifest.xml | strings | grep -E "uk\.co\.cyberheroez" | head -3
```
Expected: at least one `uk.co.cyberheroez.shieldpilot` line; **no** `uk.co.cyberheroez.safebrowse` line.

- [ ] **Step 5: No commit**

Verification only — Task 5's commit already captured the source changes.

---

## Task 7: Update in-repo docs (recent, not historical)

**Files:**
- Modify: `PRIVACY.md`, `README.md` (if present)
- Modify: `docs/MVP_OVERVIEW.md`, `docs/MVP_USER_FLOWS.md`, `docs/MVP_ARCHITECTURE.md`, `docs/STORE_LISTING.md`, `docs/PREVENT_DUTY_BRIEFING.md`, `docs/KCSIE_COMPLIANCE_MATRIX.md`, `docs/DPIA_TEMPLATE_UK.md`, `docs/DEPLOYMENT.md`, `docs/DEVLOG.md`, `docs/BROWSER_SUPPORT.md`, `docs/WEBSTORE.md`, `docs/idea-to-store-flow.md`
- Modify: `docs/superpowers/specs/2026-06-01-release-signing-aab-design.md` (future plan, not historical)
- Modify: `docs/superpowers/plans/2026-06-04-release-signing-aab-plan.md` (future plan)
- **Leave verbatim:** every `docs/superpowers/specs/2026-05-*.md` and `docs/superpowers/plans/2026-05-*.md` and earlier (historical record of work done as SafeBrowse). Task 4's sed already touched any `uk.co.cyberheroez.safebrowse` in those files — that's accepted noise; brand strings stay because the work itself happened as SafeBrowse.

- [ ] **Step 1: Brand-replace the recent docs**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  FILES=$(find . -maxdepth 2 -name '*.md' -not -path './node_modules/*' -not -path './.git/*' \
            -not -path './docs/superpowers/*' 2>/dev/null) && \
  RECENT_SP="docs/superpowers/specs/2026-06-01-release-signing-aab-design.md \
             docs/superpowers/plans/2026-06-04-release-signing-aab-plan.md" && \
  for f in $FILES $RECENT_SP; do
    sed -i '' 's/SafeBrowse/Shield Pilot/g; s/SAFEBROWSE/SHIELD PILOT/g; s/safebrowse-family/shieldpilot-family/g; s/safebrowse-blocklists/shieldpilot-blocklists/g' "$f"
  done
```

- [ ] **Step 2: Update the paused release-signing plan's keystore alias**

Edit `/Users/apple/Desktop/Projects/safebrowse-ai/docs/superpowers/plans/2026-06-04-release-signing-aab-plan.md`. Replace every occurrence of `safebrowse-upload` with `shieldpilot-upload`. The plan references the alias in Task 1 Step 2 (`keytool -alias`), Task 7's runbook, and the recovery section.

```bash
sed -i '' 's/safebrowse-upload/shieldpilot-upload/g' \
  /Users/apple/Desktop/Projects/safebrowse-ai/docs/superpowers/plans/2026-06-04-release-signing-aab-plan.md
```

Also update the same alias in `docs/superpowers/specs/2026-06-01-release-signing-aab-design.md` if it appears there:

```bash
sed -i '' 's/safebrowse-upload/shieldpilot-upload/g' \
  /Users/apple/Desktop/Projects/safebrowse-ai/docs/superpowers/specs/2026-06-01-release-signing-aab-design.md
```

- [ ] **Step 3: Spot-check**

```bash
grep -n "SafeBrowse\|safebrowse-upload\|safebrowse-family\|safebrowse-blocklists" \
  /Users/apple/Desktop/Projects/safebrowse-ai/docs/superpowers/plans/2026-06-04-release-signing-aab-plan.md \
  /Users/apple/Desktop/Projects/safebrowse-ai/docs/superpowers/specs/2026-06-01-release-signing-aab-design.md \
  /Users/apple/Desktop/Projects/safebrowse-ai/PRIVACY.md \
  /Users/apple/Desktop/Projects/safebrowse-ai/docs/STORE_LISTING.md 2>/dev/null
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add -A docs PRIVACY.md README.md 2>/dev/null; \
  git commit -m "rename(docs): SafeBrowse -> Shield Pilot in recent docs, leave historical record"
```

---

## Task 8: Update memory file `project_native_app_direction.md`

**Files:**
- Modify: `~/.claude/projects/-Users-apple-Desktop-Projects-safebrowse-ai/memory/project_native_app_direction.md`

The rename-record memory file (`project_shield_pilot_rename.md`) was already created earlier in this conversation. The `project_native_app_direction.md` file gets a header note pointing at it.

- [ ] **Step 1: Add the header note**

Open `/Users/apple/.claude/projects/-Users-apple-Desktop-Projects-safebrowse-ai/memory/project_native_app_direction.md`. After the frontmatter (the line `---` that closes the metadata block at line ~7), insert this paragraph before the first bullet:

```
**Note (2026-06-04):** Renamed to Shield Pilot. Paragraphs below describing
past events keep the old name verbatim as historical record. See
[[project-shield-pilot-rename]] for the rename details.
```

- [ ] **Step 2: No commit**

Memory lives outside the repo. The file is updated in place.

---

## Task 9: Install + manual round-trip on the new build

This is the real verification gate. Manual on devices.

**Devices:**
- Emulator `emulator-5554`
- Vivo (wireless ADB)

- [ ] **Step 1: Confirm both devices are reachable**

```bash
adb devices
```
Expected: emulator + Vivo both `device`. If Vivo offline, reconnect via wireless ADB first.

- [ ] **Step 2: Uninstall the old SafeBrowse build on the emulator**

```bash
adb -s emulator-5554 uninstall uk.co.cyberheroez.safebrowse 2>&1
```
Expected: `Success` or `Failure [DELETE_FAILED_INTERNAL_ERROR]` if absent — both fine.

- [ ] **Step 3: Install the new Shield Pilot build on the emulator**

```bash
adb -s emulator-5554 install /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: `Success`. Launcher now shows "Shield Pilot".

- [ ] **Step 4: Repeat for the Vivo**

```bash
V="$(adb devices | awk '/_adb-tls-connect/ {print $1; exit}')"
if [ -z "$V" ]; then echo "VIVO SERIAL EMPTY — abort"; exit 1; fi
adb -s "$V" uninstall uk.co.cyberheroez.safebrowse 2>&1
adb -s "$V" install /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/apk/debug/app-debug.apk
```
Expected: both `Success`. If `V` is empty (Vivo offline), reconnect first.

- [ ] **Step 5: Start a wrangler tail on the new Worker**

In a separate terminal:

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/backend && \
  npx wrangler tail --name shieldpilot-family
```
Leave it streaming. Steps below should produce log lines on it.

- [ ] **Step 6: Walk through child onboarding + pair**

On the emulator (child):
1. Open Shield Pilot, pick "This is my child's phone".
2. Walk through the 5 permission steps (VPN, Usage Access, Overlay, Battery, Pair).

On the Vivo (parent):
3. Open Shield Pilot, pick "I'm a parent". Email-OTP login (OTP appears in the wrangler tail).
4. Add child, generate code, hand the 8-character code to the emulator.

On the emulator:
5. Type the code, confirm matching SAS digits.

Expected: emulator shows "✓ Protected" + "Linked to a parent". Wrangler tail shows `POST /auth/request - Ok`, `POST /auth/verify - Ok`, `POST /pair/create - Ok`, `POST /pair/join - Ok`.

- [ ] **Step 7: Round-trip flow A — categories**

On the Vivo, untick "Adult content", tap "Save categories", wait 60 s. On the emulator open Chrome and navigate to a previously-blocked adult test domain. Expected: domain loads (no block).

Re-tick Adult on the Vivo, save, wait 60 s. Domain blocked again.

Wrangler tail shows `POST /cmd/<pairing>` lines.

- [ ] **Step 8: Round-trip flow B — daily limit + grant**

On the Vivo: tap "Change daily limit", enter `1`, Send.

On the emulator: wait until today's screen-time reaches 1 min (open any app), see the time's-up BlockActivity.

On the Vivo: tap "Grant 30 minutes". Within 30 s the emulator dismisses with the "A parent granted more time" toast.

Reset the limit to `90` from the Vivo.

- [ ] **Step 9: Round-trip flow C — blocked apps**

On the Vivo: scroll to BLOCKED APPS, tick Chrome, "Save blocked apps", wait 60 s. Opening Chrome on the emulator shows the App-blocked BlockActivity.

Untick Chrome on the Vivo, save, wait 60 s. Chrome opens normally.

- [ ] **Step 10: Round-trip flow D — state sync**

Relaunch Shield Pilot on the emulator (triggers immediate sync via `scheduleFamilySync`). On the Vivo, refresh the child dashboard. Expected: categories, current daily limit, and BLOCKED APPS list reflect the last-saved values.

- [ ] **Step 11: Logcat clean-bill**

```bash
adb -s emulator-5554 logcat -d -t 500 2>&1 | grep -iE "AndroidRuntime|FATAL|ClassNotFoundException|NoSuchMethodError|NoClassDefFoundError|IllegalStateException.*[Tt]ink" | head
```
Expected: no output. Any line here means something broke during the rename — fix and re-test before moving on.

- [ ] **Step 12: Negative check — old build (optional)**

If you still have a SafeBrowse install somewhere (e.g. a second emulator AVD), confirm it still pairs against `safebrowse-family` Worker. This proves the rollback path is intact. Skip if no second device is handy.

- [ ] **Step 13: No commit**

Verification only.

---

## Task 10: Rename repo dir + Claude memory dir (post-verify)

Only run after Task 9 is fully green.

- [ ] **Step 1: Confirm git status is clean**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && git status --short
```
Expected: empty (all rename commits already landed).

- [ ] **Step 2: Move the repo directory**

```bash
mv /Users/apple/Desktop/Projects/safebrowse-ai \
   /Users/apple/Desktop/Projects/shieldpilot
```
Expected: no output.

- [ ] **Step 3: Verify the repo still works at the new path**

```bash
cd /Users/apple/Desktop/Projects/shieldpilot && git log --oneline -3
```
Expected: the three most recent commits print — git history intact.

- [ ] **Step 4: Move the Claude memory directory**

```bash
mv ~/.claude/projects/-Users-apple-Desktop-Projects-safebrowse-ai \
   ~/.claude/projects/-Users-apple-Desktop-Projects-shieldpilot
```
Expected: no output.

- [ ] **Step 5: Verify the memory directory contents survive**

```bash
ls -la ~/.claude/projects/-Users-apple-Desktop-Projects-shieldpilot/memory/ | head
```
Expected: `MEMORY.md`, `project_shield_pilot_rename.md`, `project_native_app_direction.md`, and the other memory files all listed.

- [ ] **Step 6: No commit**

Both moves are filesystem changes only.

> **Note for the next Claude session:** the working directory and memory path have changed. Use `/Users/apple/Desktop/Projects/shieldpilot` from this point on.

---

## Task 11: Decommission old Worker + Pages (after 24 hours of clean operation)

Only run **at least 24 hours** after Task 9 passes — keeps the rollback path open in case a regression surfaces.

- [ ] **Step 1: Re-verify the new build still works**

Quick spot-check: open Shield Pilot on the Vivo, see the child dashboard refresh correctly with recent data. If anything is off, do not proceed.

- [ ] **Step 2: Delete the old Worker**

```bash
cd /Users/apple/Desktop/Projects/shieldpilot/backend && \
  npx wrangler delete --name safebrowse-family
```
Type `yes` to confirm. Expected: `Deleted safebrowse-family.`

- [ ] **Step 3: Delete the old Pages project**

Cloudflare dashboard → Workers & Pages → `safebrowse-blocklists` → Settings → Delete project. Confirm.

(There's no `wrangler pages project delete` CLI as of writing; if it's been added in your wrangler version, use it: `npx wrangler pages project delete safebrowse-blocklists`.)

- [ ] **Step 4: Confirm the old URLs return 404 / not-found**

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://safebrowse-family.cyberheroez.workers.dev/auth/request
curl -s -o /dev/null -w "%{http_code}\n" \
  https://safebrowse-blocklists.pages.dev/manifest.txt
```
Expected: `404` for both (or `522` / similar for the Worker). A `200` means the resource is still alive — re-check Steps 2 and 3.

- [ ] **Step 5: No commit**

Cloudflare-side resource changes only.

---

## Self-review notes

**Spec coverage:**

- Spec §"Android changes" → Tasks 3 + 4 + 5 + 6 (directory move, package + class string replace, applicationId/namespace/display name/URLs/DataStore/brand strings, build verify).
- Spec §"Backend (Cloudflare Worker)" → Task 1.
- Spec §"Blocklists (Cloudflare Pages)" → Task 2.
- Spec §"Docs + memory + repo dir" → Tasks 7 + 8 + 10.
- Spec §"Verification" → Tasks 6 (build) + 9 (round-trip on devices).
- Spec §"Cleanup" → Task 11.
- Spec §"Files affected" — every listed file is touched by Tasks 4 + 5 (Kotlin/manifest/strings/themes/colors/gradle/wrangler/FamilyConfig/BlocklistUpdater) or Tasks 7 + 8 (docs + memory).

**Naming consistency** across tasks:

- `uk.co.cyberheroez.shieldpilot` everywhere (Tasks 3, 4, 5, 6, 9).
- `shieldpilot-family` for Worker (Tasks 1, 5, 7, 9, 11).
- `shieldpilot-blocklists` for Pages (Tasks 2, 5, 7, 9, 11).
- `ShieldPilotVpnService` class (Task 4).
- `shieldpilot_config` DataStore name (Task 5).
- `Shield Pilot` (with space) for human-facing display (Task 5 strings.xml, brand strings sed; Task 7 docs).
- `SHIELD PILOT` (all caps) for in-UI badge (Task 5's `SAFEBROWSE` sed).
- `shieldpilot-upload` keystore alias (Task 7 — fed back into the paused release-signing plan).
- `/Users/apple/Desktop/Projects/shieldpilot` and `-Users-apple-Desktop-Projects-shieldpilot` (Task 10).

**Placeholders / red flags:** none. All shell commands are concrete and runnable. The `<vivo serial>` in Task 9 Step 4 is dynamically substituted via the `adb devices | awk` invocation, not a manual fill-in.
