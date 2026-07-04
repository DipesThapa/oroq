package uk.co.cyberheroez.oroq.family

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Base64

/**
 * Instrumented tests for [KeyVault] — the Android Keystore envelope encryption
 * that protects secrets at rest. Runs on a device/emulator because it exercises
 * the real hardware-backed keystore (not available in JVM unit tests).
 */
@RunWith(AndroidJUnit4::class)
class KeyVaultTest {

    private val secret = "this-is-a-tink-private-keyset".toByteArray(Charsets.UTF_8)

    @Test
    fun seal_then_open_roundTrips() {
        val sealed = KeyVault.seal(secret)
        val opened = KeyVault.open(sealed)
        assertArrayEquals(secret, opened)
    }

    @Test
    fun sealed_blob_does_not_contain_plaintext() {
        val sealed = KeyVault.seal(secret)
        // The base64 sealed blob must not reveal the plaintext in any form.
        assertFalse(sealed.contains("tink-private-keyset"))
        val rawSealed = Base64.getDecoder().decode(sealed)
        val asLatin1 = String(rawSealed, Charsets.ISO_8859_1)
        assertFalse(asLatin1.contains("tink-private-keyset"))
    }

    @Test
    fun each_seal_uses_a_fresh_iv() {
        // GCM security depends on never reusing an IV under the same key.
        val a = KeyVault.seal(secret)
        val b = KeyVault.seal(secret)
        assertFalse("two seals of the same plaintext must differ", a == b)
        // ...yet both decrypt back to the same secret.
        assertArrayEquals(secret, KeyVault.open(a))
        assertArrayEquals(secret, KeyVault.open(b))
    }

    @Test
    fun open_returns_null_for_a_non_sealed_value() {
        // This is exactly the signal FamilyStore uses to detect a legacy
        // plaintext keyset and trigger re-sealing.
        val legacyPlaintextB64 = Base64.getEncoder().encodeToString(secret)
        assertNull(KeyVault.open(legacyPlaintextB64))
    }

    @Test
    fun open_returns_null_for_garbage_and_empty_input() {
        assertNull(KeyVault.open(""))
        assertNull(KeyVault.open("not base64 @@@"))
        assertNull(KeyVault.open(Base64.getEncoder().encodeToString(byteArrayOf(1, 2, 3))))
    }

    @Test
    fun open_returns_null_when_ciphertext_is_tampered() {
        val sealed = KeyVault.seal(secret)
        val raw = Base64.getDecoder().decode(sealed)
        raw[raw.size - 1] = (raw[raw.size - 1].toInt() xor 0xFF).toByte() // flip last byte of tag
        val tampered = Base64.getEncoder().encodeToString(raw)
        assertNull("GCM auth must reject a tampered blob", KeyVault.open(tampered))
    }

    @Test
    fun sealed_blob_is_larger_than_plaintext_by_iv_and_tag() {
        // Sanity on framing: version(1) + iv(12) + tag(16) overhead.
        val sealed = KeyVault.seal(secret)
        val raw = Base64.getDecoder().decode(sealed)
        assertTrue(raw.size >= secret.size + 1 + 12 + 16)
    }
}
