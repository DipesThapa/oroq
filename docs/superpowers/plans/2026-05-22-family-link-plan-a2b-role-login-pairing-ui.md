# Family Link — Plan A2b: Role, Login & Pairing UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Family Link device-role choice, parent email-OTP login, and the two-sided pairing flow to the OroQ Android app, completing spec "Plan A".

**Architecture:** A `FamilyStore` (Preferences DataStore) holds the device role, the parent session token, this device's key pair and its pairing records. A role picker on first launch routes the app into Child mode (the existing app) or Parent mode (a new `ParentActivity`). Pairing reuses `FamilyApi`/`FamilyCrypto` from Plan A2a: the parent creates a pairing and shows a code; the child enters it; both confirm a 6-digit SAS before the pairing is saved.

**Tech Stack:** Kotlin, Android Views, Preferences DataStore, coroutines, the `family/` package from Plan A2a, the `ui/Style.kt` design system.

**Reference:** Spec — `docs/superpowers/specs/2026-05-22-oroq-parent-remote-view-design.md`, sections 3 (architecture), 4 (pairing) and 7 (UI).

**Depends on:** Plan A2a (`FamilyCrypto`, `FamilyApi`, `HttpUrlTransport`, models) and Plan A1 (the deployed Worker — `WORKER_BASE_URL` must point at it).

**Verification note:** these tasks are UI and DataStore code, which this project verifies by building (`./gradlew :app:assembleDebug`) and checking on an emulator — the same way the existing screens were built. Only the pure helper in Task 1 has a JVM unit test.

**Security note — key storage:** `FamilyStore` keeps this device's private keyset base64 in app-private DataStore (sandboxed per-app storage). Wrapping it with an Android Keystore master key (`AndroidKeysetManager`) is a documented hardening follow-up; it is deferred because Tink's keystore manager is handle-based and does not compose with the base64 string API chosen in A2a for testability.

---

## File structure produced by this plan

```
android/app/src/main/
├─ AndroidManifest.xml                    + 4 activities
└─ java/uk/co/cyberheroez/oroq/
   ├─ family/
   │  ├─ FamilyConfig.kt        WORKER_BASE_URL + familyApi() factory
   │  ├─ FamilyStore.kt         DataStore: role, token, keypair, pairings
   │  └─ PairingSupport.kt      normalizeCode() pure helper
   ├─ parent/
   │  ├─ ParentActivity.kt      parent home — children list
   │  ├─ ParentLoginActivity.kt email + OTP
   │  └─ AddChildActivity.kt    create pairing, show code, SAS confirm
   ├─ ui/
   │  ├─ RolePickerActivity.kt  first-launch child/parent choice
   │  ├─ LinkParentActivity.kt  child side: enter code, SAS confirm
   │  └─ SettingsActivity.kt    + "Link a parent" row
   └─ MainActivity.kt           route by device role
android/app/src/test/java/uk/co/cyberheroez/oroq/family/
└─ PairingSupportTest.kt
```

---

## Task 1: FamilyStore, config, and the code helper

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyConfig.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/PairingSupport.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyStore.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/oroq/family/PairingSupportTest.kt`

- [ ] **Step 1: Write the failing test — `PairingSupportTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Test

class PairingSupportTest {

    @Test fun uppercasesAndTrims() {
        assertEquals("ABCD2345", normalizeCode("  abcd2345 "))
    }

    @Test fun stripsSpacesAndHyphens() {
        assertEquals("ABCD2345", normalizeCode("abcd-2345"))
        assertEquals("ABCD2345", normalizeCode("ABCD 2345"))
    }

