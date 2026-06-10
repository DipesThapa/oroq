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
import uk.co.cyberheroez.oroq.ui.components.FilterChips
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Deck panel 13. Local, derived from synced events — push lands in sub-project 3. */
@Composable
fun NotificationsScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    var filter by remember { mutableStateOf("All") }
    val day = state.lastRefresh - 86_400_000L
    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
        .sortedByDescending { it.ts }
        .filter {
            when (filter) {
                "Unread" -> it.ts >= day
                "Important" -> it.cat in setOf("phishing", "malware")
                else -> true
            }
        }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Notifications", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        FilterChips(listOf("All", "Unread", "Important"), filter) { filter = it }
        Spacer(Modifier.height(8.dp))
        if (events.isEmpty()) Text("Nothing here yet.", style = OroqType.Body)
        LazyColumn { items(events) { e -> ActivityRow(e.cat, e.type, e.label, e.ts) } }
    }
}
