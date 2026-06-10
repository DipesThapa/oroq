package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.ToggleRow
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

private fun formatMinutes(m: Int): String = if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"

@Composable
fun DeviceDetailScreen(vm: ParentViewModel, pairingId: String, nav: NavController) {
    val state by vm.state.collectAsState()
    val snap = state.snapshots.firstOrNull { it.pairingId == pairingId }
    if (snap == null) {
        Column(Modifier.fillMaxSize().padding(OroqDimens.PadScreen)) {
            SecondaryLink("‹ Back") { nav.popBackStack() }
            Text("Device not found.", style = OroqType.Body)
        }
        return
    }
    val summary = snap.summary
    // Optimistic local toggle state, reconciled on every refresh.
    var protection by remember(summary) { mutableStateOf(summary?.protectionOn == true) }
    var webFiltering by remember(summary) { mutableStateOf(summary?.categories?.isNotEmpty() == true) }
    var safeSearch by remember(summary) { mutableStateOf(summary?.safeSearchOn == true) }
    var ytRestricted by remember(summary) { mutableStateOf(summary?.ytRestrictedOn == true) }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState())
            .padding(horizontal = OroqDimens.PadScreen),
    ) {
        SecondaryLink("‹ Back") { nav.popBackStack() }
        Text(snap.label, style = OroqType.H2)
        Text(
            if (summary != null) "Active • Last seen ${relativeTime(summary.ts)}" else "No data yet — the child's phone hasn't synced.",
            style = OroqType.Caption,
        )
        Spacer(Modifier.height(16.dp))

        OroqCard {
            Text("PROTECTION", style = OroqType.Caption)
            Spacer(Modifier.height(6.dp))
            ToggleRow("AI Protection", protection) { on ->
                protection = on
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_PROTECTION, intValue = if (on) 1 else 0))
            }
            ToggleRow("Web Filtering", webFiltering) { on ->
                webFiltering = on
                // Off = clear categories; on = restore the app's default set.
                vm.send(
                    pairingId,
                    FamilyCommand(
                        FamilyCommand.SET_CATEGORIES,
                        stringValue = if (on) Categories.DEFAULT_ENABLED.joinToString(",") else "",
                    ),
                )
            }
            ToggleRow("Safe Search", safeSearch) { on ->
                safeSearch = on
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_SAFE_SEARCH, intValue = if (on) 1 else 0))
            }
            ToggleRow("YouTube Restricted", ytRestricted) { on ->
                ytRestricted = on
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_YT_RESTRICTED, intValue = if (on) 1 else 0))
            }
        }

        if (summary != null) {
            Spacer(Modifier.height(12.dp))
            ScreenTimeCard(vm, pairingId, summary)
            Spacer(Modifier.height(12.dp))
            CategoryEditor(vm, pairingId, summary.categories)
            Spacer(Modifier.height(12.dp))
            BlockedAppsEditor(vm, pairingId, summary)
        }
        Spacer(Modifier.height(16.dp))
    }
}

/** Remote control card — grant time + daily limit (ported from the old dashboard). */
@Composable
private fun ScreenTimeCard(vm: ParentViewModel, pairingId: String, summary: FamilySummary) {
    var limitText by remember { mutableStateOf("") }
    OroqCard {
        Text("SCREEN TIME", style = OroqType.Caption)
        Spacer(Modifier.height(6.dp))
        Text(formatMinutes(summary.screenTimeTodayMin), style = OroqType.MetricSmall)
        Text(
            if (summary.dailyLimitMin > 0) "of ${formatMinutes(summary.dailyLimitMin)} daily limit"
            else "No daily limit set",
            style = OroqType.Caption,
        )
        for (app in summary.topApps) {
            Text("${app.label} — ${formatMinutes(app.minutes)}", style = OroqType.Body)
        }
        Spacer(Modifier.height(10.dp))
        PrimaryButton("Grant 30 minutes") {
            vm.send(pairingId, FamilyCommand(FamilyCommand.GRANT_EXTRA_TIME, intValue = 30))
        }
        Spacer(Modifier.height(8.dp))
        Row {
            OutlinedTextField(
                value = limitText,
                onValueChange = { limitText = it.filter { c -> c.isDigit() } },
                placeholder = { Text("Daily limit (minutes, 0 = none)", style = OroqType.Body) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = OroqColors.BluePrimary,
                    unfocusedBorderColor = OroqColors.Border,
                    focusedTextColor = OroqColors.TextPrimary,
                    unfocusedTextColor = OroqColors.TextPrimary,
                ),
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(8.dp))
        PrimaryButton("Set daily limit", enabled = limitText.isNotEmpty()) {
            vm.send(
                pairingId,
                FamilyCommand(FamilyCommand.SET_DAILY_LIMIT, intValue = limitText.toIntOrNull() ?: 0),
            )
            limitText = ""
        }
    }
}

/** Blocked-categories editor (ported: checkboxes → toggle rows, same command). */
@Composable
private fun CategoryEditor(vm: ParentViewModel, pairingId: String, current: Set<String>) {
    var chosen by remember(current) { mutableStateOf(current) }
    OroqCard {
        Text("BLOCKED CATEGORIES", style = OroqType.Caption)
        Spacer(Modifier.height(6.dp))
        for (category in Categories.SELECTABLE) {
            ToggleRow(category.label, category.id in chosen) { on ->
                chosen = if (on) chosen + category.id else chosen - category.id
            }
        }
        Spacer(Modifier.height(10.dp))
        PrimaryButton("Save categories", enabled = chosen != current) {
            vm.send(pairingId, FamilyCommand(FamilyCommand.SET_CATEGORIES, stringValue = chosen.joinToString(",")))
        }
    }
}

/** Blocked-apps editor (ported: waiting state + toggles, same command). */
@Composable
private fun BlockedAppsEditor(vm: ParentViewModel, pairingId: String, summary: FamilySummary) {
    var chosen by remember(summary.blockedApps) { mutableStateOf(summary.blockedApps) }
    OroqCard {
        Text("BLOCKED APPS", style = OroqType.Caption)
        Spacer(Modifier.height(6.dp))
        if (summary.installedApps.isEmpty()) {
            Text("Waiting for the child phone to sync its app list…", style = OroqType.Body)
        } else {
            for (app in summary.installedApps) {
                ToggleRow(app.label, app.packageName in chosen) { on ->
                    chosen = if (on) chosen + app.packageName else chosen - app.packageName
                }
            }
            Spacer(Modifier.height(10.dp))
            PrimaryButton("Save blocked apps", enabled = chosen != summary.blockedApps) {
                vm.send(pairingId, FamilyCommand(FamilyCommand.SET_BLOCKED_APPS, stringValue = chosen.joinToString(",")))
            }
        }
    }
}
