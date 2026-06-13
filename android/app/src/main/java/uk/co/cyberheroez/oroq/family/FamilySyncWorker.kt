package uk.co.cyberheroez.oroq.family

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.vpn.OroQVpnService
import java.util.Base64
import java.util.Calendar
import java.util.concurrent.TimeUnit

/**
 * Periodically builds this child's activity summary, encrypts it with the
 * paired parent's public key, and uploads it. Does nothing if not paired.
 */
class FamilySyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val store = FamilyStore(applicationContext)
        val link = store.getParentLink() ?: return Result.success() // not paired — nothing to do

        val config = ConfigRepository(applicationContext)
        val usage = UsageReader(applicationContext)
        val blockLog = BlockEventLog.forContext(applicationContext)
        val startOfToday = startOfTodayMillis()

        val permissionsOk = usage.hasUsageAccess() &&
            android.provider.Settings.canDrawOverlays(applicationContext) &&
            android.net.VpnService.prepare(applicationContext) == null

        val summary = buildSummary(
            now = System.currentTimeMillis(),
            protectionOn = OroQVpnService.isActive,
            dailyLimitMinutes = config.getDailyLimitMinutes(),
            usageByApp = if (usage.hasUsageAccess()) usage.todayUsageByApp() else emptyMap(),
            recentEvents = blockLog.recent(20),
            webBlockedToday = blockLog.countSince("web", startOfToday),
            appBlockedToday = blockLog.countSince("app", startOfToday),
            categories = config.getEnabledCategories(),
            installedApps = listUserApps(applicationContext),
            blockedApps = config.getBlockedApps(),
            safeSearchOn = config.isSafeSearchOn(),
            ytRestrictedOn = config.isYtRestrictedOn(),
            permissionsOk = permissionsOk,
            approvedApps = config.getApprovedApps(),
            schedules = config.getSchedules(),
        )

        val ciphertext = FamilyCrypto.encryptFor(
            link.parentPublicKeyB64, summary.toJson().toByteArray(),
        )
        val notify = inputData.getBoolean("notify", false)
        val uploaded = familyApi().syncUpload(
            link.pairingId, Base64.getEncoder().encodeToString(ciphertext), notify,
        )
        runCatching { pollAndApplyCommands(applicationContext) }
        return if (uploaded) Result.success() else Result.retry()
    }

    private fun startOfTodayMillis(): Long = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}

/**
 * Schedules the ~15-minute periodic summary upload, plus one immediate upload
 * so a freshly paired parent sees data without waiting for the first cycle.
 * Safe to call repeatedly.
 */
fun scheduleFamilySync(context: Context) {
    val manager = WorkManager.getInstance(context)
    manager.enqueueUniquePeriodicWork(
        "family-sync",
        ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<FamilySyncWorker>(15, TimeUnit.MINUTES).build(),
    )
    manager.enqueueUniqueWork(
        "family-sync-now",
        ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<FamilySyncWorker>().build(),
    )
}

/**
 * Fires an immediate, expedited upload with the notify flag set — used when the
 * child blocks a threat so the parent is pushed within seconds. Degrades to a
 * normal one-time job if expedited quota is exhausted.
 */
fun scheduleNotifySync(context: Context) {
    WorkManager.getInstance(context).enqueueUniqueWork(
        "family-sync-notify",
        ExistingWorkPolicy.REPLACE,
        OneTimeWorkRequestBuilder<FamilySyncWorker>()
            .setInputData(Data.Builder().putBoolean("notify", true).build())
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build(),
    )
}
