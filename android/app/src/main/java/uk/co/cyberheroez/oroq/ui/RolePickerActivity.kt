package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.MainActivity
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.Style.dp

/** First-launch screen: is this the child's phone or the parent's phone? */
class RolePickerActivity : AppCompatActivity() {

    private val store by lazy { FamilyStore(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Style.lightSystemBars(this)
        setContentView(buildLayout())
    }

    private fun buildLayout(): ScrollView {
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(64), dp(20), dp(28))
        }
        column.addView(TextView(this).apply {
            text = "Welcome to OroQ"
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.INK)
        })
        column.addView(TextView(this).apply {
            text = "Which phone is this?"
            textSize = 15f
            setTextColor(Style.MUTED)
        }, marginTop(4))

        column.addView(choiceBlock(
            Style.GREEN, "This is my child's phone",
            "Set up web filtering, app blocking and screen-time limits here.",
        ) { choose(DeviceRole.CHILD) }, marginTop(24))

        column.addView(choiceBlock(
            Style.BLUE, "I'm a parent",
            "Link your child's phone and see it from here.",
        ) { choose(DeviceRole.PARENT) }, marginTop(14))

        return ScrollView(this).apply {
            setBackgroundColor(Style.BG)
            addView(column, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ))
        }
    }

    private fun choiceBlock(color: Int, title: String, body: String, onTap: () -> Unit): LinearLayout =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = Style.roundRect(color, dp(26).toFloat())
            setPadding(dp(24), dp(24), dp(24), dp(26))
            isClickable = true
            setOnClickListener { onTap() }
            addView(TextView(context).apply {
                text = title
                textSize = 20f
                setTypeface(typeface, Typeface.BOLD)
                setTextColor(Style.ON_DARK)
            })
            addView(TextView(context).apply {
                text = body
                textSize = 13.5f
                setTextColor(Style.ON_DARK_SOFT)
                setLineSpacing(0f, 1.25f)
            }, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = dp(6) })
        }

    private fun marginTop(d: Int) = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(d) }

    private fun choose(role: DeviceRole) {
        lifecycleScope.launch {
            store.setRole(role)
            val next = if (role == DeviceRole.PARENT) ParentActivity::class.java
                       else MainActivity::class.java
            startActivity(Intent(this@RolePickerActivity, next))
            finish()
        }
    }
}
