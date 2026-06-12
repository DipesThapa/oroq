package uk.co.cyberheroez.oroq.ui.child

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.ParentLink
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.normalizeCode
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.OroqWordmark
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.QSymbol
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.theme.OroqColors
import uk.co.cyberheroez.oroq.ui.theme.OroqDimens
import uk.co.cyberheroez.oroq.ui.theme.OroqType
import uk.co.cyberheroez.oroq.vpn.OroQVpnService

@Composable
internal fun ChildScaffold(content: @Composable ColumnScope.() -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = OroqDimens.PadScreen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(48.dp))
        content()
    }
}

@Composable
fun SetupScreen(nav: NavController) = ChildScaffold {
    QSymbol(48.dp)
    Spacer(Modifier.height(16.dp))
    Text("Set up OroQ", style = OroqType.H1)
    Spacer(Modifier.height(32.dp))
    StepRow(1, "Pair with parent", "Securely connect this device to your parent's account.")
    Spacer(Modifier.height(22.dp))
    StepRow(2, "Allow protection", "Enable AI protection and content filtering.")
    Spacer(Modifier.height(22.dp))
    StepRow(3, "All set", "You're ready. We'll keep you safe online.", done = true)
    Spacer(Modifier.weight(1f))
    PrimaryButton("Let's go") { nav.navigate("pair") }
    Spacer(Modifier.height(24.dp))
}

/** Child-side join: returns the SAS to confirm, or null if the code failed. */
suspend fun joinPairing(context: Context, code: String): PendingLink? {
    val store = FamilyStore(context)
    val keys = store.getOrCreateKeyPair()
    val result = familyApi().pairJoin(code, keys.publicKeysetB64) ?: return null
    return PendingLink(
        pairingId = result.pairingId,
        parentPublicKeyB64 = result.parentPublicKeyB64,
        sas = FamilyCrypto.sas(result.parentPublicKeyB64, keys.publicKeysetB64),
    )
}

/** A joined-but-unconfirmed pairing: persisted only after the SAS matches. */
data class PendingLink(val pairingId: String, val parentPublicKeyB64: String, val sas: String)

suspend fun confirmPairing(context: Context, pending: PendingLink) {
    val store = FamilyStore(context)
    store.setParentLink(ParentLink(pending.pairingId, pending.parentPublicKeyB64))
    scheduleFamilySync(context)
}

@Composable
fun PairScreen(nav: NavController) = ChildScaffold {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var pending by remember { mutableStateOf<PendingLink?>(null) }

    val p = pending
    if (p != null) {
        // SAS confirmation — security step the deck omits; both phones must match.
        Text("Confirm it's safe", style = OroqType.H2)
        Text("This should match the 6 digits on your parent's phone.", style = OroqType.Body)
        Spacer(Modifier.height(16.dp))
        OroqCard {
            Text(
                p.sas,
                style = OroqType.Metric.copy(fontSize = 36.sp, letterSpacing = 8.sp, color = OroqColors.BluePrimary),
            )
        }
        Spacer(Modifier.weight(1f))
        PrimaryButton("They match — continue") {
            scope.launch {
                confirmPairing(context, p)
                nav.navigate("allow")
            }
        }
        SecondaryLink("They don't match") { pending = null; code = "" }
        Spacer(Modifier.height(24.dp))
        return@ChildScaffold
    }

    Text("Pair with parent", style = OroqType.H2)
    // Deck copy adapted: 8-character code (owner decision), not 6.
    Text("Ask your parent to generate an 8-character code on their OroQ app.", style = OroqType.Body)
    Spacer(Modifier.height(16.dp))
    OutlinedTextField(
        value = code, onValueChange = { code = it; error = null },
        placeholder = { Text("Pair code", style = OroqType.Body) },
        trailingIcon = {
            Box(
                Modifier
                    .clickable { nav.navigate("scan") }
                    .padding(12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Canvas(Modifier.size(22.dp)) { drawQrGlyph(OroqColors.BlueLight) }
            }
        },
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = OroqColors.BluePrimary,
            unfocusedBorderColor = OroqColors.Border,
            focusedTextColor = OroqColors.TextPrimary,
            unfocusedTextColor = OroqColors.TextPrimary,
        ),
        modifier = Modifier.fillMaxWidth(),
    )
    if (error != null) {
        Text(error!!, style = OroqType.Caption.copy(color = OroqColors.Danger))
    }
    SecondaryLink("Scan QR instead") { nav.navigate("scan") }
    Spacer(Modifier.weight(1f))
    PrimaryButton(if (busy) "Pairing…" else "Continue", enabled = !busy && code.isNotBlank()) {
        busy = true
        scope.launch {
            val result = withContext(Dispatchers.IO) { joinPairing(context, normalizeCode(code)) }
            busy = false
            if (result != null) pending = result
            else error = "That code didn't work — check it and try again."
        }
    }
    Spacer(Modifier.height(24.dp))
}

