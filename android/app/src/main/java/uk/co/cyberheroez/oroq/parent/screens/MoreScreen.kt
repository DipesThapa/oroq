package uk.co.cyberheroez.oroq.parent.screens

import android.content.Intent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.parent.ParentLoginActivity
import uk.co.cyberheroez.oroq.parent.ParentViewModel
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** The deck leaves "More" undefined; spec decision: timeline, notifications,
 *  children, settings, about, sign out. */
@Composable
fun MoreScreen(vm: ParentViewModel, nav: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen)) {
        Text("More", style = OroqType.H2, modifier = Modifier.padding(vertical = 16.dp))
        OroqCard {
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
                    context.startActivity(
                        Intent(context, ParentLoginActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                    )
                }
            }
        }
    }
}
