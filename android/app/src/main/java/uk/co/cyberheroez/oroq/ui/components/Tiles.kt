package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Dark card: surface bg, 1px white-8% border, 16dp radius — no shadows (deck §0.3). */
@Composable
fun OroqCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OroqDimens.RadiusCard))
            .background(OroqColors.BgSurface)
            .border(BorderStroke(1.dp, OroqColors.Border), RoundedCornerShape(OroqDimens.RadiusCard))
            .padding(OroqDimens.PadCard),
        content = content,
    )
}

@Composable
fun StatTile(
    label: String,
    value: String,
    meta: String,
    metaColor: Color = OroqColors.TextSecondary,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier
            .clip(RoundedCornerShape(OroqDimens.RadiusTile))
            .background(OroqColors.BgSurface2)
            .padding(12.dp),
    ) {
        Text(value, style = OroqType.MetricSmall)
        Spacer(Modifier.height(2.dp))
        Text(label, style = OroqType.Caption)
        Text(meta, style = OroqType.Caption.copy(color = metaColor))
    }
}

@Composable
fun FilterChips(options: List<String>, active: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (option in options) {
            val isActive = option == active
            Text(
                option,
                style = OroqType.Caption.copy(
                    color = if (isActive) Color.White else OroqColors.TextSecondary,
                    letterSpacing = 0.2.sp,
                ),
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (isActive) OroqColors.BluePrimary else OroqColors.BgSurface2)
                    .clickable { onSelect(option) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            )
        }
    }
}

@Composable
fun ToggleRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = OroqType.BodyOnDark, modifier = Modifier.weight(1f))
        Switch(
            checked = checked, onCheckedChange = onChange, enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedTrackColor = OroqColors.BluePrimary,
                uncheckedTrackColor = OroqColors.BgSurface2,
            ),
        )
    }
}
