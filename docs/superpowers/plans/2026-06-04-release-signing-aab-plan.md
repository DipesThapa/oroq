# Release Signing + AAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a signed Android App Bundle ready for Google Play Internal Testing, with R8 optimisation, a documented backup/recovery runbook, and a verification gate that catches R8-induced regressions before any upload.

**Architecture:** Local upload key (RSA-2048 via `keytool`) signs the AAB; Google's Play App Signing then re-signs for distribution. Gradle reads passwords from a gitignored `keystore.properties`. R8 enabled on the `release` build type with explicit keep rules for every reflection-using dependency in the project (Tink, org.json, WorkManager, DataStore, Kotlin coroutines). A release-only smoke pass — full family-link round-trip on a release-signed install — gates every Play upload.

**Tech Stack:** Android Gradle Plugin (Kotlin DSL), R8, `keytool`, `bundletool`, Tink 1.15.0. Build with `./gradlew` from `/Users/apple/Desktop/Projects/safebrowse-ai/android`.

**Spec:** `docs/superpowers/specs/2026-06-01-release-signing-aab-design.md`

---

## Task 1: Generate the upload keystore (one-time, user action)

This task is the only one that produces a secret. The keystore is **not committed**; it is generated locally and backed up out-of-band per the runbook in Task 7.

**Files:**
- Create (gitignored, generated): `android/keystore/upload.jks`

- [ ] **Step 1: Make the keystore directory**

```bash
mkdir -p /Users/apple/Desktop/Projects/safebrowse-ai/android/keystore
```
Expected: directory exists, empty.

