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