    @Test fun leavesAValidCodeUnchanged() {
        assertEquals("WXYZ6789", normalizeCode("WXYZ6789"))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.PairingSupportTest"`
Expected: FAIL — `normalizeCode` unresolved.

- [ ] **Step 3: Create `PairingSupport.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

/** Cleans a typed pairing code: removes spaces/hyphens and uppercases it. */
fun normalizeCode(raw: String): String =
    raw.filterNot { it == ' ' || it == '-' }.uppercase()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.PairingSupportTest"`
Expected: all 3 tests PASS.

- [ ] **Step 5: Create `FamilyConfig.kt`**

Replace `<account>` with the real `workers.dev` subdomain once Plan A1's Worker is deployed (see `backend/README.md`).

```kotlin
package uk.co.cyberheroez.oroq.family

/** Base URL of the deployed Family Link Worker. */
const val WORKER_BASE_URL = "https://oroq-family.<account>.workers.dev"

/** A FamilyApi bound to the production Worker over real HTTP. */
fun familyApi(): FamilyApi = FamilyApi(WORKER_BASE_URL, HttpUrlTransport())
```

- [ ] **Step 6: Create `FamilyStore.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import org.json.JSONObject

private val Context.familyDataStore by preferencesDataStore(name = "family_config")

/** Which side of Family Link this device is. */
enum class DeviceRole { CHILD, PARENT }

/** A child paired to this parent device. */
data class PairedChild(
    val pairingId: String,
    val label: String,
    val childPublicKeyB64: String,
)

/** The parent this child device is linked to. */
data class ParentLink(
    val pairingId: String,
    val parentPublicKeyB64: String,
)

/**
 * Persists Family Link state: the device role, the parent session token, this
 * device's key pair, and pairing records. All reads/writes are suspending.
 */
class FamilyStore(context: Context) {

    private val store = context.applicationContext.familyDataStore

    private object Keys {
        val ROLE = stringPreferencesKey("device_role")
        val PARENT_TOKEN = stringPreferencesKey("parent_token")
        val PRIVATE_KEY = stringPreferencesKey("own_private_keyset")
        val PUBLIC_KEY = stringPreferencesKey("own_public_keyset")
        val CHILDREN = stringSetPreferencesKey("paired_children")
        val PARENT_LINK = stringPreferencesKey("parent_link")
    }

    suspend fun getRole(): DeviceRole? =
        store.data.first()[Keys.ROLE]?.let { runCatching { DeviceRole.valueOf(it) }.getOrNull() }

    suspend fun setRole(role: DeviceRole) {
        store.edit { it[Keys.ROLE] = role.name }
    }

    suspend fun getParentToken(): String? = store.data.first()[Keys.PARENT_TOKEN]

    suspend fun setParentToken(token: String) {
        store.edit { it[Keys.PARENT_TOKEN] = token }
    }

    /** Returns this device's key pair, generating and storing one on first use. */
    suspend fun getOrCreateKeyPair(): FamilyKeyPair {
        val prefs = store.data.first()
        val priv = prefs[Keys.PRIVATE_KEY]
        val pub = prefs[Keys.PUBLIC_KEY]
        if (priv != null && pub != null) return FamilyKeyPair(priv, pub)
        val fresh = FamilyCrypto.generateKeyPair()
        store.edit {
            it[Keys.PRIVATE_KEY] = fresh.privateKeysetB64
            it[Keys.PUBLIC_KEY] = fresh.publicKeysetB64
        }
        return fresh
    }

    suspend fun getChildren(): List<PairedChild> =
        (store.data.first()[Keys.CHILDREN] ?: emptySet()).mapNotNull { decodeChild(it) }

    suspend fun addChild(child: PairedChild) {
        store.edit { prefs ->
            val current = prefs[Keys.CHILDREN] ?: emptySet()
            prefs[Keys.CHILDREN] = current + encodeChild(child)
        }
    }

    suspend fun getParentLink(): ParentLink? =
        store.data.first()[Keys.PARENT_LINK]?.let { decodeLink(it) }

    suspend fun setParentLink(link: ParentLink) {
        store.edit {
            it[Keys.PARENT_LINK] =
                JSONObject().put("id", link.pairingId).put("pk", link.parentPublicKeyB64).toString()
        }
    }

    private fun encodeChild(c: PairedChild): String =
        JSONObject().put("id", c.pairingId).put("label", c.label).put("pk", c.childPublicKeyB64).toString()

    private fun decodeChild(text: String): PairedChild? = runCatching {
        val j = JSONObject(text)
        PairedChild(j.getString("id"), j.getString("label"), j.getString("pk"))
    }.getOrNull()

    private fun decodeLink(text: String): ParentLink? = runCatching {
        val j = JSONObject(text)
        ParentLink(j.getString("id"), j.getString("pk"))
    }.getOrNull()
}
```

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyConfig.kt android/app/src/main/java/uk/co/cyberheroez/oroq/family/PairingSupport.kt android/app/src/main/java/uk/co/cyberheroez/oroq/family/FamilyStore.kt android/app/src/test/java/uk/co/cyberheroez/oroq/family/PairingSupportTest.kt
git commit -m "feat(android): add FamilyStore, config and code helper"
```

---

## Task 2: Role picker and routing

On first launch the user picks a role; `MainActivity` then routes by role.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/RolePickerActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Create `RolePickerActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.Style.dp

/** First-launch screen: is this the child's phone or the parent's phone? */
class RolePickerActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(buildLayout())
    }

