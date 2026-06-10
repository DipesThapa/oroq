package uk.co.cyberheroez.oroq.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.parent.ParentActivity

/** Receives FCM pushes on the parent device and posts the alert notification. */
class OroqMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        // Re-register on rotation; safe no-op if not signed in / not a parent.
        PushRegistration.register(applicationContext)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: "OroQ"
        val body = message.notification?.body ?: "New alert — tap to view."
        val manager = ContextCompat.getSystemService(this, NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Alerts", NotificationManager.IMPORTANCE_HIGH),
        )
        val tap = PendingIntent.getActivity(
            this,
            0,
            Intent(this, ParentActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        manager.notify(
            1,
            NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .build(),
        )
    }

    companion object {
        private const val CHANNEL = "oroq_alerts"
    }
}
