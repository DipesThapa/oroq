package uk.co.cyberheroez.safebrowse

import android.Manifest
import android.content.Intent
import android.graphics.Typeface
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.monitor.AppMonitorService
import uk.co.cyberheroez.safebrowse.ui.OnboardingActivity
import uk.co.cyberheroez.safebrowse.ui.SettingsActivity
import uk.co.cyberheroez.safebrowse.ui.Style
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen
import uk.co.cyberheroez.safebrowse.ui.Style.setCircleColor
import uk.co.cyberheroez.safebrowse.update.scheduleBlocklistUpdates
import uk.co.cyberheroez.safebrowse.vpn.SafeBrowseVpnService

/** Home screen: protection status, a single contextual action, and Settings. */
class MainActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private lateinit var statusBadge: TextView
    private lateinit var statusText: TextView
    private lateinit var statusSub: TextView
    private lateinit var actionButton: MaterialButton

    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == RESULT_OK) startVpnService()
        refreshStatusSoon()
    }

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            /* best effort — protection works without the notification */
        }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            if (!config.isOnboardingComplete()) {
                startActivity(Intent(this@MainActivity, OnboardingActivity::class.java))
                finish()
            } else {
                scheduleBlocklistUpdates(this@MainActivity)
                requestNotificationPermissionIfNeeded()
                setContentView(buildLayout())
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (this::statusText.isInitialized) updateStatus()
    }

    private fun buildLayout(): View {
        val view = screen(this) {
            // Status card
            card {
                gravity = Gravity.CENTER_HORIZONTAL
                statusBadge = Style.circleBadge(context)
                addView(statusBadge, LinearLayout.LayoutParams(dp(88), dp(88)))
                statusText = TextView(context).apply {
                    textSize = 23f
                    setTypeface(typeface, Typeface.BOLD)
                    gravity = Gravity.CENTER
                }
                addView(statusText, columnParams(topGap = 14))
                statusSub = TextView(context).apply {
                    textSize = 14f
                    setTextColor(Style.MUTED)
                    gravity = Gravity.CENTER
                }
                addView(statusSub, columnParams(topGap = 4))
            }
            // Contextual action
            actionButton = primaryButton("") { onActionTapped() }
            // Settings row card
            card(10) {
                val row = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
                row.addView(
                    TextView(context).apply {
                        text = "Settings"
                        textSize = 15f
                        setTextColor(Style.TEXT)
                    },
                    LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
                )
                row.addView(TextView(context).apply {
                    text = "›"
                    textSize = 22f
                    setTextColor(Style.MUTED)
                })
                addView(row, columnParams(topGap = 0))
            }.setOnClickListener {
                startActivity(Intent(this@MainActivity, SettingsActivity::class.java))
            }
        }
        updateStatus()
        return view
    }

    private fun LinearLayout.columnParams(topGap: Int) =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(topGap) }

    private fun updateStatus() {
        if (SafeBrowseVpnService.isActive) {
            statusBadge.text = "✓"
            statusBadge.setTextColor(Style.SUCCESS)
            statusBadge.setCircleColor(Style.SUCCESS_BG)
            statusText.text = "Protected"
            statusText.setTextColor(Style.SUCCESS)
            statusSub.text = "Web filtering is active on this device"
            actionButton.text = "Stop protection"
        } else {
            statusBadge.text = "!"
            statusBadge.setTextColor(Style.MUTED)
            statusBadge.setCircleColor(Style.MUTED_BG)
            statusText.text = "Not protected"
            statusText.setTextColor(Style.MUTED)
            statusSub.text = "Tap below to turn on web filtering"
            actionButton.text = "Start protection"
        }
    }

    private fun refreshStatusSoon() {
        actionButton.postDelayed({ updateStatus() }, 900)
    }

    private fun onActionTapped() {
        if (SafeBrowseVpnService.isActive) {
            stopVpnService()
            refreshStatusSoon()
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
            refreshStatusSoon()
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