    private fun buildLayout(): ScrollView {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(64), dp(20), dp(28))
        }
        column.addView(TextView(this).apply {
            text = "Welcome to OroQ"
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.INK)
        })
        column.addView(TextView(this).apply {
            text = "Which phone is this?"
            textSize = 15f
            setTextColor(Style.MUTED)
        }, marginTop(4))

        column.addView(choiceBlock(
            Style.GREEN, "This is my child's phone",
            "Set up web filtering, app blocking and screen-time limits here.",
        ) { choose(DeviceRole.CHILD) }, marginTop(24))

        column.addView(choiceBlock(
            Style.BLUE, "I'm a parent",
            "Link your child's phone and see it from here.",
        ) { choose(DeviceRole.PARENT) }, marginTop(14))

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun choiceBlock(color: Int, title: String, body: String, onTap: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(color, dp(26).toFloat())
            setPadding(dp(24), dp(24), dp(24), dp(26))
            isClickable = true
            setOnClickListener { onTap() }
            addView(TextView(context).apply {
                text = title
                textSize = 20f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Style.ON_DARK)
            })
            addView(TextView(context).apply {
                text = body
                textSize = 13.5f
                setTextColor(Style.ON_DARK_SOFT)
                setLineSpacing(0f, 1.25f)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(6) })
        }

    private fun marginTop(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }

    private fun choose(role: DeviceRole) {
        lifecycleScope.launch {
            store.setRole(role)
            val next = if (role == DeviceRole.PARENT) ParentActivity::class.java
                       else MainActivity::class.java
            startActivity(Intent(this@RolePickerActivity, next))
            finish()
        }
    }
}
```

- [ ] **Step 2: Modify `MainActivity.kt` — route by role**

In `MainActivity.onCreate`, replace the existing `lifecycleScope.launch { ... }` block with the version below. It adds a role check ahead of the onboarding check; `ParentActivity` and `RolePickerActivity` are the new destinations.

Add these imports to `MainActivity.kt`:

```kotlin
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.RolePickerActivity
```

Add a `FamilyStore` field next to the existing `config`:

```kotlin
    private val familyStore by lazy { FamilyStore(this) }
```

Replace the `lifecycleScope.launch { ... }` block in `onCreate` with:

```kotlin
        lifecycleScope.launch {
            when (familyStore.getRole()) {
                null -> {
                    startActivity(Intent(this@MainActivity, RolePickerActivity::class.java))
                    finish()
                }
                DeviceRole.PARENT -> {
                    startActivity(Intent(this@MainActivity, ParentActivity::class.java))
                    finish()
                }
                DeviceRole.CHILD -> {
                    if (!config.isOnboardingComplete()) {
                        startActivity(Intent(this@MainActivity, OnboardingActivity::class.java))
                        finish()
                    } else {
                        scheduleBlocklistUpdates(this@MainActivity)
                        requestNotificationPermissionIfNeeded()
                        setContentView(buildLayout())
                        refreshMetrics()
                    }
                }
            }
        }
