package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.RecommendationCard
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Deck panel 11 — each Enable pushes the real command to every child. */
@Composable
fun RecommendationsScreen(vm: ParentViewModel) {
    val state by vm.state.collectAsState()
    val snaps = state.snapshots
    val allSafeSearch = snaps.isNotEmpty() && snaps.all { it.summary?.safeSearchOn == true }
    val allAdult = snaps.isNotEmpty() && snaps.all { it.summary?.categories?.contains("adult") == true }
    val allYt = snaps.isNotEmpty() && snaps.all { it.summary?.ytRestrictedOn == true }
    Column(
        Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Recommended for you", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        RecommendationCard("Enable Safe Search", "Helps filter explicit content", allSafeSearch) {
            vm.send(null, FamilyCommand(FamilyCommand.SET_SAFE_SEARCH, intValue = 1))
        }
        RecommendationCard("Block Adult Content", "Restrict access to adult websites", allAdult) {
            for (snap in snaps) {
                val cats = (snap.summary?.categories ?: emptySet()) + "adult"
                vm.send(snap.pairingId, FamilyCommand(FamilyCommand.SET_CATEGORIES, stringValue = cats.joinToString(",")))
            }
        }
        RecommendationCard("Enable YouTube Restricted Mode", "Additional protection for videos", allYt) {
            vm.send(null, FamilyCommand(FamilyCommand.SET_YT_RESTRICTED, intValue = 1))
        }
    }
}
