# Android Parental Control — Plan 3: Parent UI, Config & PIN

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plan 2 debug screen with the real parent-facing app — first-launch onboarding (PIN, recovery code, category choice), a Home/Status screen, a PIN-locked Settings screen — and make the VpnService filter the categories the parent actually chose.

**Architecture:** Android Views (the project is a Views/MaterialComponents project — no Jetpack Compose). Parent configuration is persisted with Preferences DataStore. The PIN and recovery code are stored as salted PBKDF2 hashes, never in plain text. Three Activities — `OnboardingActivity`, `MainActivity` (Home), `SettingsActivity` — plus a reusable PIN-prompt dialog. The VpnService reads the enabled categories from DataStore at start instead of enabling everything.

**Tech Stack:** Kotlin, Android Views, Preferences DataStore, PBKDF2 (JDK `javax.crypto`), JUnit 4.

**Reference:** Design spec — `docs/superpowers/specs/2026-05-21-safebrowse-android-parental-control-design.md` (§7, §8).

**Depends on:** Plan 1 (filter core) and Plan 2 (`SafeBrowseVpnService`, `loadBlocklistRepository`, `DnsFilter`).

**Plan series:** Plan 1 (done) → Plan 2 (done) → Plan 3 (this) → Plan 4 (blocklist updates + release prep).

**Scope note — "Blocked page":** the design spec listed a blocked-page screen. With DNS-level filtering a blocked domain returns NXDOMAIN and the browser shows its own error; there is no in-app blocked page. That screen is intentionally dropped here (the spec already flagged the HTTPS limitation). The four real screens are Onboarding, Home, the PIN prompt, and Settings.

**Category-change behaviour:** the VpnService reads enabled categories once when protection starts. Changing categories in Settings takes effect the next time protection is turned on; Settings shows a note saying so. Live reconfiguration is out of scope for the MVP.

---

## File structure produced by this plan

```
android/app/src/main/
├─ AndroidManifest.xml                   + OnboardingActivity, SettingsActivity
└─ java/uk/co/cyberheroez/safebrowse/
   ├─ MainActivity.kt                    reworked: Home/Status + onboarding routing
   ├─ config/
   │  ├─ PinHasher.kt                    salted PBKDF2 hash/verify + recovery code
   │  ├─ Categories.kt                   selectable categories + defaults
   │  └─ ConfigRepository.kt             DataStore-backed parent config
   ├─ ui/
   │  ├─ PinPrompt.kt                    reusable numeric PIN dialog
   │  ├─ OnboardingActivity.kt           first-launch setup
   │  └─ SettingsActivity.kt             PIN-locked settings
   └─ vpn/SafeBrowseVpnService.kt        reads enabled categories from config

android/app/src/test/java/uk/co/cyberheroez/safebrowse/config/
└─ PinHasherTest.kt
```

---

## Task 1: Add DataStore and lifecycle dependencies

**Files:**
- Modify: `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`

- [ ] **Step 1: Add versions and library aliases**

In `android/gradle/libs.versions.toml`, add these lines to the `[versions]` block:

```toml
datastore = "1.1.1"
lifecycle = "2.8.7"
```

Add these lines to the `[libraries]` block:

```toml
androidx-datastore-preferences = { group = "androidx.datastore", name = "datastore-preferences", version.ref = "datastore" }
androidx-lifecycle-runtime-ktx = { group = "androidx.lifecycle", name = "lifecycle-runtime-ktx", version.ref = "lifecycle" }
```

- [ ] **Step 2: Reference them in the app module**

In `android/app/build.gradle.kts`, add these two lines inside the `dependencies { }` block, after `implementation(libs.material)`:

```kotlin
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.lifecycle.runtime.ktx)
```

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/gradle/libs.versions.toml android/app/build.gradle.kts
git commit -m "chore(android): add DataStore + lifecycle dependencies"
```

---

## Task 2: PIN hashing

Salted PBKDF2 hashing for the parent PIN and the recovery code. Uses
`java.util.Base64` (available on API 26+ and in JVM unit tests) — not
`android.util.Base64`, which is unavailable in unit tests.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/config/PinHasher.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/config/PinHasherTest.kt`

- [ ] **Step 1: Write the failing test**

Create `PinHasherTest.kt`:

