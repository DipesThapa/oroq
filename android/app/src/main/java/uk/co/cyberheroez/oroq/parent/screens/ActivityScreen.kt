package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.ActivityRow
import uk.co.cyberheroez.oroq.ui.components.EmptyState
import uk.co.cyberheroez.oroq.ui.components.FilterChips
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

private val THREATS = setOf("phishing", "malware")
private val WARNINGS = setOf("scam", "adult", "gambling", "drugs", "violence")

@Composable
fun ActivityScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    var filter by remember { mutableStateOf("All") }
    val week = state.lastRefresh - 7 * 86_400_000L
    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
        .filter { it.ts >= week }
        .sortedByDescending { it.ts }
        .filter {
            when (filter) {
                "Threats" -> it.cat in THREATS
                "Warnings" -> it.cat in WARNINGS
                "Info" -> it.cat !in THREATS && it.cat !in WARNINGS
                else -> true
            }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Activity", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        FilterChips(listOf("All", "Threats", "Warnings", "Info"), filter) { filter = it }
        Spacer(Modifier.height(8.dp))
        // Static label: the child only syncs its most recent events, so other
        // windows would lie. Becomes a real dropdown with backend history.
        Text("Last 7 days", style = OroqType.Caption)
        if (events.isEmpty()) {
            EmptyState("Nothing blocked yet", "When OroQ blocks something, it shows up here.")
        } else {
            LazyColumn { items(events) { e -> ActivityRow(e.cat, e.type, e.label, e.ts) } }
        }
    }
}