- [ ] **Step 2: Generate the upload key**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  keytool -genkeypair -v -keystore keystore/upload.jks \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -alias safebrowse-upload
```

`keytool` will prompt for:
- **Keystore password** (twice) — pick a strong password, write it down immediately.
- **Key password** (twice) — use the **same** password as the keystore password (Gradle reads them separately but they may match).
- **Your first and last name** → `CyberHeroez CIC`
- **Organizational unit** → `SafeBrowse`
- **Organization** → `CyberHeroez CIC`
- **City or Locality** → `London`
- **State or Province** → `England`
- **Two-letter country code** → `GB`
- Final confirmation → `yes`

Expected output ends with:
```
[Storing keystore/upload.jks]
```

- [ ] **Step 3: Record the key fingerprint**

```bash
keytool -list -v -keystore keystore/upload.jks -alias safebrowse-upload
```

Enter the keystore password when prompted. The output prints the SHA-256 fingerprint and validity (~27 years from today). Copy both lines — Task 7's runbook references them.

- [ ] **Step 4: Confirm `upload.jks` exists and is non-empty**

```bash
ls -la keystore/upload.jks
```
Expected: a file of ~2-3 KB. (If 0 bytes, repeat Step 2.)

- [ ] **Step 5: No commit**

`keystore/upload.jks` is going into `.gitignore` in Task 3 — no `git add` here. The next task adds the ignore rules **before** any further work, so a stray `git status` won't tempt anyone into staging the secret.

---

## Task 2: Add gitignore rules + properties template

**Files:**
- Modify: `android/.gitignore`
- Create: `android/keystore.properties.example`

- [ ] **Step 1: Extend `.gitignore`**

Open `/Users/apple/Desktop/Projects/safebrowse-ai/android/.gitignore`. After the existing `local.properties` line, append:

```
# Release signing — secrets, never commit
keystore.properties
keystore/*.jks
```

The whole file should now end with those four new lines.

- [ ] **Step 2: Verify the rule covers the keystore**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git check-ignore -v android/keystore/upload.jks
```
Expected: a line citing `android/.gitignore:<lineno>:keystore/*.jks` followed by the file path. (If no output, the rule isn't matching — re-check Step 1.)

- [ ] **Step 3: Create the properties template**

Write to `/Users/apple/Desktop/Projects/safebrowse-ai/android/keystore.properties.example`:

```
# Copy this file to keystore.properties and fill in the real values.
# keystore.properties is gitignored — never commit the real one.
storeFile=keystore/upload.jks
storePassword=REPLACE_WITH_KEYSTORE_PASSWORD
keyAlias=safebrowse-upload
keyPassword=REPLACE_WITH_KEY_PASSWORD
```

- [ ] **Step 4: Create the real `keystore.properties` (gitignored)**

Copy the template and edit:

```bash
cp /Users/apple/Desktop/Projects/safebrowse-ai/android/keystore.properties.example \
   /Users/apple/Desktop/Projects/safebrowse-ai/android/keystore.properties
```

Open `android/keystore.properties` in an editor and replace both `REPLACE_WITH_…` lines with the actual passwords from Task 1 Step 2.

- [ ] **Step 5: Verify the real file is also gitignored**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git check-ignore -v android/keystore.properties
```
Expected: a line citing `keystore.properties`. (If no output, fix Step 1 immediately — the file would otherwise leak on the next commit.)

- [ ] **Step 6: Commit the gitignore + template only**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/.gitignore android/keystore.properties.example && \
  git commit -m "build(android): gitignore release keystore + add properties template"
```

Run `git status` after. Expected output: clean — no `upload.jks`, no real `keystore.properties` staged.

---

## Task 3: Wire Gradle to sign the release build

**Files:**
- Modify: `android/app/build.gradle.kts`

- [ ] **Step 1: Replace `build.gradle.kts`**

Replace the entire contents of `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/build.gradle.kts` with:

```kotlin
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    namespace = "uk.co.cyberheroez.safebrowse"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "uk.co.cyberheroez.safebrowse"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        create("release") {
            if (keystorePropsFile.exists()) {
                storeFile = rootProject.file(keystoreProps["storeFile"] as String)
                storePassword = keystoreProps["storePassword"] as String
                keyAlias = keystoreProps["keyAlias"] as String
                keyPassword = keystoreProps["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.work.runtime.ktx)
    implementation("com.google.crypto.tink:tink-android:1.15.0")
    testImplementation("com.google.crypto.tink:tink:1.15.0")
    testImplementation("org.json:json:20240303")
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
```

The diffs vs. the prior file:
1. New `import java.util.Properties` line at the top.
2. New `keystorePropsFile` + `keystoreProps` block above `android { … }`.
3. New `signingConfigs { create("release") { … } }` block inside `android`.
4. `release` build type: `isMinifyEnabled = true`, `isShrinkResources = true`, conditional `signingConfig` assignment.

Everything else is preserved.

- [ ] **Step 2: Sync / parse the build script**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  ./gradlew :app:tasks --quiet 2>&1 | tail -5
```
Expected: tasks listing, no `BUILD FAILED`. If a "configuration error" mentions `keystore.properties`, re-check Task 2 Step 4.

- [ ] **Step 3: Sanity-check the debug build still works**

```bash
./gradlew :app:assembleDebug 2>&1 | tail -6
```
Expected: `BUILD SUCCESSFUL`. (Debug is unaffected by the new signing block.)

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/build.gradle.kts && \
  git commit -m "build(android): wire release signing config + enable R8"
```

---

## Task 4: ProGuard keep rules

**Files:**
- Modify: `android/app/proguard-rules.pro`

- [ ] **Step 1: Replace `proguard-rules.pro`**

Replace the entire contents of `/Users/apple/Desktop/Projects/safebrowse-ai/android/app/proguard-rules.pro` with:

```proguard
# --- Tink (HPKE / hybrid encryption) ---
# Tink uses protobuf-lite reflection for keyset serialization; the entire
# package must survive obfuscation or KeysetHandle.parseKeyset returns null.
-keep class com.google.crypto.tink.** { *; }
-keep class com.google.crypto.tink.proto.** { *; }
-keepclassmembers class * extends com.google.crypto.tink.shaded.protobuf.GeneratedMessageLite {
    <fields>;
}

# --- BouncyCastle (Tink's bundled crypto provider) ---
-dontwarn org.bouncycastle.**
-dontwarn javax.naming.**

# --- org.json (every wire payload is parsed via org.json) ---
-keep class org.json.** { *; }

# --- Kotlin coroutines (Flow + DataStore + repos) ---
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }

# --- WorkManager (FamilySyncWorker, BlocklistUpdateWorker reflected by name) ---
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.CoroutineWorker
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}

# --- AndroidX DataStore protobuf descriptors ---
-keep class androidx.datastore.*.** { *; }

# --- Our own data classes survive obfuscation enough to be JSON-roundtripped ---
# Field names are read by reflection inside Tink keyset parsing.
-keep class uk.co.cyberheroez.safebrowse.family.** { *; }
-keep class uk.co.cyberheroez.safebrowse.config.** { *; }

# --- Crash-stack readability ---
# Required so Play Console deobfuscates stacks when mapping.txt is uploaded.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

- [ ] **Step 2: Run a release build to confirm R8 doesn't choke on the rules**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  ./gradlew :app:bundleRelease 2>&1 | tail -15
```

Expected outcome:
- `BUILD SUCCESSFUL`.
- A new artefact at `app/build/outputs/bundle/release/app-release.aab`.
- A new mapping file at `app/build/outputs/mapping/release/mapping.txt`.

If you see `Missing class …` warnings, that's R8 flagging a class the rules don't cover. If they reference `com.google.crypto.tink.*`, `org.bouncycastle.*`, or anything from our `family/`/`config/` packages, add a matching `-dontwarn` or `-keep` rule, re-run. **Don't move on with warnings.**

- [ ] **Step 3: Confirm the AAB is signed with the upload key**

```bash
jarsigner -verify -verbose -certs \
  /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/bundle/release/app-release.aab \
  2>&1 | tail -20
```

Expected: a line `jar verified.` Cross-check the fingerprint shown against the one recorded in Task 1 Step 3. If they differ, the keystore.properties values are wrong.

- [ ] **Step 4: Confirm mapping.txt was produced**

```bash
ls -la /Users/apple/Desktop/Projects/safebrowse-ai/android/app/build/outputs/mapping/release/mapping.txt
```
Expected: a file of >10 KB. (If absent, R8 didn't run — check Task 3's `isMinifyEnabled = true`.)

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add android/app/proguard-rules.pro && \
  git commit -m "build(android): R8 keep rules for Tink, WorkManager, DataStore, our data classes"
```

---

## Task 5: Install `bundletool` and smoke-install the AAB

**Files:**
- None (tooling install + verification only).

- [ ] **Step 1: Install bundletool**

```bash
brew install bundletool 2>&1 | tail -3
```
Expected: `🍺 /opt/homebrew/Cellar/bundletool/…` or similar success line. If Homebrew isn't installed, run:

```bash
curl -sL -o /tmp/bundletool.jar \
  https://github.com/google/bundletool/releases/latest/download/bundletool-all.jar
```

and substitute `java -jar /tmp/bundletool.jar` for `bundletool` in the steps below.

- [ ] **Step 2: Confirm bundletool runs**

```bash
bundletool version 2>&1
```
Expected: a version number (e.g. `1.18.x`). Any error → see the Homebrew fallback above.

- [ ] **Step 3: Build the .apks set from the AAB**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android && \
  bundletool build-apks \
    --bundle=app/build/outputs/bundle/release/app-release.aab \
    --output=app/build/outputs/bundle/release/app-release.apks \
    --local-testing
```

Expected: a new `.apks` file (~15-20 MB) next to the `.aab`. The `--local-testing` flag tells bundletool to bypass Play's split-config server and bundle everything for direct install.

- [ ] **Step 4: Confirm emulator is reachable**

```bash
adb devices
```
Expected: `emulator-5554  device` present. If absent, start the emulator from Android Studio and re-check.

- [ ] **Step 5: Uninstall the prior debug build**

```bash
adb -s emulator-5554 uninstall uk.co.cyberheroez.safebrowse 2>&1
```
Expected: `Success`, or `Failure [DELETE_FAILED_INTERNAL_ERROR]` if it was never installed. Both are fine.

- [ ] **Step 6: Install the release AAB on the emulator**

```bash
bundletool install-apks \
  --apks=app/build/outputs/bundle/release/app-release.apks \
  --device-id=emulator-5554 2>&1
```
Expected: `Installed APKs to device emulator-5554.` If R8 dropped a class the emulator notices at install time, you'll see a `INSTALL_FAILED_DEXOPT` here — back to Task 4 Step 1 to widen the keep rules.

- [ ] **Step 7: Launch and confirm no immediate crash**

```bash
adb -s emulator-5554 shell am start -n uk.co.cyberheroez.safebrowse/.MainActivity
sleep 5
adb -s emulator-5554 shell "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'" | head -3
```
Expected: `mCurrentFocus` points at `uk.co.cyberheroez.safebrowse/...` (RolePickerActivity on fresh install, or MainActivity if previous state was restored — either is fine; what matters is the package is alive, not crashed). If `mCurrentFocus` is empty or points at the launcher, the app crashed — `adb logcat | grep -E "AndroidRuntime|safebrowse"` will show why.

- [ ] **Step 8: No commit**

Tooling install isn't a repo change. Task 7's runbook captures the bundletool invocation for future reference.

---

## Task 6: Family-link round-trip on the release build (verification gate)

This is the gate the spec hangs everything on: every release build must clear it before any Play upload. Manual on real devices; the test is "do the four flows that exercise Tink + WorkManager + JSON + DataStore still work after R8?"

**Files:**
- None (verification only).

**Pre-requisites:**
- Emulator (`emulator-5554`) running with the Task 5 release install.
- Vivo (parent) reachable via wireless ADB and freshly installed with the same release AAB (use the same `bundletool install-apks` command but `--device-id=<vivo serial>`).
- Both apps uninstalled-then-reinstalled (Task 5 Step 5 covers the emulator; do the same on the Vivo).

- [ ] **Step 1: Re-pair**

On the Vivo (parent), sign in (email OTP from `wrangler tail` if not cached), add a child, generate a fresh 8-character code, type it into the emulator (child) when prompted, confirm matching SAS digits.

Expected: both devices land on their respective home screens; child shows "✓ Protected" + "Linked to a parent".

- [ ] **Step 2: Flow A — categories**

On the parent dashboard for that child, untick "Adult content", tap "Save categories". Wait ~60 seconds (AppMonitorService polls every minute).

On the emulator (child), open Chrome and navigate to `https://www.pornhub.com`.

Expected: site loads (no block screen). The VPN bounced and re-loaded the smaller blocklist.

Re-tick "Adult content" + Save on the parent. Wait 60 s. Re-test on emulator → site is blocked again.

- [ ] **Step 3: Flow B — daily limit + grant time**

On the parent: tap "Change daily limit", enter `1`, Send.

On the emulator: wait until current screen-time exceeds 1 min (open any app for a minute). The time's-up BlockActivity appears.

On the parent: tap "Grant 30 minutes". Wait up to 30 s.

Expected: the emulator's BlockActivity dismisses with a toast "A parent granted more time".

Reset the limit to `90` from the parent and confirm via the next sync.

- [ ] **Step 4: Flow C — blocked apps**

On the parent: scroll to BLOCKED APPS, tick `Chrome`, tap "Save blocked apps". Wait ~60 s.

On the emulator: try to open Chrome.

Expected: `BlockActivity` ("App blocked") appears within 1-2 seconds of foregrounding Chrome.

Untick `Chrome` + Save; wait 60 s; Chrome opens normally.

- [ ] **Step 5: Flow D — inventory + state sync**

Trigger a child→parent sync by relaunching SafeBrowse on the emulator (`scheduleFamilySync` fires an immediate one-time worker).

On the parent: refresh the child dashboard. Expect the BLOCKED CATEGORIES checkboxes, the "Currently … per day" caption, the BLOCKED APPS list, and the screen-time block to reflect whatever was last set.

- [ ] **Step 6: Logcat clean-bill check**

```bash
adb -s emulator-5554 logcat -d -t 500 2>&1 | grep -iE "AndroidRuntime|FATAL|ClassNotFoundException|NoSuchMethodError|NoClassDefFoundError|java.lang.IllegalStateException.*[Tt]ink" | head
```
Expected: no output. Any line here means R8 stripped something — add to `proguard-rules.pro`, re-run from Task 4 Step 2, re-test.

- [ ] **Step 7: No commit**

This task verifies behaviour; the artefact is the AAB from Task 4, the mapping file, and the green checklist itself. Task 7's runbook formalises this checklist for repeated use.

---

## Task 7: Release runbook — `docs/RELEASE.md`

**Files:**
- Create: `docs/RELEASE.md`

- [ ] **Step 1: Write the runbook**

Create `/Users/apple/Desktop/Projects/safebrowse-ai/docs/RELEASE.md` with the following content. Replace `<SHA-256 from Task 1 Step 3>` with the actual fingerprint you recorded, and `<expiry date>` with the validity end-date from the same step.

```markdown
# Release runbook — SafeBrowse Android

This is the canonical instruction sheet for producing a Play-Store-ready AAB.
Follow every step in order for every release. The spec lives at
`docs/superpowers/specs/2026-06-01-release-signing-aab-design.md`.

## Keystore facts (record once, never change)

| Field | Value |
|---|---|
| Path | `android/keystore/upload.jks` |
| Alias | `safebrowse-upload` |
| Algorithm | RSA 2048 |
| Validity | 27 years (`-validity 10000`) — expires <expiry date> |
| Identity | CN=CyberHeroez CIC, OU=SafeBrowse, O=CyberHeroez CIC, L=London, ST=England, C=GB |
| SHA-256 fingerprint | `<SHA-256 from Task 1 Step 3>` |

## First-time setup (already done — listed for reference)

```bash
mkdir -p android/keystore
cd android
keytool -genkeypair -v -keystore keystore/upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias safebrowse-upload
```

Then copy `keystore.properties.example` to `keystore.properties` and fill in the
two passwords.

## Backup checklist (do this NOW if you haven't)

- [ ] 1Password vault entry "SafeBrowse Android upload key" with:
  - `upload.jks` attached as a file
  - keystore password
  - key password (same as keystore password if you followed the prompt)
  - copy of `keystore.properties` contents
- [ ] Offline encrypted backup: `gpg -c keystore/upload.jks`, copy the `.gpg` to
  a USB stick in a physical drawer.
- [ ] Verify both backups by opening them on a different machine before
  marking complete.

**Never** put the keystore or its passwords in email, iCloud, Dropbox,
GitHub, or any chat. The whole "Play App Signing recovery" flow exists
because losing this key is otherwise fatal.

## Build a signed AAB

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai/android
./gradlew :app:bundleRelease
```

Output:
- AAB: `app/build/outputs/bundle/release/app-release.aab`
- Mapping: `app/build/outputs/mapping/release/mapping.txt`

## Verify the AAB

```bash
jarsigner -verify -verbose -certs \
  app/build/outputs/bundle/release/app-release.aab | tail -20
```

Expect `jar verified.`. The fingerprint shown must match the SHA-256 above.
If it doesn't, the build used the wrong key — check `keystore.properties`.

## Smoke-install on emulator + Vivo

```bash
bundletool build-apks \
  --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app/build/outputs/bundle/release/app-release.apks \
  --local-testing

# Emulator
adb -s emulator-5554 uninstall uk.co.cyberheroez.safebrowse
bundletool install-apks --apks=app/build/outputs/bundle/release/app-release.apks \
  --device-id=emulator-5554

# Vivo (paste the wireless serial)
V="<vivo serial from `adb devices`>"
adb -s "$V" uninstall uk.co.cyberheroez.safebrowse
bundletool install-apks --apks=app/build/outputs/bundle/release/app-release.apks \
  --device-id="$V"
```

## Round-trip checklist (must clear before every Play upload)

- [ ] Both devices freshly installed and re-paired.
- [ ] **Flow A (categories):** untick "Adult content" on parent, save, wait 60 s,
      adult test site loads on child. Re-tick + save + wait 60 s → blocked.
- [ ] **Flow B (limit + grant):** parent sets daily limit to 1 min, child sees
      time's-up screen, parent taps "Grant 30 minutes", child dismisses within
      30 s with "A parent granted more time" toast.
- [ ] **Flow C (apps):** parent ticks Chrome in BLOCKED APPS, saves, wait 60 s,
      opening Chrome on child shows BlockActivity. Untick + save + wait 60 s →
      Chrome opens normally.
- [ ] **Flow D (state sync):** parent dashboard reflects the latest categories,
      daily limit, and blocked-apps list from the child within one sync cycle.
- [ ] **Logcat clean:** zero `FATAL`, `ClassNotFoundException`,
      `NoSuchMethodError`, `NoClassDefFoundError`, or `IllegalStateException:
      Tink` lines from the run.

If any check fails, R8 stripped something. Widen `proguard-rules.pro`, rebuild,
re-test. Do not upload past a failed check.

## Upload to Play Console (Internal Testing)

1. Sign in to https://play.google.com/console.
2. App → Testing → Internal testing → Create new release.
3. Upload `app-release.aab`.
4. Upload `mapping.txt` when prompted (Console → Quality → Android vitals →
   Deobfuscation files, or via the upload prompt during release creation).
5. Add release notes (something like "Initial Internal Testing build.").
6. Save → Review release → Start rollout to Internal testing.
7. Add your own Google account as a tester under "Testers".
8. Open the Internal Testing opt-in URL on the Vivo, install via Play.
9. Re-run the round-trip checklist above against the Play-installed build.

## Upload key recovery (if `upload.jks` is lost)

Google supports resetting the upload key without losing the app. Follow:

https://support.google.com/googleplay/android-developer/answer/7384423

Summary of the flow:

1. Generate a new RSA-2048 keypair locally (same `keytool` command, new alias
   `safebrowse-upload-v2`).
2. Export the public certificate: `keytool -export -alias safebrowse-upload-v2
   -keystore <new>.jks -file upload_certificate.pem`.
3. In Play Console → App integrity → Upload key, request reset and attach
   `upload_certificate.pem`.
4. Google responds within 1-2 business days. Once approved, update
   `keystore.properties` to point at the new keystore.
5. Update the "Keystore facts" table at the top of this doc with the new
   fingerprint and validity.

Note: this only works because Play App Signing holds the production signing
key; **without** Play App Signing enrolment a lost upload key permanently
strands the app.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/apple/Desktop/Projects/safebrowse-ai && \
  git add docs/RELEASE.md && \
  git commit -m "docs(release): runbook for signed AAB build + recovery"
```

---

## Self-review notes

**Spec coverage:**

- Spec §"Keystore strategy" → Task 1 (key generation), Task 2 (gitignore + template), Task 7 (backup + recovery doc).
- Spec §"Gradle signing config" → Task 3 (build.gradle.kts).
- Spec §"R8 + ProGuard keep rules" → Task 4 (proguard-rules.pro).
- Spec §"Release runbook — docs/RELEASE.md" → Task 7.
- Spec §"Verification" → Task 5 (bundletool + smoke install) + Task 6 (full round-trip on release build).
- Spec §"Files affected" → Tasks 2, 3, 4, 7 between them touch every file the spec lists; gitignored artefacts produced in Tasks 1 + 2.

**Type / name consistency:**
- `keystore.properties` is the single source of truth referenced by name in Tasks 2, 3, 7.
- `safebrowse-upload` alias defined in Task 1, referenced in Tasks 2, 4, 7.
- `app-release.aab` and `mapping.txt` paths are identical across Tasks 4, 5, 7.
- R8 keep-rule package globs in Task 4 match the actual `uk.co.cyberheroez.safebrowse.family.*` and `.config.*` packages used by the existing code.

**Placeholder scan:** the only `<…>` placeholders are in Task 7's runbook (the fingerprint and expiry date) and in the Vivo serial reference in the smoke-install block — both are intentional, filled in by the engineer at runtime using values they recorded in Task 1 Step 3 and the live `adb devices` output respectively. No "TBD"/"TODO"/"implement later" markers anywhere.
