# Release signing + AAB — design

**Date:** 2026-06-01
**Status:** Approved (brainstorming)
**Predecessors:** All feature work for the Android parental-control app (see [project memory](../../../../.claude/projects/-Users-apple-Desktop-Projects-safebrowse-ai/memory/project_native_app_direction.md)).

## Why

The app is functionally complete and verified end-to-end on emulator + Vivo, but every build to date has been a debug APK signed with Android's debug keystore. Google Play accepts **signed AABs only**, and rejects anything signed with a debug key. Without this sub-project, nothing else in the launch-prep arc can produce a submittable artefact.

This is also the cheapest insurance against a future "lost the only key" disaster: setting up Play App Signing now means Google holds the long-term key and a lost upload key is recoverable.

## Scope

This pass:

- Generate an RSA-2048 upload key, store it locally, document backup + recovery.
- Wire Gradle to read keystore credentials from a gitignored properties file and sign release builds.
- Enable R8 (full minify + shrink + obfuscate) on release with explicit keep rules for every reflection-heavy dependency in the project.
- Produce a `docs/RELEASE.md` runbook covering build, verify, upload, and key-loss recovery.
- Define the release-AAB smoke pass (full family-link round-trip on a release-signed install) and gate Play uploads behind it.

**Explicitly out of scope (deferred to later sub-projects):**

- Privacy policy rewrite for the Android app — separate spec.
- Play Store listing copy, screenshots, feature graphic — separate spec.
- VPN-service policy declaration + stalkerware self-declaration paperwork — separate spec.
- Account-deletion flow (UI + Worker endpoint) — separate spec.
- DPO / legal review — external, not a code task.
- CI / GitHub Actions for automated release builds — single-developer workflow, manual `./gradlew bundleRelease` is enough for now.
- Closed / open testing track configuration — happens after the first Internal Testing upload, separate process spec.

## Architecture

### Keystore strategy

Two keys total:

1. **Upload key (local, RSA-2048):** generated on the developer laptop with `keytool`, lives at `android/keystore/upload.jks`. Used by `bundleRelease` to sign every `.aab` before upload. If lost, Google's "Use Play App Signing to reset your upload key" flow re-issues it within 1-2 business days. Recoverable.
2. **App signing key (Google's):** Google generates and holds this when the app is first enrolled in Play App Signing. It re-signs every AAB before serving to devices. We never see it.

Files:

```
android/
  keystore/
    upload.jks                 ← gitignored, generated locally
  keystore.properties          ← gitignored, holds passwords
  keystore.properties.example  ← committed template
```

`keystore.properties` schema:

```
storeFile=keystore/upload.jks
storePassword=<from keytool prompt>
keyAlias=safebrowse-upload
keyPassword=<from keytool prompt>
```

Backup, per `docs/RELEASE.md`: three copies, two media:

- 1Password vault entry "SafeBrowse Android upload key" — `upload.jks` attached + both passwords + the keystore.properties values.
- GPG-encrypted USB stick in a physical drawer (`gpg -c upload.jks`).
- Never email, never iCloud/Dropbox unencrypted, never commit.

### Gradle signing config

`android/app/build.gradle.kts` reads `keystore.properties` at configuration time. When the file is present, the `release` build type signs with the upload key; when absent, the build still produces an *unsigned* AAB so the rest of the pipeline (CI smoke, dependency probes) keeps working — only the actual Play upload is blocked.

```kotlin
import java.util.Properties

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
    // ...existing...

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
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (keystorePropsFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}
```

`.gitignore` gains:

```
android/keystore.properties
android/keystore/*.jks
```

### R8 + ProGuard keep rules

R8 ships disabled in the current `release` configuration; enabling it without keep rules will silently strip Tink's protobuf-lite reflection targets, and decryption will start returning `null` at runtime with no exception trail. The keep rules below cover every reflection-using library the app actually invokes.

`android/app/proguard-rules.pro` (replacing the current empty stub):

```proguard
# --- Tink (HPKE / hybrid encryption) ---
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
-keep class uk.co.cyberheroez.oroq.family.** { *; }
-keep class uk.co.cyberheroez.oroq.config.** { *; }

# --- Crash-stack readability ---
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
```

The crash-stack attributes matter because Play Console only deobfuscates traces when the matching `mapping.txt` is uploaded — Sec "Release runbook" covers that.

### Release runbook — `docs/RELEASE.md`

A single discoverable document. Sections:

1. **First-time key generation** — exact `keytool` invocation with the identity fields used (CN: CyberHeroez CIC, OU: SafeBrowse, locality: London, country: GB) so any re-issue matches.
2. **Immediate backup** — the three-copy/two-media rule above with checklist boxes.
3. **Build a signed AAB** — `cd android && ./gradlew :app:bundleRelease`, output at `app/build/outputs/bundle/release/app-release.aab`.
4. **Verify** — `jarsigner -verify -verbose -certs app-release.aab`, expected fingerprints recorded.
5. **Smoke-install on emulator** via `bundletool`:
   ```bash
   bundletool build-apks --bundle=app-release.aab --output=app-release.apks --local-testing
   bundletool install-apks --apks=app-release.apks
   ```
6. **Round-trip checklist** — the 4 family-link flows from "Verification" below as a tick-box list.
7. **Upload** — Play Console → Internal Testing track → upload AAB + `mapping.txt` from `app/build/outputs/mapping/release/`.
8. **Recovery if upload key lost** — link to https://support.google.com/googleplay/android-developer/answer/7384423 with exact steps.

### Verification

R8 can break the app silently. Every release build runs the same gate before any Play upload:

1. `./gradlew :app:bundleRelease` succeeds, AAB produced.
2. `jarsigner -verify` succeeds with the recorded fingerprint.
3. Install on `emulator-5554` via `bundletool ... --local-testing`.
4. **Family-link round-trip on the release-signed APK**:
   - Uninstall both emulator + Vivo, re-pair from scratch.
   - Parent untoggles "Adult content" → child VPN restarts → an adult test domain resolves on the child.
   - Parent lowers daily limit to 1 min → child sees time's-up screen → parent grants 30 minutes → child dismisses within 30 s.
   - Parent ticks Chrome in BLOCKED APPS → opening Chrome on emulator shows BlockActivity within 60 s.
   - Child's next sync uploads `installedApps` + `blockedApps` + `categories` matching what the parent set.
5. Logcat during the run shows zero `ClassNotFoundException`, `NoSuchMethodError`, `NoClassDefFoundError`, or `IllegalStateException: Tink`.
6. `mapping.txt` present at `app/build/outputs/mapping/release/mapping.txt`.

If step 4 surfaces a "Couldn't send" toast, a silent no-op, or a Tink decryption failure, R8 stripped a reflection target the keep rules missed — add to `proguard-rules.pro`, rebuild, re-run the whole gate. **Don't ship past this gate.**

After the local gate passes, the AAB goes to Internal Testing in Play Console; the same round-trip runs once more on the Vivo against the Play-installed build (different distribution path, real OEM modifications). Then leave both devices idle overnight to confirm the 15-min WorkManager periodic sync still uploads (check `wrangler tail` next morning).

## Files affected

**Modified:**
- `android/app/build.gradle.kts` — signing config block, R8 enable on release, ProGuard files reference.
- `android/app/proguard-rules.pro` — keep rules above (replaces the empty stub).
- `.gitignore` — adds `android/keystore.properties` + `android/keystore/*.jks`.

**Created:**
- `android/keystore.properties.example` — committed template, real values absent.
- `docs/RELEASE.md` — the runbook above.
- `android/keystore/upload.jks` — gitignored, generated by the user via `keytool` per the runbook.
- `android/keystore.properties` — gitignored, filled by the user from their generated keystore.

**Roughly:** 3 modified, 2 created in-repo, 2 created out-of-repo (gitignored secrets).

## Testing

- **Unit:** none new. R8 / signing config can't be exercised by JUnit; verification is the release-build smoke pass above.
- **Manual artefacts** captured in `docs/RELEASE.md`:
  - Output of `jarsigner -verify -verbose -certs app-release.aab` (SHA-256 fingerprint of upload key recorded).
  - Output of `keytool -list -keystore upload.jks` (alias, validity dates recorded).
  - The 4-flow round-trip checklist lives in the runbook so every future release re-runs it.

## Security & privacy

- Upload key never leaves the developer laptop; it is the only secret introduced by this sub-project.
- Play App Signing enrolment delegates production signing to Google, removing single-point-of-failure if the upload key is lost.
- Obfuscation is a defence-in-depth measure, not a security boundary — all our security properties (E2E encryption, JWT verification, RLS-equivalent checks on Worker endpoints) already hold without it.
- Keep rules deliberately preserve our own package names under `family/` and `config/` so reflection-based JSON round-tripping continues to work; this is not a meaningful information disclosure (the code is open-source-readable through the AAB regardless).

## Open items (not blocking)

- Crashlytics / Play Vitals wiring once telemetry policy is decided (out of scope per project rules — no telemetry without an explicit decision).
- Per-environment build flavours (dev / staging / prod) once we have a staging Worker.
- Automatic `mapping.txt` upload via the Gradle Play Publisher plugin if/when CI happens.