```

- [ ] **Step 3: Register the activities in `AndroidManifest.xml`**

Inside the `<application>` element, add (alongside the existing activities):

```xml
        <activity android:name=".ui.RolePickerActivity" android:exported="false" />
        <activity android:name=".parent.ParentActivity" android:exported="false" />
        <activity android:name=".parent.ParentLoginActivity" android:exported="false" />
        <activity android:name=".parent.AddChildActivity" android:exported="false" />
        <activity android:name=".ui.LinkParentActivity" android:exported="false" />
```

- [ ] **Step 4: Verify it builds**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL. (`ParentActivity`, `ParentLoginActivity`, `AddChildActivity`, `LinkParentActivity` are created in Tasks 3-5; this step compiles only after those exist — run it again at the end of Task 5. For now, confirm `RolePickerActivity` and the `MainActivity` changes have no syntax errors by reviewing them.)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/oroq/ui/RolePickerActivity.kt android/app/src/main/java/uk/co/cyberheroez/oroq/MainActivity.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): add device role picker and role-based routing"
```

---

## Task 3: Parent login and parent home

`ParentActivity` is the parent home; if there is no session token it sends the user to `ParentLoginActivity` (email → OTP).

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentLoginActivity.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentActivity.kt`

- [ ] **Step 1: Create `ParentLoginActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.ui.Style.pageHeader
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Passwordless parent login: email, then a 6-digit OTP. */
class ParentLoginActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val api by lazy { familyApi() }
    private lateinit var emailField: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(emailView())
    }

    private fun emailView(): View = screen(this) {
        pageHeader("Parent sign-in")
        card {
            cardTitle("Your email")
            body("We'll email you a 6-digit code. No password needed.")
            emailField = EditText(context).apply {
                inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                hint = "you@example.com"
                textSize = 16f
            }
            addView(emailField, fieldParams())
        }
        primaryButton("Send code") { requestCode() }
    }

    private fun otpView(email: String): View = screen(this) {
        pageHeader("Enter your code")
        card {
            cardTitle("6-digit code")
            body("Sent to $email.")
            val otpField = EditText(context).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                hint = "123456"
                textSize = 16f
            }
            addView(otpField, fieldParams())
            primaryButton("Verify") { verify(email, otpField.text.toString().trim()) }
        }
    }

    private fun fieldParams() = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(12) }

    private fun requestCode() {
        val email = emailField.text.toString().trim()
        if (!email.contains("@")) {
            toast("Enter a valid email")
            return
        }
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) { api.authRequest(email) }
            if (ok) setContentView(otpView(email))
            else toast("Couldn't send the code — check your connection")
        }
    }

    private fun verify(email: String, otp: String) {
        if (otp.length < 6) {
            toast("Enter the 6-digit code")
            return
        }
        lifecycleScope.launch {
            val token = withContext(Dispatchers.IO) { api.authVerify(email, otp) }
            if (token == null) {
                toast("Wrong or expired code")
            } else {
                store.setParentToken(token)
                startActivity(android.content.Intent(this@ParentLoginActivity, ParentActivity::class.java))
                finish()
            }
        }
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
```

- [ ] **Step 2: Create `ParentActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.PairedChild
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.dp

/** Parent home: the list of paired children, with "Add a child". */
class ParentActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            if (store.getParentToken() == null) {
                startActivity(Intent(this@ParentActivity, ParentLoginActivity::class.java))
                finish()
            } else {
                setContentView(buildLayout(store.getChildren()))
            }
        }
    }

    private fun buildLayout(children: List<PairedChild>): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
        }
        column.addView(TextView(this).apply {
            text = "Your children"
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.INK)
        })

        if (children.isEmpty()) {
            column.addView(TextView(this).apply {
                text = "No phones linked yet. Tap below to link your child's phone."
                textSize = 14f
                setTextColor(Style.MUTED)
            }, gap(6))
        }
        for ((index, child) in children.withIndex()) {
            column.addView(childCard(child), gap(if (index == 0) 18 else 12))
        }

        column.addView(addBlock(), gap(if (children.isEmpty()) 22 else 14))

        return android.widget.ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun childCard(child: PairedChild): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = Style.roundRect(Style.VIOLET, dp(22).toFloat())
        setPadding(dp(22), dp(20), dp(22), dp(20))
        addView(TextView(context).apply {
            text = child.label
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        })
        addView(TextView(context).apply {
            text = "Linked · live status arrives in a later update"
            textSize = 12.5f
            setTextColor(Style.ON_DARK_SOFT)
        })
    }

    private fun addBlock(): View = LinearLayout(this).apply {
        background = Style.roundRect(Style.INK, dp(22).toFloat())
        setPadding(dp(24), dp(22), dp(24), dp(22))
        isClickable = true
        setOnClickListener {
            startActivity(Intent(this@ParentActivity, AddChildActivity::class.java))
        }
        addView(TextView(context).apply {
            text = "+  Add a child"
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        })
    }

    private fun gap(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }
}
```

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentLoginActivity.kt android/app/src/main/java/uk/co/cyberheroez/oroq/parent/ParentActivity.kt
git commit -m "feat(android): add parent login and parent home"
```

