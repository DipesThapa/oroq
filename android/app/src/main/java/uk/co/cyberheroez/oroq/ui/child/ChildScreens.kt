package uk.co.cyberheroez.oroq.ui.child

import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uk.co.cyberheroez.oroq.R
import uk.co.cyberheroez.oroq.family.FamilyCrypto
import uk.co.cyberheroez.oroq.family.FamilyStore
import uk.co.cyberheroez.oroq.family.ParentLink
import uk.co.cyberheroez.oroq.family.familyApi
import uk.co.cyberheroez.oroq.family.scheduleFamilySync
import uk.co.cyberheroez.oroq.monitor.AppMonitorService
import uk.co.cyberheroez.oroq.monitor.UsageReader
import uk.co.cyberheroez.oroq.ui.components.OroqCard
import uk.co.cyberheroez.oroq.ui.components.OroqWordmark
import uk.co.cyberheroez.oroq.ui.components.PrimaryButton
import uk.co.cyberheroez.oroq.ui.components.QSymbol
import uk.co.cyberheroez.oroq.ui.components.SecondaryLink
import uk.co.cyberheroez.oroq.ui.components.qrBitmap
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

/**
 * Brand moment shown the instant the child flow starts (right after the user
 * taps "This is my child's phone"): just the bare Q on the dark background,
 * then it hands off to [SetupScreen]. Deliberately not the OS launcher splash
 * — that one carries the navy tile; this is the plain mark.
 */
@Composable
fun ChildLogoScreen(nav: NavController) {
    LaunchedEffect(Unit) {
        delay(1100)
        nav.navigate("setup") { popUpTo("logo") { inclusive = true } }
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        QSymbol(104.dp)
    }
}

@Composable
fun SetupScreen(nav: NavController) = ChildScaffold {
    Spacer(Modifier.height(8.dp))
    QSymbol(64.dp)
    Spacer(Modifier.height(28.dp))
    Column(Modifier.fillMaxWidth()) {
        Text("Set up OroQ", style = OroqType.H1)
        Spacer(Modifier.height(28.dp))
        SetupStepper(
            listOf(
                SetupStep(1, "Pair with parent", "Securely connect this device to your parent's account."),
                SetupStep(2, "Allow protection", "Enable AI protection and content filtering."),
                SetupStep(3, "All set", "You're ready. We'll keep you safe online.", done = true),
            ),
        )
    }
    Spacer(Modifier.weight(1f))
    PrimaryButton("Let's go") { nav.navigate("showcode") }
    Spacer(Modifier.height(24.dp))
}

/** Child-side create: mints the pairing + code to display, or null on failure. */
data class ShowPairing(val pairingId: String, val code: String, val childPublicKeyB64: String)

suspend fun createPairing(context: Context): ShowPairing? {
    val store = FamilyStore(context)
    val keys = store.getOrCreateKeyPair()
    val result = familyApi().pairCreate(keys.publicKeysetB64) ?: return null
    // Persist the bearer token now so it survives the await-join screens; it
    // authenticates this device on every later /sync and /cmd call.
    store.setChildToken(result.childToken)
    return ShowPairing(result.pairingId, result.code, keys.publicKeysetB64)
}

/** Polls until the parent joins; returns the pending link (with SAS), or null on timeout. */
suspend fun awaitParentJoin(show: ShowPairing): PendingLink? {
    repeat(80) {
        delay(3_000)
        val record = familyApi().pairGet(show.pairingId)
        val parentKey = record?.parentPublicKeyB64
        if (record?.paired == true && parentKey != null) {
            // SAS arg order (parent, child) must match the parent side. Guard the
            // decode so a malformed key from the relay can't crash the child —
            // we just keep waiting rather than take down the app.
            val sas = runCatching { FamilyCrypto.sas(parentKey, show.childPublicKeyB64) }.getOrNull()
            if (sas != null) {
                return PendingLink(show.pairingId, parentKey, sas)
            }
        }
    }
    return null
}

/** A joined-but-unconfirmed pairing: persisted only after the SAS matches. */
data class PendingLink(val pairingId: String, val parentPublicKeyB64: String, val sas: String)

suspend fun confirmPairing(context: Context, pending: PendingLink) {
    val store = FamilyStore(context)
    store.setParentLink(ParentLink(pending.pairingId, pending.parentPublicKeyB64))
    scheduleFamilySync(context)
}

