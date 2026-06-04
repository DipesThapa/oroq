package uk.co.cyberheroez.oroq.ui

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.family.pollAndApplyCommands
import uk.co.cyberheroez.oroq.ui.Style.dp

/**
 * Full-screen screen shown when an app is blocked or screen time is up.
 *
 * The only action is "Go to home screen" — there is no local PIN escape.
 * On the time's-up variant, the activity polls the parent every 30 s for a
 * grant-extra-time command and dismisses itself the moment one is applied.
 */
class BlockActivity : AppCompatActivity() {

    private val match = ViewGroup.LayoutParams.MATCH_PARENT
    private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.hide()
        val reason = intent.getStringExtra(EXTRA_REASON) ?: REASON_APP
        setContentView(if (reason == REASON_TIME) timeUpView() else appBlockedView())
        if (reason == REASON_TIME) pollForRemoteGrant()
    }

    /** While the time's-up screen shows, checks for a remote grant every 30s. */
    private fun pollForRemoteGrant() {
        lifecycleScope.launch {
            repeat(40) { // ~20 minutes of polling
                delay(30_000)
                val applied = runCatching {
                    pollAndApplyCommands(applicationContext)
                }.getOrDefault(0)
                if (applied > 0) {
                    Toast.makeText(
                        this@BlockActivity, "A parent granted more time", Toast.LENGTH_LONG,
                    ).show()
                    finish()
                    return@launch
                }
            }
        }
    }

    /** Back returns to the launcher, never to the blocked app. */
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() = goHome()

    private fun appBlockedView(): View = blockScreen(
        bgColor = Style.CORAL,
        iconRes = R.drawable.ic_block,
        heading = "App blocked",
        message = "This app has been blocked by SafeBrowse.",
    ) {
        whiteButton("Go to home screen", Style.CORAL) { goHome() }
    }

    private fun timeUpView(): View = blockScreen(
        bgColor = Style.BLUE,
        iconRes = R.drawable.ic_clock,
        heading = "Screen time's up",
        message = "Today's screen-time limit has been reached. " +
            "A parent can grant more time remotely.",
    ) {
        whiteButton("Go to home screen", Style.BLUE) { goHome() }
    }

    private fun blockScreen(
        bgColor: Int,
        iconRes: Int,
        heading: String,
        message: String,
        actions: LinearLayout.() -> Unit,
    ): View {
        window.statusBarColor = bgColor
        val column = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(bgColor)
            setPadding(dp(32), dp(32), dp(32), dp(40))
        }
        column.addView(ImageView(this).apply {
            setImageResource(iconRes)
            imageTintList = ColorStateList.valueOf(Style.ON_DARK)
            background = Style.roundRect(Style.WHITE_CHIP, dp(28).toFloat())
            val p = dp(22)
            setPadding(p, p, p, p)
        }, LinearLayout.LayoutParams(dp(100), dp(100)))
        column.addView(TextView(this).apply {
            text = heading
            textSize = 27f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Style.ON_DARK)
            gravity = Gravity.CENTER
        }, mw(26))
        column.addView(TextView(this).apply {
            text = message
            textSize = 15f
            setTextColor(Style.ON_DARK_SOFT)
            gravity = Gravity.CENTER
            setLineSpacing(0f, 1.3f)
        }, mw(10))
        column.actions()
        return column
    }

    private fun mw(topDp: Int) = LinearLayout.LayoutParams(match, wrap)
        .apply { topMargin = dp(topDp) }

    /** A white pill button with [textColor] text, for use on a coloured screen. */
    private fun LinearLayout.whiteButton(text: String, textColor: Int, onClick: () -> Unit) {
        addView(MaterialButton(this@BlockActivity).apply {
            this.text = text
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = dp(28)
            insetTop = 0
            insetBottom = 0
            backgroundTintList = ColorStateList.valueOf(Style.ON_DARK)
            setTextColor(textColor)
            setOnClickListener { onClick() }
        }, LinearLayout.LayoutParams(match, dp(56)).apply { topMargin = dp(30) })
    }

    private fun goHome() {
        startActivity(
            Intent(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        finish()
    }

    companion object {
        const val EXTRA_REASON = "reason"
        const val REASON_APP = "APP"
        const val REASON_TIME = "TIME"
    }
}
