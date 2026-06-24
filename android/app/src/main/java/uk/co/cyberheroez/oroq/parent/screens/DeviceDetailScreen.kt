package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.config.Categories
import uk.co.cyberheroez.oroq.family.FamilyCommand
import uk.co.cyberheroez.oroq.family.FamilySummary
import uk.co.cyberheroez.oroq.family.appSchedulePayload
import uk.co.cyberheroez.oroq.monitor.Window
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.ToggleRow
import uk.co.cyberheroez.oroq.ui.components.relativeTime
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

private fun formatMinutes(m: Int): String = when {
    m >= 60 && m % 60 == 0 -> "${m / 60}h"
    m >= 60 -> "${m / 60}h ${m % 60}m"
    else -> "${m}m"
}

/** No heartbeat for this long → the child is treated as offline. */
private const val STALE_AFTER_MS = 35 * 60 * 1000L

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
            when {
                summary == null -> "No data yet — the child's phone hasn't synced."
                System.currentTimeMillis() - summary.ts > STALE_AFTER_MS -> "Offline • Last seen ${relativeTime(summary.ts)}"
                else -> "Active • Last seen ${relativeTime(summary.ts)}"
            },
            style = OroqType.Caption,
        )
        Spacer(Modifier.height(16.dp))

        if (summary != null) {
            ProtectionBanner(summary)
            if (System.currentTimeMillis() - summary.ts > STALE_AFTER_MS) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Changes you make now are saved and applied when the device reconnects.",
                    style = OroqType.Caption,
                )
            }
            Spacer(Modifier.height(12.dp))
        }

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
            AppAccessEditor(vm, pairingId, summary)
            Spacer(Modifier.height(12.dp))
            BlockedAppsEditor(vm, pairingId, summary)
        }

        Spacer(Modifier.height(20.dp))
        var confirmUnpair by remember { mutableStateOf(false) }
        SecondaryLink(
            "Remove this device",
            modifier = Modifier.align(Alignment.CenterHorizontally),
        ) { confirmUnpair = true }
        if (confirmUnpair) {
            AlertDialog(
                onDismissRequest = { confirmUnpair = false },
                title = { Text("Remove ${snap.label}?", style = OroqType.H3) },
                text = {
                    Text(
                        "This unpairs the device and deletes its data from OroQ. The child phone will need a new pairing code to reconnect.",
                        style = OroqType.Body,
                    )
                },
                confirmButton = {
                    Text(
                        "Remove",
                        style = OroqType.BodyOnDark.copy(color = OroqColors.Danger, fontWeight = FontWeight.SemiBold),
                        modifier = Modifier
                            .clickable {
                                confirmUnpair = false
                                vm.unpair(pairingId) { nav.popBackStack() }
                            }
                            .padding(8.dp),
                    )
                },
                dismissButton = {
                    Text(
                        "Cancel",
                        style = OroqType.Body.copy(color = OroqColors.BlueAccent),
                        modifier = Modifier.clickable { confirmUnpair = false }.padding(8.dp),
                    )
                },
                containerColor = OroqColors.BgSurface,
            )
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
        // topApps carries package names; resolve to friendly labels where we have them.
        val appLabels = remember(summary.installedApps) {
            summary.installedApps.associate { it.packageName to it.label }
        }
        for (app in summary.topApps) {
            Text("${appLabels[app.label] ?: app.label} — ${formatMinutes(app.minutes)}", style = OroqType.Body)
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

private fun minutesToHhmm(m: Int): String = "%02d:%02d".format(m / 60, m % 60)

private fun hhmmToMinutes(text: String): Int? {
    val parts = text.split(":")
    if (parts.size != 2) return null
    val h = parts[0].toIntOrNull() ?: return null
    val min = parts[1].toIntOrNull() ?: return null
    if (h !in 0..23 || min !in 0..59) return null
    return h * 60 + min
}

/** Top-of-screen heartbeat banner: protection active / permissions off / offline. */
@Composable
private fun ProtectionBanner(summary: FamilySummary) {
    val now = System.currentTimeMillis()
    val staleMs = now - summary.ts
    val (text, color) = when {
        staleMs > STALE_AFTER_MS -> "Protection offline — last seen ${relativeTime(summary.ts)}" to OroqColors.Danger
        !summary.permissionsOk -> "Permissions turned off on the child device" to OroqColors.Danger
        !summary.protectionOn -> "Web protection is off" to OroqColors.Danger
        else -> "Protection active" to OroqColors.Success
    }
    OroqCard {
        Text(text, style = OroqType.Body.copy(color = color, fontWeight = FontWeight.SemiBold))
    }
}

/** App approval (default-deny) + per-app schedule entry point. */
@Composable
private fun AppAccessEditor(vm: ParentViewModel, pairingId: String, summary: FamilySummary) {
    var approved by remember(summary.approvedApps) { mutableStateOf(summary.approvedApps) }
    var editingPkg by remember { mutableStateOf<String?>(null) }
    OroqCard {
        Text("APP ACCESS", style = OroqType.Caption)
        Spacer(Modifier.height(4.dp))
        Text(
            "New apps your child installs stay blocked until you approve them here.",
            style = OroqType.Caption,
        )
        Spacer(Modifier.height(6.dp))
        if (summary.installedApps.isEmpty()) {
            Text("Waiting for the child phone to sync its app list…", style = OroqType.Body)
        } else {
            for (app in summary.installedApps) {
                val isApproved = app.packageName in approved
                ToggleRow(app.label, isApproved) { on ->
                    approved = if (on) approved + app.packageName else approved - app.packageName
                }
                if (isApproved) {
                    val count = summary.schedules[app.packageName]?.size ?: 0
                    SecondaryLink(if (count > 0) "Schedule ($count)" else "Set schedule") {
                        editingPkg = app.packageName
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            PrimaryButton("Save approvals", enabled = approved != summary.approvedApps) {
                vm.send(
                    pairingId,
                    FamilyCommand(FamilyCommand.SET_APPROVED_APPS, stringValue = approved.joinToString(",")),
                )
            }
        }
    }
    editingPkg?.let { pkg ->
        ScheduleDialog(
            appLabel = summary.installedApps.firstOrNull { it.packageName == pkg }?.label ?: pkg,
            initial = summary.schedules[pkg] ?: emptyList(),
            onDismiss = { editingPkg = null },
            onSave = { windows ->
                vm.send(
                    pairingId,
                    FamilyCommand(FamilyCommand.SET_APP_SCHEDULE, stringValue = appSchedulePayload(pkg, windows)),
                )
                editingPkg = null
            },
        )
    }
}

/** Edits one app's list of blocked-time windows. */
@Composable
private fun ScheduleDialog(
    appLabel: String,
    initial: List<Window>,
    onDismiss: () -> Unit,
    onSave: (List<Window>) -> Unit,
) {
    val windows = remember { mutableStateListOf<Window>().apply { addAll(initial) } }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Schedule — $appLabel", style = OroqType.H3) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text("Blocked hours. The app works outside these windows.", style = OroqType.Caption)
                Spacer(Modifier.height(8.dp))
                windows.forEachIndexed { i, w ->
                    WindowRow(
                        window = w,
                        onChange = { windows[i] = it },
                        onRemove = { windows.removeAt(i) },
                    )
                    Spacer(Modifier.height(10.dp))
                }
                SecondaryLink("+ Add window") {
                    windows.add(Window(1260, 420, java.time.DayOfWeek.values().toSet()))
                }
            }
        },
        confirmButton = {
            Text(
                "Save",
                style = OroqType.BodyOnDark.copy(color = OroqColors.BlueAccent, fontWeight = FontWeight.SemiBold),
                modifier = Modifier.clickable { onSave(windows.toList()) }.padding(8.dp),
            )
        },
        dismissButton = {
            Text(
                "Cancel",
                style = OroqType.Body.copy(color = OroqColors.TextSecondary),
                modifier = Modifier.clickable(onClick = onDismiss).padding(8.dp),
            )
        },
        containerColor = OroqColors.BgSurface,
    )
}

@Composable
private fun WindowRow(window: Window, onChange: (Window) -> Unit, onRemove: () -> Unit) {
    var startText by remember { mutableStateOf(minutesToHhmm(window.startMinute)) }
    var endText by remember { mutableStateOf(minutesToHhmm(window.endMinute)) }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TimeField(startText, "From") {
                startText = it
                hhmmToMinutes(it)?.let { m -> onChange(window.copy(startMinute = m)) }
            }
            Spacer(Modifier.width(8.dp))
            TimeField(endText, "To") {
                endText = it
                hhmmToMinutes(it)?.let { m -> onChange(window.copy(endMinute = m)) }
            }
            Spacer(Modifier.width(8.dp))
            SecondaryLink("Remove") { onRemove() }
        }
        Spacer(Modifier.height(6.dp))
        Row {
            for (d in java.time.DayOfWeek.values()) {
                val on = d in window.days
                DayChip(d.name.take(1), on) {
                    val days = if (on) window.days - d else window.days + d
                    onChange(window.copy(days = days))
                }
                Spacer(Modifier.width(4.dp))
            }
        }
    }
}

@Composable
private fun TimeField(value: String, label: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label, style = OroqType.Caption) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = Modifier.width(104.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = OroqColors.BluePrimary,
            unfocusedBorderColor = OroqColors.Border,
            focusedTextColor = OroqColors.TextPrimary,
            unfocusedTextColor = OroqColors.TextPrimary,
        ),
    )
}

@Composable
private fun DayChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        style = OroqType.Caption.copy(
            color = if (selected) OroqColors.TextPrimary else OroqColors.TextSecondary,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
        ),
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (selected) OroqColors.BluePrimary else OroqColors.BgSurface2)
            .clickable(onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    )
}
