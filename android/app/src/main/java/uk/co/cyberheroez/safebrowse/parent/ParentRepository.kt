package uk.co.cyberheroez.safebrowse.parent

import android.content.Context
import uk.co.cyberheroez.safebrowse.family.FamilyCommand
import uk.co.cyberheroez.safebrowse.family.FamilyCrypto
import uk.co.cyberheroez.safebrowse.family.FamilyStore
import uk.co.cyberheroez.safebrowse.family.FamilySummary
import uk.co.cyberheroez.safebrowse.family.familyApi
import uk.co.cyberheroez.safebrowse.family.parseSummary
import java.util.Base64

/** Fetches and decrypts a child's latest activity summary for the parent UI. */
class ParentRepository(context: Context) {

    private val store = FamilyStore(context.applicationContext)
    private val api = familyApi()

    /**
     * Returns the child's latest summary, or null if not signed in, nothing has
     * been uploaded yet, or the blob could not be decrypted.
     */
    fun fetchSummary(pairingId: String): FamilySummary? {
        val token = store.tokenBlocking() ?: return null
        val ciphertextB64 = api.syncFetch(token, pairingId) ?: return null
        return runCatching {
            val keys = store.keyPairBlocking()
            val plaintext = FamilyCrypto.decrypt(
                keys.privateKeysetB64, Base64.getDecoder().decode(ciphertextB64),
            )
            parseSummary(plaintext.decodeToString())
        }.getOrNull()
    }

    /**
     * Encrypts [command] with the child's public key and enqueues it on the
     * Worker. Returns true on success.
     */
    fun sendCommand(pairingId: String, command: FamilyCommand): Boolean {
        val token = store.tokenBlocking() ?: return false
        val child = store.childrenBlocking().firstOrNull { it.pairingId == pairingId } ?: return false
        val ciphertext = FamilyCrypto.encryptFor(
            child.childPublicKeyB64, command.toJson().toByteArray(),
        )
        return api.cmdSend(token, pairingId, Base64.getEncoder().encodeToString(ciphertext))
    }

    /** Convenience wrapper: tells the child to block exactly [categories]. */
    fun sendSetCategories(pairingId: String, categories: Set<String>): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_CATEGORIES,
                stringValue = categories.joinToString(","),
            ),
        )

    /** Convenience wrapper: tells the child to block exactly [packageNames]. */
    fun sendSetBlockedApps(pairingId: String, packageNames: Set<String>): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_BLOCKED_APPS,
                stringValue = packageNames.joinToString(","),
            ),
        )
}
