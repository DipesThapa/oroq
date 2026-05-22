package uk.co.cyberheroez.safebrowse.family

import android.content.Context
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import java.util.Base64

/**
 * Fetches pending remote commands, decrypts and applies each one to
 * [ConfigRepository], then acknowledges them. Returns the number of commands
 * newly applied. Safe against re-delivery via [AppliedCommandLog].
 */
suspend fun pollAndApplyCommands(context: Context): Int {
    val store = FamilyStore(context)
    val link = store.getParentLink() ?: return 0
    val queue = familyApi().cmdFetch(link.pairingId) ?: return 0
    if (queue.isEmpty()) return 0

    val keys = store.getOrCreateKeyPair()
    val applied = AppliedCommandLog.forContext(context)
    val config = ConfigRepository(context)
    var appliedCount = 0

    for ((id, ciphertextB64) in queue) {
        if (applied.contains(id)) continue
        val command = runCatching {
            val plain = FamilyCrypto.decrypt(
                keys.privateKeysetB64, Base64.getDecoder().decode(ciphertextB64),
            )
            parseCommand(plain.decodeToString())
        }.getOrNull() ?: continue

        when (command.type) {
            FamilyCommand.GRANT_EXTRA_TIME -> config.grantExtraMinutes(command.intValue)
            FamilyCommand.SET_DAILY_LIMIT -> config.setDailyLimitMinutes(command.intValue)
        }
        applied.markApplied(id)
        appliedCount++
    }

    // Ack every id we saw — applied now or already applied earlier — so the
    // server drops them.
    familyApi().cmdAck(link.pairingId, queue.map { it.first })
    return appliedCount
}
