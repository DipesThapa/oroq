package uk.co.cyberheroez.oroq.update

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** Runs [BlocklistUpdater] on WorkManager's background thread. */
class BlocklistUpdateWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {

    override fun doWork(): Result = try {
        BlocklistUpdater(applicationContext).runUpdate()
        Result.success()
    } catch (e: Exception) {
        Result.retry()
    }
}

/** Schedules a weekly blocklist update (only when a network is available). */
fun scheduleBlocklistUpdates(context: Context) {
    val request = PeriodicWorkRequestBuilder<BlocklistUpdateWorker>(7, TimeUnit.DAYS)
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
        )
        .build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
        "blocklist-update",
        ExistingPeriodicWorkPolicy.KEEP,
        request,
    )
}