```kotlin
package uk.co.cyberheroez.oroq.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PinHasherTest {

    @Test fun hashIsDeterministicForSameSaltAndSecret() {
        val salt = PinHasher.newSalt()
        assertEquals(PinHasher.hash("1234", salt), PinHasher.hash("1234", salt))
    }

    @Test fun verifyAcceptsTheCorrectSecret() {
        val salt = PinHasher.newSalt()
        val hash = PinHasher.hash("1234", salt)
        assertTrue(PinHasher.verify("1234", salt, hash))
    }

    @Test fun verifyRejectsAWrongSecret() {
        val salt = PinHasher.newSalt()
        val hash = PinHasher.hash("1234", salt)
        assertFalse(PinHasher.verify("9999", salt, hash))
    }

    @Test fun differentSaltsProduceDifferentHashes() {
        assertNotEquals(
            PinHasher.hash("1234", PinHasher.newSalt()),
            PinHasher.hash("1234", PinHasher.newSalt()),
        )
    }

    @Test fun recoveryCodeIsEightCharacters() {
        assertEquals(8, PinHasher.newRecoveryCode().length)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd android && ./gradlew :app:testDebugUnitTest --tests "*PinHasherTest"
```

Expected: FAIL — `PinHasher` is unresolved.

- [ ] **Step 3: Write the implementation**

Create `PinHasher.kt`:

```kotlin
package uk.co.cyberheroez.oroq.config

import java.security.SecureRandom
import java.util.Base64
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Salted PBKDF2 hashing for the parent PIN and recovery code. */
object PinHasher {

    private const val ITERATIONS = 100_000
    private const val KEY_LENGTH_BITS = 256
    private val random = SecureRandom()
    private val encoder: Base64.Encoder = Base64.getEncoder()
    private val decoder: Base64.Decoder = Base64.getDecoder()

    /** A fresh random 16-byte salt, Base64-encoded. */
    fun newSalt(): String {
        val bytes = ByteArray(16)
        random.nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    /** PBKDF2-SHA256 hash of [secret] with [saltBase64], Base64-encoded. */
    fun hash(secret: String, saltBase64: String): String {
        val salt = decoder.decode(saltBase64)
        val spec = PBEKeySpec(secret.toCharArray(), salt, ITERATIONS, KEY_LENGTH_BITS)
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        return encoder.encodeToString(factory.generateSecret(spec).encoded)
    }

    /** True if [secret] hashes to [expectedHash] under [saltBase64]. */
    fun verify(secret: String, saltBase64: String, expectedHash: String): Boolean =
        hash(secret, saltBase64) == expectedHash

    /** A random 8-character recovery code from an unambiguous alphabet. */
    fun newRecoveryCode(): String {
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no I, O, 0, 1
        return buildString {
            repeat(8) { append(alphabet[random.nextInt(alphabet.length)]) }
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
./gradlew :app:testDebugUnitTest --tests "*PinHasherTest"
```

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/test/java
git commit -m "feat(android): salted PBKDF2 PIN hashing"
```

---

## Task 3: Categories and config repository

The list of selectable categories, and a DataStore-backed store for the parent's
PIN, recovery code, and category selection.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/config/Categories.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/config/ConfigRepository.kt`

- [ ] **Step 1: Write `Categories.kt`**

```kotlin
package uk.co.cyberheroez.oroq.config

/** The web-content categories a parent can choose to block. */
object Categories {

    /** A blockable category. [id] matches a bundled `blocklists/<id>.txt`. */
    data class Category(val id: String, val label: String)

    /** Categories shown as toggles during onboarding and in settings. */
    val SELECTABLE = listOf(
        Category("adult", "Adult content"),
        Category("gambling", "Gambling"),
        Category("drugs", "Drugs"),
        Category("violence", "Violence"),
        Category("social", "Social media"),
        Category("gaming", "Gaming sites"),
        Category("malware", "Malware"),
        Category("phishing", "Phishing"),
    )

    /** Always enforced, never shown as a toggle (anti-DoH-bypass). */
    const val ALWAYS_ON = "doh"

    /** Default selection for a new install: every selectable category. */
    val DEFAULT_ENABLED: Set<String> = SELECTABLE.map { it.id }.toSet()
}
```

- [ ] **Step 2: Write `ConfigRepository.kt`**

