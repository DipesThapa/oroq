package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.categoryColor
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun InsightsScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    val week = state.lastRefresh - 7 * 86_400_000L
    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }.filter { it.ts >= week }
    val webThreats = events.filter { it.type == "web" && it.cat != null }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        Text("Insights", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        Text("This week", style = OroqType.Caption)
        Spacer(Modifier.height(8.dp))
        OroqCard {
            Text("OroQ blocked", style = OroqType.Body)
            Text("${events.size}", style = OroqType.Metric)
            Text("potential threats", style = OroqType.Body)
        }
        Spacer(Modifier.height(12.dp))
        // Mini-stats row (deck-illegible; explicit assumption per spec):
        // threats / warnings / devices flagged.
        Row(horizontalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
            val threats = webThreats.count { it.cat in setOf("phishing", "malware") }
            val warnings = webThreats.count { it.cat in setOf("scam", "adult", "gambling", "drugs", "violence") }
            val flagged = state.snapshots.count { s -> s.summary?.recentEvents?.any { it.ts >= week } == true }
            for ((label, n) in listOf("Threats" to threats, "Warnings" to warnings, "Flagged" to flagged)) {
                OroqCard(Modifier.weight(1f)) {
                    Text("$n", style = OroqType.MetricSmall)
                    Text(label, style = OroqType.Caption)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        OroqCard {
            Text("Top categories", style = OroqType.BodyOnDark)
            Spacer(Modifier.height(8.dp))
            val byCat = webThreats.groupingBy { it.cat!! }.eachCount().entries.sortedByDescending { it.value }
            val total = webThreats.size.coerceAtLeast(1)
            if (byCat.isEmpty()) Text("No blocked threats this week.", style = OroqType.Body)
            for ((cat, n) in byCat) {
                val frac = n.toFloat() / total
                Row(Modifier.padding(vertical = 4.dp)) {
                    Text(
                        cat.replaceFirstChar { it.uppercase() },
                        style = OroqType.Body,
                        modifier = Modifier.width(110.dp),
                    )
                    Box(
                        Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(999.dp))
                            .background(OroqColors.BgSurface2)
                            .padding(top = 0.dp),
                    ) {
                        Box(
                            Modifier.fillMaxWidth(frac).fillMaxHeight()
                                .clip(RoundedCornerShape(999.dp)).background(categoryColor(cat)),
                        )
                    }
                    Text(" ${(frac * 100).toInt()}%", style = OroqType.Caption)
                }
            }
        }
        SecondaryLink("View all recommendations") { nav.navigate("recommendations") }
        Spacer(Modifier.height(16.dp))
    }
}
