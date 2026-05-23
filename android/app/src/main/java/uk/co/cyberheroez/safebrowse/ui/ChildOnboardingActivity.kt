package uk.co.cyberheroez.safebrowse.ui

import android.content.Intent
import android.graphics.Typeface
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.family.FamilyStore
import uk.co.cyberheroez.safebrowse.monitor.AppMonitorService
import uk.co.cyberheroez.safebrowse.monitor.UsageReader
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.vpn.SafeBrowseVpnService

/**
 * First-launch guided setup for a child phone:
 *
 *  1. VPN consent
 *  2. Usage Access
 *  3. Display over other apps
 *  4. Battery exemption (best-effort)
 *  5. Pair with a parent (delegates to [LinkParentActivity])
 *
 * Once every required step is satisfied and a parent is linked, this activity
 * starts the foreground services and finishes — the home screen takes over.
 * The same activity is launched again from the home screen if any of those
 * conditions later regress.
 */
class ChildOnboardingActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }

    private val vpnConsent = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { /* refresh on resume */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { renderNextStep() }
    }

    private suspend fun renderNextStep() {
        val step = nextStep()
        if (step == Step.DONE) {
            startServicesAndFinish()
            return
        }
        setContentView(stepView(step))
    }

    /** Recomputes which step is next, given the current permission state. */
    private suspend fun nextStep(): Step {
        if (VpnService.prepare(this) != null) return Step.VPN
        if (!UsageReader(this).hasUsageAccess()) return Step.USAGE
        if (!Settings.canDrawOverlays(this)) return Step.OVERLAY
        if (!isIgnoringBatteryOptimisations()) return Step.BATTERY
        if (store.getParentLink() == null) return Step.PAIR
        return Step.DONE
    }

    private fun isIgnoringBatteryOptimisations(): Boolean {
        val pm = ContextCompat.getSystemService(this, PowerManager::class.java) ?: return true
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    /** Starts the VPN + monitor and routes back to the home. */
    private fun startServicesAndFinish() {
        startService(Intent(this, SafeBrowseVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
        finish()
    }

    private fun stepView(step: Step): ScrollView {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(64), dp(20), dp(28))
        }
        column.addView(title("Set up SafeBrowse"))
        column.addView(caption("Step ${step.index} of 5 — ${step.label}"), marginTop(4))
        column.addView(body(step.explanation), marginTop(20))
        column.addView(primaryButton(step.actionLabel) { performStep(step) }, marginTop(28))
        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun performStep(step: Step) {
        when (step) {
            Step.VPN -> {
                val intent = VpnService.prepare(this)
                if (intent != null) vpnConsent.launch(intent)
            }
            Step.USAGE -> startActivity(UsageReader.usageAccessIntent())
            Step.OVERLAY -> startActivity(UsageReader.overlayIntent(this))
            Step.BATTERY -> openBatterySettings()
            Step.PAIR -> startActivity(Intent(this, LinkParentActivity::class.java))
            Step.DONE -> { /* unreachable */ }
        }
    }

    private fun openBatterySettings() {
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }
    }

    // ---- view helpers ----

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        textSize = 27f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.INK)
    }

    private fun caption(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13f
        setTextColor(Style.MUTED)
    }

    private fun body(text: String) = TextView(this).apply {
        this.text = text
        textSize = 16f
        setTextColor(Style.INK)
        setLineSpacing(0f, 1.3f)
    }

    private fun primaryButton(label: String, onClick: () -> Unit): MaterialButton =
        MaterialButton(this).apply {
            this.text = label
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = dp(28)
            insetTop = 0
            insetBottom = 0
            setOnClickListener { onClick() }
        }

    private fun marginTop(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }

    /**
     * Each onboarding step carries the copy and action label shown to the user.
     * `index` exists only for the "Step N of 5" caption.
     */
    private enum class Step(
        val index: Int,
        val label: String,
        val explanation: String,
        val actionLabel: String,
    ) {
        VPN(1, "Allow web filtering",
            "SafeBrowse runs as a local-only VPN to block harmful sites. " +
                "Android will ask you to allow it.",
            "Allow VPN"),
        USAGE(2, "Allow usage access",
            "This is how SafeBrowse measures screen time and detects which " +
                "app is open.",
            "Open settings"),
        OVERLAY(3, "Allow display over apps",
            "Needed so SafeBrowse can show a block screen when a blocked app " +
                "is opened.",
            "Open settings"),
        BATTERY(4, "Stay on in the background",
            "Exempt SafeBrowse from battery optimisation so protection stays on.",
            "Open settings"),
        PAIR(5, "Link to a parent",
            "Ask your parent for the 8-character pairing code shown on " +
                "their phone.",
            "Open pairing"),
        DONE(0, "", "", "");
    }
}
