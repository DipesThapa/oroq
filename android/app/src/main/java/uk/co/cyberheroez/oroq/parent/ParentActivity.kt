package uk.co.cyberheroez.oroq.parent

import android.content.Intent
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
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.family.PairedChild
import uk.co.cyberheroez.oroq.ui.Style
import uk.co.cyberheroez.oroq.ui.Style.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Parent home: a card per paired child with a glanceable status, plus "Add a child". */
class ParentActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }
    private val repo by lazy { ParentRepository(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch {
            if (store.getParentToken() == null) {
                startActivity(Intent(this@ParentActivity, ParentLoginActivity::class.java))
                finish()
                return@launch
            }
            val children = store.getChildren()
            if (children.isEmpty()) {
                setContentView(buildLayout(emptyList()))
                return@launch
            }
            setContentView(loadingView())
            val withSummaries = children.map { child ->
                child to withContext(Dispatchers.IO) { repo.fetchSummary(child.pairingId) }
            }
            setContentView(buildLayout(withSummaries))
        }
    }

    private fun buildLayout(children: List<Pair<PairedChild, FamilySummary?>>): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
        }
        column.addView(heading("Your children"))

        if (children.isEmpty()) {
            column.addView(TextView(this).apply {
                text = "No phones linked yet. Tap below to link your child's phone."
                textSize = 14f
                setTextColor(Style.MUTED)
            }, gap(6))
        }
        for ((index, pair) in children.withIndex()) {
            column.addView(childCard(pair.first, pair.second), gap(if (index == 0) 18 else 12))
        }
        column.addView(addBlock(), gap(if (children.isEmpty()) 22 else 14))

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun loadingView(): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
            addView(heading("Your children"))
            addView(TextView(this@ParentActivity).apply {
                text = "Loading…"
                textSize = 14f
                setTextColor(Style.MUTED)
            }, gap(6))
        }
        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun childCard(child: PairedChild, summary: FamilySummary?): View {
        val color = when {
            summary == null -> Style.VIOLET
            summary.protectionOn -> Style.GREEN
            else -> Style.RED_OFF
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(color, dp(22).toFloat())
            setPadding(dp(22), dp(20), dp(22), dp(20))
            isClickable = true
            setOnClickListener {
                startActivity(
                    Intent(this@ParentActivity, ChildDashboardActivity::class.java)
                        .putExtra(ChildDashboardActivity.EXTRA_PAIRING_ID, child.pairingId)
                        .putExtra(ChildDashboardActivity.EXTRA_LABEL, child.label),
                )
            }
            addView(TextView(context).apply {
                text = child.label
                textSize = 19f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Style.ON_DARK)
            })
            addView(TextView(context).apply {
                text = statusLine(summary)
                textSize = 14f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Style.ON_DARK)
            }, gap(8))
            addView(TextView(context).apply {
                text = subLine(summary)
                textSize = 12.5f
                setTextColor(Style.ON_DARK_SOFT)
            }, gap(2))
        }
    }

    private fun addBlock(): View = LinearLayout(this).apply {
        background = Style.roundRect(Style.INK, dp(22).toFloat())
        setPadding(dp(24), dp(22), dp(24), dp(22))
        isClickable = true
        setOnClickListener {
            startActivity(Intent(this@ParentActivity, AddChildActivity::class.java))
        }
        addView(TextView(context).apply {
            text = "+  Add a child"
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        })
    }

    private fun heading(text: String) = TextView(this).apply {
        this.text = text
        textSize = 27f
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Style.INK)
    }

    private fun statusLine(s: FamilySummary?): String = when {
        s == null -> "No activity synced yet"
        s.protectionOn -> "Protected"
        else -> "Not protected"
    }

    private fun subLine(s: FamilySummary?): String {
        if (s == null) return "Tap to open"
        val time = "${formatMinutes(s.screenTimeTodayMin)} screen time today"
        val blocked = s.webBlockedToday + s.appBlockedToday
        val synced = "synced ${relativeTime(s.ts)}"
        return if (blocked > 0) "$time · $blocked blocked · $synced" else "$time · $synced"
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
}
