package uk.co.cyberheroez.oroq

import android.Manifest
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import uk.co.cyberheroez.oroq.family.DeviceRole
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.parent.ParentActivity
import uk.co.cyberheroez.oroq.ui.WelcomeActivity
import uk.co.cyberheroez.oroq.ui.child.ChildActivity
import uk.co.cyberheroez.oroq.ui.components.OroqWordmark
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType
import uk.co.cyberheroez.oroq.update.scheduleBlocklistUpdates
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

/**
 * The child phone's only screen: a single status badge plus a "Linked to a
 * parent" caption. Parent and Role-picker routing is unchanged from before.
 *
 * Tapping the badge when it is red routes to [ChildActivity], which walks
 * through whatever permission is missing.
 */
class MainActivity : ComponentActivity() {

    private val familyStore by lazy { FamilyStore(this) }
    private var protectedOn by mutableStateOf(false)

    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            when (familyStore.getRole()) {
                null -> {
                    startActivity(Intent(this@MainActivity, WelcomeActivity::class.java))
                    finish()
                }
                DeviceRole.PARENT -> {
                    startActivity(
                        Intent(this@MainActivity, ParentActivity::class.java)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
                    )
                    finish()
                }
                DeviceRole.CHILD -> setUpChildHome()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        protectedOn = OroQVpnService.isActive && permissionsGranted()
    }

    private suspend fun setUpChildHome() {
        if (!isReadyToShowHome()) {
            startActivity(
                Intent(this, ChildActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK),
            )
            finish()
            return
        }
        scheduleBlocklistUpdates(this)
        scheduleFamilySync(this)
        requestNotificationPermissionIfNeeded()
        // Ensure the services are running on every cold start. They no-op if
        // already up.
        startService(Intent(this, OroQVpnService::class.java))
        startService(Intent(this, AppMonitorService::class.java))
        protectedOn = OroQVpnService.isActive && permissionsGranted()
        setContent {
            ChildHome(
                protectedOn = protectedOn,
                onBadgeTap = {
                    if (!(OroQVpnService.isActive && permissionsGranted())) {
                        startActivity(Intent(this, ChildActivity::class.java))
                    }
                },
            )
        }
    }

    /** True when every onboarding gate has been satisfied. */
    private suspend fun isReadyToShowHome(): Boolean {
        if (VpnService.prepare(this) != null) return false
        if (!UsageReader(this).hasUsageAccess()) return false
        if (!Settings.canDrawOverlays(this)) return false
        if (familyStore.getParentLink() == null) return false
        return true
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun permissionsGranted(): Boolean {
        if (VpnService.prepare(this) != null) return false
        if (!UsageReader(this).hasUsageAccess()) return false
        if (!Settings.canDrawOverlays(this)) return false
        return isIgnoringBatteryOptimisations()
    }

    private fun isIgnoringBatteryOptimisations(): Boolean {
        val pm = ContextCompat.getSystemService(this, PowerManager::class.java) ?: return true
        return pm.isIgnoringBatteryOptimizations(packageName)
    }
}

@androidx.compose.runtime.Composable
private fun ChildHome(protectedOn: Boolean, onBadgeTap: () -> Unit) {
    Column(
        Modifier.fillMaxSize().background(OroqColors.BgPrimary).systemBarsPadding()
            .padding(horizontal = OroqDimens.PadScreen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(72.dp))
        OroqWordmark()
        Spacer(Modifier.height(40.dp))
        val badgeColor = if (protectedOn) OroqColors.Success else OroqColors.Danger
        Column(
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(OroqDimens.RadiusCard))
                .background(badgeColor)
                .clickable(onClick = onBadgeTap)
                .padding(vertical = 60.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (protectedOn) "✓ Protected" else "Not protected",
                style = OroqType.H1.copy(color = Color.White, fontWeight = FontWeight.Bold),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                if (protectedOn) "Web filtering is on" else "Tap to fix",
                style = OroqType.Body.copy(color = Color.White.copy(alpha = 0.8f)),
            )
        }
        Spacer(Modifier.height(28.dp))
        Text("Linked to a parent", style = OroqType.Body)
    }
}
