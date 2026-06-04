# Android Parental Control — Plan 4: Blocklist Updates & Release Prep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the blocklists real and keep them fresh — augment the curated seed lists with large maintained open-source lists, host them on Cloudflare, have the app pull updates periodically, and complete the release-preparation steps for a Play Store MVP.

**Architecture:** A build-time step merges the curated OroQ lists with category-aligned open-source lists (the BlockListProject) and emits both the bundled APK assets and a flat `manifest.txt` of per-category versions. The same files are deployed to Cloudflare Pages. On the device, a `BlocklistUpdater` compares the hosted `manifest.txt` against what is installed and downloads only the changed category files into the app's private storage; the filter prefers those over the bundled copies. A weekly `WorkManager` job runs the updater. Release prep adds the notification-permission request and reliability guidance.

**Tech Stack:** Kotlin, Android Views, WorkManager, Preferences DataStore, Node.js (build script), Cloudflare Pages, JUnit 4.

**Reference:** Design spec — `docs/superpowers/specs/2026-05-21-oroq-android-parental-control-design.md` (§6, §8).

**Depends on:** Plans 1-3.

**Plan series:** Plan 1 → Plan 2 → Plan 3 (all done) → Plan 4 (this, final).

---

## File structure produced by this plan

```
android/
├─ blocklist/
│  ├─ sources/_external.json             category -> open-list URL
│  └─ build-blocklist.mjs                fetches + merges open lists
├─ app/src/main/
│  ├─ AndroidManifest.xml                + ACCESS_NETWORK_STATE
│  ├─ assets/blocklists/                 regenerated: bigger .txt + manifest.txt
│  └─ java/uk/co/cyberheroez/oroq/
│     ├─ MainActivity.kt                 + notification permission, schedule updates
│     ├─ filter/BlocklistAssets.kt       loadBlocklistRepository prefers filesDir
│     ├─ vpn/OroQVpnService.kt     loadBlocklistRepository(context)
│     ├─ ui/SettingsActivity.kt          + reliability guidance section
│     └─ update/
│        ├─ BlocklistManifest.kt         parseManifest + planUpdate (pure)
│        ├─ BlocklistUpdater.kt          downloads changed lists
│        └─ BlocklistUpdateWorker.kt     WorkManager periodic worker
└─ app/src/test/java/uk/co/cyberheroez/oroq/update/
   └─ BlocklistManifestTest.kt
```

---

## Task 1: Bigger blocklists from open-source lists

Extends the build script to merge each curated category with a large
category-aligned open-source list, and to emit a flat `manifest.txt`.

**Files:**
- Create: `android/blocklist/sources/_external.json`
- Modify: `android/blocklist/build-blocklist.mjs`
- Modify: `android/blocklist/test/build-blocklist.test.mjs`

- [ ] **Step 1: Create the external-source map**

Create `android/blocklist/sources/_external.json`:

```json
{
  "adult": "https://raw.githubusercontent.com/blocklistproject/Lists/master/porn.txt",
  "gambling": "https://raw.githubusercontent.com/blocklistproject/Lists/master/gambling.txt",
  "drugs": "https://raw.githubusercontent.com/blocklistproject/Lists/master/drugs.txt",
  "malware": "https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt",
  "phishing": "https://raw.githubusercontent.com/blocklistproject/Lists/master/phishing.txt"
}
```

> The BlockListProject lists are published under the Unlicense (public domain),
> so they are safe to redistribute. Categories without an entry here
> (`social`, `gaming`, `violence`, `doh`) keep only their curated lists.

- [ ] **Step 2: Add the failing test for the hosts-format parser**

Replace the entire contents of `android/blocklist/test/build-blocklist.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomains, parseHostsList } from '../build-blocklist.mjs';

test('normalizeDomains lowercases, trims, dedupes, and sorts', () => {
  const result = normalizeDomains(['B.com', ' a.com ', 'a.com', 'C.com.']);
  assert.deepEqual(result, ['a.com', 'b.com', 'c.com']);
});

test('normalizeDomains tolerates missing or empty input', () => {
  assert.deepEqual(normalizeDomains(undefined), []);
  assert.deepEqual(normalizeDomains([]), []);
});

test('parseHostsList extracts domains from hosts-format lines', () => {
  const text = '# comment\n0.0.0.0 evil.com\n0.0.0.0 bad.net\n\nplain.org\n';
  assert.deepEqual(parseHostsList(text), ['evil.com', 'bad.net', 'plain.org']);
});

test('parseHostsList drops comments, blanks, and non-domains', () => {
  const text = '# header\n\n0.0.0.0 localhost\n0.0.0.0\nnotadomain\n0.0.0.0 ok.com\n';
  assert.deepEqual(parseHostsList(text), ['ok.com']);
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
node --test android/blocklist/test/
```

