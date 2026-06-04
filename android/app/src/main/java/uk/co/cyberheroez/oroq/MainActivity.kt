package uk.co.cyberheroez.oroq

import android.Manifest
import android.content.Intent
import android.graphics.Typeface
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.ChildOnboardingActivity
import uk.co.cyberheroez.oroq.ui.RolePickerActivity
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.dp
import uk.co.cyberheroez.oroq.update.scheduleBlocklistUpdates
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

/**
 * The child phone's only screen: a single status badge plus a "Linked to a
 * parent" caption. Parent and Role-picker routing is unchanged from before.
 *
 * Tapping the badge when it is red routes to [ChildOnboardingActivity], which
 * walks through whatever permission is missing.
 */
class MainActivity : AppCompatActivity() {

    private val familyStore by lazy { FamilyStore(this) }

    private lateinit var badge: LinearLayout
    private lateinit var badgeTitle: TextView
    private lateinit var badgeSub: TextView
    private lateinit var linkedLine: TextView

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        window.statusBarColor = Style.BG
        WindowCompat.getInsetsController(window, window.decorView)
            .isAppearanceLightStatusBars = true

        lifecycleScope.launch {
            when (familyStore.getRole()) {
                null -> {
                    startActivity(Intent(this@MainActivity, RolePickerActivity::class.java))
                    finish()
                }
                DeviceRole.PARENT -> {
                    startActivity(Intent(this@MainActivity, ParentActivity::class.java))
                    finish()
                }
                DeviceRole.CHILD -> setUpChildHome()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (this::badge.isInitialized) updateStatus()
    }

    private suspend fun setUpChildHome() {
        if (!isReadyToShowHome()) {
            startActivity(Intent(this, ChildOnboardingActivity::class.java))
            finish()
            return
        }
        scheduleBlocklistUpdates(this)
        scheduleFamilySync(this)
        requestNotificationPermissionIfNeeded()
        // Ensure the services are running on every cold start. They no-op if
        // already up.
        startService(Intent(this, OroQVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
        setContentView(buildLayout())
        updateStatus()
    }

    /** True when every onboarding gate has been satisfied. */
    private suspend fun isReadyToShowHome(): Boolean {
        if (VpnService.prepare(this) != null) return false
        if (!UsageReader(this).hasUsageAccess()) return false
        if (!Settings.canDrawOverlays(this)) return false
        if (familyStore.getParentLink() == null) return false
        return true
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun buildLayout(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(96), dp(24), dp(40))
        }
        column.addView(TextView(this).apply {
            text = "SAFEBROWSE"
            textSize = 13f
            letterSpacing = 0.32f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.MUTED)
        })

        badge = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(60), dp(28), dp(60))
            background = Style.roundRect(Style.GREEN, dp(28).toFloat())
            isClickable = true
            setOnClickListener { onBadgeTapped() }
        }
        badgeTitle = TextView(this).apply {
            textSize = 32f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
            gravity = Gravity.CENTER
        }
        badge.addView(badgeTitle)
        badgeSub = TextView(this).apply {
            textSize = 14f
            setTextColor(Style.ON_DARK_SOFT)
            gravity = Gravity.CENTER
        }
        badge.addView(badgeSub, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) })

        column.addView(badge, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(40) })

        linkedLine = TextView(this).apply {
            textSize = 14f
            setTextColor(Style.MUTED)
            gravity = Gravity.CENTER
            text = "Linked to a parent"
        }
        column.addView(linkedLine, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(28) })

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
            ))
        }
    }

    private fun updateStatus() {
        val protectedOn = OroQVpnService.isActive && permissionsGranted()
        if (protectedOn) {
            badge.background = Style.roundRect(Style.GREEN, dp(28).toFloat())
            badgeTitle.text = "✓ Protected"
            badgeSub.text = "Web filtering is on"
        } else {
            badge.background = Style.roundRect(Style.RED_OFF, dp(28).toFloat())
            badgeTitle.text = "Not protected"
            badgeSub.text = "Tap to fix"
        }
    }

    private fun permissionsGranted(): Boolean {
        if (VpnService.prepare(this) != null) return false
        if (!UsageReader(this).hasUsageAccess()) return false
        if (!Settings.canDrawOverlays(this)) return false
        return isIgnoringBatteryOptimisations()
    }

    private fun isIgnoringBatteryOptimisations(): Boolean {
        val pm = ContextCompat.getSystemService(this, PowerManager::class.java) ?: return true
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    private fun onBadgeTapped() {
        if (OroQVpnService.isActive && permissionsGranted()) return
        startActivity(Intent(this, ChildOnboardingActivity::class.java))
    }
}
