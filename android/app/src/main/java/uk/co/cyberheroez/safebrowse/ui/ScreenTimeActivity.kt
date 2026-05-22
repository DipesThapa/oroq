package uk.co.cyberheroez.safebrowse.ui

import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.monitor.UsageReader
import uk.co.cyberheroez.safebrowse.ui.Style.body
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** Parent screen: today's usage and the daily screen-time limit. */
class ScreenTimeActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val usage by lazy { UsageReader(this) }
    private lateinit var limitField: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Screen time"
    }

    override fun onResume() {
        super.onResume()
        // Re-checked each time so it updates after the user returns from settings.
        if (usage.monitoringReady()) {
            lifecycleScope.launch { setContentView(mainView(config.getDailyLimitMinutes())) }
        } else {
            setContentView(monitorPermissionView(this))
        }
    }

    private fun mainView(limitMinutes: Int): View = screen(this) {
        card {
            cardTitle("Today")
            body("Total screen time: ${formatMinutes(usage.todayForegroundMinutes())}")
            val top = usage.todayUsageByApp().entries.sortedByDescending { it.value }.take(5)
            for ((pkg, minutes) in top) {
                body("${appLabel(pkg)} — ${formatMinutes(minutes)}", Style.MUTED, 4)
            }
        }
        card {
            cardTitle("Daily limit")
            body("Minutes per day (0 = no limit)", topGap = 14)
            limitField = EditText(context).apply {
                inputType = InputType.TYPE_CLASS_NUMBER
                setText(limitMinutes.toString())
            }
            addView(limitField, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(8) })
        }
        primaryButton("Save limit") {
            val minutes = limitField.text.toString().toIntOrNull() ?: 0
            lifecycleScope.launch {
                config.setDailyLimitMinutes(minutes)
                Toast.makeText(this@ScreenTimeActivity, "Saved", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun appLabel(pkg: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: Exception) {
        pkg
    }

    private fun formatMinutes(m: Int): String =
        if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
}
