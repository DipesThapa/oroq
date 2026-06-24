package uk.co.cyberheroez.oroq.monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.runBlocking
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.family.BlockEventLog
import uk.co.cyberheroez.oroq.family.listUserApps
import uk.co.cyberheroez.oroq.family.pollAndApplyCommands
import uk.co.cyberheroez.oroq.family.scheduleNotifySync
import uk.co.cyberheroez.oroq.ui.BlockActivity
import java.util.concurrent.atomic.AtomicBoolean

/** Foreground service: polls usage and shows the block screen when needed. */
class AppMonitorService : android.app.Service() {

    private val running = AtomicBoolean(false)
    private var worker: Thread? = null
    private val blockLog by lazy { BlockEventLog.forContext(this) }
    private var lastBlockedApp: String? = null
    // True once we've detected Usage Access is gone — used to alert the parent
    // exactly once per transition rather than every tick.
    private var degraded = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (running.compareAndSet(false, true)) {
            startForeground(NOTIFICATION_ID, buildNotification())
            worker = Thread { runLoop() }.also { it.start() }
        }
        return START_STICKY
    }

    private fun runLoop() {
        val usage = UsageReader(this)
        val config = ConfigRepository(applicationContext)
        val systemCritical = systemCriticalApps(applicationContext)
        // First run: approve the apps already on the phone so default-deny only
        // blocks apps installed later. Idempotent — no-op once seeded.
        runBlocking {
            config.seedApprovedAppsIfNeeded(
                listUserApps(applicationContext).map { it.packageName }.toSet(),
            )
        }
        var tickCount = 0L
        while (running.get()) {
            try {
                if (usage.hasUsageAccess()) {
                    if (degraded) setDegraded(false) // access restored
                    val foreground = usage.currentForegroundApp()
                    // Never block our own screens (incl. BlockActivity itself).
                    if (foreground != packageName) {
                        val now = java.time.LocalTime.now()
                        val decision = runBlocking {
                            decideBlock(
                                foregroundApp = foreground,
                                todayMinutes = usage.todayForegroundMinutes(),
                                blockedApps = config.getBlockedApps(),
                                limitMinutes = config.getDailyLimitMinutes(),
                                extraMinutes = config.getExtraMinutes(),
                                approvedApps = config.getApprovedApps(),
                                schedules = config.getSchedules(),
                                systemCriticalApps = systemCritical,
                                nowMinuteOfDay = now.hour * 60 + now.minute,
                                dayOfWeek = java.time.LocalDate.now().dayOfWeek,
                            )
                        }
                        when (decision) {
                            BlockDecision.BLOCK_APP, BlockDecision.BLOCK_UNAPPROVED -> {
                                foreground?.let { pkg ->
                                    if (pkg != lastBlockedApp) {
                                        lastBlockedApp = pkg
                                        blockLog.record("app", appLabel(pkg))
                                    }
                                }
                                val reason = if (decision == BlockDecision.BLOCK_UNAPPROVED) {
                                    BlockActivity.REASON_UNAPPROVED
                                } else {
                                    BlockActivity.REASON_APP
                                }
                                showBlock(reason)
                            }
                            BlockDecision.BLOCK_SCHEDULE -> showBlock(BlockActivity.REASON_SCHEDULE)
                            BlockDecision.TIME_UP -> showBlock(BlockActivity.REASON_TIME)
                            BlockDecision.ALLOW -> {}
                        }
                    }
                } else if (!degraded) {
                    // Usage Access was revoked — enforcement is now off. Fail loudly:
                    // flip the notification and push the parent within seconds rather
                    // than leaving them to discover it at the next 15-min sync.
                    setDegraded(true)
                }
                // Every 60 ticks (~60 s) also drain the remote-command queue, so
                // parent actions reach the child far sooner than the 15-min
                // WorkManager periodic. Runs on a side thread so the 1-s
                // foreground tick is never blocked by a network call.
                tickCount++
                if (tickCount % 60 == 0L) drainCommandsAsync()
            } catch (e: Exception) {
                Log.w(TAG, "monitor tick failed", e)
            }
            try {
                Thread.sleep(1000)
            } catch (e: InterruptedException) {
                break
            }
        }
    }

    /** Fire-and-forget remote-command poll. */
    private fun drainCommandsAsync() {
        Thread {
            runCatching { runBlocking { pollAndApplyCommands(applicationContext) } }
                .onFailure { Log.w(TAG, "command poll failed", it) }
        }.start()
    }

    private fun appLabel(pkg: String): String = runCatching {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    }.getOrDefault(pkg)

    private fun showBlock(reason: String) {
        try {
            startActivity(
                Intent(this, BlockActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    .putExtra(BlockActivity.EXTRA_REASON, reason)
            )
        } catch (e: Exception) {
            Log.w(TAG, "could not show block screen", e)
        }
    }

    override fun onDestroy() {
        running.set(false)
        worker?.interrupt()
        super.onDestroy()
    }

    /** Records the degraded transition: repost the notification + alert the parent. */
    private fun setDegraded(value: Boolean) {
        degraded = value
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(NOTIFICATION_ID, buildNotification(active = !value))
        if (value) {
            // Expedited summary upload (notify=true). The summary's permissionsOk
            // will be false, so the parent sees exactly why protection dropped.
            runCatching { scheduleNotifySync(applicationContext) }
        }
    }

    private fun buildNotification(active: Boolean = true): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "App & screen-time limits", NotificationManager.IMPORTANCE_LOW)
        )
        val (title, text) = if (active) {
            "OroQ limits are active" to "App blocking and screen-time limits are running"
        } else {
            "OroQ protection needs attention" to "Usage access is off — open OroQ to restore protection"
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "AppMonitor"
        private const val NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "oroq_monitor"
    }
}
