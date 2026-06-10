package uk.co.cyberheroez.oroq.ui.child

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqType

/** Placeholder until the CameraX + ZXing scanner lands (next task). */
@Composable
fun ScanScreen(nav: NavController) = ChildScaffold {
    Text("Scan QR code", style = OroqType.H2)
    Spacer(Modifier.height(12.dp))
    Text("Scanner coming in the next build — enter the code manually for now.", style = OroqType.Body)
    SecondaryLink("Cancel") { nav.popBackStack() }
}
