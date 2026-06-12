package uk.co.cyberheroez.oroq.ui.child

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

class ChildActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val nav = rememberNavController()
            Box(
                Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding(),
            ) {
                NavHost(nav, startDestination = "logo") {
                    composable("logo") { ChildLogoScreen(nav) }
                    composable("setup") { SetupScreen(nav) }
                    composable("pair") { PairScreen(nav) }
                    composable("scan") { ScanScreen(nav) }
                    composable("allow") { AllowProtectionScreen(nav) }
                    composable("allset") { AllSetScreen(nav) }
                    composable("childhome") { ChildHomeScreen() }
                }
            }
        }
    }
}
