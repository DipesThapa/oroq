package uk.co.cyberheroez.safebrowse.family

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
