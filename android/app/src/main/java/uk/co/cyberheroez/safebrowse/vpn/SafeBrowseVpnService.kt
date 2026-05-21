package uk.co.cyberheroez.safebrowse.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import uk.co.cyberheroez.safebrowse.MainActivity
import uk.co.cyberheroez.safebrowse.R
import uk.co.cyberheroez.safebrowse.filter.DnsFilter
import uk.co.cyberheroez.safebrowse.filter.loadBlocklistRepository
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A local-only VpnService that intercepts DNS traffic. It advertises itself as
 * the system DNS server and routes only that server's address into the TUN, so
 * the worker loop sees DNS packets exclusively.
 */
class SafeBrowseVpnService : VpnService() {

    private val running = AtomicBoolean(false)
    private var tun: ParcelFileDescriptor? = null
    private var worker: Thread? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopVpn()
            return START_NOT_STICKY
        }
        startVpn()
        return START_STICKY
    }

    private fun startVpn() {
        if (running.get()) return
        startForeground(NOTIFICATION_ID, buildNotification())
        val descriptor = Builder()
            .setSession("SafeBrowse")
            .addAddress(VPN_ADDRESS, 32)
            .addDnsServer(DNS_SERVER)
            .addRoute(DNS_SERVER, 32)
            .establish()
        if (descriptor == null) {
            stopVpn()
            return
        }
        tun = descriptor
        running.set(true)
        worker = Thread { runLoop(descriptor) }.also { it.start() }
    }

    private fun runLoop(descriptor: ParcelFileDescriptor) {
        val repository = loadBlocklistRepository(assets)
        // Plan 2: every category is enabled. Plan 3 replaces this with the
        // parent's saved configuration. "doh" is always among the categories.
        val filter = DnsFilter(repository) { repository.availableCategories }
        val input = FileInputStream(descriptor.fileDescriptor)
        val output = FileOutputStream(descriptor.fileDescriptor)
        val buffer = ByteArray(MAX_PACKET)
        while (running.get()) {
            val length = try {
                input.read(buffer)
            } catch (e: Exception) {
                break
            }
            if (length <= 0) continue
            val udp = parseUdp(buffer.copyOf(length)) ?: continue
            if (udp.destinationPort != DNS_PORT) continue
            val responsePayload = when (val decision = filter.decide(udp.payload)) {
                is DnsFilter.Decision.Block -> decision.response
                DnsFilter.Decision.Allow -> resolveUpstream(udp.payload) ?: continue
            }
            val reply = buildUdpPacket(
                sourceAddress = udp.destinationAddress,
                destinationAddress = udp.sourceAddress,
                sourcePort = udp.destinationPort,
                destinationPort = udp.sourcePort,
                payload = responsePayload,
            )
            try {
                output.write(reply)
            } catch (e: Exception) {
                break
            }
        }
    }

    /** Forwards [query] to the upstream resolver over a protected socket. */
    private fun resolveUpstream(query: ByteArray): ByteArray? = try {
        DatagramSocket().use { socket ->
            protect(socket)
            socket.soTimeout = UPSTREAM_TIMEOUT_MS
            val server = InetAddress.getByName(UPSTREAM_DNS)
            socket.send(DatagramPacket(query, query.size, server, DNS_PORT))
            val buf = ByteArray(MAX_PACKET)
            val response = DatagramPacket(buf, buf.size)
            socket.receive(response)
            buf.copyOf(response.length)
        }
    } catch (e: Exception) {
        null
    }

    private fun stopVpn() {
        running.set(false)
        worker?.interrupt()
        worker = null
        try {
            tun?.close()
        } catch (e: Exception) {
            // already closed
        }
        tun = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "SafeBrowse protection",
                NotificationManager.IMPORTANCE_LOW,
            )
        )
        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("SafeBrowse is protecting this device")
            .setContentText("Web filtering is active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openApp)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_STOP = "uk.co.cyberheroez.safebrowse.STOP_VPN"

        private const val VPN_ADDRESS = "10.111.222.1"
        private const val DNS_SERVER = "10.111.222.2"
        private const val UPSTREAM_DNS = "1.1.1.1"
        private const val DNS_PORT = 53
        private const val UPSTREAM_TIMEOUT_MS = 5000
        private const val MAX_PACKET = 32767
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "safebrowse_vpn"
    }
}
