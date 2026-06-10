package uk.co.cyberheroez.oroq.ui.motion

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

/** True unless the user has disabled animations system-wide. */
@Composable
fun animationsEnabled(): Boolean {
    val context = LocalContext.current
    return remember {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) != 0f
    }
}

/** Press-scale feedback for tappable surfaces. */
fun Modifier.pressable(interaction: MutableInteractionSource): Modifier = composed {
    val pressed by interaction.collectIsPressedAsState()
    val enabled = animationsEnabled()
    val scale by animateFloatAsState(
        if (pressed && enabled) 0.98f else 1f,
        spring(stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    this.scale(scale)
}

/** Fade + 12dp rise, staggered by [index] (first 4 only), once per first composition. */
fun Modifier.staggeredEntrance(index: Int): Modifier = composed {
    if (!animationsEnabled() || index > 3) return@composed this
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(index * 50L)
        progress.animateTo(1f, tween(260, easing = LinearOutSlowInEasing))
    }
    this
        .alpha(progress.value)
        .layout { measurable, constraints ->
            val placeable = measurable.measure(constraints)
            val dy = ((1f - progress.value) * 12.dp.toPx()).toInt()
            layout(placeable.width, placeable.height) { placeable.place(0, dy) }
        }
}
