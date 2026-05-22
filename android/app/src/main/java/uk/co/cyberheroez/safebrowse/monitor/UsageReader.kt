package uk.co.cyberheroez.safebrowse.monitor

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import java.util.Calendar

/** Reads device-usage data from Android's UsageStatsManager. */
class UsageReader(private val context: Context) {

    private val usm =
        context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

    /** True if the user has granted Usage Access to this app. */
    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName,
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    /** True if the app may draw over other apps — needed to show the block screen. */
    fun canShowBlockScreen(): Boolean = Settings.canDrawOverlays(context)

    /** True when both monitoring permissions are granted. */
    fun monitoringReady(): Boolean = hasUsageAccess() && canShowBlockScreen()

    /** The package most recently moved to the foreground, or null. */
    fun currentForegroundApp(): String? {
        val end = System.currentTimeMillis()
        val events = usm.queryEvents(end - 10_000, end)
        val event = UsageEvents.Event()
        var last: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                last = event.packageName
            }
        }
        return last
    }

    /** Total foreground time across all apps since midnight, in minutes. */
    fun todayForegroundMinutes(): Int = todayUsageByApp().values.sum()

    /** Per-package foreground minutes since midnight. */
    fun todayUsageByApp(): Map<String, Int> {
        val start = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
        }.timeInMillis
        val now = System.currentTimeMillis()
        val totals = HashMap<String, Long>()
        for (stat in usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, now)) {
            if (stat.totalTimeInForeground <= 0) continue
            totals[stat.packageName] = (totals[stat.packageName] ?: 0L) + stat.totalTimeInForeground
        }
        return totals.mapValues { (it.value / 60_000L).toInt() }
    }

    companion object {
        /** Intent for the system Usage Access settings screen. */
        fun usageAccessIntent(): Intent =
            Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)

        /** Intent for the "display over other apps" settings screen for this app. */
        fun overlayIntent(context: Context): Intent =
            Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:${context.packageName}"),
            )
    }
}
