package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun PrimaryButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusButton))
            .background(if (enabled) OroqColors.BluePrimary else OroqColors.BgSurface2)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
    }
}

@Composable
fun SecondaryLink(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        text,
        style = OroqType.Body.copy(color = OroqColors.BlueAccent, fontWeight = FontWeight.Medium),
        modifier = modifier.clickable(onClick = onClick).padding(8.dp),
    )
}