Expected: FAIL — `parseHostsList` is not exported.

- [ ] **Step 4: Rewrite the build script**

Replace the entire contents of `android/blocklist/build-blocklist.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = join(__dirname, 'sources');
const OUT_DIR = join(__dirname, '..', 'app', 'src', 'main', 'assets', 'blocklists');

/**
 * Pure, testable: normalise a raw domain list into a sorted, de-duplicated,
 * lowercased array. Trailing dots and surrounding whitespace are stripped.
 */
export function normalizeDomains(domains) {
  const set = new Set();
  for (const d of domains ?? []) {
    const clean = String(d).trim().toLowerCase().replace(/\.$/, '');
    if (clean) set.add(clean);
  }
  return [...set].sort();
}

/**
 * Pure, testable: extract domains from hosts-format text. Each non-comment
 * line's last whitespace-separated token is the domain; sink addresses and
 * non-domain tokens are dropped.
 */
export function parseHostsList(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const domain = parts[parts.length - 1].toLowerCase();
    if (!domain || domain === 'localhost' || !domain.includes('.')) continue;
    if (domain === '0.0.0.0' || domain.startsWith('0.0.0.0')) continue;
    out.push(domain);
  }
  return out;
}

async function main() {
  const externalPath = join(SOURCES_DIR, '_external.json');
  const external = existsSync(externalPath)
    ? JSON.parse(readFileSync(externalPath, 'utf8'))
    : {};

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];

  for (const file of readdirSync(SOURCES_DIR)) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    const category = file.replace(/\.json$/, '');
    const curated = JSON.parse(readFileSync(join(SOURCES_DIR, file), 'utf8')).domains ?? [];

    let extra = [];
    if (external[category]) {
      const resp = await fetch(external[category]);
      if (!resp.ok) throw new Error(`fetch failed for ${category}: ${resp.status}`);
      extra = parseHostsList(await resp.text());
    }

    const domains = normalizeDomains([...curated, ...extra]);
    const body = domains.join('\n') + '\n';
    writeFileSync(join(OUT_DIR, `${category}.txt`), body);
    const version = createHash('sha256').update(body).digest('hex').slice(0, 12);
    manifest.push(`${category} ${version}`);
    console.log(`built ${category}: ${domains.length} domains (version ${version})`);
  }

  writeFileSync(join(OUT_DIR, 'manifest.txt'), manifest.sort().join('\n') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
node --test android/blocklist/test/
```

Expected: PASS — 4 tests.

- [ ] **Step 6: Run the build (needs network) and remove the stale manifest**

```bash
node android/blocklist/build-blocklist.mjs
rm -f android/app/src/main/assets/blocklists/manifest.json
```

Expected: nine `built <category>: N domains` lines, with `adult`, `gambling`,
`drugs`, `malware`, `phishing` now showing thousands of domains. Confirm
`android/app/src/main/assets/blocklists/manifest.txt` exists with nine lines.

- [ ] **Step 7: Commit**

```bash
git add android/blocklist android/app/src/main/assets/blocklists
git commit -m "feat(android): merge open-source blocklists + emit manifest.txt"
```

---

## Task 2: Update-planning logic

Pure logic for deciding which category lists to download.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/update/BlocklistManifest.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/update/BlocklistManifestTest.kt`

- [ ] **Step 1: Write the failing test**

Create `BlocklistManifestTest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.update

import org.junit.Assert.assertEquals
import org.junit.Test

class BlocklistManifestTest {

    @Test fun parsesCategoryVersionLines() {
        val parsed = parseManifest("adult aaa111\ngambling bbb222\n")
        assertEquals(mapOf("adult" to "aaa111", "gambling" to "bbb222"), parsed)
    }

    @Test fun parseManifestIgnoresBlankAndMalformedLines() {
        val parsed = parseManifest("adult aaa111\n\nmalformed\n")
        assertEquals(mapOf("adult" to "aaa111"), parsed)
    }

    @Test fun planUpdateReturnsChangedAndNewCategories() {
        val local = mapOf("adult" to "v1", "gambling" to "v1")
        val remote = mapOf("adult" to "v2", "gambling" to "v1", "drugs" to "v1")
        assertEquals(setOf("adult", "drugs"), planUpdate(local, remote))
    }

