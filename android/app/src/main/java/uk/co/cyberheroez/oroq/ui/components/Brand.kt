package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/**
 * The OroQ mark — the real brand art (mist ring + blue compass needle, tail
 * breaking out bottom-right), rendered straight from
 * `res/drawable-nodpi/oroq_q.png` so it's pixel-faithful at every size rather
 * than an approximation.
 */
@Composable
fun QSymbol(size: Dp) {
    Image(
        painter = painterResource(R.drawable.oroq_q),
        contentDescription = null,
        modifier = Modifier.size(size),
    )
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
