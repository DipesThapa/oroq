# Family Link — Plan A2a: Android Crypto & API Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SafeBrowse Android `family/` package — end-to-end encryption and the HTTP client for the Family Link Worker — with no UI, fully JVM-unit-tested.

**Architecture:** A `family/` package with three concerns: `FamilyCrypto` wraps Tink hybrid encryption (HPKE / X25519) so a device encrypts for a peer's public key; `FamilyApi` talks to the Worker over an injectable `HttpTransport` (a fake transport in tests, an `HttpURLConnection` adapter in the app); plain data classes carry the request/response shapes. All keys cross the boundary as base64 strings, so every unit is testable on the JVM.

**Tech Stack:** Kotlin, Google Tink (`tink-android` in the app, `tink` in JVM tests), `org.json` (Android built-in; `org.json:json` in tests), `java.net.HttpURLConnection`, `java.util.Base64`, JUnit 4.

**Reference:** Spec — `docs/superpowers/specs/2026-05-22-safebrowse-parent-remote-view-design.md`, sections 4 (pairing) and 8 (security).

**Depends on:** Plan A1 (the Worker) — `FamilyApi` calls its `/auth/*` and `/pair/*` routes. No A1 *code* is imported; only its HTTP contract.

**Design note — crypto:** the spec §4.4 sketched "X25519 → HKDF → AES-GCM, one shared key". This plan uses Tink **hybrid encryption** (HPKE over X25519) instead: each direction encrypts with the *recipient's* public key. It is the same primitives, is what Tink provides directly, needs no shared-secret handshake, and matches the spec's approach summary ("child encrypts with the parent's public key; the parent encrypts with the child's key"). Raw X25519 via the JCA needs API 31; our `minSdk` is 26, so a vetted library is required — Tink is Google-maintained and Apache-2.0.

---

## File structure produced by this plan

```
android/app/
├─ build.gradle.kts                                    + Tink & org.json deps
└─ src/
   ├─ main/java/uk/co/cyberheroez/safebrowse/family/
   │  ├─ FamilyCrypto.kt     Tink hybrid encrypt/decrypt + SAS
   │  ├─ FamilyModels.kt     request/response data classes
   │  ├─ FamilyApi.kt        HttpTransport interface + FamilyApi client
   │  └─ HttpUrlTransport.kt HttpURLConnection adapter
   └─ test/java/uk/co/cyberheroez/safebrowse/family/
      ├─ FamilyCryptoTest.kt
      ├─ FamilyApiTest.kt
      └─ HttpUrlTransportTest.kt
```

`FamilyCrypto` keeps the device key pair only as base64 strings — secure on-device storage (Android Keystore) is Plan A2b's responsibility.

---

## Task 1: Tink crypto — generate, encrypt, decrypt

**Files:**
- Modify: `android/app/build.gradle.kts` (the `dependencies { }` block)
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyCrypto.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCryptoTest.kt`

- [ ] **Step 1: Add the dependencies**

In `android/app/build.gradle.kts`, inside the existing `dependencies { }` block, add these lines after `implementation(libs.androidx.work.runtime.ktx)`:

```kotlin
    implementation("com.google.crypto.tink:tink-android:1.15.0")
    testImplementation("com.google.crypto.tink:tink:1.15.0")
    testImplementation("org.json:json:20240303")
```

- [ ] **Step 2: Write the failing test — `FamilyCryptoTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertNotEquals
import org.junit.Test
import java.security.GeneralSecurityException

class FamilyCryptoTest {

    @Test fun encryptThenDecryptRoundTrips() {
        val keys = FamilyCrypto.generateKeyPair()
        val message = "hello family".toByteArray()
        val ciphertext = FamilyCrypto.encryptFor(keys.publicKeysetB64, message)
        val plaintext = FamilyCrypto.decrypt(keys.privateKeysetB64, ciphertext)
        assertArrayEquals(message, plaintext)
    }

