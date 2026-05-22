package uk.co.cyberheroez.safebrowse.family

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.monitor.UsageReader
import uk.co.cyberheroez.safebrowse.vpn.SafeBrowseVpnService
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

        val summary = buildSummary(
            now = System.currentTimeMillis(),
            protectionOn = SafeBrowseVpnService.isActive,
            dailyLimitMinutes = config.getDailyLimitMinutes(),
            usageByApp = if (usage.hasUsageAccess()) usage.todayUsageByApp() else emptyMap(),
            recentEvents = blockLog.recent(20),
            webBlockedToday = blockLog.countSince("web", startOfToday),
            appBlockedToday = blockLog.countSince("app", startOfToday),
        )

        val ciphertext = FamilyCrypto.encryptFor(
            link.parentPublicKeyB64, summary.toJson().toByteArray(),
        )
        val uploaded = familyApi().syncUpload(
            link.pairingId, Base64.getEncoder().encodeToString(ciphertext),
        )
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
