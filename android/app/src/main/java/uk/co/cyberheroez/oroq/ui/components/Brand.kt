package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** The Q mark: white ring with the blue needle tail breaking out bottom-right (deck §1). */
@Composable
fun QSymbol(size: Dp, ring: Color = Color.White) {
    Canvas(Modifier.size(size)) {
        val stroke = this.size.minDimension * 0.12f
        val r = this.size.minDimension / 2 - stroke
        drawCircle(color = ring, radius = r, style = Stroke(stroke))
        val c = center
        val edge = Offset(c.x + r * 0.707f, c.y + r * 0.707f)
        val tip = Offset(c.x + r * 1.45f, c.y + r * 1.45f)
        drawLine(
            brush = OroqColors.QTail, start = edge, end = tip,
            strokeWidth = stroke * 1.1f, cap = StrokeCap.Round,
        )
    }
}

/** Wordmark `OROQ` — all-caps, tracked-out; prose copy uses "OroQ" (deck defect fix). */
@Composable
fun OroqWordmark(fontSize: TextUnit = 16.sp) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            "OROQ",
            style = OroqType.H2.copy(fontSize = fontSize, fontWeight = FontWeight.Bold, letterSpacing = 2.sp),
        )
    }
}
