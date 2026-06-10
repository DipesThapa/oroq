package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentUiState
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.ActivityRow
import uk.co.cyberheroez.oroq.ui.components.ConfidenceGauge
import uk.co.cyberheroez.oroq.ui.components.GlowBox
import uk.co.cyberheroez.oroq.ui.components.OnboardingCard
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.OroqWordmark
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.Skeleton
import uk.co.cyberheroez.oroq.ui.components.StatTile
import uk.co.cyberheroez.oroq.ui.components.WhatYouWillSeeCard
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.motion.staggeredEntrance
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(vm: ParentViewModel, nav: NavController) {
    val state by vm.state.collectAsState()
    PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = { vm.refresh() }) {
        HomeContent(
            state = state,
            onAddChild = { nav.navigate("addchild") },
            onViewAll = { nav.navigate("activity") },
            onBell = { nav.navigate("notifications") },
        )
    }
}

@Composable
fun HomeContent(
    state: ParentUiState,
    onAddChild: () -> Unit,
    onViewAll: () -> Unit,
    onBell: () -> Unit,
) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        // Top bar: wordmark left, bell right (red dot = any event in the last day).
        Row(
            Modifier.fillMaxWidth().padding(vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OroqWordmark()
            Spacer(Modifier.weight(1f))
            Box(Modifier.clickable(onClick = onBell)) {
                Text("🔔", style = OroqType.BodyOnDark)
                val hasRecent = state.snapshots.any { snap ->
                    snap.summary?.recentEvents?.any { state.lastRefresh - it.ts < 86_400_000L } == true
                }
                if (hasRecent) {
                    Box(
                        Modifier.align(Alignment.TopEnd).size(7.dp).clip(CircleShape)
                            .background(OroqColors.Danger),
                    )
                }
            }
        }

        when {
            state.refreshing && state.lastRefresh == 0L -> {
                Spacer(Modifier.height(OroqDimens.ScreenTop))
                Skeleton(height = 150.dp)
                Spacer(Modifier.height(OroqDimens.SectionGap))
                Skeleton(height = 90.dp)
            }

            state.snapshots.isEmpty() -> {
                Spacer(Modifier.height(OroqDimens.ScreenTop))
                OnboardingCard(onAddChild)
                Spacer(Modifier.height(OroqDimens.SectionGap))
                WhatYouWillSeeCard()
            }

            else -> {
                val stats = state.stats
                GlowBox(Modifier.staggeredEntrance(0)) {
                    OroqCard {
                        Text("CYBER CONFIDENCE", style = OroqType.Caption)
                        Spacer(Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ConfidenceGauge(score = stats.score, size = 130.dp)
                            Spacer(Modifier.width(OroqDimens.GapGrid))
                            Column(
                                Modifier.weight(1f),
                                verticalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid),
                            ) {
                                Row(horizontalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
                                    StatTile("Threats Blocked", "${stats.threatsBlockedWeek}", "This week", modifier = Modifier.weight(1f))
                                    StatTile("Unsafe Domains", "${stats.unsafeDomainsWeek}", "This week", modifier = Modifier.weight(1f))
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(OroqDimens.GapGrid)) {
                                    StatTile(
                                        "Devices Protected", "${stats.devicesProtected}",
                                        if (stats.devicesProtected == stats.deviceCount && stats.deviceCount > 0) "All secure" else "of ${stats.deviceCount}",
                                        metaColor = OroqColors.Success, modifier = Modifier.weight(1f),
                                    )
                                    StatTile("Uptime", "${stats.uptimePercent}%", "This week", modifier = Modifier.weight(1f))
                                }
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text(
                            if (state.refreshing) "Refreshing…" else "Updated ${relativeTime(state.lastRefresh)}",
                            style = OroqType.Caption,
                        )
                    }
                }

                Spacer(Modifier.height(12.dp))

                OroqCard(Modifier.staggeredEntrance(1)) {
                    Row {
                        Text("Recent Activity", style = OroqType.BodyOnDark.copy(fontWeight = FontWeight.SemiBold))
                        Spacer(Modifier.weight(1f))
                        SecondaryLink("View all", onClick = onViewAll)
                    }
                    val events = state.snapshots.flatMap { it.summary?.recentEvents ?: emptyList() }
                        .sortedByDescending { it.ts }.take(3)
                    if (events.isEmpty()) {
                        Text("No activity yet — you're all set.", style = OroqType.Body)
                    } else {
                        for (e in events) ActivityRow(e.cat, e.type, e.label, e.ts)
                    }
                }
            }
        }
        Spacer(Modifier.height(16.dp))
    }
}
