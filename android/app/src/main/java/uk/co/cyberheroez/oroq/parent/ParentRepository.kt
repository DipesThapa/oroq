package uk.co.cyberheroez.oroq.parent

import android.content.Context
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.appSchedulePayload
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.parseSummary
import java.util.Base64

/** A decrypted summary plus the server's receive time (used for staleness). */
data class FetchedChildSummary(val summary: FamilySummary, val serverReceivedAt: Long?)

/** Fetches and decrypts a child's latest activity summary for the parent UI. */
class ParentRepository(context: Context) {

    private val store = FamilyStore(context.applicationContext)
    private val api = familyApi()

    /**
     * Returns the child's latest summary plus the server's receive time, or null
     * if not signed in, nothing has been uploaded yet, or the blob could not be
     * decrypted. Staleness is judged off [FetchedChildSummary.serverReceivedAt]
     * (server-stamped) rather than the child-supplied ts inside the blob.
     */
    fun fetchSummary(pairingId: String): FetchedChildSummary? {
        val token = store.tokenBlocking() ?: return null
        val fetched = api.syncFetch(token, pairingId) ?: return null
        val summary = runCatching {
            val keys = store.keyPairBlocking()
            val plaintext = FamilyCrypto.decrypt(
                keys.privateKeysetB64, Base64.getDecoder().decode(fetched.ciphertextB64),
            )
            parseSummary(plaintext.decodeToString())
        }.getOrNull() ?: return null
        return FetchedChildSummary(summary, fetched.receivedAt)
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

    /**
     * Unpairs a child: deletes the pairing on the server, then removes it from
     * this device. Local removal happens even if the server call fails, so a
     * dead pairing can always be cleared from the parent's view.
     */
    fun unpairChild(pairingId: String): Boolean {
        val token = store.tokenBlocking()
        val serverOk = token != null && api.pairDelete(token, pairingId)
        kotlinx.coroutines.runBlocking { store.removeChild(pairingId) }
        return serverOk
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

    /** Convenience wrapper: tells the child exactly which apps are approved. */
    fun sendSetApprovedApps(pairingId: String, packageNames: Set<String>): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_APPROVED_APPS,
                stringValue = packageNames.joinToString(","),
            ),
        )

    /** Convenience wrapper: sets (or clears, when [windows] is empty) one app's schedule. */
    fun sendSetAppSchedule(
        pairingId: String,
        pkg: String,
        windows: List<uk.co.cyberheroez.oroq.monitor.Window>,
    ): Boolean =
        sendCommand(
            pairingId,
            FamilyCommand(
                type = FamilyCommand.SET_APP_SCHEDULE,
                stringValue = appSchedulePayload(pkg, windows),
            ),
        )
}