```kotlin
package uk.co.cyberheroez.oroq.config

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first

private val Context.dataStore by preferencesDataStore(name = "safebrowse_config")

/**
 * Persists parent configuration: the PIN and recovery code (as salted PBKDF2
 * hashes) and the set of enabled categories. All reads/writes are suspending.
 */
class ConfigRepository(context: Context) {

    private val store = context.applicationContext.dataStore

    private object Keys {
        val PIN_HASH = stringPreferencesKey("pin_hash")
        val PIN_SALT = stringPreferencesKey("pin_salt")
        val RECOVERY_HASH = stringPreferencesKey("recovery_hash")
        val RECOVERY_SALT = stringPreferencesKey("recovery_salt")
        val CATEGORIES = stringSetPreferencesKey("enabled_categories")
        val ONBOARDED = booleanPreferencesKey("onboarding_done")
    }

    suspend fun isOnboardingComplete(): Boolean =
        store.data.first()[Keys.ONBOARDED] ?: false

    /** Stores the PIN, recovery code, and categories, and marks onboarding done. */
    suspend fun completeOnboarding(pin: String, recoveryCode: String, categories: Set<String>) {
        val pinSalt = PinHasher.newSalt()
        val recoverySalt = PinHasher.newSalt()
        store.edit { prefs ->
            prefs[Keys.PIN_HASH] = PinHasher.hash(pin, pinSalt)
            prefs[Keys.PIN_SALT] = pinSalt
            prefs[Keys.RECOVERY_HASH] = PinHasher.hash(recoveryCode, recoverySalt)
            prefs[Keys.RECOVERY_SALT] = recoverySalt
            prefs[Keys.CATEGORIES] = categories
            prefs[Keys.ONBOARDED] = true
        }
    }

    suspend fun verifyPin(pin: String): Boolean {
        val prefs = store.data.first()
        val hash = prefs[Keys.PIN_HASH] ?: return false
        val salt = prefs[Keys.PIN_SALT] ?: return false
        return PinHasher.verify(pin, salt, hash)
    }

    suspend fun verifyRecoveryCode(code: String): Boolean {
        val prefs = store.data.first()
        val hash = prefs[Keys.RECOVERY_HASH] ?: return false
        val salt = prefs[Keys.RECOVERY_SALT] ?: return false
        return PinHasher.verify(code.uppercase().trim(), salt, hash)
    }

    suspend fun setPin(pin: String) {
        val salt = PinHasher.newSalt()
        store.edit { prefs ->
            prefs[Keys.PIN_HASH] = PinHasher.hash(pin, salt)
            prefs[Keys.PIN_SALT] = salt
        }
    }

    suspend fun getEnabledCategories(): Set<String> =
        store.data.first()[Keys.CATEGORIES] ?: Categories.DEFAULT_ENABLED

    suspend fun setEnabledCategories(categories: Set<String>) {
        store.edit { it[Keys.CATEGORIES] = categories }
    }
}
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
git commit -m "feat(android): category list + DataStore config repository"
```

---

## Task 4: Reusable PIN prompt

A numeric PIN dialog used to gate the Settings screen.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/PinPrompt.kt`

- [ ] **Step 1: Write `PinPrompt.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Context
import android.text.InputType
import android.widget.EditText
import androidx.appcompat.app.AlertDialog

/**
 * Shows a numeric PIN dialog. Calls [onEntered] with the typed PIN when the
 * parent taps OK, or [onCancelled] if they dismiss it. When [onForgot] is
 * supplied, a neutral "Forgot PIN?" button is shown.
 */
fun showPinPrompt(
    context: Context,
    title: String,
    onEntered: (String) -> Unit,
    onCancelled: () -> Unit = {},
    onForgot: (() -> Unit)? = null,
) {
    val input = EditText(context).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
        hint = "PIN"
    }
    val builder = AlertDialog.Builder(context)
        .setTitle(title)
        .setView(input)
        .setCancelable(false)
        .setPositiveButton("OK") { _, _ -> onEntered(input.text.toString()) }
        .setNegativeButton("Cancel") { _, _ -> onCancelled() }
    if (onForgot != null) {
        builder.setNeutralButton("Forgot PIN?") { _, _ -> onForgot() }
    }
    builder.show()
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
git commit -m "feat(android): reusable PIN prompt dialog"
```

---

## Task 5: Onboarding screen

First-launch setup: create a PIN, choose categories, then see the recovery code.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/OnboardingActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Declare the activity**

In `android/app/src/main/AndroidManifest.xml`, add this `<activity>` element as a
child of `<application>`, immediately after the existing `MainActivity` activity:

```xml
        <activity
            android:name=".ui.OnboardingActivity"
            android:exported="false" />
