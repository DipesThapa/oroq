package uk.co.cyberheroez.safebrowse.parent

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
import kotlinx.coroutines.launch
import uk.co.cyberheroez.safebrowse.family.FamilyStore
import uk.co.cyberheroez.safebrowse.family.PairedChild
import uk.co.cyberheroez.safebrowse.ui.Style
import uk.co.cyberheroez.safebrowse.ui.Style.dp

/** Parent home: the list of paired children, with "Add a child". */
class ParentActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }

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
            } else {
                setContentView(buildLayout(store.getChildren()))
            }
        }
    }

    private fun buildLayout(children: List<PairedChild>): View {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(60), dp(20), dp(28))
        }
        column.addView(TextView(this).apply {
            text = "Your children"
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.INK)
        })

        if (children.isEmpty()) {
            column.addView(TextView(this).apply {
                text = "No phones linked yet. Tap below to link your child's phone."
                textSize = 14f
                setTextColor(Style.MUTED)
            }, gap(6))
        }
        for ((index, child) in children.withIndex()) {
            column.addView(childCard(child), gap(if (index == 0) 18 else 12))
        }

        column.addView(addBlock(), gap(if (children.isEmpty()) 22 else 14))

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun childCard(child: PairedChild): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = Style.roundRect(Style.VIOLET, dp(22).toFloat())
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
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
        })
        addView(TextView(context).apply {
            text = "Tap to see today's activity"
            textSize = 12.5f
            setTextColor(Style.ON_DARK_SOFT)
        })
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

    private fun gap(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }
}