    @Test fun planUpdateReturnsEmptyWhenEverythingMatches() {
        val same = mapOf("adult" to "v1")
        assertEquals(emptySet<String>(), planUpdate(same, same))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*BlocklistManifestTest"
```

Expected: FAIL — `parseManifest` / `planUpdate` unresolved.

- [ ] **Step 3: Write the implementation**

Create `BlocklistManifest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.update

/**
 * Parses a manifest of `"<category> <version>"` lines into a category→version
 * map. Blank and malformed lines are ignored.
 */
fun parseManifest(text: String): Map<String, String> =
    text.lineSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .mapNotNull {
            val parts = it.split(Regex("\\s+"))
            if (parts.size == 2) parts[0] to parts[1] else null
        }
        .toMap()

/**
 * Returns the categories whose [remote] version differs from [local] — i.e.
 * the lists that need downloading (changed or newly added).
 */
fun planUpdate(local: Map<String, String>, remote: Map<String, String>): Set<String> =
    remote.filterKeys { local[it] != remote[it] }.keys
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*BlocklistManifestTest"
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): blocklist update-planning logic"
```

---

## Task 3: Blocklist updater

Downloads changed category lists from the hosted Cloudflare site into the app's
private storage. Verified on-device, not by unit tests (network + filesystem).

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/update/BlocklistUpdater.kt`

- [ ] **Step 1: Write `BlocklistUpdater.kt`**

```kotlin
package uk.co.cyberheroez.oroq.update

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads updated blocklists from the hosted site into the app's private
 * `filesDir/blocklists/`. Only categories whose version changed are fetched.
 */
class BlocklistUpdater(private val context: Context) {

    private val updatedDir = File(context.filesDir, "blocklists")

    /** Runs one update pass. Returns the number of category lists refreshed. */
    fun runUpdate(): Int {
        val remoteManifestText = httpGet("$BASE_URL/manifest.txt") ?: return 0
        val remote = parseManifest(remoteManifestText)
        val local = parseManifest(installedManifestText())
        val toUpdate = planUpdate(local, remote)
        if (toUpdate.isEmpty()) return 0

        updatedDir.mkdirs()
        var updated = 0
        for (category in toUpdate) {
            val body = httpGet("$BASE_URL/$category.txt")
            if (body == null) {
                // A partial failure: leave the manifest unwritten so the next
                // run retries. Already-written files are simply re-fetched.
                Log.w(TAG, "download failed for $category; will retry next run")
                return updated
            }
            File(updatedDir, "$category.txt").writeText(body)
            updated++
        }
        File(updatedDir, "manifest.txt").writeText(remoteManifestText)
        Log.i(TAG, "updated $updated category list(s)")
        return updated
    }

    /** The currently installed manifest — updated copy if present, else bundled. */
    private fun installedManifestText(): String {
        val updatedManifest = File(updatedDir, "manifest.txt")
        return if (updatedManifest.exists()) {
            updatedManifest.readText()
        } else {
            context.assets.open("blocklists/manifest.txt")
                .bufferedReader().use { it.readText() }
        }
    }

    private fun httpGet(url: String): String? = try {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = TIMEOUT_MS
        connection.readTimeout = TIMEOUT_MS
        try {
            if (connection.responseCode == 200) {
                connection.inputStream.bufferedReader().use { it.readText() }
            } else {
                null
            }
        } finally {
            connection.disconnect()
        }
    } catch (e: Exception) {
        Log.w(TAG, "GET failed: $url", e)
        null
    }

    companion object {
        private const val TAG = "BlocklistUpdater"
        private const val TIMEOUT_MS = 15_000
        const val BASE_URL = "https://oroq-blocklists.pages.dev"
    }
}
```

- [ ] **Step 2: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): blocklist updater"
```

---

## Task 4: Filter prefers updated lists

`loadBlocklistRepository` should load each category from the updated copy in
`filesDir` when present, falling back to the bundled asset.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/filter/BlocklistAssets.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/vpn/OroQVpnService.kt`

- [ ] **Step 1: Replace `loadBlocklistRepository` in `BlocklistAssets.kt`**

Replace the existing `loadBlocklistRepository` function (keep `parseBlocklistText`
unchanged) with:

```kotlin
/**
 * Loads every bundled `blocklists/<category>.txt` asset into a
 * [BlocklistRepository]. For each category, an updated copy downloaded into
 * `filesDir/blocklists/` takes precedence over the bundled asset. The
 * `manifest.txt` file is not a category and is skipped.
 */
fun loadBlocklistRepository(context: Context): BlocklistRepository {
    val dir = "blocklists"
    val updatedDir = java.io.File(context.filesDir, dir)
    val categories = HashMap<String, Set<String>>()
    for (name in context.assets.list(dir).orEmpty()) {
        if (!name.endsWith(".txt") || name == "manifest.txt") continue
        val category = name.removeSuffix(".txt")
        val updatedFile = java.io.File(updatedDir, name)
        val text = if (updatedFile.exists()) {
            updatedFile.readText()
        } else {
            context.assets.open("$dir/$name").bufferedReader().use { it.readText() }
        }
        categories[category] = parseBlocklistText(text)
    }
    return BlocklistRepository(categories)
}
```

The import line at the top of the file changes from `import android.content.res.AssetManager`
to `import android.content.Context`.

- [ ] **Step 2: Update the call site in `OroQVpnService.kt`**

In `runLoop`, change:

```kotlin
            val repository = loadBlocklistRepository(assets)
```

to:

```kotlin
            val repository = loadBlocklistRepository(this@OroQVpnService)
```

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): filter prefers downloaded blocklists over bundled"
```

---

## Task 5: Periodic update worker

A weekly `WorkManager` job runs the updater.

**Files:**
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/update/BlocklistUpdateWorker.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt`

- [ ] **Step 1: Add the WorkManager dependency**

In `android/gradle/libs.versions.toml`, add to `[versions]`:

```toml
work = "2.9.1"
```

and to `[libraries]`:

```toml
androidx-work-runtime-ktx = { group = "androidx.work", name = "work-runtime-ktx", version.ref = "work" }
```

In `android/app/build.gradle.kts`, add inside `dependencies { }` after
`implementation(libs.androidx.lifecycle.runtime.ktx)`:

```kotlin
    implementation(libs.androidx.work.runtime.ktx)
```

- [ ] **Step 2: Write `BlocklistUpdateWorker.kt`**

```kotlin
package uk.co.cyberheroez.oroq.update

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** Runs [BlocklistUpdater] on WorkManager's background thread. */
class BlocklistUpdateWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {

    override fun doWork(): Result = try {
        BlocklistUpdater(applicationContext).runUpdate()
        Result.success()
    } catch (e: Exception) {
        Result.retry()
    }
}

/** Schedules a weekly blocklist update (only when a network is available). */
fun scheduleBlocklistUpdates(context: Context) {
    val request = PeriodicWorkRequestBuilder<BlocklistUpdateWorker>(7, TimeUnit.DAYS)
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "blocklist-update",
        ExistingPeriodicWorkPolicy.KEEP,
        request,
    )
}
```

- [ ] **Step 3: Schedule updates once onboarding is complete**

In `MainActivity.kt`, add the import:

```kotlin
import uk.co.cyberheroez.oroq.update.scheduleBlocklistUpdates
```

In `onCreate`, inside the `else` branch (where onboarding is already complete),
add `scheduleBlocklistUpdates` before `setContentView`:

```kotlin
            } else {
                scheduleBlocklistUpdates(this@MainActivity)
                setContentView(buildLayout())
            }
```

- [ ] **Step 4: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/gradle/libs.versions.toml android/app/build.gradle.kts android/app/src/main/java
git commit -m "feat(android): weekly WorkManager blocklist update"
```

---

## Task 6: Host the blocklists on Cloudflare Pages

Publishes the generated blocklist files so the updater has a source. Uses the
Wrangler CLI, which is already authenticated against the Cloudflare account.

**Files:** none (deploys existing generated assets).

- [ ] **Step 1: Create the Pages project**

```bash
npx wrangler pages project create oroq-blocklists --production-branch=main
```

- [ ] **Step 2: Deploy the blocklist files**

```bash
npx wrangler pages deploy android/app/src/main/assets/blocklists \
  --project-name=oroq-blocklists --branch=main --commit-dirty=true
```

Expected: a deployment URL. The production URL is
`https://oroq-blocklists.pages.dev` — this must match
`BlocklistUpdater.BASE_URL`.

- [ ] **Step 3: Smoke-check the hosted files**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://oroq-blocklists.pages.dev/manifest.txt
curl -s -o /dev/null -w "%{http_code}\n" https://oroq-blocklists.pages.dev/adult.txt
```

Expected: `200` for both. (If the deployment is seconds old, retry once — the
edge can take a moment.)

> No commit — this task only deploys. Re-running Task 1's build script and
> re-deploying here is how the blocklists are grown after launch, with no app
> release needed.

---

## Task 7: Release preparation

The notification permission (so the foreground notification shows on Android 13+)
and reliability guidance for the parent.

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/SettingsActivity.kt`

