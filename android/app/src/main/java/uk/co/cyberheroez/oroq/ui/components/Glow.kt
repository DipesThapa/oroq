package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

/** Wraps [content] with a soft radial blue glow rising from bottom-centre (deck §0.1). */
@Composable
fun GlowBox(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    Box(
        modifier.drawBehind {
            drawRect(
                Brush.radialGradient(
                    colors = listOf(
                        OroqColors.BluePrimary.copy(alpha = 0.30f),
                        OroqColors.BluePrimary.copy(alpha = 0f),
                    ),
                    center = Offset(size.width / 2f, size.height),
                    radius = size.width * 0.75f,
                ),
            )
        },
        content = content,
    )
}