/**
 * Child-led pairing: this device mints a code and shows it as a QR + text for
 * the parent to scan/enter — the child scans nothing. It then waits for the
 * parent to join, and both confirm the SAS digits match before the link sticks.
 */
@Composable
fun ShowCodeScreen(nav: NavController) = ChildScaffold {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var show by remember { mutableStateOf<ShowPairing?>(null) }
    var pending by remember { mutableStateOf<PendingLink?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val created = withContext(Dispatchers.IO) { createPairing(context) }
        if (created == null) {
            error = "Couldn't start pairing — check your connection."
            return@LaunchedEffect
        }
        show = created
        val link = withContext(Dispatchers.IO) { awaitParentJoin(created) }
        if (link != null) pending = link
        else if (error == null) error = "Pairing timed out — go back and try again."
    }

    val p = pending
    if (p != null) {
        // SAS confirmation — both phones must show the same 6 digits.
        Column(Modifier.fillMaxWidth()) {
            Text("Confirm it's safe", style = OroqType.H1)
            Spacer(Modifier.height(8.dp))
            Text("This should match the 6 digits on your parent's phone.", style = OroqType.Body)
        }
        Spacer(Modifier.height(24.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            OroqCard {
                Text(
                    p.sas,
                    style = OroqType.Metric.copy(fontSize = 36.sp, letterSpacing = 8.sp, color = OroqColors.BluePrimary),
                )
            }
        }
        Spacer(Modifier.weight(1f))
        PrimaryButton("They match — continue") {
            scope.launch {
                confirmPairing(context, p)
                nav.navigate("allow")
            }
        }
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            SecondaryLink("They don't match") { nav.popBackStack() }
        }
        Spacer(Modifier.height(24.dp))
        return@ChildScaffold
    }

    Column(Modifier.fillMaxWidth()) {
        Text("Pair with parent", style = OroqType.H1)
        Spacer(Modifier.height(8.dp))
        Text(
            "Ask your parent to scan this with their OroQ app — or enter the code.",
            style = OroqType.Body,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }
    Spacer(Modifier.height(24.dp))

    val s = show
    if (s != null) {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Column(
                Modifier.clip(RoundedCornerShape(OroqDimens.RadiusCard)).background(Color.White).padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(
                    bitmap = remember(s.code) { qrBitmap(s.code) }.asImageBitmap(),
                    contentDescription = "Pairing QR code",
                    modifier = Modifier.size(220.dp),
                )
            }
        }
        Spacer(Modifier.height(20.dp))
        Text(
            "Or enter this code",
            style = OroqType.Caption,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.clip(RoundedCornerShape(OroqDimens.RadiusTile)).background(OroqColors.BgSurface)
                    .padding(horizontal = 28.dp, vertical = 12.dp),
            ) {
                Text(s.code, style = OroqType.Metric.copy(fontSize = 28.sp, letterSpacing = 6.sp))
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Waiting for your parent…",
            style = OroqType.Caption.copy(color = OroqColors.BlueLight),
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    } else if (error == null) {
        Text(
            "Starting…",
            style = OroqType.Caption,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }

    if (error != null) {
        Spacer(Modifier.height(12.dp))
        Text(
            error!!,
            style = OroqType.Caption.copy(color = OroqColors.Danger),
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }
    Spacer(Modifier.weight(1f))
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        SecondaryLink("Cancel") { nav.popBackStack() }
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

    // Deck order: title (top-left) → shield → centred copy → check list → button.
    Column(Modifier.fillMaxWidth()) {
        Text("Allow protection", style = OroqType.H1)
    }
    Spacer(Modifier.height(16.dp))
    ShieldGraphic(96.dp)
    Spacer(Modifier.height(16.dp))
    Text(
        "OroQ will now protect this device from harmful content and online threats.",
        style = OroqType.Body,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
    Spacer(Modifier.height(24.dp))
    Column(Modifier.fillMaxWidth()) {
        CheckRow("Block harmful content")
        CheckRow("AI Scam protection")
        CheckRow("Real-time monitoring")
    }
    if (gate != Gate.DONE) {
        Spacer(Modifier.height(10.dp))
        Text(
            "Next: ${gate.label}",
            style = OroqType.Caption,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
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