- [ ] **Step 1: Add the network-state permission**

In `android/app/src/main/AndroidManifest.xml`, add after the existing
`<uses-permission>` lines:

```xml
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

- [ ] **Step 2: Request the notification permission in `MainActivity`**

In `MainActivity.kt`, add these imports:

```kotlin
import android.Manifest
import android.os.Build
import androidx.activity.result.contract.ActivityResultContracts.RequestPermission
```

Add this property next to `vpnConsent`:

```kotlin
    private val notificationPermission =
        registerForActivityResult(RequestPermission()) { /* best effort */ }
```

Add this method and call it from the `else` branch of `onCreate` (after
`scheduleBlocklistUpdates`):

```kotlin
    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
```

The `else` branch becomes:

```kotlin
            } else {
                scheduleBlocklistUpdates(this@MainActivity)
                requestNotificationPermissionIfNeeded()
                setContentView(buildLayout())
            }
```

- [ ] **Step 3: Add a reliability section to `SettingsActivity`**

In `SettingsActivity.kt`, add these imports:

```kotlin
import android.content.Intent
import android.provider.Settings
```

In `buildLayout`, add this block after the "Change PIN" button is added to
`column` (before the `return ScrollView(...)`):

```kotlin
        column.addView(TextView(this).apply {
            text = "Reliability"
            textSize = 16f
            setPadding(0, pad, 0, 0)
        })
        column.addView(TextView(this).apply {
            text = "For protection that cannot be switched off easily, exempt " +
                "OroQ from battery optimisation and enable Always-on VPN " +
                "for OroQ in Android's VPN settings."
        })
        column.addView(Button(this).apply {
            text = "Battery settings"
            setOnClickListener {
                runCatching {
                    startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                }
            }
        })
        column.addView(Button(this).apply {
            text = "VPN settings"
            setOnClickListener {
                runCatching { startActivity(Intent(Settings.ACTION_VPN_SETTINGS)) }
            }
        })
```

- [ ] **Step 4: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/AndroidManifest.xml android/app/src/main/java
git commit -m "feat(android): notification permission + reliability guidance"
```

---

## Task 8: Final verification

**Files:** none.

- [ ] **Step 1: Run the full unit-test suite**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: PASS — every unit test across Plans 1-4.

- [ ] **Step 2: Build and install**

```bash
./gradlew :app:installDebug
```

Expected: `BUILD SUCCESSFUL`, `Installed on 1 device`.

- [ ] **Step 3: Verify filtering still works after the loader change**

```bash
adb shell pm clear uk.co.cyberheroez.oroq
```

Open **OroQ**, complete onboarding, and start protection. Confirm a site
in an enabled category fails to load and a normal site works. This is the key
regression check — Task 4 changed `loadBlocklistRepository`'s signature, so this
proves the filter still loads its lists correctly.

- [ ] **Step 4: Confirm the update worker is scheduled**

```bash
adb shell dumpsys jobscheduler | grep -i oroq | head -5
```

Expected: a scheduled job for the OroQ package — the periodic update.

- [ ] **Step 5: (Optional) Trigger the update worker immediately**

To exercise the download path without waiting a week, find the job id from the
Step 4 output and run it:

```bash
adb shell cmd jobscheduler run -f uk.co.cyberheroez.oroq <JOB_ID>
adb logcat -d -s BlocklistUpdater
```

Expected: the `BlocklistUpdater` log shows "updated N category list(s)" or no
change (both are success — it depends on whether the hosted lists differ from
the bundled ones).

- [ ] **Step 6: Final commit (if any verification fixes were needed)**

Only if Steps 1-5 required changes. Otherwise Plan 4 is complete.

---

## Done — Plan 4 outcome (MVP complete)

The blocklists are now real (curated lists merged with large open-source lists),
hosted on Cloudflare, and refreshed weekly on-device without an app release. The
notification permission and reliability guidance complete the release-prep work.
With Plans 1-4 done, the OroQ Android parental-control MVP is
feature-complete and ready for Play Store submission.

**Growing the blocklists post-launch:** re-run `node android/blocklist/build-blocklist.mjs`
and re-deploy via Task 6 — installed apps pick up the changes within a week.

