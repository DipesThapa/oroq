package uk.co.cyberheroez.oroq.family

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Instrumented tests proving that [FamilyStore] never persists the device's
 * private Tink keyset in the clear, and that a pre-hardening (legacy) keyset is
 * migrated to a sealed form transparently on first read.
 */
@RunWith(AndroidJUnit4::class)
class FamilyStorePrivateKeyTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    /** The on-disk DataStore file backing FamilyStore's "family_config" store. */
    private val dataStoreFile: File
        get() = File(context.filesDir, "datastore/family_config.preferences_pb")

    @Before
    fun clearPersistedState() = runBlocking {
        // Clear through the DataStore itself so both the in-memory cache and the
        // on-disk file are reset — deleting the file under the process-wide
        // singleton would leave stale cached state and flake.
        FamilyStore(context).clearAllForTest()
    }

    @Test
    fun keyPair_is_stable_across_calls() = runBlocking {
        val store = FamilyStore(context)
        val first = store.getOrCreateKeyPair()
        val second = store.getOrCreateKeyPair()
        assertEquals(first.privateKeysetB64, second.privateKeysetB64)
        assertEquals(first.publicKeysetB64, second.publicKeysetB64)
    }

    @Test
    fun private_keyset_is_never_written_in_clear() = runBlocking {
        val store = FamilyStore(context)
        val kp = store.getOrCreateKeyPair()

        // The raw stored value is a KeyVault-sealed blob, not the plaintext.
        val rawStored = store.rawStoredPrivateKeyForTest()
        assertNotNull(rawStored)
        assertFalse("stored value must not equal the plaintext keyset", rawStored == kp.privateKeysetB64)
        assertNull("stored public field is not what we sealed", KeyVault.open(kp.publicKeysetB64))
        assertArrayEquals(
            "sealed blob must open back to the private keyset",
            kp.privateKeysetB64.toByteArray(Charsets.UTF_8),
            KeyVault.open(rawStored!!),
        )

        // And the plaintext must not appear anywhere in the on-disk proto file.
        val bytes = dataStoreFile.readBytes()
        val onDisk = String(bytes, Charsets.ISO_8859_1)
        assertFalse("plaintext private keyset leaked to disk", onDisk.contains(kp.privateKeysetB64))
    }

    @Test
    fun legacy_plaintext_keyset_is_migrated_and_returned_unchanged() = runBlocking {
        // Simulate a device that stored its keyset before hardening shipped.
        val legacy = FamilyCrypto.generateKeyPair()
        val store = FamilyStore(context)
        store.seedLegacyPrivateKeyForTest(legacy.privateKeysetB64, legacy.publicKeysetB64)

        // First read returns the same keys (no data loss) ...
        val read = store.getOrCreateKeyPair()
        assertEquals(legacy.privateKeysetB64, read.privateKeysetB64)
        assertEquals(legacy.publicKeysetB64, read.publicKeysetB64)

        // ... and has re-sealed the private keyset in place.
        val rawAfter = store.rawStoredPrivateKeyForTest()
        assertNotNull(rawAfter)
        assertFalse("must no longer be stored unsealed", rawAfter == legacy.privateKeysetB64)
        assertArrayEquals(
            legacy.privateKeysetB64.toByteArray(Charsets.UTF_8),
            KeyVault.open(rawAfter!!),
        )

        // A subsequent read still round-trips through the sealed form.
        assertEquals(legacy.privateKeysetB64, store.getOrCreateKeyPair().privateKeysetB64)
    }

    @Test
    fun sealed_keyset_still_decrypts_a_real_ciphertext() = runBlocking {
        // End-to-end: a keyset retrieved through the seal/open path must still
        // work as a Tink private key for actual E2E decryption.
        val store = FamilyStore(context)
        val kp = store.getOrCreateKeyPair()
        val aad = "pairing-123".toByteArray(Charsets.UTF_8)
        val plaintext = "child summary blob".toByteArray(Charsets.UTF_8)

        val ct = FamilyCrypto.encryptFor(kp.publicKeysetB64, plaintext, aad)
        val recovered = FamilyCrypto.decrypt(kp.privateKeysetB64, ct, aad)
        assertArrayEquals(plaintext, recovered)
    }
}
