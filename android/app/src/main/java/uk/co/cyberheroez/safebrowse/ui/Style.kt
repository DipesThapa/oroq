package uk.co.cyberheroez.safebrowse.ui

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

/**
 * SafeBrowse design system — a calm teal palette, a gradient hero, soft
 * rounded cards and pill buttons. Shared builders keep every screen consistent.
 */
object Style {

    const val BG = 0xFFF7F4EF.toInt()
    const val CARD = 0xFFFFFFFF.toInt()
    const val PRIMARY = 0xFF0D9488.toInt()
    const val INK = 0xFF2A2530.toInt()
    const val MUTED = 0xFF8A8390.toInt()
    const val ON_DARK = 0xFFFFFFFF.toInt()
    const val ON_DARK_SOFT = 0xCCFFFFFF.toInt()

    // Bold & playful accent blocks
    const val CORAL = 0xFFFF6B6B.toInt()
    const val AMBER = 0xFFF2A33D.toInt()
    const val VIOLET = 0xFF7C6CF0.toInt()
    const val BLUE = 0xFF4C8DF6.toInt()
    const val GREEN = 0xFF1FB07A.toInt()
    const val RED_OFF = 0xFFFF5A6E.toInt()
    const val WHITE_CHIP = 0x33FFFFFF.toInt()
    const val WHITE_TRACK = 0x40FFFFFF.toInt()

    // Hero gradients — teal when protected, slate when not.
    const val HERO_LIGHT = 0xFF1FB8A6.toInt()
    const val HERO_DARK = 0xFF0B7268.toInt()
    const val OFF_LIGHT = 0xFF9AA7A6.toInt()
    const val OFF_DARK = 0xFF63726F.toInt()
    const val MINT_BG = 0xFFE0F5F1.toInt()
    const val MUTED_BG = 0xFFE6EAEA.toInt()

    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** A scrolling screen on the brand background; [build] fills its column. */
    fun screen(context: Context, build: LinearLayout.() -> Unit): ScrollView {
        val column = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(context.dp(20), context.dp(52), context.dp(20), context.dp(28))
        }
        column.build()
        return ScrollView(context).apply {
            setBackgroundColor(BG)
            addView(column, LinearLayout.LayoutParams(MATCH, WRAP))
        }
    }

    /** Hide the action bar and use dark status-bar icons on the warm background. */
    fun lightSystemBars(activity: AppCompatActivity) {
        activity.supportActionBar?.hide()
        activity.window.statusBarColor = BG
        WindowCompat.getInsetsController(activity.window, activity.window.decorView)
            .isAppearanceLightStatusBars = true
    }

    /** A big, bold page title — optionally preceded by a tappable "Back" row. */
    fun LinearLayout.pageHeader(title: String, onBack: (() -> Unit)? = null) {
        if (onBack != null) {
            addText("‹  Back", 15f, MUTED, Typeface.BOLD, 0).apply {
                isClickable = true
                setOnClickListener { onBack() }
            }
        }
        addText(title, 27f, INK, Typeface.BOLD, if (onBack != null) 10 else 0)
    }

    /** A solid rounded-rectangle drawable — chips, stat tiles, progress tracks. */
    fun roundRect(color: Int, radius: Float): GradientDrawable =
        GradientDrawable().apply { setColor(color); cornerRadius = radius }

    /** A diagonal two-stop gradient, optionally with rounded bottom corners. */
    fun gradient(context: Context, light: Int, dark: Int, bottomRadiusDp: Int = 0): GradientDrawable =
        GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(light, dark)).apply {
            if (bottomRadiusDp > 0) {
                val r = context.dp(bottomRadiusDp).toFloat()
                cornerRadii = floatArrayOf(0f, 0f, 0f, 0f, r, r, r, r)
            }
        }

    /** A white rounded card; [build] fills its inner column. */
    fun LinearLayout.card(topGap: Int = 14, build: LinearLayout.() -> Unit): MaterialCardView {
        val inner = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(CARD)
            val p = context.dp(22)
            setPadding(p, p, p, p)
        }
        inner.build()
        val cardView = MaterialCardView(context).apply {
            radius = context.dp(22).toFloat()
            cardElevation = context.dp(3).toFloat()
            setCardBackgroundColor(CARD)
            addView(inner)
        }
        addView(cardView, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(topGap) })
        return cardView
    }

    fun LinearLayout.heading(text: String): TextView = addText(text, 23f, INK, Typeface.BOLD, 0)
    fun LinearLayout.cardTitle(text: String): TextView = addText(text, 16f, INK, Typeface.BOLD, 0)
    fun LinearLayout.body(text: String, color: Int = MUTED, topGap: Int = 6): TextView =
        addText(text, 14f, color, Typeface.NORMAL, topGap)

    private fun LinearLayout.addText(text: String, sizeSp: Float, color: Int, style: Int, topGap: Int): TextView {
        val tv = TextView(context).apply {
            this.text = text
            textSize = sizeSp
            setTextColor(color)
            setTypeface(typeface, style)
            setLineSpacing(0f, 1.25f)
        }
        addView(tv, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(topGap) })
        return tv
    }

    /** A filled teal pill button (uses the theme's teal colorPrimary). */
    fun LinearLayout.primaryButton(text: String, onClick: () -> Unit): MaterialButton {
        val b = MaterialButton(context).apply {
            this.text = text
            isAllCaps = false
            textSize = 16f
            setTypeface(typeface, Typeface.BOLD)
            cornerRadius = context.dp(30)
            setOnClickListener { onClick() }
        }
        addView(b, LinearLayout.LayoutParams(MATCH, context.dp(58)).apply { topMargin = context.dp(18) })
        return b
    }

    /** An outlined pill button. */
    fun LinearLayout.ghostButton(text: String, onClick: () -> Unit): MaterialButton {
        val b = MaterialButton(
            context, null, com.google.android.material.R.attr.materialButtonOutlinedStyle
        ).apply {
            this.text = text
            isAllCaps = false
            textSize = 15f
            cornerRadius = context.dp(30)
            setOnClickListener { onClick() }
        }
        addView(b, LinearLayout.LayoutParams(MATCH, context.dp(54)).apply { topMargin = context.dp(10) })
        return b
    }

    /** A circular badge whose fill colour can be changed via [setCircleColor]. */
    fun circleBadge(context: Context): TextView = TextView(context).apply {
        gravity = Gravity.CENTER
        textSize = 44f
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL }
    }

    fun TextView.setCircleColor(color: Int) {
        (background as GradientDrawable).setColor(color)
    }
}
