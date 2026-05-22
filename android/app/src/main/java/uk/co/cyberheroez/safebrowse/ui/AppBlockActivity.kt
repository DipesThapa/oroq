package uk.co.cyberheroez.safebrowse.ui

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.config.ConfigRepository
import uk.co.cyberheroez.safebrowse.monitor.UsageReader
import uk.co.cyberheroez.safebrowse.ui.Style.card
import uk.co.cyberheroez.safebrowse.ui.Style.cardTitle
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import uk.co.cyberheroez.safebrowse.ui.Style.pageHeader
import uk.co.cyberheroez.safebrowse.ui.Style.primaryButton
import uk.co.cyberheroez.safebrowse.ui.Style.screen

/** Parent screen: choose which installed apps to block. */
class AppBlockActivity : AppCompatActivity() {

    private val config by lazy { ConfigRepository(this) }
    private val usage by lazy { UsageReader(this) }
    private val boxes = mutableMapOf<String, CheckBox>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
    }

    override fun onResume() {
        super.onResume()
        // Re-checked each time so it updates after the user returns from settings.
        if (usage.monitoringReady()) {
            lifecycleScope.launch { setContentView(buildLayout(config.getBlockedApps())) }
        } else {
            setContentView(monitorPermissionView(this))
        }
    }

    /** Installed launchable apps as (packageName, label), excluding our own. */
    private fun launchableApps(): List<Pair<String, String>> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return packageManager.queryIntentActivities(intent, 0)
            .map { it.activityInfo.packageName to it.loadLabel(packageManager).toString() }
            .filter { it.first != packageName }
            .distinctBy { it.first }
            .sortedBy { it.second.lowercase() }
    }

    private fun buildLayout(blocked: Set<String>): View = screen(this) {
        pageHeader("App blocking") { finish() }
        card {
            cardTitle("Block these apps")
            for ((pkg, label) in launchableApps()) {
                val box = CheckBox(context).apply {
                    text = label
                    textSize = 15f
                    isChecked = pkg in blocked
                }
                boxes[pkg] = box
                addView(box, LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = dp(2) })
            }
        }
        primaryButton("Save") {
            val selected = boxes.filterValues { it.isChecked }.keys.toSet()
            lifecycleScope.launch {
                config.setBlockedApps(selected)
                Toast.makeText(this@AppBlockActivity, "Saved", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }
}
