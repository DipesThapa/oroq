package uk.co.cyberheroez.oroq.parent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import uk.co.cyberheroez.oroq.ui.motion.animationsEnabled
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import uk.co.cyberheroez.oroq.parent.screens.ActivityScreen
import uk.co.cyberheroez.oroq.parent.screens.AddChildScreen
import uk.co.cyberheroez.oroq.parent.screens.DeviceDetailScreen
import uk.co.cyberheroez.oroq.parent.screens.DevicesScreen
import uk.co.cyberheroez.oroq.parent.screens.HomeScreen
import uk.co.cyberheroez.oroq.parent.screens.InsightsScreen
import uk.co.cyberheroez.oroq.parent.screens.MoreScreen
import uk.co.cyberheroez.oroq.parent.screens.NotificationsScreen
import uk.co.cyberheroez.oroq.parent.screens.RecommendationsScreen
import uk.co.cyberheroez.oroq.parent.screens.TimelineScreen
import uk.co.cyberheroez.oroq.ui.components.BottomNav
import uk.co.cyberheroez.oroq.ui.components.ParentTab
import uk.co.cyberheroez.oroq.ui.theme.OroqColors

class ParentActivity : ComponentActivity() {
    private val viewModel: ParentViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Login gate (behaviour from the old ParentActivity): no session
        // token means the parent must sign in first.
        val hasToken = kotlinx.coroutines.runBlocking {
            uk.co.cyberheroez.oroq.family.FamilyStore(this@ParentActivity).getParentToken() != null
        }
        if (!hasToken) {
            startActivity(android.content.Intent(this, ParentLoginActivity::class.java))
            finish()
            return
        }
        // Register this parent device for instant push alerts (no-op until
        // Firebase is configured).
        uk.co.cyberheroez.oroq.push.PushRegistration.register(this)
        setContent {
            val nav = rememberNavController()
            var tab by remember { mutableStateOf(ParentTab.HOME) }
            Column(
                Modifier.fillMaxSize().background(OroqColors.BgPrimary)
                    .systemBarsPadding(),
            ) {
                val anim = animationsEnabled()
                Box(Modifier.weight(1f)) {
                    NavHost(
                        nav,
                        startDestination = "home",
                        enterTransition = { if (anim) fadeIn(tween(200)) else EnterTransition.None },
                        exitTransition = { if (anim) fadeOut(tween(200)) else ExitTransition.None },
                    ) {
                        composable("home") { HomeScreen(viewModel, nav) }
                        composable("activity") { ActivityScreen(viewModel) }
                        composable("devices") { DevicesScreen(viewModel, nav) }
                        composable("insights") { InsightsScreen(viewModel, nav) }
                        composable("more") { MoreScreen(viewModel, nav) }
                        composable("device/{id}") { entry ->
                            DeviceDetailScreen(viewModel, entry.arguments?.getString("id").orEmpty(), nav)
                        }
                        composable("recommendations") { RecommendationsScreen(viewModel) }
                        composable("timeline") { TimelineScreen(viewModel) }
                        composable("notifications") { NotificationsScreen(viewModel) }
                        composable("addchild") { AddChildScreen(viewModel, nav) }
                    }
                }
                BottomNav(active = tab) { selected ->
                    tab = selected
                    val route = when (selected) {
                        ParentTab.HOME -> "home"
                        ParentTab.ACTIVITY -> "activity"
                        ParentTab.DEVICES -> "devices"
                        ParentTab.INSIGHTS -> "insights"
                        ParentTab.MORE -> "more"
                    }
                    nav.navigate(route) {
                        popUpTo("home")
                        launchSingleTop = true
                    }
                }
            }
        }
    }
}
