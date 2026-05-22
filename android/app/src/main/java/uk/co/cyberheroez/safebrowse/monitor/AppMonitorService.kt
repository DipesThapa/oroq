package uk.co.cyberheroez.safebrowse.monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.runBlocking
import uk.co.cyberheroez.safebrowse.R
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.ui.BlockActivity
import java.util.concurrent.atomic.AtomicBoolean

/** Foreground service: polls usage and shows the block screen when needed. */
class AppMonitorService : android.app.Service() {

    private val running = AtomicBoolean(false)
    private var worker: Thread? = null

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
        while (running.get()) {
            try {
                if (usage.hasUsageAccess()) {
                    val foreground = usage.currentForegroundApp()
                    // Never block our own screens (incl. BlockActivity itself).
                    if (foreground != packageName) {
                        val decision = runBlocking {
                            decideBlock(
                                foregroundApp = foreground,
                                todayMinutes = usage.todayForegroundMinutes(),
                                blockedApps = config.getBlockedApps(),
                                limitMinutes = config.getDailyLimitMinutes(),
                                extraMinutes = config.getExtraMinutes(),
                            )
                        }
                        when (decision) {
                            BlockDecision.BLOCK_APP -> showBlock(BlockActivity.REASON_APP)
                            BlockDecision.TIME_UP -> showBlock(BlockActivity.REASON_TIME)
                            BlockDecision.ALLOW -> {}
                        }
                    }
                }
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

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "App & screen-time limits", NotificationManager.IMPORTANCE_LOW)
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("SafeBrowse limits are active")
            .setContentText("App blocking and screen-time limits are running")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "AppMonitor"
        private const val NOTIFICATION_ID = 2
        private const val CHANNEL_ID = "safebrowse_monitor"
    }
}
