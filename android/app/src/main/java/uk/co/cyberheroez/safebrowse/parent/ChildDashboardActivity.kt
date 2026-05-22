package uk.co.cyberheroez.safebrowse.parent

import android.graphics.Typeface
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.safebrowse.family.FamilyCommand
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
        column.addView(backRow())
        column.addView(title(label), gap(10))
        column.addView(caption("Last synced ${relativeTime(summary.ts)}"), gap(2))

        column.addView(statusBlock(summary.protectionOn), gap(20))
        column.addView(screenTimeBlock(summary), gap(14))
        column.addView(blockedBlock(summary), gap(14))

        column.addView(sectionLabel("REMOTE CONTROL"), gap(24))
        column.addView(actionButton("Grant 30 minutes") {
            sendCommand(FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, 30), "Granted 30 minutes")
        }, gap(10))
        column.addView(actionButton("Set daily limit") { promptDailyLimit() }, gap(10))

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

    private fun sectionLabel(text: String) = TextView(this).apply {
        this.text = text
        textSize = 12f
        letterSpacing = 0.12f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.MUTED)
    }

    private fun actionButton(label: String, onClick: () -> Unit): MaterialButton =
        MaterialButton(this).apply {
            text = label
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = dp(30)
            insetTop = 0
            insetBottom = 0
            setOnClickListener { onClick() }
        }

    private fun promptDailyLimit() {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "Minutes per day (0 = no limit)"
        }
        AlertDialog.Builder(this)
            .setTitle("Daily screen-time limit")
            .setView(input)
            .setPositiveButton("Send") { _, _ ->
                val minutes = input.text.toString().toIntOrNull() ?: 0
                sendCommand(
                    FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, minutes),
                    "Daily limit set to ${formatMinutes(minutes)}",
                )
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun sendCommand(command: FamilyCommand, successMessage: String) {
        val pairingId = intent.getStringExtra(EXTRA_PAIRING_ID) ?: return
        lifecycleScope.launch {
            val ok = withContext(Dispatchers.IO) { repo.sendCommand(pairingId, command) }
            Toast.makeText(
                this@ChildDashboardActivity,
                if (ok) "$successMessage — it reaches the phone shortly"
                else "Couldn't send — check your connection",
                Toast.LENGTH_LONG,
            ).show()
        }
    }

    private fun backRow() = TextView(this).apply {
        text = "‹  Back"
        textSize = 15f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.MUTED)
        isClickable = true
        setOnClickListener { finish() }
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
            addView(backRow())
            addView(title(intent.getStringExtra(EXTRA_LABEL) ?: "Child phone"), gap(10))
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
