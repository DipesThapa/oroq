package uk.co.cyberheroez.oroq.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import kotlinx.coroutines.runBlocking
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.config.ConfigRepository
import uk.co.cyberheroez.oroq.filter.DnsFilter
import uk.co.cyberheroez.oroq.filter.DnsMessage
import uk.co.cyberheroez.oroq.family.BlockEventLog
import uk.co.cyberheroez.oroq.filter.loadBlocklistRepository
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
class OroQVpnService : VpnService() {

    private val running = AtomicBoolean(false)
    private var tun: ParcelFileDescriptor? = null
    private var worker: Thread? = null
    private val blockLog by lazy { BlockEventLog.forContext(this) }
    private var lastBlockedDomain: String? = null

    /** Categories worth an instant parent push (deck: threats only). */
    private val threatCategories = setOf("phishing", "malware", "scam", "adult")

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
            .setSession("OroQ")
            .addAddress(VPN_ADDRESS, 32)
            .addDnsServer(DNS_SERVER)
            .addRoute(DNS_SERVER, 32)
            .establish()
        Log.i(TAG, "establish() -> ${if (descriptor == null) "NULL" else "ok"}")
        if (descriptor == null) {
            stopVpn()
            return
        }
        tun = descriptor
        running.set(true)
        isActive = true
        worker = Thread { runLoop(descriptor) }.also { it.start() }
    }

    private fun runLoop(descriptor: ParcelFileDescriptor) {
        try {
            val repository = loadBlocklistRepository(this@OroQVpnService)
            val config = ConfigRepository(applicationContext)
            val enabled = runBlocking { config.getEnabledCategories() } + Categories.ALWAYS_ON
            val safeSearch = runBlocking { config.isSafeSearchOn() }
            val ytRestricted = runBlocking { config.isYtRestrictedOn() }
            Log.i(TAG, "blocklist loaded; enabled categories=$enabled safeSearch=$safeSearch ytRestricted=$ytRestricted")
            val filter = DnsFilter(repository, { enabled }, { safeSearch }, { ytRestricted })
            val input = FileInputStream(descriptor.fileDescriptor)
            val output = FileOutputStream(descriptor.fileDescriptor)
            val buffer = ByteArray(MAX_PACKET)
            Log.i(TAG, "worker loop started")
            while (running.get()) {
                val length = try {
                    input.read(buffer)
                } catch (e: Exception) {
                    Log.w(TAG, "tun read failed", e)
                    break
                }
                if (length <= 0) continue
                val udp = parseUdp(buffer.copyOf(length))
                if (udp == null) {
                    Log.d(TAG, "read $length bytes: not IPv4/UDP")
                    continue
                }
                if (udp.destinationPort != DNS_PORT) {
                    Log.d(TAG, "read $length bytes: udp dstPort=${udp.destinationPort}, skipping")
                    continue
                }
                val domain = DnsMessage.parseQuestionDomain(udp.payload)
                val responsePayload = when (val decision = filter.decide(udp.payload)) {
                    is DnsFilter.Decision.Block -> {
                        Log.d(TAG, "BLOCK $domain")
                        domain?.let { d ->
                            if (d != lastBlockedDomain) {
                                lastBlockedDomain = d
                                blockLog.record("web", d, decision.category)
                                if (decision.category in threatCategories) {
                                    uk.co.cyberheroez.oroq.family.scheduleNotifySync(applicationContext)
                                }
                            }
                        }
                        decision.response
                    }
                    is DnsFilter.Decision.Rewrite -> {
                        Log.d(TAG, "REWRITE $domain")
                        decision.response
                    }
                    DnsFilter.Decision.Allow -> {
                        val upstream = resolveUpstream(udp.payload)
                        if (upstream == null) {
                            Log.w(TAG, "ALLOW $domain: upstream failed, dropping")
                            continue
                        }
                        Log.d(TAG, "ALLOW $domain: upstream ${upstream.size} bytes")
                        upstream
                    }
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
                    Log.d(TAG, "wrote ${reply.size} bytes for $domain")
                } catch (e: Exception) {
                    Log.w(TAG, "tun write failed", e)
                    break
                }
            }
            Log.i(TAG, "worker loop ended")
        } catch (e: Exception) {
            Log.e(TAG, "worker loop crashed", e)
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
        Log.w(TAG, "resolveUpstream failed", e)
        null
    }

    private fun stopVpn() {
        running.set(false)
        isActive = false
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
                "OroQ protection",
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
            .setContentTitle("OroQ is protecting this device")
            .setContentText("Web filtering is active")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openApp)
            .setOngoing(true)
            .build()
    }

    companion object {
        const val ACTION_STOP = "uk.co.cyberheroez.oroq.STOP_VPN"

        /** True while the VPN filter is established and the worker loop runs. */
        @Volatile
        var isActive: Boolean = false
            private set

        private const val TAG = "OroQVpn"
        private const val VPN_ADDRESS = "10.111.222.1"
        private const val DNS_SERVER = "10.111.222.2"
        private const val UPSTREAM_DNS = "1.1.1.1"
        private const val DNS_PORT = 53
        private const val UPSTREAM_TIMEOUT_MS = 5000
        private const val MAX_PACKET = 32767
        private const val NOTIFICATION_ID = 1
        private const val CHANNEL_ID = "oroq_vpn"
    }
}