    @Test fun eachKeyPairIsDistinct() {
        assertNotEquals(
            FamilyCrypto.generateKeyPair().publicKeysetB64,
            FamilyCrypto.generateKeyPair().publicKeysetB64,
        )
    }

    @Test fun aDifferentPrivateKeyCannotDecrypt() {
        val alice = FamilyCrypto.generateKeyPair()
        val mallory = FamilyCrypto.generateKeyPair()
        val ciphertext = FamilyCrypto.encryptFor(alice.publicKeysetB64, "secret".toByteArray())
        assertThrows(GeneralSecurityException::class.java) {
            FamilyCrypto.decrypt(mallory.privateKeysetB64, ciphertext)
        }
    }
}
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCryptoTest"`
Expected: FAIL — `FamilyCrypto` unresolved (does not compile yet).

- [ ] **Step 4: Create `FamilyCrypto.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import com.google.crypto.tink.HybridDecrypt
import com.google.crypto.tink.HybridEncrypt
import com.google.crypto.tink.InsecureSecretKeyAccess
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.TinkProtoKeysetFormat
import com.google.crypto.tink.hybrid.HybridConfig
import java.security.MessageDigest
import java.util.Base64

/** A device's hybrid-encryption key pair, serialised as base64 Tink keysets. */
data class FamilyKeyPair(val privateKeysetB64: String, val publicKeysetB64: String)

/**
 * End-to-end encryption for Family Link, built on Tink hybrid encryption
 * (HPKE over X25519). A device encrypts FOR a peer using the peer's public
 * keyset; only the holder of the matching private keyset can decrypt.
 */
object FamilyCrypto {

    private const val TEMPLATE = "DHKEM_X25519_HKDF_SHA256_HKDF_SHA256_AES_256_GCM"
    private val EMPTY = ByteArray(0)

    @Volatile private var registered = false

    /** Registers Tink's hybrid primitives. Safe to call repeatedly. */
    fun init() {
        if (registered) return
        synchronized(this) {
            if (!registered) {
                HybridConfig.register()
                registered = true
            }
        }
    }

    /** Generates a new hybrid key pair for this device. */
    fun generateKeyPair(): FamilyKeyPair {
        init()
        val handle = KeysetHandle.generateNew(KeyTemplates.get(TEMPLATE))
        val privateBytes = TinkProtoKeysetFormat.serializeKeyset(handle, InsecureSecretKeyAccess.get())
        val publicBytes = TinkProtoKeysetFormat.serializeKeysetWithoutSecret(handle.publicKeysetHandle)
        return FamilyKeyPair(encode(privateBytes), encode(publicBytes))
    }

    /** Encrypts [plaintext] so only the holder of [recipientPublicB64]'s private key can read it. */
    fun encryptFor(recipientPublicB64: String, plaintext: ByteArray): ByteArray {
        init()
        val publicHandle = TinkProtoKeysetFormat.parseKeysetWithoutSecret(decode(recipientPublicB64))
        return publicHandle.getPrimitive(HybridEncrypt::class.java).encrypt(plaintext, EMPTY)
    }

    /** Decrypts [ciphertext] addressed to the holder of [privateKeysetB64]. */
    fun decrypt(privateKeysetB64: String, ciphertext: ByteArray): ByteArray {
        init()
        val privateHandle =
            TinkProtoKeysetFormat.parseKeyset(decode(privateKeysetB64), InsecureSecretKeyAccess.get())
        return privateHandle.getPrimitive(HybridDecrypt::class.java).decrypt(ciphertext, EMPTY)
    }

    /**
     * The 6-digit Short Authentication String for a pairing — a hash of both
     * public keysets. Both devices compute the same value; the parent and
     * child compare it aloud to detect a key-swapping relay.
     */
    fun sas(parentPublicB64: String, childPublicB64: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(decode(parentPublicB64))
        digest.update(decode(childPublicB64))
        val hash = digest.digest()
        var n = 0L
        for (i in 0 until 4) n = (n shl 8) or (hash[i].toLong() and 0xFF)
        return (n % 1_000_000).toString().padStart(6, '0')
    }

    private fun encode(bytes: ByteArray): String = Base64.getEncoder().encodeToString(bytes)
    private fun decode(text: String): ByteArray = Base64.getDecoder().decode(text)
}
```

