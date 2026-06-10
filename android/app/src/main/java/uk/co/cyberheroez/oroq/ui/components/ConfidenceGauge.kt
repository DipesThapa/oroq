package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.parent.ConfidenceScore
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/**
 * Deck panel 06: circular gauge, track white-8%, sweep starts at 135°, round
 * caps, 800ms ease-out on first composition. Color follows the deck thresholds.
 */
@Composable
fun ConfidenceGauge(score: Int, size: Dp = 140.dp) {
    val color = when {
        score >= 80 -> OroqColors.BluePrimary
        score >= 60 -> OroqColors.Warning
        else -> OroqColors.Danger
    }
    var target by remember { mutableFloatStateOf(0f) }
    val sweep by animateFloatAsState(target, tween(800), label = "gauge")
    LaunchedEffect(score) { target = score / 100f }

    Box(Modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val stroke = this.size.minDimension * 0.085f
            val inset = stroke / 2
            val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
            val topLeft = Offset(inset, inset)
            drawArc(
                OroqColors.Track, startAngle = 135f, sweepAngle = 270f, useCenter = false,
                topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round),
            )
            drawArc(
                color, startAngle = 135f, sweepAngle = 270f * sweep, useCenter = false,
                topLeft = topLeft, size = arcSize, style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontSize = 34.sp)) { append("$score") }
                    withStyle(SpanStyle(fontSize = 13.sp, color = OroqColors.TextSecondary)) { append("/100") }
                },
                style = OroqType.Metric,
            )
            Text(ConfidenceScore.statusWord(score), style = OroqType.Caption.copy(color = color))
        }
    }
}
