package uk.co.cyberheroez.oroq.family

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Hardware-backed envelope encryption for secrets held at rest in DataStore.
 *
 * The device's private Tink keyset is the crown jewel: whoever holds it can
 * decrypt every summary a child ever sent this parent. Persisting it as a
 * plaintext base64 string in DataStore means a rooted device — or an `adb
 * backup` of a debuggable build — can read it straight off disk.
 *
 * [KeyVault] wraps such secrets with an AES-256-GCM key that lives inside the
 * AndroidKeyStore (StrongBox where the hardware supports it, TEE otherwise).
 * The wrapping key is non-exportable by construction, so the raw keyset never
 * touches disk in the clear and the key that protects it can never leave the
 * secure element.
 *
 * The wrapping key is NOT bound to user authentication or an unlocked screen:
 * background workers (the boot-time DNS filter, the sync worker) must reach the
 * secret without an unlock prompt. The hardware keystore itself is the trust
 * boundary, which is the correct posture for an always-on protection service.
 */
object KeyVault {

    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "oroq_family_secret_wrap_v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val IV_LENGTH = 12
    private const val TAG_BITS = 128

    /** Format tag prefixed to every sealed blob, so a future key rotation or
     *  primitive change has a clean handshake instead of an ambiguous blob. */
    private const val VERSION: Byte = 1

    /**
     * Wraps [plaintext], returning base64( VERSION | iv | ciphertext+tag ).
     * A fresh random IV is generated per call by the cipher.
     */
    fun seal(plaintext: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val iv = cipher.iv
        require(iv.size == IV_LENGTH) { "unexpected GCM IV length: ${iv.size}" }
        val ct = cipher.doFinal(plaintext)
        val out = ByteArray(1 + iv.size + ct.size)
        out[0] = VERSION
        System.arraycopy(iv, 0, out, 1, iv.size)
        System.arraycopy(ct, 0, out, 1 + iv.size, ct.size)
        return Base64.getEncoder().encodeToString(out)
    }

    /**
     * Reverses [seal]. Returns null when [blob] is not a value this vault
     * produced — e.g. a legacy plaintext keyset written before hardening, or a
     * blob whose GCM tag fails to authenticate. Callers use the null result to
     * drive a one-time migration rather than crashing.
     */
    fun open(blob: String): ByteArray? = runCatching {
        val raw = Base64.getDecoder().decode(blob)
        require(raw.size > 1 + IV_LENGTH && raw[0] == VERSION) { "not a sealed blob" }
        val iv = raw.copyOfRange(1, 1 + IV_LENGTH)
        val ct = raw.copyOfRange(1 + IV_LENGTH, raw.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_BITS, iv))
        cipher.doFinal(ct)
    }.getOrNull()

    private fun getOrCreateKey(): SecretKey {
        val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        // Prefer a StrongBox-backed key; fall back to the standard TEE-backed
        // keystore on devices without a dedicated secure element (or pre-API-28).
        return runCatching { generateKey(strongBox = true) }
            .getOrElse { generateKey(strongBox = false) }
    }

    private fun generateKey(strongBox: Boolean): SecretKey {
        val builder = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true)
        }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(builder.build())
        return generator.generateKey()
    }
}