```

- [ ] **Step 2: Write `OnboardingActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.config.PinHasher

/** First-launch setup: parent PIN, category choice, and recovery code. */
class OnboardingActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private lateinit var pinField: EditText
    private lateinit var confirmField: EditText
    private val categoryBoxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildLayout())
    }

    private fun buildLayout(): ScrollView {
        val pad = (24 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(heading("Set up SafeBrowse"))

        column.addView(label("Create a parent PIN (4+ digits)"))
        pinField = pinInput()
        column.addView(pinField)

        column.addView(label("Confirm PIN"))
        confirmField = pinInput()
        column.addView(confirmField)

        column.addView(label("Choose what to block"))
        for (category in Categories.SELECTABLE) {
            val box = CheckBox(this).apply {
                text = category.label
                isChecked = category.id in Categories.DEFAULT_ENABLED
            }
            categoryBoxes[category.id] = box
            column.addView(box)
        }

        column.addView(Button(this).apply {
            text = "Finish setup"
            setOnClickListener { finishSetup() }
        })

        return ScrollView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(column)
        }
    }

    private fun finishSetup() {
        val pin = pinField.text.toString()
        val confirm = confirmField.text.toString()
        if (pin.length < 4) {
            toast("PIN must be at least 4 digits")
            return
        }
        if (pin != confirm) {
            toast("PINs do not match")
            return
        }
        val categories = categoryBoxes.filterValues { it.isChecked }.keys.toSet()
        if (categories.isEmpty()) {
            toast("Choose at least one category to block")
            return
        }
        val recoveryCode = PinHasher.newRecoveryCode()
        lifecycleScope.launch {
            config.completeOnboarding(pin, recoveryCode, categories)
            showRecoveryCode(recoveryCode)
        }
    }

    private fun showRecoveryCode(code: String) {
        AlertDialog.Builder(this)
            .setTitle("Save your recovery code")
            .setMessage(
                "If you forget your PIN, this code is the only way to reset it:\n\n" +
                    "$code\n\nWrite it down somewhere safe now."
            )
            .setCancelable(false)
            .setPositiveButton("I have saved it") { _, _ ->
                startActivity(Intent(this, MainActivity::class.java))
                finish()
            }
            .show()
    }

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        textSize = 24f
        gravity = Gravity.CENTER
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        textSize = 16f
        setPadding(0, (16 * resources.displayMetrics.density).toInt(), 0, 0)
    }

    private fun pinInput() = EditText(this).apply {
        inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
```

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): onboarding screen"
```

---

## Task 6: Home/Status screen with onboarding routing

Reworks `MainActivity` into the real Home screen: it sends a first-time user to
onboarding, shows protection status, and starts/stops the VPN.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/MainActivity.kt`

- [ ] **Step 1: Replace `MainActivity.kt` entirely**

```kotlin
package uk.co.cyberheroez.oroq

import android.content.Intent
import android.graphics.Color
import android.net.VpnService
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.ui.OnboardingActivity
import uk.co.cyberheroez.oroq.ui.SettingsActivity
import uk.co.cyberheroez.oroq.vpn.SafeBrowseVpnService

/** Home screen: protection status, start/stop, and a link to Settings. */
class MainActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private lateinit var statusText: TextView

    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) startVpnService()
        refreshStatusSoon()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            if (!config.isOnboardingComplete()) {
                startActivity(Intent(this@MainActivity, OnboardingActivity::class.java))
                finish()
            } else {
                setContentView(buildLayout())
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (this::statusText.isInitialized) updateStatus()
    }

    private fun buildLayout(): LinearLayout {
        val pad = (24 * resources.displayMetrics.density).toInt()
        statusText = TextView(this).apply {
            textSize = 20f
            gravity = Gravity.CENTER
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setPadding(pad, pad, pad, pad)
            addView(TextView(context).apply {
                text = getString(R.string.app_name)
                textSize = 28f
                gravity = Gravity.CENTER
            })
            addView(statusText)
            addView(Button(context).apply {
                text = "Start protection"
                setOnClickListener { requestVpn() }
            })
            addView(Button(context).apply {
                text = "Stop protection"
                setOnClickListener {
                    stopVpnService()
                    refreshStatusSoon()
                }
            })
            addView(Button(context).apply {
                text = "Settings"
                setOnClickListener {
                    startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
                }
            })
        }
        .also { updateStatus() }
    }

    private fun updateStatus() {
        if (SafeBrowseVpnService.isActive) {
            statusText.text = "● Protected"
            statusText.setTextColor(Color.parseColor("#1B7F3B"))
        } else {
            statusText.text = "○ Not protected"
            statusText.setTextColor(Color.parseColor("#9E9E9E"))
        }
    }

    private fun refreshStatusSoon() {
        statusText.postDelayed({ updateStatus() }, 900)
    }

    private fun requestVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnConsent.launch(intent)
        } else {
            startVpnService()
            refreshStatusSoon()
        }
    }

    private fun startVpnService() {
        startService(Intent(this, SafeBrowseVpnService::class.java))
    }

    private fun stopVpnService() {
        startService(
            Intent(this, SafeBrowseVpnService::class.java)
                .setAction(SafeBrowseVpnService.ACTION_STOP)
        )
    }
}
```

- [ ] **Step 2: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: FAIL — `SettingsActivity` is unresolved (created in Task 7). This is
expected; the build passes after Task 7.

- [ ] **Step 3: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): Home screen with onboarding routing"
```

