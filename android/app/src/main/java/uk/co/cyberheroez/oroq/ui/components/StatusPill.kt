package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** One pill shape for every status/severity/category tag: 999dp, 14% fill, full-opacity text. */
@Composable
fun StatusPill(label: String, color: Color, modifier: Modifier = Modifier) {
    Text(
        label,
        style = OroqType.Caption.copy(color = color, fontWeight = FontWeight.SemiBold),
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(OroqColors.pill(color))
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
}