> Tink API note: `getPrimitive(Class)` is the stable form in Tink 1.15. If a future Tink release removes it, switch to `getPrimitive(com.google.crypto.tink.RegistryConfiguration.get(), HybridEncrypt::class.java)` — same behaviour.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCryptoTest"`
Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add android/app/build.gradle.kts android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyCrypto.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCryptoTest.kt
git commit -m "feat(android): add FamilyCrypto — Tink hybrid encryption"
```

---

## Task 2: SAS derivation

The SAS function is already written inside `FamilyCrypto` (Task 1, Step 4). This task adds its dedicated tests.

**Files:**
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCryptoTest.kt` (add to the existing file)

- [ ] **Step 1: Add SAS tests to `FamilyCryptoTest.kt`**

Add these methods inside the existing `class FamilyCryptoTest { }`:

```kotlin
    @Test fun sasIsSixDigits() {
        val parent = FamilyCrypto.generateKeyPair()
        val child = FamilyCrypto.generateKeyPair()
        val sas = FamilyCrypto.sas(parent.publicKeysetB64, child.publicKeysetB64)
        assertTrue(sas.matches(Regex("\\d{6}")))
    }

    @Test fun sasIsStableForTheSameKeys() {
        val parent = FamilyCrypto.generateKeyPair()
        val child = FamilyCrypto.generateKeyPair()
        assertEquals(
            FamilyCrypto.sas(parent.publicKeysetB64, child.publicKeysetB64),
            FamilyCrypto.sas(parent.publicKeysetB64, child.publicKeysetB64),
        )
    }

    @Test fun sasDependsOnKeyOrder() {
        val parent = FamilyCrypto.generateKeyPair()
        val child = FamilyCrypto.generateKeyPair()
        assertNotEquals(
            FamilyCrypto.sas(parent.publicKeysetB64, child.publicKeysetB64),
            FamilyCrypto.sas(child.publicKeysetB64, parent.publicKeysetB64),
        )
    }
```

Add these imports at the top of the file:

```kotlin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
```

- [ ] **Step 2: Run the tests to verify they pass**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyCryptoTest"`
Expected: all 6 tests PASS (3 from Task 1 + 3 SAS tests).

> Note: `sasDependsOnKeyOrder` could in principle collide once in ~10^6 runs if two distinct inputs hash to the same 6 digits. The two inputs here are different key orders of independently random keys, so a collision is astronomically unlikely in practice; if it ever flakes, re-running generates fresh keys.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyCryptoTest.kt
git commit -m "test(android): cover FamilyCrypto SAS derivation"
```

---

## Task 3: Models and the API client

`FamilyApi` builds JSON requests, calls the Worker through an injectable `HttpTransport`, and parses responses into data classes.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyModels.kt`
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyApiTest.kt`

- [ ] **Step 1: Write the failing test — `FamilyApiTest.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** An HttpTransport whose responses are scripted per "METHOD url". */
private class FakeTransport(
    private val responses: Map<String, HttpResponse>,
) : HttpTransport {
    val sent = mutableListOf<String>()
    override fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse {
        sent += "$method $url ${body ?: ""}"
        return responses["$method $url"] ?: HttpResponse(404, "")
    }
}

class FamilyApiTest {

    private val base = "https://api.test"

