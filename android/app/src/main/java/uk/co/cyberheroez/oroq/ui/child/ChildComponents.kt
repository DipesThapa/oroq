package uk.co.cyberheroez.oroq.ui.child

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** A check tick scaled to the current canvas (used by several child visuals). */
private fun DrawScope.drawCheck(color: Color, widthFactor: Float = 0.14f) {
    val w = size.width
    val h = size.height
    val path = Path().apply {
        moveTo(w * 0.22f, h * 0.52f)
        lineTo(w * 0.42f, h * 0.72f)
        lineTo(w * 0.78f, h * 0.30f)
    }
    drawPath(path, color, style = Stroke(w * widthFactor, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

/** Numbered (or completed) step badge for the "Set up OroQ" screen. */
@Composable
private fun StepBadge(number: Int, done: Boolean) {
    Box(
        Modifier
            .size(28.dp)
            .clip(CircleShape)
            .border(1.5.dp, Color.White.copy(alpha = 0.30f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (done) {
            // Same outlined badge as the numbered steps, with a tick in place of
            // the number (deck §05: the final step is a check, not a filled pill).
            Canvas(Modifier.size(13.dp)) { drawCheck(OroqColors.TextSecondary, widthFactor = 0.18f) }
        } else {
            Text(
                "$number",
                style = OroqType.Caption.copy(color = OroqColors.TextSecondary, fontWeight = FontWeight.SemiBold),
            )
        }
    }
}

/** One entry in the "Set up OroQ" checklist. */
data class SetupStep(val number: Int, val title: String, val body: String, val done: Boolean = false)

/**
 * Vertical stepper for "Set up OroQ": numbered/done badges joined by a thin
 * connector line, each with a title + supporting copy (deck §05 layout).
 */
@Composable
fun SetupStepper(steps: List<SetupStep>) {
    Column(Modifier.fillMaxWidth()) {
        steps.forEachIndexed { i, step ->
            val last = i == steps.lastIndex
            // IntrinsicSize.Min binds the row height to the copy block, so the
            // badge column's fillMaxHeight + weighted connector spans exactly the
            // gap to the next badge instead of stretching to the screen bottom.
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
                // Badge column: the connector fills whatever height the copy needs,
                // so the line always meets the next badge regardless of text length.
                Column(
                    Modifier.width(28.dp).fillMaxHeight(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    StepBadge(step.number, step.done)
                    if (!last) {
                        Box(
                            Modifier
                                .padding(vertical = 4.dp)
                                .width(2.dp)
                                .weight(1f)
                                .background(Color.White.copy(alpha = 0.14f)),
                        )
                    }
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.padding(bottom = if (last) 0.dp else 22.dp)) {
                    Text(step.title, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                    Spacer(Modifier.height(3.dp))
                    Text(step.body, style = OroqType.Caption)
                }
            }
        }
    }
}

/** Filled blue shield with a white tick on a soft disc — "Allow protection" hero. */
@Composable
fun ShieldGraphic(size: Dp = 96.dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        // soft halo disc
        drawCircle(OroqColors.BluePrimary.copy(alpha = 0.12f), radius = w * 0.5f)
        // shield body
        val shield = Path().apply {
            moveTo(w * 0.5f, h * 0.20f)
            lineTo(w * 0.74f, h * 0.30f)
            lineTo(w * 0.74f, h * 0.52f)
            cubicTo(w * 0.74f, h * 0.70f, w * 0.62f, h * 0.78f, w * 0.5f, h * 0.82f)
            cubicTo(w * 0.38f, h * 0.78f, w * 0.26f, h * 0.70f, w * 0.26f, h * 0.52f)
            lineTo(w * 0.26f, h * 0.30f)
            close()
        }
        drawPath(shield, OroqColors.BluePrimary)
        // white tick
        val tick = Path().apply {
            moveTo(w * 0.41f, h * 0.50f)
            lineTo(w * 0.48f, h * 0.58f)
            lineTo(w * 0.61f, h * 0.40f)
        }
        drawPath(tick, Color.White, style = Stroke(w * 0.05f, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** Thin green ring around a green tick — the "All set!" success mark. */
@Composable
fun SuccessCheck(size: Dp = 96.dp) {
    Canvas(Modifier.size(size)) {
        val w = this.size.width
        drawCircle(OroqColors.Success, radius = w * 0.46f, style = Stroke(w * 0.035f))
        val tick = Path().apply {
            moveTo(w * 0.33f, w * 0.52f)
            lineTo(w * 0.45f, w * 0.64f)
            lineTo(w * 0.68f, w * 0.38f)
        }
        drawPath(tick, OroqColors.Success, style = Stroke(w * 0.05f, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}

/** Circle-check bullet + label, for the "Allow protection" capability list. */
@Composable
fun CheckRow(text: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(24.dp).clip(CircleShape).background(OroqColors.Success.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center,
        ) {
            Canvas(Modifier.size(13.dp)) { drawCheck(OroqColors.Success, widthFactor = 0.18f) }
        }
        Spacer(Modifier.width(12.dp))
        Text(text, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.Medium))
    }
}

/** Minimal QR glyph for the pair-code field's "scan" affordance. */
fun DrawScope.drawQrGlyph(color: Color) {
    val w = size.width
    val u = w / 5f
    drawRoundRect(
        color,
        cornerRadius = CornerRadius(w * 0.12f),
        style = Stroke(w * 0.08f),
    )
    val sq = Size(u * 1.25f, u * 1.25f)
    drawRect(color, topLeft = Offset(u * 0.85f, u * 0.85f), size = sq)
    drawRect(color, topLeft = Offset(w - u * 2.1f, u * 0.85f), size = sq)
    drawRect(color, topLeft = Offset(u * 0.85f, w - u * 2.1f), size = sq)
}