---

## Task 7: Settings screen

PIN-locked: category toggles and a change-PIN action.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/ui/SettingsActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Declare the activity**

In `android/app/src/main/AndroidManifest.xml`, add this `<activity>` element as a
child of `<application>`, immediately after the `OnboardingActivity` activity:

```xml
        <activity
            android:name=".ui.SettingsActivity"
            android:exported="false" />
```

- [ ] **Step 2: Write `SettingsActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.config.ConfigRepository

/** PIN-locked settings: category toggles and change-PIN. */
class SettingsActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val categoryBoxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Gate entry behind the PIN before showing anything.
        showPinPrompt(
            context = this,
            title = "Enter parent PIN",
            onEntered = { pin -> checkPinThenOpen(pin) },
            onCancelled = { finish() },
            onForgot = { showRecoveryFlow() },
        )
    }

    /** Forgot-PIN path: verify the recovery code, then set a new PIN. */
    private fun showRecoveryFlow() {
        val input = EditText(this).apply { hint = "Recovery code" }
        AlertDialog.Builder(this)
            .setTitle("Enter recovery code")
            .setView(input)
            .setCancelable(false)
            .setPositiveButton("OK") { _, _ ->
                lifecycleScope.launch {
                    if (config.verifyRecoveryCode(input.text.toString())) {
                        promptNewPinViaRecovery()
                    } else {
                        Toast.makeText(this@SettingsActivity, "Wrong recovery code", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                }
            }
            .setNegativeButton("Cancel") { _, _ -> finish() }
            .show()
    }

    private fun promptNewPinViaRecovery() {
        showPinPrompt(
            context = this,
            title = "Set a new PIN (4+ digits)",
            onEntered = { newPin ->
                if (newPin.length < 4) {
                    Toast.makeText(this, "PIN must be at least 4 digits", Toast.LENGTH_SHORT).show()
                    finish()
                } else {
                    lifecycleScope.launch {
                        config.setPin(newPin)
                        Toast.makeText(this@SettingsActivity, "PIN reset", Toast.LENGTH_SHORT).show()
                        setContentView(buildLayout(config.getEnabledCategories()))
                    }
                }
            },
            onCancelled = { finish() },
        )
    }

    private fun checkPinThenOpen(pin: String) {
        lifecycleScope.launch {
            if (config.verifyPin(pin)) {
                setContentView(buildLayout(config.getEnabledCategories()))
            } else {
                Toast.makeText(this@SettingsActivity, "Wrong PIN", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun buildLayout(enabled: Set<String>): ScrollView {
        val pad = (24 * resources.displayMetrics.density).toInt()
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        column.addView(TextView(this).apply {
            text = "Settings"
            textSize = 24f
            gravity = Gravity.CENTER
        })

        column.addView(TextView(this).apply {
            text = "Blocked categories"
            textSize = 16f
            setPadding(0, pad, 0, 0)
        })
        for (category in Categories.SELECTABLE) {
            val box = CheckBox(this).apply {
                text = category.label
                isChecked = category.id in enabled
            }
            categoryBoxes[category.id] = box
            column.addView(box)
        }

        column.addView(Button(this).apply {
            text = "Save categories"
            setOnClickListener { saveCategories() }
        })
        column.addView(Button(this).apply {
            text = "Change PIN"
            setOnClickListener { changePin() }
        })

        return ScrollView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            addView(column)
        }
    }

    private fun saveCategories() {
        val categories = categoryBoxes.filterValues { it.isChecked }.keys.toSet()
        if (categories.isEmpty()) {
            Toast.makeText(this, "Choose at least one category", Toast.LENGTH_SHORT).show()
            return
        }
        lifecycleScope.launch {
            config.setEnabledCategories(categories)
            Toast.makeText(
                this@SettingsActivity,
                "Saved. Restart protection for changes to take effect.",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun changePin() {
        showPinPrompt(
            context = this,
            title = "New parent PIN (4+ digits)",
            onEntered = { newPin ->
                if (newPin.length < 4) {
                    Toast.makeText(this, "PIN must be at least 4 digits", Toast.LENGTH_SHORT).show()
                } else {
                    lifecycleScope.launch {
                        config.setPin(newPin)
                        Toast.makeText(this@SettingsActivity, "PIN changed", Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
    }
}
```

