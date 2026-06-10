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
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ConfidenceScore
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.DeviceRow
import uk.co.cyberheroez.oroq.ui.components.EmptyState
import uk.co.cyberheroez.oroq.ui.components.FilterChips
import uk.co.cyberheroez.oroq.ui.components.OnboardingCard
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@Composable
fun DevicesScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    // The chip labels carry live counts, so track the selected *prefix* and
    // resolve the active label per composition.
    var filterPrefix by remember { mutableStateOf("All") }
    val snaps = state.snapshots
    val active = snaps.filter { state.lastRefresh - it.fetchedAt < ConfidenceScore.FRESH_MS && it.summary != null }
    val shown = when (filterPrefix) {
        "Active" -> active
        "Inactive" -> snaps - active.toSet()
        else -> snaps
    }
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("Devices", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        val options = listOf("All (${snaps.size})", "Active (${active.size})", "Inactive (${snaps.size - active.size})")
        FilterChips(
            options,
            active = options.first { it.startsWith(filterPrefix) },
        ) { filterPrefix = it.substringBefore(" (") }
        Spacer(Modifier.height(8.dp))
        Column(Modifier.weight(1f)) {
            if (snaps.isEmpty()) {
                Spacer(Modifier.height(OroqDimens.ScreenTop))
                OnboardingCard(onAddChild = { nav.navigate("addchild") })
            } else if (shown.isEmpty()) {
                EmptyState("No devices in this filter", "Switch the filter above to see your other devices.")
            } else {
                LazyColumn {
                    items(shown) { snap ->
                        val fresh = snap.summary != null
                        DeviceRow(
                            name = snap.label,
                            statusLine = if (fresh) "Active • Last seen ${relativeTime(snap.summary!!.ts)}" else "No data yet",
                            isProtected = snap.summary?.protectionOn == true,
                        ) { nav.navigate("device/${snap.pairingId}") }
                    }
                }
            }
        }
        if (snaps.isNotEmpty()) {
            PrimaryButton("Add a child device") { nav.navigate("addchild") }
        }
        Spacer(Modifier.height(12.dp))
    }
}
