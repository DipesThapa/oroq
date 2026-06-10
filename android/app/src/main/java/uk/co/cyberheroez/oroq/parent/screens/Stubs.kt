package uk.co.cyberheroez.oroq.parent.screens

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.theme.OroqType

// Temporary placeholders — each is deleted as its real screen lands (Tasks 9–13).
@Composable fun DevicesScreen(vm: ParentViewModel, nav: NavController) { Text("devices", style = OroqType.BodyOnDark) }
@Composable fun InsightsScreen(vm: ParentViewModel, nav: NavController) { Text("insights", style = OroqType.BodyOnDark) }
@Composable fun MoreScreen(vm: ParentViewModel, nav: NavController) { Text("more", style = OroqType.BodyOnDark) }
@Composable fun DeviceDetailScreen(vm: ParentViewModel, id: String, nav: NavController) { Text("device", style = OroqType.BodyOnDark) }
@Composable fun RecommendationsScreen(vm: ParentViewModel) { Text("recs", style = OroqType.BodyOnDark) }
@Composable fun TimelineScreen(vm: ParentViewModel) { Text("timeline", style = OroqType.BodyOnDark) }
@Composable fun NotificationsScreen(vm: ParentViewModel) { Text("notifications", style = OroqType.BodyOnDark) }
@Composable fun AddChildScreen(vm: ParentViewModel, nav: NavController) { Text("addchild", style = OroqType.BodyOnDark) }
