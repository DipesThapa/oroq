package uk.co.cyberheroez.oroq.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqType

enum class ParentTab(val label: String, val glyph: String) {
    HOME("Home", "⌂"),
    ACTIVITY("Activity", "≋"),
    DEVICES("Devices", "▢"),
    INSIGHTS("Insights", "◔"),
    MORE("More", "⋯"),
}

/** Deck: 5 tabs everywhere (panel 08's 4-tab bar is a deck defect). */
@Composable
fun BottomNav(active: ParentTab, onSelect: (ParentTab) -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(OroqColors.BgPrimary).padding(top = 8.dp, bottom = 14.dp),
        horizontalArrangement = Arrangement.SpaceAround,
    ) {
        for (tab in ParentTab.entries) {
            val color = if (tab == active) OroqColors.BluePrimary else OroqColors.TextSecondary
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.clickable { onSelect(tab) }.padding(horizontal = 10.dp),
            ) {
                Text(tab.glyph, style = OroqType.BodyOnDark.copy(color = color))
                Text(tab.label, style = OroqType.Caption.copy(color = color, fontWeight = FontWeight.Medium))
            }
        }
    }
}