- [ ] **Step 3: Verify the project builds**

```bash
cd android && ./gradlew :app:assembleDebug
```

Expected: `BUILD SUCCESSFUL` (Task 6's `SettingsActivity` reference now resolves).

- [ ] **Step 4: Commit**

```bash
cd ..
git add android/app/src/main/java android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): PIN-locked settings screen"
```

---

## Task 8: Wire the VpnService to the parent's categories + verify

The VpnService currently enables every category. Make it read the parent's
selection from `ConfigRepository`, then verify the whole app on a device.

**Files:**
- Modify: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/vpn/SafeBrowseVpnService.kt`

- [ ] **Step 1: Read enabled categories from config**

In `SafeBrowseVpnService.kt`, add these imports alongside the existing ones:

```kotlin
import kotlinx.coroutines.runBlocking
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.config.ConfigRepository
```

Then, in `runLoop`, replace this block:

```kotlin
            val repository = loadBlocklistRepository(assets)
            Log.i(TAG, "blocklist loaded: categories=${repository.availableCategories}")
            val filter = DnsFilter(repository) { repository.availableCategories }
```

with:

```kotlin
            val repository = loadBlocklistRepository(assets)
            val enabled = runBlocking {
                ConfigRepository(applicationContext).getEnabledCategories()
            } + Categories.ALWAYS_ON
            Log.i(TAG, "blocklist loaded; enabled categories=$enabled")
            val filter = DnsFilter(repository) { enabled }
```

- [ ] **Step 2: Run the full unit-test suite**

```bash
cd android && ./gradlew :app:testDebugUnitTest
```

Expected: PASS — all unit tests (Plan 1 + Plan 2 + `PinHasherTest`).

- [ ] **Step 3: Build and install**

```bash
./gradlew :app:installDebug
```

Expected: `BUILD SUCCESSFUL`, `Installed on 1 device`.

- [ ] **Step 4: On-device verification**

To start from a clean state, clear the app's data first:

```bash
adb shell pm clear uk.co.cyberheroez.oroq
```

Open **SafeBrowse**. Expected flow:
1. **Onboarding** appears (first launch). Set a PIN (e.g. `1234`), confirm it,
   leave categories at their defaults, tap **Finish setup**.
2. The **recovery code** dialog appears. Tap **I have saved it**.
3. The **Home** screen appears showing **○ Not protected**.
4. Tap **Start protection**, accept the VPN consent dialog → status becomes
   **● Protected**.
5. In a browser, confirm a blocked site (e.g. an `adult` category site) fails
   to load and a normal site works.
6. Tap **Settings**, enter the PIN → settings open. Uncheck **Adult content**,
   tap **Save categories**. Tap **Stop protection** then **Start protection** on
   Home; confirm the previously blocked site now loads.
7. Re-open the app — it goes straight to **Home** (onboarding is not repeated).

If any step fails, capture `adb logcat -s SafeBrowseVpn` and stop to investigate
rather than guessing.

- [ ] **Step 5: Commit**

```bash
cd ..
git add android/app/src/main/java
git commit -m "feat(android): filter the parent's chosen categories"
```

---

## Done — Plan 3 outcome

The app now has its real parent-facing flow: first-launch onboarding with a
hashed PIN and recovery code, a Home/Status screen, and PIN-locked Settings. The
VpnService filters exactly the categories the parent chose. **Plan 4** adds
periodic blocklist updates, larger blocklists hosted on Cloudflare, and
release-preparation steps.
