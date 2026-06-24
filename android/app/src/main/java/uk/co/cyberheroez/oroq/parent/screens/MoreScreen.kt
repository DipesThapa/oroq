package uk.co.cyberheroez.oroq.parent.screens

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentLoginActivity
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** The deck leaves "More" undefined; spec decision: timeline, notifications,
 *  children, settings, about, sign out. */
@Composable
fun MoreScreen(vm: ParentViewModel, nav: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var confirmDelete by remember { mutableStateOf(false) }

    fun toLogin() {
        context.startActivity(
            Intent(context, ParentLoginActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
        )
    }

    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("More", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        OroqCard {
            SecondaryLink("Refresh now") { vm.refresh() }
            SecondaryLink("Timeline") { nav.navigate("timeline") }
            SecondaryLink("Notifications") { nav.navigate("notifications") }
            SecondaryLink("Add a child device") { nav.navigate("addchild") }
        }
        Spacer(Modifier.height(12.dp))
        OroqCard {
            Text("OroQ", style = OroqType.BodyOnDark)
            Text("See Risk. Act With Confidence.", style = OroqType.Caption)
            SecondaryLink("Sign out") {
                scope.launch {
                    FamilyStore(context).clearParentToken()
                    toLogin()
                }
            }
            SecondaryLink("Delete account") { confirmDelete = true }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Delete your OroQ account?", style = OroqType.H3) },
            text = {
                Text(
                    "This permanently deletes your account, every paired device, and all " +
                        "their data from OroQ. Child devices stop being monitored. This can't be undone.",
                    style = OroqType.Body,
                )
            },
            confirmButton = {
                Text(
                    "Delete account",
                    style = OroqType.BodyOnDark.copy(color = OroqColors.Danger, fontWeight = FontWeight.SemiBold),
                    modifier = Modifier
                        .clickable {
                            confirmDelete = false
                            vm.deleteAccount { toLogin() }
                        }
                        .padding(8.dp),
                )
            },
            dismissButton = {
                Text(
                    "Cancel",
                    style = OroqType.Body.copy(color = OroqColors.BlueAccent),
                    modifier = Modifier.clickable { confirmDelete = false }.padding(8.dp),
                )
            },
            containerColor = OroqColors.BgSurface,
        )
    }
}
