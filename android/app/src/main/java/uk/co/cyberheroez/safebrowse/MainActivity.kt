package uk.co.cyberheroez.safebrowse

import android.Manifest
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.monitor.AppMonitorService
import uk.co.cyberheroez.safebrowse.monitor.UsageReader
import uk.co.cyberheroez.safebrowse.ui.AppBlockActivity
import uk.co.cyberheroez.safebrowse.ui.OnboardingActivity
import uk.co.cyberheroez.safebrowse.ui.ScreenTimeActivity
import uk.co.cyberheroez.safebrowse.ui.SettingsActivity
import uk.co.cyberheroez.safebrowse.ui.Style
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.update.scheduleBlocklistUpdates
import uk.co.cyberheroez.safebrowse.vpn.SafeBrowseVpnService

/**
 * Home dashboard — a bold, playful layout: a greeting, a tappable protection
 * block, and bright solid-colour blocks for today's screen time, blocked apps
 * and blocked categories.
 */
class MainActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val usage by lazy { UsageReader(this) }

    private val match = ViewGroup.LayoutParams.MATCH_PARENT
    private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT

    private lateinit var greetingSub: TextView
    private lateinit var protectionBlock: LinearLayout
    private lateinit var protectionTitle: TextView
    private lateinit var protectionSub: TextView
    private lateinit var screenTimeValue: TextView
    private lateinit var screenTimeCaption: TextView
    private lateinit var barFill: View
    private lateinit var barRest: View
    private lateinit var categoriesValue: TextView
    private lateinit var appsValue: TextView

    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) startVpnService()
        refreshSoon()
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        window.statusBarColor = Style.BG
        WindowCompat.getInsetsController(window, window.decorView)
            .isAppearanceLightStatusBars = true
        lifecycleScope.launch {
            if (!config.isOnboardingComplete()) {
                startActivity(Intent(this@MainActivity, OnboardingActivity::class.java))
                finish()
            } else {
                scheduleBlocklistUpdates(this@MainActivity)
                requestNotificationPermissionIfNeeded()
                setContentView(buildLayout())
                refreshMetrics()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (this::protectionTitle.isInitialized) {
            updateStatus()
            lifecycleScope.launch { refreshMetrics() }
        }
    }

    // ---- Layout ------------------------------------------------------------

    private fun lp(topDp: Int) = LinearLayout.LayoutParams(match, wrap)
        .apply { topMargin = dp(topDp) }

    private fun buildLayout(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(32))
        }
        column.addView(TextView(this).apply {
            text = "Hi there 👋"
            textSize = 28f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.INK)
        })
        greetingSub = TextView(this).apply {
            textSize = 15f
            setTextColor(Style.MUTED)
        }
        column.addView(greetingSub, lp(3))

        column.addView(buildProtectionBlock(), lp(22))
        column.addView(buildScreenTimeBlock(), lp(14))
        column.addView(buildStatRow(), lp(14))
        column.addView(buildSettingsBlock(), lp(14))

        updateStatus()
        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(match, wrap))
        }
    }

    /** A flat, rounded solid-colour block. */
    private fun block(bgColor: Int): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = Style.roundRect(bgColor, dp(26).toFloat())
        setPadding(dp(22), dp(20), dp(22), dp(22))
    }

    /** A white-tinted icon on a translucent-white rounded chip. */
    private fun iconChip(iconRes: Int, size: Int): ImageView = ImageView(this).apply {
        setImageResource(iconRes)
        imageTintList = ColorStateList.valueOf(Style.ON_DARK)
        background = Style.roundRect(Style.WHITE_CHIP, dp(14).toFloat())
        val p = dp(if (size >= 50) 13 else 11)
        setPadding(p, p, p, p)
    }

    private fun buildProtectionBlock(): LinearLayout {
        protectionBlock = block(Style.GREEN).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            isClickable = true
            setOnClickListener { onActionTapped() }
        }
        protectionBlock.addView(
            iconChip(R.drawable.ic_power, 56),
            LinearLayout.LayoutParams(dp(56), dp(56)),
        )
        val textCol = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        protectionTitle = TextView(this).apply {
            textSize = 21f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        }
        textCol.addView(protectionTitle)
        protectionSub = TextView(this).apply {
            textSize = 13f
            setTextColor(Style.ON_DARK_SOFT)
        }
        textCol.addView(protectionSub, lp(2))
        protectionBlock.addView(textCol, LinearLayout.LayoutParams(0, wrap, 1f).apply {
            marginStart = dp(16)
        })
        return protectionBlock
    }

    private fun buildScreenTimeBlock(): LinearLayout {
        val b = block(Style.BLUE).apply {
            isClickable = true
            setOnClickListener { open(ScreenTimeActivity::class.java) }
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        header.addView(
            iconChip(R.drawable.ic_clock, 44),
            LinearLayout.LayoutParams(dp(44), dp(44)),
        )
        header.addView(TextView(this).apply {
            text = "SCREEN TIME TODAY"
            textSize = 11.5f
            letterSpacing = 0.08f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK_SOFT)
        }, LinearLayout.LayoutParams(wrap, wrap).apply { marginStart = dp(12) })
        b.addView(header)
        screenTimeValue = TextView(this).apply {
            textSize = 32f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        }
        b.addView(screenTimeValue, lp(14))

        val track = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            background = Style.roundRect(Style.WHITE_TRACK, dp(5).toFloat())
        }
        barFill = View(this).apply {
            background = Style.roundRect(Style.ON_DARK, dp(5).toFloat())
        }
        barRest = View(this)
        track.addView(barFill, LinearLayout.LayoutParams(0, match, 0f))
        track.addView(barRest, LinearLayout.LayoutParams(0, match, 1f))
        b.addView(track, LinearLayout.LayoutParams(match, dp(10)).apply { topMargin = dp(14) })

        screenTimeCaption = TextView(this).apply {
            textSize = 12.5f
            setTextColor(Style.ON_DARK_SOFT)
        }
        b.addView(screenTimeCaption, lp(8))
        return b
    }

    private fun buildStatRow(): LinearLayout {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val (appsB, appsV) = statBlock(Style.AMBER, R.drawable.ic_block, "Apps blocked") {
            open(AppBlockActivity::class.java)
        }
        appsValue = appsV
        val (catB, catV) = statBlock(Style.VIOLET, R.drawable.ic_shield, "Categories blocked") {
            open(SettingsActivity::class.java)
        }
        categoriesValue = catV
        row.addView(appsB, LinearLayout.LayoutParams(0, wrap, 1f))
        row.addView(catB, LinearLayout.LayoutParams(0, wrap, 1f).apply { marginStart = dp(14) })
        return row
    }

    private fun statBlock(bg: Int, iconRes: Int, label: String, onClick: () -> Unit):
            Pair<LinearLayout, TextView> {
        val b = block(bg).apply {
            isClickable = true
            setOnClickListener { onClick() }
        }
        b.addView(iconChip(iconRes, 46), LinearLayout.LayoutParams(dp(46), dp(46)))
        val value = TextView(this).apply {
            textSize = 34f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        }
        b.addView(value, lp(14))
        b.addView(TextView(this).apply {
            text = label
            textSize = 13f
            setTextColor(Style.ON_DARK_SOFT)
        }, lp(1))
        return b to value
    }

    private fun buildSettingsBlock(): LinearLayout {
        val b = block(Style.INK).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(24), dp(22), dp(24), dp(22))
            isClickable = true
            setOnClickListener { open(SettingsActivity::class.java) }
        }
        b.addView(TextView(this).apply {
            text = "Settings"
            textSize = 17f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        }, LinearLayout.LayoutParams(0, wrap, 1f))
        b.addView(TextView(this).apply {
            text = "›"
            textSize = 26f
            setTextColor(Style.ON_DARK_SOFT)
        })
        return b
    }

    private fun open(activity: Class<*>) = startActivity(Intent(this, activity))

    // ---- State -------------------------------------------------------------

    private fun updateStatus() {
        if (SafeBrowseVpnService.isActive) {
            protectionBlock.background = Style.roundRect(Style.GREEN, dp(26).toFloat())
            protectionTitle.text = "You're protected"
            protectionSub.text = "Web filtering is on · tap to pause"
            greetingSub.text = "Everything looks safe"
        } else {
            protectionBlock.background = Style.roundRect(Style.RED_OFF, dp(26).toFloat())
            protectionTitle.text = "Not protected"
            protectionSub.text = "Tap to turn on web filtering"
            greetingSub.text = "Tap the card below to start"
        }
    }

    private suspend fun refreshMetrics() {
        if (!this::categoriesValue.isInitialized) return
        categoriesValue.text = config.getEnabledCategories().size.toString()
        appsValue.text = config.getBlockedApps().size.toString()

        val limit = config.getDailyLimitMinutes()
        if (usage.hasUsageAccess()) {
            val minutes = withContext(Dispatchers.IO) { usage.todayForegroundMinutes() }
            screenTimeValue.text = formatDuration(minutes)
            if (limit > 0) {
                setBar(minutes.toFloat() / limit)
                screenTimeCaption.text = "of ${formatDuration(limit)} daily limit"
            } else {
                setBar(0f)
                screenTimeCaption.text = "No daily limit set"
            }
        } else {
            screenTimeValue.text = "—"
            setBar(0f)
            screenTimeCaption.text = "Tap to turn on screen-time tracking"
        }
    }

    private fun setBar(fraction: Float) {
        val f = fraction.coerceIn(0f, 1f)
        (barFill.layoutParams as LinearLayout.LayoutParams).weight = f
        (barRest.layoutParams as LinearLayout.LayoutParams).weight = 1f - f
        barFill.visibility = if (f <= 0f) View.INVISIBLE else View.VISIBLE
        barFill.requestLayout()
        barRest.requestLayout()
    }

    private fun formatDuration(m: Int): String =
        if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"

    private fun refreshSoon() {
        protectionBlock.postDelayed({
            updateStatus()
            lifecycleScope.launch { refreshMetrics() }
        }, 900)
    }

    // ---- Actions -----------------------------------------------------------

    private fun onActionTapped() {
        if (SafeBrowseVpnService.isActive) {
            stopVpnService()
            refreshSoon()
        } else {
            requestVpn()
        }
    }

    private fun requestVpn() {
        val intent = VpnService.prepare(this)
        if (intent != null) {
            vpnConsent.launch(intent)
        } else {
            startVpnService()
            refreshSoon()
        }
    }

    private fun startVpnService() {
        startService(Intent(this, SafeBrowseVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
    }

    private fun stopVpnService() {
        startService(
            Intent(this, SafeBrowseVpnService::class.java)
                .setAction(SafeBrowseVpnService.ACTION_STOP)
        )
        stopService(Intent(this, AppMonitorService::class.java))
    }
}
