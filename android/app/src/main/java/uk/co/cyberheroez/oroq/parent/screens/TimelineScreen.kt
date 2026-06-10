package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.TimelineGroup
import uk.co.cyberheroez.oroq.ui.components.categoryColor
import uk.co.cyberheroez.oroq.ui.components.categoryTitle
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun TimelineScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    val fmt = SimpleDateFormat("EEE d MMM", Locale.UK)
    val now = state.lastRefresh
    val groups = state.snapshots.flatMap { snap ->
        (snap.summary?.recentEvents ?: emptyList()).map { snap.label to it }
    }.sortedByDescending { it.second.ts }
        .groupBy { (_, e) ->
            when ((now - e.ts) / 86_400_000L) {
                0L -> "Today"
                1L -> "Yesterday"
                else -> fmt.format(Date(e.ts))
            }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Timeline", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        if (groups.isEmpty()) Text("No events yet.", style = OroqType.Body)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            items(groups.entries.toList()) { (day, entries) ->
                TimelineGroup(
                    day,
                    entries.map { (label, e) ->
                        Triple(
                            categoryTitle(e.cat, e.type),
                            "$label • ${e.label} • ${relativeTime(e.ts)}",
                            categoryColor(e.cat),
                        )
                    },
                )
            }
        }
    }
}
