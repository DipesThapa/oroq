package uk.co.cyberheroez.oroq.boot

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.update.scheduleBlocklistUpdates
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

/**
 * Restarts protection after a reboot. START_STICKY does not survive a power
 * cycle, so without this the child's VPN filter, app blocking, schedules,
 * limits, and default-deny stay off until the child manually reopens the app.
 *
 * BOOT_COMPLETED is one of the few broadcasts that exempt an app from the
 * background foreground-service-start restriction, so we may (re)start the
 * enforcement services here. The VPN only starts if consent already exists;
 * otherwise the next summary reports protectionOn=false and the parent is told.
 *
 * Only the CHILD role enforces anything — a parent device does nothing on boot.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in BOOT_ACTIONS) return
        val app = context.applicationContext
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (FamilyStore(app).getRole() != DeviceRole.CHILD) return@launch
                scheduleFamilySync(app)
                scheduleBlocklistUpdates(app)
                if (VpnService.prepare(app) == null) {
                    ContextCompat.startForegroundService(app, Intent(app, OroQVpnService::class.java))
                }
                ContextCompat.startForegroundService(app, Intent(app, AppMonitorService::class.java))
            } finally {
                pending.finish()
            }
        }
    }

    private companion object {
        val BOOT_ACTIONS = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON", // OEM (HTC/Xiaomi) fast-boot variant
        )
    }
}
