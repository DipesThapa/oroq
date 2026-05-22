package uk.co.cyberheroez.safebrowse.parent

import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.safebrowse.family.FamilySummary
import uk.co.cyberheroez.safebrowse.ui.Style
import uk.co.cyberheroez.safebrowse.ui.Style.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Read-only view of one child's latest activity summary. */
class ChildDashboardActivity : AppCompatActivity() {

    private val repo by lazy { ParentRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(messageView("Loading…"))
    }

    override fun onResume() {
        super.onResume()
        val pairingId = intent.getStringExtra(EXTRA_PAIRING_ID) ?: run { finish(); return }
        lifecycleScope.launch {
            val summary = withContext(Dispatchers.IO) { repo.fetchSummary(pairingId) }
            setContentView(
                if (summary == null) messageView("No data yet — the child's phone hasn't synced.")
                else dashboardView(summary),
            )
        }
    }

    private fun dashboardView(summary: FamilySummary): View {
        val label = intent.getStringExtra(EXTRA_LABEL) ?: "Child phone"
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
        }
        column.addView(title(label))
        column.addView(caption("Last synced ${relativeTime(summary.ts)}"), gap(2))

        column.addView(statusBlock(summary.protectionOn), gap(20))
        column.addView(screenTimeBlock(summary), gap(14))
        column.addView(blockedBlock(summary), gap(14))

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun statusBlock(on: Boolean): View = block(if (on) Style.GREEN else Style.RED_OFF) {
        addView(blockTitle(if (on) "Protected" else "Not protected"))
        addView(blockBody(if (on) "Web filtering is on." else "Web filtering is off on this phone."))
    }

    private fun screenTimeBlock(summary: FamilySummary): View = block(Style.BLUE) {
        addView(blockCaption("SCREEN TIME TODAY"))
        addView(blockValue(formatMinutes(summary.screenTimeTodayMin)))
        val limit = if (summary.dailyLimitMin > 0)
            "of ${formatMinutes(summary.dailyLimitMin)} daily limit" else "No daily limit set"
        addView(blockBody(limit))
        for (app in summary.topApps) {
            addView(blockBody("${app.label} — ${formatMinutes(app.minutes)}"))
        }
    }

    private fun blockedBlock(summary: FamilySummary): View = block(Style.AMBER) {
        addView(blockCaption("BLOCKED TODAY"))
        addView(blockValue("${summary.webBlockedToday + summary.appBlockedToday}"))
        addView(blockBody("${summary.webBlockedToday} web · ${summary.appBlockedToday} apps"))
        if (summary.recentEvents.isEmpty()) {
            addView(blockBody("No blocked attempts recorded."))
        }
        for (event in summary.recentEvents) {
            addView(blockBody("${event.label}  ·  ${relativeTime(event.ts)}"))
        }
    }

    // ---- view helpers ----

    private fun block(color: Int, build: LinearLayout.() -> Unit): View =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(color, dp(22).toFloat())
            setPadding(dp(22), dp(20), dp(22), dp(20))
            build()
        }

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

    private fun blockTitle(text: String) = TextView(this).apply {
        this.text = text
        textSize = 20f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.ON_DARK)
    }

    private fun blockCaption(text: String) = TextView(this).apply {
        this.text = text
        textSize = 11f
        letterSpacing = 0.1f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.ON_DARK_SOFT)
    }

    private fun blockValue(text: String) = TextView(this).apply {
        this.text = text
        textSize = 30f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.ON_DARK)
    }

    private fun blockBody(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13.5f
        setTextColor(Style.ON_DARK_SOFT)
        layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(4) }
    }

    private fun messageView(text: String): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
            addView(title(intent.getStringExtra(EXTRA_LABEL) ?: "Child phone"))
            addView(caption(text), gap(8))
        }
        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun gap(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }

    private fun formatMinutes(m: Int): String =
        if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"

    private fun relativeTime(ts: Long): String {
        val minutes = (System.currentTimeMillis() - ts) / 60_000
        return when {
            minutes < 1 -> "just now"
            minutes < 60 -> "$minutes min ago"
            minutes < 1440 -> "${minutes / 60} h ago"
            else -> SimpleDateFormat("d MMM", Locale.UK).format(Date(ts))
        }
    }

    companion object {
        const val EXTRA_PAIRING_ID = "pairing_id"
        const val EXTRA_LABEL = "label"
    }
}
