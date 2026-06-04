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