/** The real permission gates behind the deck's single "Allow protection" screen. */
private enum class Gate(val label: String) {
    VPN("Allow web filtering"),
    USAGE("Allow usage access"),
    OVERLAY("Allow display over apps"),
    BATTERY("Stay on in the background"),
    DONE(""),
}

private fun nextGate(context: Context): Gate = when {
    VpnService.prepare(context) != null -> Gate.VPN
    !UsageReader(context).hasUsageAccess() -> Gate.USAGE
    !Settings.canDrawOverlays(context) -> Gate.OVERLAY
    !isIgnoringBattery(context) -> Gate.BATTERY
    else -> Gate.DONE
}

private fun isIgnoringBattery(context: Context): Boolean {
    val pm = ContextCompat.getSystemService(context, PowerManager::class.java) ?: return true
    return pm.isIgnoringBatteryOptimizations(context.packageName)
}

@Composable
fun AllowProtectionScreen(nav: NavController) = ChildScaffold {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var gate by remember { mutableStateOf(nextGate(context)) }
    var resumeTick by remember { mutableIntStateOf(0) }
    val vpnConsent = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { gate = nextGate(context) }

    // Re-check the gates whenever the user comes back from a settings screen.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                gate = nextGate(context)
                resumeTick++
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    ShieldGraphic(96.dp)
    Spacer(Modifier.height(20.dp))
    Text("Allow protection", style = OroqType.H1)
    Spacer(Modifier.height(8.dp))
    Text(
        "OroQ will now protect this device from harmful content and online threats.",
        style = OroqType.Body,
    )
    Spacer(Modifier.height(20.dp))
    Column(Modifier.fillMaxWidth()) {
        CheckRow("Block harmful content")
        CheckRow("AI Scam protection")
        CheckRow("Real-time monitoring")
    }
    if (gate != Gate.DONE) {
        Spacer(Modifier.height(12.dp))
        Text("Next: ${gate.label}", style = OroqType.Caption)
    }
    Spacer(Modifier.weight(1f))
    PrimaryButton(if (gate == Gate.DONE) "Continue" else "Allow & Continue") {
        when (gate) {
            Gate.VPN -> VpnService.prepare(context)?.let { vpnConsent.launch(it) }
            Gate.USAGE -> context.startActivity(UsageReader.usageAccessIntent())
            Gate.OVERLAY -> context.startActivity(UsageReader.overlayIntent(context))
            Gate.BATTERY -> runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
                }
            }
            Gate.DONE -> nav.navigate("allset")
        }
    }
    Spacer(Modifier.height(24.dp))
}

@Composable
fun AllSetScreen(nav: NavController) = ChildScaffold {
    val context = LocalContext.current
    Spacer(Modifier.height(8.dp))
    SuccessCheck(96.dp)
    Spacer(Modifier.height(20.dp))
    Text("All set!", style = OroqType.H1)
    Spacer(Modifier.height(8.dp))
    Text("You're protected. You can now browse with confidence.", style = OroqType.Body)
    Spacer(Modifier.height(8.dp))
    Image(
        painter = painterResource(R.drawable.welcome_hero),
        contentDescription = null,
        contentScale = ContentScale.Fit,
        modifier = Modifier.fillMaxWidth().weight(1f).padding(vertical = 8.dp),
    )
    // Deck typo "Allo to Home" fixed per the deck spec's own instruction.
    PrimaryButton("Go to Home") {
        context.startService(Intent(context, OroQVpnService::class.java))
        context.startService(Intent(context, AppMonitorService::class.java))
        nav.navigate("childhome") { popUpTo("setup") { inclusive = true } }
    }
    Spacer(Modifier.height(24.dp))
}

/** Slim child surface (AADC posture): protection state + paired badge only. */
@Composable
fun ChildHomeScreen() = ChildScaffold {
    OroqWordmark()
    Spacer(Modifier.height(48.dp))
    QSymbol(96.dp)
    Spacer(Modifier.height(32.dp))
    val protectionOn = OroQVpnService.isActive
    Text(if (protectionOn) "You're protected" else "Protection is off", style = OroqType.H2)
    Text(
        if (protectionOn) "Browse with confidence." else "Ask a parent to turn protection back on.",
        style = OroqType.Body,
    )
}
