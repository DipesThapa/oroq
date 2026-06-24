package uk.co.cyberheroez.oroq.family

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.GeneralSecurityException

class FamilyCryptoTest {

    private val AAD = "pairing-1".toByteArray()

    @Test fun encryptThenDecryptRoundTrips() {
        val keys = FamilyCrypto.generateKeyPair()
        val message = "hello family".toByteArray()
        val ciphertext = FamilyCrypto.encryptFor(keys.publicKeysetB64, message, AAD)
        val plaintext = FamilyCrypto.decrypt(keys.privateKeysetB64, ciphertext, AAD)
        assertArrayEquals(message, plaintext)
    }

    @Test fun ciphertextCarriesTheVersionTag() {
        val keys = FamilyCrypto.generateKeyPair()
        val ciphertext = FamilyCrypto.encryptFor(keys.publicKeysetB64, "x".toByteArray(), AAD)
        assertEquals(1.toByte(), ciphertext[0])
    }

    @Test fun aMismatchedVersionByteIsRejected() {
        val keys = FamilyCrypto.generateKeyPair()
        val ciphertext = FamilyCrypto.encryptFor(keys.publicKeysetB64, "x".toByteArray(), AAD)
        ciphertext[0] = 9 // unknown version
        assertThrows(IllegalArgumentException::class.java) {
            FamilyCrypto.decrypt(keys.privateKeysetB64, ciphertext, AAD)
        }
    }

    @Test fun aDifferentAssociatedDataCannotDecrypt() {
        val keys = FamilyCrypto.generateKeyPair()
        val ciphertext = FamilyCrypto.encryptFor(keys.publicKeysetB64, "secret".toByteArray(), AAD)
        // Same key, but a ciphertext bound to pairing-1 won't open under pairing-2.
        assertThrows(GeneralSecurityException::class.java) {
            FamilyCrypto.decrypt(keys.privateKeysetB64, ciphertext, "pairing-2".toByteArray())
        }
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
        val ciphertext = FamilyCrypto.encryptFor(alice.publicKeysetB64, "secret".toByteArray(), AAD)
        assertThrows(GeneralSecurityException::class.java) {
            FamilyCrypto.decrypt(mallory.privateKeysetB64, ciphertext, AAD)
        }
    }

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
}