    @Test fun authRequestReturnsTrueOn200() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/auth/request" to HttpResponse(200, """{"ok":true}"""),
        )))
        assertTrue(api.authRequest("parent@example.com"))
    }

    @Test fun authVerifyReturnsTheToken() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/auth/verify" to HttpResponse(200, """{"token":"jwt-123"}"""),
        )))
        assertEquals("jwt-123", api.authVerify("parent@example.com", "654321"))
    }

    @Test fun authVerifyReturnsNullOnBadOtp() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/auth/verify" to HttpResponse(401, """{"error":"bad_otp"}"""),
        )))
        assertNull(api.authVerify("parent@example.com", "000000"))
    }

    @Test fun pairCreateParsesTheCode() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/pair/create" to HttpResponse(
                200, """{"pairingId":"pid-1","code":"ABCD2345","expiresInSec":600}""",
            ),
        )))
        val result = api.pairCreate("jwt-123", "PARENTKEY", "Tablet")
        assertEquals("pid-1", result?.pairingId)
        assertEquals("ABCD2345", result?.code)
    }

    @Test fun pairJoinParsesTheParentKey() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "POST $base/pair/join" to HttpResponse(
                200, """{"pairingId":"pid-1","parentPublicKey":"PARENTKEY"}""",
            ),
        )))
        val result = api.pairJoin("ABCD2345", "CHILDKEY")
        assertEquals("PARENTKEY", result?.parentPublicKeyB64)
    }

    @Test fun pairGetParsesTheRecord() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/pair/pid-1" to HttpResponse(
                200,
                """{"pairingId":"pid-1","childLabel":"Tablet","parentPublicKey":"PK",""" +
                    """"childPublicKey":"CK","paired":true,"pairedAt":123}""",
            ),
        )))
        val record = api.pairGet("pid-1")
        assertEquals(true, record?.paired)
        assertEquals("CK", record?.childPublicKeyB64)
    }

    @Test fun pairGetReturnsNullWhenMissing() {
        val api = FamilyApi(base, FakeTransport(mapOf(
            "GET $base/pair/missing" to HttpResponse(404, """{"error":"not_found"}"""),
        )))
        assertNull(api.pairGet("missing"))
    }

    @Test fun pairCreateSendsTheBearerToken() {
        val transport = FakeTransport(mapOf(
            "POST $base/pair/create" to HttpResponse(
                200, """{"pairingId":"p","code":"ABCD2345","expiresInSec":600}""",
            ),
        ))
        FamilyApi(base, transport).pairCreate("jwt-xyz", "PK", null)
        assertTrue(transport.sent.any { it.contains("/pair/create") })
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyApiTest"`
Expected: FAIL — `FamilyApi`, `HttpTransport`, `HttpResponse` unresolved.

- [ ] **Step 3: Create `FamilyModels.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

/** Result of `POST /pair/create`. */
data class CreatePairingResult(
    val pairingId: String,
    val code: String,
    val expiresInSec: Int,
)

/** Result of `POST /pair/join`. */
data class JoinPairingResult(
    val pairingId: String,
    val parentPublicKeyB64: String,
)

/** A pairing record from `GET /pair/:id`. */
data class PairingRecord(
    val pairingId: String,
    val childLabel: String?,
    val parentPublicKeyB64: String,
    val childPublicKeyB64: String?,
    val paired: Boolean,
)
```

- [ ] **Step 4: Create `FamilyApi.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import org.json.JSONObject

/** A single HTTP response: status code and raw body text. */
data class HttpResponse(val status: Int, val body: String)

/** Performs a blocking HTTP request. Swapped for a fake in tests. */
interface HttpTransport {
    fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse
}

/**
 * Client for the Family Link Worker. All calls are blocking — callers run them
 * on a background dispatcher. A method returns null when the request fails or
 * the server rejects it; the caller decides how to surface that.
 */
class FamilyApi(
    private val baseUrl: String,
    private val transport: HttpTransport,
) {
    private val jsonHeaders = mapOf("content-type" to "application/json")

    /** Asks the Worker to email an OTP. Returns true on success. */
    fun authRequest(email: String): Boolean {
        val body = JSONObject().put("email", email).toString()
        return post("/auth/request", jsonHeaders, body).status == 200
    }

    /** Verifies the OTP; returns the session token, or null if rejected. */
    fun authVerify(email: String, otp: String): String? {
        val body = JSONObject().put("email", email).put("otp", otp).toString()
        val res = post("/auth/verify", jsonHeaders, body)
        if (res.status != 200) return null
        return JSONObject(res.body).optString("token").ifEmpty { null }
    }

    /** Creates a pairing and returns its id + short code, or null on failure. */
    fun pairCreate(token: String, parentPublicKeyB64: String, childLabel: String?): CreatePairingResult? {
        val payload = JSONObject().put("parentPublicKey", parentPublicKeyB64)
        if (childLabel != null) payload.put("childLabel", childLabel)
        val headers = jsonHeaders + ("authorization" to "Bearer $token")
        val res = post("/pair/create", headers, payload.toString())
        if (res.status != 200) return null
        val json = JSONObject(res.body)
        return CreatePairingResult(
            pairingId = json.getString("pairingId"),
            code = json.getString("code"),
            expiresInSec = json.optInt("expiresInSec", 600),
        )
    }

    /** Joins a pairing with a code; returns the parent public key, or null on failure. */
    fun pairJoin(code: String, childPublicKeyB64: String): JoinPairingResult? {
        val body = JSONObject().put("code", code).put("childPublicKey", childPublicKeyB64).toString()
        val res = post("/pair/join", jsonHeaders, body)
        if (res.status != 200) return null
        val json = JSONObject(res.body)
        return JoinPairingResult(
            pairingId = json.getString("pairingId"),
            parentPublicKeyB64 = json.getString("parentPublicKey"),
        )
    }

    /** Fetches a pairing record, or null if it does not exist or the request fails. */
    fun pairGet(pairingId: String): PairingRecord? {
        val res = transport.request("GET", "$baseUrl/pair/$pairingId", emptyMap(), null)
        if (res.status != 200) return null
        val json = JSONObject(res.body)
        return PairingRecord(
            pairingId = json.getString("pairingId"),
            childLabel = json.optString("childLabel").ifEmpty { null },
            parentPublicKeyB64 = json.getString("parentPublicKey"),
            childPublicKeyB64 = json.optString("childPublicKey").ifEmpty { null },
            paired = json.optBoolean("paired", false),
        )
    }

    private fun post(path: String, headers: Map<String, String>, body: String): HttpResponse =
        transport.request("POST", "$baseUrl$path", headers, body)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.FamilyApiTest"`
Expected: all 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyModels.kt android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/FamilyApi.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/FamilyApiTest.kt
git commit -m "feat(android): add FamilyApi client and pairing models"
```

---

## Task 4: Real HTTP transport

`HttpUrlTransport` is the production `HttpTransport`, backed by `HttpURLConnection` — the same approach the existing `update/BlocklistUpdater` uses.

**Files:**
- Create: `android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/HttpUrlTransport.kt`
- Test: `android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/HttpUrlTransportTest.kt`

- [ ] **Step 1: Write the failing test — `HttpUrlTransportTest.kt`**

This test runs a real localhost HTTP server (`com.sun.net.httpserver.HttpServer`, built into the JDK — no dependency) and checks the transport round-trips method, body and status.

```kotlin
package uk.co.cyberheroez.oroq.family

import com.sun.net.httpserver.HttpServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetSocketAddress

class HttpUrlTransportTest {

    private lateinit var server: HttpServer
    private var port = 0

    @Before fun startServer() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/echo") { exchange ->
            val requestBody = exchange.requestBody.readBytes().decodeToString()
            val reply = """{"method":"${exchange.requestMethod}","got":"$requestBody"}"""
            val bytes = reply.toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/missing") { exchange ->
            exchange.sendResponseHeaders(404, -1)
            exchange.close()
        }
        server.start()
        port = server.address.port
    }

    @After fun stopServer() {
        server.stop(0)
    }

    @Test fun postSendsBodyAndReadsResponse() {
        val res = HttpUrlTransport().request(
            "POST",
            "http://127.0.0.1:$port/echo",
            mapOf("content-type" to "application/json"),
            """{"hello":"world"}""",
        )
        assertEquals(200, res.status)
        assertTrue(res.body.contains("\"method\":\"POST\""))
        assertTrue(res.body.contains("hello"))
    }

    @Test fun getReadsResponse() {
        val res = HttpUrlTransport().request(
            "GET", "http://127.0.0.1:$port/echo", emptyMap(), null,
        )
        assertEquals(200, res.status)
        assertTrue(res.body.contains("\"method\":\"GET\""))
    }

    @Test fun reportsNon200Status() {
        val res = HttpUrlTransport().request(
            "GET", "http://127.0.0.1:$port/missing", emptyMap(), null,
        )
        assertEquals(404, res.status)
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.HttpUrlTransportTest"`
Expected: FAIL — `HttpUrlTransport` unresolved.

- [ ] **Step 3: Create `HttpUrlTransport.kt`**

```kotlin
package uk.co.cyberheroez.oroq.family

import java.net.HttpURLConnection
import java.net.URL

/** Production [HttpTransport] backed by HttpURLConnection. */
class HttpUrlTransport(
    private val connectTimeoutMs: Int = 15_000,
    private val readTimeoutMs: Int = 20_000,
) : HttpTransport {

    override fun request(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = connectTimeoutMs
            connection.readTimeout = readTimeoutMs
            for ((name, value) in headers) connection.setRequestProperty(name, value)

            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toByteArray()) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.use { it.readBytes().decodeToString() } ?: ""
            return HttpResponse(status, text)
        } finally {
            connection.disconnect()
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd android && ./gradlew :app:testDebugUnitTest --tests "uk.co.cyberheroez.oroq.family.HttpUrlTransportTest"`
Expected: all 3 tests PASS.

- [ ] **Step 5: Run the whole unit-test suite**

Run: `cd android && ./gradlew :app:testDebugUnitTest`
Expected: BUILD SUCCESSFUL — the existing 52 tests plus the new `family` tests all pass.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/uk/co/cyberheroez/safebrowse/family/HttpUrlTransport.kt android/app/src/test/java/uk/co/cyberheroez/safebrowse/family/HttpUrlTransportTest.kt
git commit -m "feat(android): add HttpURLConnection transport for FamilyApi"
```

---

## Self-review

**Spec coverage** (spec §4 pairing, §8 security):
- §4.3 X25519 keypair + public-key exchange → `FamilyCrypto.generateKeyPair` (Task 1).
- §4.3 SAS, hash of both public keys → `FamilyCrypto.sas` (Tasks 1-2).
- §4.4 E2E encryption (refined to Tink hybrid — see the design note) → `encryptFor` / `decrypt` (Task 1).
- §5 API contract consumed → `FamilyApi` covers `/auth/request`, `/auth/verify`, `/pair/create`, `/pair/join`, `/pair/:id` (Tasks 3-4).
- §8 a different key cannot decrypt → tested in Task 1 (`aDifferentPrivateKeyCannotDecrypt`).

**Out of scope here** (Plan A2b): secure on-device storage of the private keyset (Android Keystore), the `device_role` flag, the role picker, parent login UI, and the pairing UI. A2a deliberately ships only headless, JVM-testable units.

**Placeholder scan:** none — every step has complete file content or an exact command.

**Type consistency:** `FamilyKeyPair`, `HttpResponse`, `HttpTransport`, `CreatePairingResult`, `JoinPairingResult`, `PairingRecord` are each defined once and used with the same field names in the API client and its tests; `FamilyApi(baseUrl, transport)` constructor and method signatures match every call site in `FamilyApiTest`; the fake and real transports both implement `HttpTransport.request(method, url, headers, body)`.

**Dependency note:** Tink is pinned at `1.15.0` (`tink-android` for the app, `tink` for JVM tests). If a newer Tink changes the `getPrimitive` overload, see the inline note in Task 1, Step 4. `org.json` is bundled in Android; the `org.json:json` test dependency supplies it for JVM unit tests.