---

## Task 4: Parent — "Add a child" pairing

`AddChildActivity` generates the parent key pair, creates a pairing, shows the code, polls until the child joins, then shows the SAS to confirm.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/parent/AddChildActivity.kt`

- [ ] **Step 1: Create `AddChildActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.parent

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.PairedChild
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.ui.Style.pageHeader
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Parent side of pairing: create a pairing, show the code, confirm the SAS. */
class AddChildActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val api by lazy { familyApi() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(loadingView("Creating a pairing…"))
        startPairing()
    }

    private fun startPairing() {
        lifecycleScope.launch {
            val token = store.getParentToken()
            if (token == null) {
                toastAndFinish("Please sign in again")
                return@launch
            }
            val keys = store.getOrCreateKeyPair()
            val created = withContext(Dispatchers.IO) {
                api.pairCreate(token, keys.publicKeysetB64, "Child phone")
            }
            if (created == null) {
                toastAndFinish("Couldn't start pairing — check your connection")
                return@launch
            }
            setContentView(codeView(created.code))
            pollForChild(created.pairingId, keys.publicKeysetB64)
        }
    }

    /** Polls the pairing record until the child has joined. */
    private fun pollForChild(pairingId: String, parentPublicB64: String) {
        lifecycleScope.launch {
            repeat(80) { // ~80 * 5s ≈ the 10-minute code lifetime
                delay(5_000)
                val record = withContext(Dispatchers.IO) { api.pairGet(pairingId) }
                val childKey = record?.childPublicKeyB64
                if (record?.paired == true && childKey != null) {
                    val sas = FamilyCrypto.sas(parentPublicB64, childKey)
                    setContentView(sasView(pairingId, childKey, sas))
                    return@launch
                }
            }
            toastAndFinish("Pairing timed out — try again")
        }
    }

    private fun codeView(code: String): View = screen(this) {
        pageHeader("Pairing code")
        card {
            cardTitle("On your child's phone")
            body("Open OroQ, choose \"This is my child's phone\", then " +
                "Settings → Link a parent, and enter this code:")
            addView(android.widget.TextView(context).apply {
                text = code
                textSize = 40f
                letterSpacing = 0.15f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(Style.INK)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) })
            body("Waiting for the child's phone…", Style.MUTED, 16)
        }
    }

    private fun sasView(pairingId: String, childKey: String, sas: String): View = screen(this) {
        pageHeader("Confirm it's safe")
        card {
            cardTitle("Security code")
            body("Both phones should show the same 6 digits. Check your child's " +
                "phone — if they match, the link is genuine.")
            addView(android.widget.TextView(context).apply {
                text = sas
                textSize = 40f
                letterSpacing = 0.3f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(Style.PRIMARY)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) })
        }
        primaryButton("They match — finish") {
            lifecycleScope.launch {
                store.addChild(PairedChild(pairingId, "Child phone", childKey))
                Toast.makeText(this@AddChildActivity, "Child linked", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun loadingView(message: String): View = screen(this) {
        pageHeader("Add a child")
        card { body(message) }
    }

    private fun toastAndFinish(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        finish()
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
```

- [ ] **Step 2: Verify it builds**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL. (`LinkParentActivity`, referenced in the manifest from Task 2, is created in Task 5 — if the build flags it as missing, complete Task 5 first, then build.)

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/oroq/parent/AddChildActivity.kt
git commit -m "feat(android): add parent-side pairing (Add a child)"
```

---

## Task 5: Child — "Link a parent" pairing

`LinkParentActivity` is reached from child-mode Settings. The child enters the code, joins, and confirms the SAS.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/LinkParentActivity.kt`
- Modify: `android/app/src/main/java/uk/co/cyberheroez/oroq/ui/SettingsActivity.kt`

- [ ] **Step 1: Create `LinkParentActivity.kt`**

```kotlin
package uk.co.cyberheroez.oroq.ui

import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.ParentLink
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.normalizeCode
import uk.co.cyberheroez.oroq.ui.Style.body
import uk.co.cyberheroez.oroq.ui.Style.card
import uk.co.cyberheroez.oroq.ui.Style.cardTitle
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.ui.Style.pageHeader
import uk.co.cyberheroez.oroq.ui.Style.primaryButton
import uk.co.cyberheroez.oroq.ui.Style.screen

/** Child side of pairing: enter the parent's code, confirm the SAS. */
class LinkParentActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val api by lazy { familyApi() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(codeEntryView())
    }

    private fun codeEntryView(): View = screen(this) {
        pageHeader("Link a parent") { finish() }
        card {
            cardTitle("Pairing code")
            body("Ask your parent for the 8-character code shown on their phone.")
            val field = EditText(context).apply {
                inputType = InputType.TYPE_CLASS_TEXT
                hint = "ABCD2345"
                textSize = 18f
            }
            addView(field, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(12) })
            primaryButton("Link") { join(normalizeCode(field.text.toString())) }
        }
    }

    private fun join(code: String) {
        if (code.length < 8) {
            toast("Enter the full 8-character code")
            return
        }
        setContentView(loadingView())
        lifecycleScope.launch {
            val keys = store.getOrCreateKeyPair()
            val result = withContext(Dispatchers.IO) {
                api.pairJoin(code, keys.publicKeysetB64)
            }
            if (result == null) {
                toast("That code didn't work — check it and try again")
                setContentView(codeEntryView())
                return@launch
            }
            val sas = FamilyCrypto.sas(result.parentPublicKeyB64, keys.publicKeysetB64)
            setContentView(sasView(result.pairingId, result.parentPublicKeyB64, sas))
        }
    }

    private fun sasView(pairingId: String, parentKey: String, sas: String): View = screen(this) {
        pageHeader("Confirm it's safe")
        card {
            cardTitle("Security code")
            body("This should match the 6 digits on your parent's phone.")
            addView(android.widget.TextView(context).apply {
                text = sas
                textSize = 40f
                letterSpacing = 0.3f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(Style.PRIMARY)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(16) })
        }
        primaryButton("They match — finish") {
            lifecycleScope.launch {
                store.setParentLink(ParentLink(pairingId, parentKey))
                Toast.makeText(this@LinkParentActivity, "Linked to a parent", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun loadingView(): View = screen(this) {
        pageHeader("Link a parent")
        card { body("Linking…") }
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}
```

- [ ] **Step 2: Add a "Link a parent" row to `SettingsActivity.kt`**

In `SettingsActivity.buildLayout`, after the existing `ghostButton("Screen time") { ... }` block and before `primaryButton("Save categories") { ... }`, add:

```kotlin
        ghostButton("Link a parent") {
            startActivity(Intent(this@SettingsActivity, LinkParentActivity::class.java))
        }
```

`Intent` is already imported in `SettingsActivity.kt`; `LinkParentActivity` is in the same `ui` package, so no new import is needed.

- [ ] **Step 3: Verify the whole app builds**

Run: `cd android && ./gradlew :app:assembleDebug`
Expected: BUILD SUCCESSFUL — all four new activities compile and are registered.

- [ ] **Step 4: Run the full unit-test suite**

Run: `cd android && ./gradlew :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL — the existing tests plus `PairingSupportTest` pass.

- [ ] **Step 5: Manual verification on an emulator**

Install (`./gradlew :app:installDebug`) on two emulators (or an emulator + a device). Note: this needs the Worker from Plan A1 deployed and `WORKER_BASE_URL` set in `FamilyConfig.kt`.

- On phone A: launch → role picker → "I'm a parent" → sign in with an email + the OTP → "Add a child" → a code appears.
- On phone B: launch → role picker → "This is my child's phone" → finish onboarding → Settings → "Link a parent" → enter the code.
- Confirm both phones show the **same 6-digit SAS**, tap "They match" on each.
- On phone A, the child appears in the children list.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/oroq/ui/LinkParentActivity.kt android/app/src/main/java/uk/co/cyberheroez/oroq/ui/SettingsActivity.kt
git commit -m "feat(android): add child-side pairing (Link a parent)"
```

---

## Self-review

**Spec coverage:**
- §3 mode-aware app, `device_role` in storage → `FamilyStore` + `RolePickerActivity` + `MainActivity` routing (Tasks 1-2).
- §4.1-4.2 parent creates pairing & shows code; child joins with code → `AddChildActivity` / `LinkParentActivity` (Tasks 4-5).
- §4.3 SAS confirmation on both sides → `sasView` in both activities, using `FamilyCrypto.sas` (Tasks 4-5).
- §4.4 keys held only on the two devices → `FamilyStore.getOrCreateKeyPair` (Task 1).
- §5 auth — passwordless email OTP → `ParentLoginActivity` (Task 3).
- §7 screens — role picker, parent login, children list, add child, link parent → Tasks 2-5. The full child *dashboard* for the parent is Plan B, not here.
- §8 "Linked to a parent" shown on the child → the child stores a `ParentLink`; surfacing it as a visible Settings status is small and belongs with Plan B's child UI. **Gap noted:** Task 5 adds the *entry point* but not a persistent "you are linked" banner — Plan B's child-side work should add it.

**Out of scope** (Plan B/C): encrypted summary upload, the parent's live child dashboard, remote control, and the child-side "you are linked" banner.

**Placeholder scan:** `WORKER_BASE_URL` contains `<account>` — this is a real deploy-time configuration value (the Worker is deployed in Plan A1), called out in Task 1 Step 5, not an unfinished instruction.

**Type consistency:** `FamilyStore` methods (`getRole`, `setRole`, `getParentToken`, `setParentToken`, `getOrCreateKeyPair`, `getChildren`, `addChild`, `getParentLink`, `setParentLink`), `DeviceRole`, `PairedChild`, `ParentLink`, and `familyApi()` are defined in Task 1 and used with matching signatures in Tasks 2-5. `FamilyApi`/`FamilyCrypto`/`FamilyKeyPair` come from Plan A2a unchanged. `Style.screen/card/cardTitle/body/primaryButton/ghostButton/pageHeader/roundRect/lightSystemBars/dp` and the colour constants are the existing design-system API.

**Build-order note:** the manifest (Task 2) references all four activities, so `assembleDebug` only fully succeeds once Task 5 is done — each task's build step says so. Executing the tasks in order resolves this.
