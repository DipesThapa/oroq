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
