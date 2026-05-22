package uk.co.cyberheroez.safebrowse.ui

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

/**
 * Shared visual style — the SafeBrowse brand palette and a small set of
 * styled-view builders so every screen looks consistent and professional.
 */
object Style {

    const val BG = 0xFFEEF1F6.toInt()
    const val PRIMARY = 0xFF3D5AFE.toInt()
    const val CARD = 0xFFFFFFFF.toInt()
    const val TEXT = 0xFF16213E.toInt()
    const val MUTED = 0xFF767B8F.toInt()
    const val SUCCESS = 0xFF1FA855.toInt()
    const val SUCCESS_BG = 0xFFE3F6E9.toInt()
    const val MUTED_BG = 0xFFE3E6EF.toInt()

    private const val MATCH = ViewGroup.LayoutParams.MATCH_PARENT
    private const val WRAP = ViewGroup.LayoutParams.WRAP_CONTENT

    fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** A scrolling screen on the brand background; [build] fills its column. */
    fun screen(context: Context, build: LinearLayout.() -> Unit): ScrollView {
        val column = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val p = context.dp(20)
            setPadding(p, p, p, p)
        }
        column.build()
        return ScrollView(context).apply {
            setBackgroundColor(BG)
            addView(column, LinearLayout.LayoutParams(MATCH, WRAP))
        }
    }

    /** Adds a white rounded card to this column; [build] fills the card. */
    fun LinearLayout.card(topGap: Int = 14, build: LinearLayout.() -> Unit): MaterialCardView {
        val inner = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(CARD)
            val p = context.dp(20)
            setPadding(p, p, p, p)
        }
        inner.build()
        val cardView = MaterialCardView(context).apply {
            radius = context.dp(18).toFloat()
            cardElevation = context.dp(4).toFloat()
            setCardBackgroundColor(CARD)
            addView(inner)
        }
        addView(cardView, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(topGap) })
        return cardView
    }

    fun LinearLayout.heading(text: String): TextView =
        addText(text, 22f, TEXT, Typeface.BOLD, 0)

    fun LinearLayout.cardTitle(text: String): TextView =
        addText(text, 16f, TEXT, Typeface.BOLD, 0)

    fun LinearLayout.body(text: String, color: Int = MUTED, topGap: Int = 6): TextView =
        addText(text, 14f, color, Typeface.NORMAL, topGap)

    private fun LinearLayout.addText(text: String, sizeSp: Float, color: Int, style: Int, topGap: Int): TextView {
        val tv = TextView(context).apply {
            this.text = text
            textSize = sizeSp
            setTextColor(color)
            setTypeface(typeface, style)
        }
        addView(tv, LinearLayout.LayoutParams(MATCH, WRAP).apply { topMargin = context.dp(topGap) })
        return tv
    }

    /** A filled brand-coloured button. */
    fun LinearLayout.primaryButton(text: String, onClick: () -> Unit): MaterialButton {
        val b = MaterialButton(context).apply {
            this.text = text
            isAllCaps = false
            textSize = 15f
            cornerRadius = context.dp(14)
            setOnClickListener { onClick() }
        }
        addView(b, LinearLayout.LayoutParams(MATCH, context.dp(52)).apply { topMargin = context.dp(16) })
        return b
    }

    /** An outlined secondary button. */
    fun LinearLayout.ghostButton(text: String, onClick: () -> Unit): MaterialButton {
        val b = MaterialButton(
            context, null, com.google.android.material.R.attr.materialButtonOutlinedStyle
        ).apply {
            this.text = text
            isAllCaps = false
            textSize = 15f
            cornerRadius = context.dp(14)
            setOnClickListener { onClick() }
        }
        addView(b, LinearLayout.LayoutParams(MATCH, context.dp(52)).apply { topMargin = context.dp(10) })
        return b
    }

    /** A circular badge whose fill colour can be changed later via [setCircleColor]. */
    fun circleBadge(context: Context): TextView = TextView(context).apply {
        gravity = Gravity.CENTER
        textSize = 36f
        background = GradientDrawable().apply { shape = GradientDrawable.OVAL }
    }

    fun TextView.setCircleColor(color: Int) {
        (background as GradientDrawable).setColor(color)
    }
}
