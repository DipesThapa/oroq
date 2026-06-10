package uk.co.cyberheroez.oroq.family

import android.content.Context
import android.content.Intent
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.vpn.OroQVpnService
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
            FamilyCommand.GRANT_EXTRA_TIME -> {
                val today = runCatching { UsageReader(context).todayForegroundMinutes() }.getOrDefault(0)
                config.grantExtraMinutes(command.intValue, today)
            }
            FamilyCommand.SET_DAILY_LIMIT -> config.setDailyLimitMinutes(command.intValue)
            FamilyCommand.SET_CATEGORIES -> {
                val ids = command.stringValue
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
                config.setEnabledCategories(ids)
                restartVpnIfActive(context)
            }
            FamilyCommand.SET_BLOCKED_APPS -> {
                val pkgs = command.stringValue
                    .split(",")
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                    .toSet()
                config.setBlockedApps(pkgs)
            }
            FamilyCommand.SET_PROTECTION -> {
                if (command.intValue == 1) {
                    // Can only start if VPN consent already exists; otherwise the
                    // next summary's protectionOn=false tells the parent.
                    if (android.net.VpnService.prepare(context) == null) {
                        context.startService(Intent(context, OroQVpnService::class.java))
                    }
                } else {
                    context.startService(
                        Intent(context, OroQVpnService::class.java).setAction(OroQVpnService.ACTION_STOP),
                    )
                }
            }
            FamilyCommand.SET_SAFE_SEARCH -> {
                config.setSafeSearchOn(command.intValue == 1)
                restartVpnIfActive(context)
            }
            FamilyCommand.SET_YT_RESTRICTED -> {
                config.setYtRestrictedOn(command.intValue == 1)
                restartVpnIfActive(context)
            }
        }
        applied.markApplied(id)
        appliedCount++
    }

    // Ack every id we saw — applied now or already applied earlier — so the
    // server drops them.
    familyApi().cmdAck(link.pairingId, queue.map { it.first })
    return appliedCount
}

/**
 * Bounces the VPN service so it re-reads its blocklists. If the service isn't
 * active, this is a no-op — the next time the child starts protection it will
 * load the new categories naturally. Any failure here is swallowed; the next
 * sync's `protectionOn` field tells the parent if something went wrong.
 */
private fun restartVpnIfActive(context: Context) {
    if (!OroQVpnService.isActive) return
    runCatching {
        context.startService(
            Intent(context, OroQVpnService::class.java)
                .setAction(OroQVpnService.ACTION_STOP)
        )
        context.startService(Intent(context, OroQVpnService::class.java))
    }
}
